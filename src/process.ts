// We expect the logs (YYYY-MM) directory to be structured as follows:
//
//     YYYY-MM
//     └── format
//         └── YYYY-MM-DD
//             └── battle-format-N.log.json
//
// The resulting reports will be written out in the following directory structure:
//
//     YYYY-MM
//     ├── chaos
//     │   └── format-N.json
//     ├── format-N.txt
//     ├── leads
//     │   └── format-N.txt
//     ├── metagame
//     │   └── format-N.txt
//     ├── monotype
//     │   ├── chaos
//     │   │   └── format-monoT-N.json
//     │   ├── format-monoT-N.txt
//     │   ├── leads
//     │   │   └── format-monoT-N.txt
//     │   ├── metagame
//     │   │   └── format-monoT-N.txt
//     │   └── moveset
//     │       └── format-monoT-N.txt
//     └── moveset
//         └── format-N.txt

import * as os from 'os';
import * as path from 'path';
import {Data, ID, toID} from 'ps';

import * as fs from './fs';
import {canonicalizeFormat, Parser, Reports, Statistics, Stats, TaggedStatistics} from './index';

const NUM_CPUS = os.cpus().length;

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

export async function process(month: string, reports: string) {
  // Set up out report output directory structure
  await rmrf(reports);
  await fs.mkdir(reports, {recursive: true, mode: 0o755});
  const monotype = path.resolve(reports, 'monotype');
  await fs.mkdir(monotype, {mode: 0o755});
  await Promise.all([...mkdirs(reports), ...mkdirs(monotype)]);

  // All of the reports we're writing
  const writes: Array<Promise<void>> = [];
  // TODO: multi process
  for (const f of await fs.readdir(month)) {
    const format = canonicalizeFormat(toID(f));
    if (format.startsWith('seasonal') || format.includes('random') ||
        format.includes('metronome' || format.includes('superstaff'))) {
      continue;
    }
    const cutoffs = POPULAR.has(format) ? CUTOFFS.popular : CUTOFFS.default;
    const data = Data.forFormat(format);
    const stats = Stats.create();
    // TODO: chunk the number of files we read instead of all at once
    const logs: Array<Promise<void>> = [];

    const d = path.resolve(month, f);
    for (const day of await fs.readdir(d)) {
      const l = path.resolve(d, day);
      for (const log of await fs.readdir(l)) {
        logs.push(processLog(format, data, path.resolve(l, log), cutoffs, stats));
      }
    }
    await Promise.all(logs);

    const b = stats.battles;
    for (const [c, s] of stats.total.entries()) {
      writes.push(...writeReports(reports, format, c, s, b));
    }

    for (const [t, ts] of stats.tags.entries()) {
      for (const [c, s] of ts.entries()) {
        writes.push(...writeReports(reports, format, c, s, b, t));
      }
    }
  }
  await Promise.all(writes);
}

const monotypes = (data: Data) => new Set(Object.keys(data.Types).map(t => `mono${toID(t)}` as ID));

async function processLog(
    format: ID, data: Data, file: string, cutoffs: number[], stats: TaggedStatistics) {
  try {
    // TODO: gzip if necessary
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

function mkdirs(dir: string) {
  const dirs: Array<Promise<void>> = [];
  dirs.push(fs.mkdir(path.resolve(dir, 'chaos'), {mode: 0o755}));
  dirs.push(fs.mkdir(path.resolve(dir, 'leads'), {mode: 0o755}));
  dirs.push(fs.mkdir(path.resolve(dir, 'moveset'), {mode: 0o755}));
  dirs.push(fs.mkdir(path.resolve(dir, 'metagame'), {mode: 0o755}));
  return dirs;
}

async function rmrf(dir: string) {
  if (await fs.exists(dir)) {
    const rms: Array<Promise<void>> = [];
    for (const file of await fs.readdir(dir)) {
      const f = path.resolve(dir, file);
      if ((await fs.lstat(f)).isDirectory()) {
        rms.push(rmrf(f));
      } else {
        rms.push(fs.unlink(f));
      }
    }
    await Promise.all(rms);
    await fs.rmdir(dir);
  }
}