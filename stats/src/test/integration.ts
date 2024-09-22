import * as fs from 'fs';
import * as path from 'path';

import {Generation, ID, toID} from '@pkmn/data';
import {Dex} from '@pkmn/dex';
import stringify from 'json-stringify-pretty-compact';

import * as stats from '../index';
import {genForFormat, newGenerations} from '../util';

import * as TIERS from './testdata/stats/tiers.json';

const TESTDATA = path.resolve(__dirname.replace('build', 'src'), 'testdata');

const MONTHS: [string, string, string] = [
  path.resolve(TESTDATA, 'stats', '2024-06'),
  path.resolve(TESTDATA, 'stats', '2024-05'),
  path.resolve(TESTDATA, 'stats', '2024-04'),
];

// https://www.smogon.com/forums/posts/10173519
const UPDATE = {
  singles: path.resolve(TESTDATA, 'stats', 'update', 'singles.txt'),
  doubles: path.resolve(TESTDATA, 'stats', 'update', 'doublesTier.txt'),
  nationaldex: path.resolve(TESTDATA, 'stats', 'update', 'nationaldex.txt'),
  littlecup: path.resolve(TESTDATA, 'stats', 'update', 'littlecup.txt'),
};

const CUTOFFS = [0, 1500, 1630, 1760];
// TODO const TAGS = new Set(['monowater', 'monosteel'] as ID[]);

interface TaggedReports {
  total: WeightedReports;
  tags: Map<ID, WeightedReports>;
}
type WeightedReports = Map<number, Reports>;
interface Reports {
  usage: string;
  leads: string;
  movesets: {basic: string; detailed: string};
  metagame: string;
  display: string;
}
type CompareFn = (file: string, actual: string, expected: string) => void;

export async function process() {
  const gens = newGenerations(Dex);

  const base = path.resolve(TESTDATA, 'logs');
  const parsed: Map<ID, stats.Battle[]> = new Map();
  for (const dir of fs.readdirSync(base)) {
    const format = toID(dir);
    const battles: stats.Battle[] = [];
    for (const log of fs.readdirSync(path.resolve(base, dir))) {
      const raw = JSON.parse(fs.readFileSync(path.resolve(base, dir, log), 'utf8'));
      const gen = genForFormat(gens, format);
      battles.push(stats.Parser.parse(gen, format, raw, true));
    }
    parsed.set(format, battles);
  }

  const formats: Map<ID, TaggedReports> = new Map();
  for (const [format, battles] of parsed.entries()) {
    const gen = genForFormat(gens, format);
    const taggedStats = {total: {}, tags: {}};
    for (const battle of battles) {
      stats.Stats.updateTagged(gen, format, battle, CUTOFFS, taggedStats, true/* , TAGS */);
    }

    const trs = {total: new Map(), tags: new Map()};
    for (const [c, s] of Object.entries(taggedStats.total)) {
      const cutoff = Number(c);
      trs.total.set(cutoff, createReports(gen, format, s as stats.Statistics, cutoff));
    }

    for (const [t, ts] of Object.entries(taggedStats.tags)) {
      const wrs: WeightedReports = new Map();
      for (const [c, s] of Object.entries(ts as stats.WeightedStatistics)) {
        const cutoff = Number(c);
        wrs.set(cutoff, createReports(gen, format, s as stats.Statistics, cutoff, t as ID));
      }
      trs.tags.set(t, wrs);
    }
    formats.set(format, trs);
  }

  override(Dex);
  const tiers: {[type: string]: string} = {};
  for (const type of ['singles', 'doubles', 'nationaldex', 'littlecup'] as const) {
    tiers[type] = await stats.Reports.tierUpdateReport(gens.get(9), MONTHS, (month, format) => {
      const baseline = ['ou', 'doublesou'].includes(format.slice(4)) ? 1695 : 1630;
      const file = path.resolve(`${month}`, `${format}-${baseline}.txt`);
      return new Promise((resolve, reject) => {
        fs.readFile(file, 'utf8', (err, data) => {
          if (err) return err.code === 'ENOENT' ? resolve(undefined) : reject(err);
          resolve([baseline, data]);
        });
      });
    }, type, true);
  }

  return {formats, tiers};
}

function override(d: typeof Dex) {
  const dex = d.forGen(9);
  for (const tier in TIERS) {
    if (tier === 'default') continue;
    for (const t in (TIERS as any)[tier]) {
      for (const species of (TIERS as any)[tier][t]) {
        (dex.species.get(species) as any)[tier] = t;
      }
    }
  }
}

export function update(reports: {
  formats: Map<ID, TaggedReports>;
  tiers: {[type: string]: string};
}) {
  const dir = path.resolve(TESTDATA, 'reports');
  rmrf(dir);
  fs.mkdirSync(dir);

  for (const [format, taggedReports] of reports.formats.entries()) {
    const d = path.resolve(dir, format);
    fs.mkdirSync(d);

    for (const [c, rs] of taggedReports.total.entries()) {
      writeReports(d, rs, c);
    }

    for (const [t, trs] of taggedReports.tags.entries()) {
      const td = path.resolve(d, t);
      fs.mkdirSync(td);

      for (const [c, rs] of trs.entries()) {
        writeReports(td, rs, c);
      }
    }
  }

  for (const type in reports.tiers) {
    fs.writeFileSync((UPDATE as any)[type], reports.tiers[type]);
  }
}
export function compare(
  reports: {formats: Map<ID, TaggedReports>; tiers: {[type: string]: string}},
  cmp: CompareFn
) {
  const dir = path.resolve(TESTDATA, 'reports');
  for (const [format, taggedReports] of reports.formats.entries()) {
    const d = path.resolve(dir, format);

    for (const [c, rs] of taggedReports.total.entries()) {
      compareReports(d, rs, c, cmp);
    }

    for (const [t, trs] of taggedReports.tags.entries()) {
      const td = path.resolve(d, t);

      for (const [c, rs] of trs.entries()) {
        compareReports(td, rs, c, cmp);
      }
    }
  }

  for (const type in reports.tiers) {
    const file = (UPDATE as any)[type];
    cmp(file, reports.tiers[type], fs.readFileSync(file, 'utf8'));
  }
}

function createReports(
  gen: Generation,
  format: ID,
  s: stats.Statistics,
  cutoff?: number,
  tag: ID | null = null
) {
  return {
    usage: stats.Reports.usageReport(gen, format, s),
    leads: stats.Reports.leadsReport(gen, s),
    movesets: stats.Reports.movesetReports(gen, format, s, cutoff, tag, [0, -Infinity]),
    metagame: stats.Reports.metagameReport(s),
    display: stringify(stats.Display.fromStatistics(gen, format, s, 0)),
  };
}

function writeReports(dir: string, reports: Reports, cutoff: number) {
  eachReport(reports, cutoff, (name, data) => {
    fs.writeFileSync(path.resolve(dir, name), data);
  });
}

function compareReports(dir: string, reports: Reports, cutoff: number, cmp: CompareFn) {
  eachReport(reports, cutoff, (name, data) => {
    const file = path.resolve(dir, name);
    cmp(file, data, fs.readFileSync(file, 'utf8'));
  });
}

function eachReport(reports: Reports, cutoff: number, fn: (name: string, data: string) => void) {
  fn(`usage.${cutoff}.txt`, reports.usage);
  fn(`leads.${cutoff}.txt`, reports.leads);
  fn(`movesets.${cutoff}.txt`, reports.movesets.basic);
  fn(`detailed.${cutoff}.json`, reports.movesets.detailed);
  fn(`metagame.${cutoff}.txt`, reports.metagame);
  fn(`display.${cutoff}.json`, reports.display);
}

function rmrf(dir: string) {
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      const f = path.resolve(dir, file);
      if (fs.lstatSync(f).isDirectory()) {
        rmrf(f);
      } else {
        fs.unlinkSync(f);
      }
    }
    fs.rmdirSync(dir);
  }
}
