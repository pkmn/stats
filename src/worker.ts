import * as path from 'path';
import {Data, ID, toID} from 'ps';
import {Parser, Reports, Statistics, Stats, TaggedStatistics} from 'stats';
import {workerData} from 'worker_threads';

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
    const stats = Stats.create();

    // We could potentially optimize here by using a semaphore/throttle to enforce the maxFiles
    // limit but for simplicity and to save on the memory creating a bunch of promises would need we
    // instead just wait for each batch, hoping that the async reads (and multiple workers
    // processes) are still going to keep our disk busy the whole time anyway.
    // TODO: add periodic checkpointing
    for (const log of logs) {
      const processed: Array<Promise<void>> = [];
      for (let n = 0; n < options.maxFiles; n++) {
        processed.push(processLog(storage, data, log, cutoffs, stats));
      }
      await Promise.all(processed);
    }

    const b = stats.battles;
    let writes: Array<Promise<void>> = [];
    for (const [c, s] of stats.total.entries()) {
      if (writes.length + REPORTS > options.maxFiles) {
        await Promise.all(writes);
        writes = [];
      }
      writes.push(...writeReports(options, format, c, s, b));
    }

    for (const [t, ts] of stats.tags.entries()) {
      for (const [c, s] of ts.entries()) {
        if (writes.length + REPORTS > options.maxFiles) {
          await Promise.all(writes);
          writes = [];
        }
        writes.push(...writeReports(options, format, c, s, b, t));
      }
    }
    await Promise.all(writes);
  }
}

async function processLog(
    storage: Storage, data: Data, log: string, cutoffs: number[], stats: TaggedStatistics) {
  try {
    const raw = JSON.parse(await storage.readLog(log));
    // TODO: save checkpoints/IR (by chunk)
    const battle = Parser.parse(raw, data);
    const tags = data.format === 'gen7monotype' ? monotypes(data) : undefined;
    Stats.update(data, battle, cutoffs, stats, tags);
  } catch (err) {
    console.error(`${log}: ${err.message}`);
  }
}

function writeReports(
    options: main.WorkerOptions, format: ID, cutoff: number, stats: Statistics, battles: number,
    tag?: ID) {
  const file = tag ? `${format}-${tag}-${cutoff}` : `${format}-${cutoff}`;
  const usage = Reports.usageReport(format, stats, battles);

  const reports = options.reportsPath;
  const min = options.debug ? [0, -Infinity] : [20, 0.5];
  const writes: Array<Promise<void>> = [];
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