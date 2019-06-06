import 'source-map-support/register';

import {Data, ID, toID} from 'ps';
import {workerData} from 'worker_threads';

import {Batch, Checkpoints, Offset} from './checkpoint';
import * as debug from './debug';
import * as fs from './fs';
import {Configuration} from './main';
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

async function apply(batches: Batch[], config: Configuration) {
  const storage = Storage.connect(config);
  for (const {format, begin, end, size} of batches {
    const cutoffs = POPULAR.has(format) ? CUTOFFS.popular : CUTOFFS.default;
    const data = Data.forFormat(format);
    const stats = Stats.create();

    LOG(`Processing ${size} log(s) from ${format}: ${Checkpoints.formatOffsets(begin, end)}`);
    for (const log of storage.listLogs(format, begin, end)) {
      if (processed.length >= config.maxFiles) {
        LOG(`Waiting for ${processed.length} log(s) from ${format} to be parsed`);
        await Promise.all(processed);
        processed = [];
      }

      processed.push(processLog(storage, data, log, cutoffs, stats, config.dryRun));
    }
    if (processed.length) {
      LOG(`Waiting for ${processed.length} log(s) from ${format} to be parsed`);
      await Promise.all(processed);
    }
    const filename = Checkpoints.filename(config.checkpoint, format, begin, end);
    LOG(`Writing checkpoint ${filename} (${Checkpoints.formatOffsets(begin, end)})`);
    if (!config.dryRun) await Checkpoints.writeCheckpoint(filename, {begin, end, stats});
  }
}

async function processLog(
    storage: Storage, data: Data, log: string, cutoffs: number[], stats: TaggedStatistics,
    dryRun?: boolean) {
  VLOG(`Processing ${log}`);
  if (dryRun) return;
  try {
    const raw = JSON.parse(await storage.readLog(log));
    const battle = Parser.parse(raw, data);
    const tags = data.format === 'gen7monotype' ? monotypes(data) : undefined;
    Stats.update(data, battle, cutoffs, stats, tags);
  } catch (err) {
    console.error(`${log}: ${err.message}`);
  }
}

async function combine(formats: ID[], config: Configuration) {
  for (const format of formats) {
    LOG(`Combining checkpoint(s) for ${format}`);
    stats = await Checkpoints.combine(config.checkpoints, format, config.maxFiles);

    const b = stats.battles;
    let writes = [];
    for (const [c, s] of stats.total.entries()) {
      if (writes.length + REPORTS >= config.maxFiles) {
        LOG(`Waiting for ${writes.length} report(s) for ${format} to be written`);
        await Promise.all(writes);
        writes = [];
      }
      writes.push(...writeReports(config, format, c, s, b));
    }

    for (const [t, ts] of stats.tags.entries()) {
      for (const [c, s] of ts.entries()) {
        if (writes.length + REPORTS >= config.maxFiles) {
          LOG(`Waiting for ${writes.length} report(s) for ${format} to be written`);
          await Promise.all(writes);
          writes = [];
        }
        writes.push(...writeReports(config, format, c, s, b, t));
      }
    }
    LOG(`Waiting for ${writes.length} report(s) for ${format} to be written`);
    await Promise.all(writes);
  }
}

function writeReports(
    config: Configuration, format: ID, cutoff: number, stats: Statistics, battles: number,
    tag?: ID) {
  LOG(`Writing reports for ${format} for cutoff ${cutoff}` + (tag ? ` (${tag})` : ''));
  if (config.dryRun) return new Array(REPORTS).fill(Promise.resolve());

  const file = tag ? `${format}-${tag}-${cutoff}` : `${format}-${cutoff}`;
  const usage = Reports.usageReport(format, stats, battles);

  const reports =
      (format === 'gen7monotype' && tag) ? path.join(config.reports, 'monotype') : config.reports;
  const min = config.all ? [0, -Infinity] : [20, 0.5];
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

function LOG(...args: any[]) {
  if (!args.length) return workerData.config.verbose;
  if (!workerData.config.verbose) return false;
  debug.log(`worker:${workerData.num}`, workerData.num, ...args);
  return true;
}

function VLOG(...args: any[]) {
  if (!args.length) return +workerData.config.verbose < 2;
  if (+workerData.config.verbose < 2) return false;
  LOG(...args);
  return true;
}

// tslint:disable-next-line: no-floating-promises
(async () => workerData.type === 'apply' ? await apply(workerData.formats, workerData.config) :
                                           await combine(workerData.formats, workerData.config))();
