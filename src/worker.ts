import * as path from 'path';
import {performance} from 'perf_hooks';
import {Data, ID, toID} from 'ps';
import {Parser, Reports, Statistics, Stats, TaggedStatistics} from 'stats';
import * as util from 'util';
import {workerData} from 'worker_threads';

import {Checkpoints, Offset} from './checkpoint';
import * as fs from './fs';
import * as main from './main';
import {Storage} from './storage';

const POPULAR = new Set([
  'ou',
  'doublesou',
  'randombattle',
  'oususpecttest',
  'smogondoublessuspecttest',
  'doublesoususpecttest',
  'gen7pokebankou',
  'gen7ou',
  'gen7pokebankdoublesou',
  'gen7pokebankoususpecttest',
  'gen7oususpecttest',
  'gen7pokebankdoublesoususpecttest',
  'gen7doublesoususpecttest',
  'gen7doublesou',
] as ID[]);

const CUTOFFS = {
  default: [0, 1500, 1630, 1760],
  popular: [0, 1500, 1695, 1825],
};

// The number of report files written by `writeReports` (usage, leads, moveset, chaos, metagame).
const REPORTS = 5;

const monotypes = (data: Data) => new Set(Object.keys(data.Types).map(t => `mono${toID(t)}` as ID));

async function process(formats: main.FormatData[], options: main.WorkerOptions) {
  const storage = Storage.connect(options);

  for (const {format, logs} of formats) {
    const cutoffs = POPULAR.has(format) ? CUTOFFS.popular : CUTOFFS.default;
    const data = Data.forFormat(format);
    let stats = Stats.create();

    // We could potentially optimize here by using a semaphore/throttle to enforce the maxFiles
    // limit but for simplicity and to save on the memory creating a bunch of promises would need we
    // instead just wait for each batch, hoping that the async reads (and multiple workers
    // processes) are still going to keep our disk busy the whole time anyway.
    let n = 0;
    let processed = [];
    let begin: Offset = undefined!;
    let log = '';
    for (log of logs) {
      if (!begin) begin = main.getOffset(log);
      const shouldCheckpoint = options.checkpoint && processed.length >= options.batchSize!;
      if (n >= options.maxFiles || shouldCheckpoint) {
        debug(`Waiting for ${processed.length} logs to be parsed`);
        const done = await Promise.all(processed);
        n = 0;
        processed = [];
        if (shouldCheckpoint) {
          const filename = Checkpoints.filename(options.checkpoint!, format, done[done.length]);
          const end = main.getOffset(log);
          debug(
              `Writing checkpoint ${filename} from ${util.inspect(begin)} to ${util.inspect(end)}`);
          if (!options.dryRun) {
            await Checkpoints.writeCheckpoint(filename, {begin, end, stats});
            stats = Stats.create();
          }
        }
      }

      if (options.dryRun) {
        debug(`Processing ${log}`);
        processed.push(Promise.resolve(0));
      } else {
        processed.push(processLog(storage, data, log, cutoffs, stats));
      }
      n++;
    }
    debug(`Waiting for ${processed.length} logs to be parsed`);
    const done = await Promise.all(processed);
    if (options.checkpoint) {
      const filename = Checkpoints.filename(options.checkpoint, format, done[done.length]);
      const end = main.getOffset(log);
      debug(`Writing checkpoint ${filename} from ${util.inspect(begin)} to ${util.inspect(end)}`);
      if (!options.dryRun) {
        await Checkpoints.writeCheckpoint(filename, {begin, end, stats});
        debug(`Combining checkpoints`);
        stats = await Checkpoints.combine(options.checkpoint, format, options.maxFiles);
      }
    }

    const b = stats.battles;
    let writes = [];
    for (const [c, s] of stats.total.entries()) {
      if (writes.length + REPORTS >= options.maxFiles) {
        debug(`Waiting for ${writes.length} reports to be written`);
        await Promise.all(writes);
        writes = [];
      }
      writes.push(...writeReports(options, format, c, s, b));
    }

    for (const [t, ts] of stats.tags.entries()) {
      for (const [c, s] of ts.entries()) {
        if (writes.length + REPORTS >= options.maxFiles) {
          debug(`Waiting for ${writes.length} reports to be written`);
          await Promise.all(writes);
          writes = [];
        }
        writes.push(...writeReports(options, format, c, s, b, t));
      }
    }
    debug(`Waiting for ${writes.length} reports to be written`);
    await Promise.all(writes);
  }
}

async function processLog(
    storage: Storage, data: Data, log: string, cutoffs: number[], stats: TaggedStatistics) {
  debug(`Processing ${log}`);
  try {
    const raw = JSON.parse(await storage.readLog(log));
    const battle = Parser.parse(raw, data);
    const tags = data.format === 'gen7monotype' ? monotypes(data) : undefined;
    Stats.update(data, battle, cutoffs, stats, tags);
    return Date.parse(raw.timestamp);
  } catch (err) {
    console.error(`${log}: ${err.message}`);
  }
  return 0;
}

function writeReports(
    options: main.WorkerOptions, format: ID, cutoff: number, stats: Statistics, battles: number,
    tag?: ID) {
  debug(`Writing reports for ${format} for cutoff ${cutoff}` + (tag ? tag : ''));
  if (options.dryRun) return new Array(REPORTS).fill(Promise.resolve());

  const file = tag ? `${format}-${tag}-${cutoff}` : `${format}-${cutoff}`;
  const usage = Reports.usageReport(format, stats, battles);

  const reports = options.reportsPath;
  const min = options.all ? [0, -Infinity] : [20, 0.5];
  const writes = [];
  writes.push(fs.writeFile(path.resolve(reports, `${file}.txt`), usage));
  const leads = Reports.leadsReport(format, stats, battles);
  writes.push(fs.writeFile(path.resolve(reports, 'leads', `${file}.txt`), leads));
  const movesets = Reports.movesetReports(format, stats, battles, cutoff, tag, min);
  writes.push(fs.writeFile(path.resolve(reports, 'moveset', `${file}.txt`), movesets.basic));
  writes.push(fs.writeFile(path.resolve(reports, 'chaos', `${file}.json`), movesets.detailed));
  const metagame = Reports.metagameReport(stats);
  writes.push(fs.writeFile(path.resolve(reports, 'metagame', `${file}.txt`), metagame));
  return writes;
}

function debug(...args: any[]) {
  if (!workerData.options.verbose) return;
  const color = (workerData.num % 5) + 2;
  const tag = util.format(
      `[%s] \x1b[3${color}m%s\x1b[0m`, Math.round(performance.now()), `worker:${workerData.num}`);
  console.log(tag, ...args);
}

// tslint:disable-next-line: no-floating-promises
(async () => await process(workerData.formats, workerData.options))();
