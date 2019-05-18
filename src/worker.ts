import * as path from 'path';
import {Data, ID, toID} from 'ps';
import {Parser, Reports, Statistics, Stats, TaggedStatistics} from 'stats';
import {parentPort, workerData} from 'worker_threads';

import * as fs from './fs';
import * as main from './main';

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

const monotypes = (data: Data) => new Set(Object.keys(data.Types).map(t => `mono${toID(t)}` as ID));

interface Options extends main.Options {
  reportsPath: string;
}

async function process(formats: main.FormatData[], options: Options) {
  // All of the reports we're writing
  const writes: Array<Promise<void>> = [];
  for (const {format, size, files} of formats) {
    const cutoffs = POPULAR.has(format) ? CUTOFFS.popular : CUTOFFS.default;
    const data = Data.forFormat(format);
    const stats = Stats.create();
    // TODO: chunk the number of files we read instead of all at once
    const logs: Array<Promise<void>> = [];
    for (const file of files) {
      logs.push(processLog(format, data, file, cutoffs, stats));
    }
    await Promise.all(logs);

    const b = stats.battles;
    for (const [c, s] of stats.total.entries()) {
      writes.push(...writeReports(options.reportsPath, format, c, s, b));
    }

    for (const [t, ts] of stats.tags.entries()) {
      for (const [c, s] of ts.entries()) {
        writes.push(...writeReports(options.reportsPath, format, c, s, b, t));
      }
    }
  }
  await Promise.all(writes);
}

async function processLog(
    format: ID, data: Data, file: string, cutoffs: number[], stats: TaggedStatistics) {
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8'));
    // TODO: save checkpoints/IR (by chunk)
    const battle = Parser.parse(raw, data);
    const tags = format === 'gen7monotype' ? monotypes(data) : undefined;
    Stats.update(data, battle, cutoffs, stats, tags);
  } catch (err) {
    console.error(`${file}: ${err.message}`);
  }
}

function writeReports(
    reports: string, format: ID, cutoff: number, stats: Statistics, battles: number, tag?: ID) {
  const file = tag ? `${format}-${tag}-${cutoff}` : `${format}-${cutoff}`;
  const usage = Reports.usageReport(format, stats, battles);

  const writes: Array<Promise<void>> = [];
  writes.push(fs.writeFile(path.resolve(reports, `${file}.txt`), usage));
  const leads = Reports.leadsReport(format, stats, battles);
  writes.push(fs.writeFile(path.resolve(reports, 'leads', `${file}.txt`), leads));
  const movesets = Reports.movesetReports(format, stats, battles, cutoff, tag);
  writes.push(fs.writeFile(path.resolve(reports, 'moveset', `${file}.txt`), movesets.basic));
  writes.push(fs.writeFile(path.resolve(reports, 'chaos', `${file}.json`), movesets.detailed));
  const metagame = Reports.metagameReport(stats);
  writes.push(fs.writeFile(path.resolve(reports, 'metagame', `${file}.txt`), metagame));
  return writes;
}

// tslint:disable-next-line: no-floating-promises
(async () => parentPort!.postMessage(await process(workerData.formats, workerData.options)))();
