import * as path from 'path';
import {Data, ID, toID} from 'ps';
import {Parser, Reports, Statistics, Stats, TaggedStatistics} from 'stats';
import {workerData} from 'worker_threads';

import * as fs from './fs';
import * as main from './main';
import * as state from './state';

// TODO: Make sure checkpoints respects MAX_FILES (not WORKING_SET_SIZE)
interface Checkpoint {
  begin: number;  // TODO: timestamp number of string?
  end: number;
  stats: TaggedStatistics;
}

// If we are configured to use checkpoints we will check to see if a checkpoints directory
// already exists - if so we need to resume from the checkpoint, otherwise we need to
// create the checkpoint directory setup and write the checkpoints as we process the logs.

// The checkpoints directory is to be structured as follows:
//
//     <checkpoints>
//     └── format
//         └── timestamp.json(.gz)

function writeCheckpoint(file: string, checkpoint: Checkpoint) {
  // TODO: filename should be based on checkpoint.end!
  return fs.writeGzipFile(file, JSON.stringify({
    begin: checkpoint.begin,
    end: checkpoint.end,
    stats: state.serializeTagged(checkpoint.stats),
  }));
}

async function readCheckpoint(file: string) {
  const json = JSON.parse(await fs.readFile(file, 'utf8'));
  return {begin: json.begin, end: json.end, checkpoint: state.deserializeTagged(json.stats)};
}

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

interface Options extends main.Options {
  reportsPath: string;
  maxFiles: number;
}

async function process(formats: main.FormatData[], options: Options) {
  for (const {format, size, files} of formats) {
    const cutoffs = POPULAR.has(format) ? CUTOFFS.popular : CUTOFFS.default;
    const data = Data.forFormat(format);
    const stats = Stats.create();

    // We could potentially optimize here by using a semaphore/throttle to enforce the maxFiles
    // limit but for simplicity and to save on the memory creating a bunch of promises would need we
    // instead just wait for each batch, hoping that the async reads (and multiple workers
    // processes) are still going to keep our disk busy the whole time anyway.
    // TODO: add periodic checkpointing
    for (const file of files) {
      const logs: Array<Promise<void>> = [];
      for (let n = 0; n < options.maxFiles; n++) {
        logs.push(processLog(data, file, cutoffs, stats));
      }
      await Promise.all(logs);
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

async function processLog(data: Data, file: string, cutoffs: number[], stats: TaggedStatistics) {
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8'));
    // TODO: save checkpoints/IR (by chunk)
    const battle = Parser.parse(raw, data);
    const tags = data.format === 'gen7monotype' ? monotypes(data) : undefined;
    Stats.update(data, battle, cutoffs, stats, tags);
  } catch (err) {
    console.error(`${file}: ${err.message}`);
  }
}

function writeReports(
    options: Options, format: ID, cutoff: number, stats: Statistics, battles: number, tag?: ID) {
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
