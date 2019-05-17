import * as os from 'os';
import * as path from 'path';

import {Data, ID, toID} from 'ps';

import * as fs from './fs';
import {canonicalizeFormat, Parser, Reports, Statistics, Stats} from './index';

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

const monotypes = (data: Data) => new Set(Object.keys(data.Types).map(t => `mono${toID(t)}` as ID));

export async function process(month: string, reports: string) {
  rmrf(reports);
  await fs.mkdir(reports, {recursive: true, mode: 0o755});

  // YYYY-MM
  // └── format
  //    └── YYYY-MM-DD
  //        └── battle-format-N.log.json

  // TODO: async + multi process
  for (const f of await fs.readdir(month)) {
    const format = canonicalizeFormat(toID(f));
    if (format.startsWith('seasonal') || format.includes('random') ||
        format.includes('metronome' || format.includes('superstaff'))) {
      continue;
    }
    const cutoffs = POPULAR.has(format) ? CUTOFFS.popular : CUTOFFS.default;
    const data = Data.forFormat(format);
    const stats = Stats.create();

    const d = path.resolve(month, f);
    for (const day of await fs.readdir(d)) {
      const l = path.resolve(d, day);
      for (const log of await fs.readdir(l)) {
        const file = path.resolve(l, log);
        try {
          // TODO: gzip
          const raw = JSON.parse(await fs.readFile(file, 'utf8'));
          // TODO: save checkpoints/IR
          const battle = Parser.parse(raw, data);
          const tags = format === 'gen7monotype' ? monotypes(data) : undefined;
          Stats.update(data, battle, cutoffs, stats, tags);
        } catch (err) {
          console.error(`${file}: ${err.message}`);
        }
      }
    }

    // YYYY-MM
    // ├── chaos
    // │   └── format-N.json
    // ├── format-N.txt
    // ├── leads
    // │   └── format-N.txt
    // ├── metagame
    // │   └── format-N.txt
    // ├── monotype
    // │   ├── chaos
    // │   │   └── format-monoT-N.json
    // │   ├── format-monoT-N.txt
    // │   ├── leads
    // │   │   └── format-monoT-N.txt
    // │   ├── metagame
    // │   │   └── format-monoT-N.txt
    // │   └── moveset
    // │       └── format-monoT-N.txt
    // └── moveset
    //     └── format-N.txt

    // TODO: stream directly to file instead of building up string
    const b = stats.battles;
    for (const [c, s] of stats.total.entries()) {
      writeReports(reports, format, c, s, b);
    }

    for (const [t, ts] of stats.tags.entries()) {
      for (const [c, s] of ts.entries()) {
        writeReports(reports, format, c, s, b, t);
      }
    }
  }
}

function writeReports(
    reports: string, format: ID, cutoff: number, stats: Statistics, battles: number, tag?: ID) {
  const file = tag ? `${format}-${tag}-${cutoff}` : `${format}-${cutoff}`;
  const usage = Reports.usageReport(format, stats, battles);
  ensureWriteFileSync(path.resolve(reports, `${file}.txt`), usage);
  const leads = Reports.leadsReport(format, stats, battles);
  ensureWriteFileSync(path.resolve(reports, 'leads', `${file}.txt`), leads);
  const movesets = Reports.movesetReports(format, stats, battles, cutoff, tag);
  ensureWriteFileSync(path.resolve(reports, 'moveset', `${file}.txt`), movesets.basic);
  ensureWriteFileSync(path.resolve(reports, 'chaos', `${file}.json`), movesets.detailed);
  const metagame = Reports.metagameReport(stats);
  ensureWriteFileSync(path.resolve(reports, 'metagame', `${file}.txt`), metagame);
}

async function ensureWriteFileSync(file: string, data: string) {
  const dir = path.dirname(file);
  if (!(await fs.exists(dir))) await fs.mkdir(dir, {mode: 0o755});
  await fs.writeFile(file, data);
}

async function rmrf(dir: string) {
  if (await fs.exists(dir)) {
    for (const file of await fs.readdir(dir)) {
      const f = path.resolve(dir, file);
      if ((await fs.lstat(f)).isDirectory()) {
        await rmrf(f);
      } else {
        await fs.unlink(f);
      }
    }
    await fs.rmdir(dir);
  }
}
