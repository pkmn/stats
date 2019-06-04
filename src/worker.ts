import * as path from 'path';
import {Data, ID, toID} from 'ps';
import {Parser, Reports, Statistics, Stats, TaggedStatistics} from 'stats';
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
      if (!begin) begin = getOffset(log);
      const shouldCheckpoint = options.checkpoint && process.length >= options.batchSize!;
      if (n >= options.maxFiles || shouldCheckpoint) {
        const done = await Promise.all(processed);
        n = 0;
        processed = [];
        if (shouldCheckpoint) {
          const filename = Checkpoints.filename(options.checkpoint!, format, done[done.length]);
          await Checkpoints.writeCheckpoint(filename, {begin, end: getOffset(log), stats});
          stats = Stats.create();
        }
      }

      processed.push(processLog(storage, data, log, cutoffs, stats));
      n++;
    }
    const done = await Promise.all(processed);
    if (options.checkpoint) {
      const filename = Checkpoints.filename(options.checkpoint, format, done[done.length]);
      await Checkpoints.writeCheckpoint(filename, {begin, end: getOffset(log), stats});
      stats = await Checkpoints.combine(options.checkpoint, format, options.maxFiles);
    }

    const b = stats.battles;
    let writes = [];
    for (const [c, s] of stats.total.entries()) {
      if (writes.length + REPORTS >= options.maxFiles) {
        await Promise.all(writes);
        writes = [];
      }
      writes.push(...writeReports(options, format, c, s, b));
    }

    for (const [t, ts] of stats.tags.entries()) {
      for (const [c, s] of ts.entries()) {
        if (writes.length + REPORTS >= options.maxFiles) {
          await Promise.all(writes);
          writes = [];
        }
        writes.push(...writeReports(options, format, c, s, b, t));
      }
    }
    await Promise.all(writes);
  }
}

function getOffset(full: string): Offset {
  const [month, format, day, log] = full.split(path.sep);
  return {day, log};
}

async function processLog(
    storage: Storage, data: Data, log: string, cutoffs: number[], stats: TaggedStatistics) {
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
  const file = tag ? `${format}-${tag}-${cutoff}` : `${format}-${cutoff}`;
  const usage = Reports.usageReport(format, stats, battles);

  const reports = options.reportsPath;
  const min = options.debug ? [0, -Infinity] : [20, 0.5];
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

// tslint:disable-next-line: no-floating-promises
(async () => await process(workerData.formats, workerData.options))();
