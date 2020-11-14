import * as fs from 'fs';
import * as path from 'path';
import stringify from 'json-stringify-pretty-compact';

import {Dex} from '@pkmn/dex';
import {Generation, ID, toID} from '@pkmn/data';

import * as stats from '../index';
import {newGenerations, genForFormat} from '../util';

const TESTDATA = path.resolve(__dirname.replace('build', 'src'), 'testdata');
// const MONTHS: [string, string, string] = [
//   path.resolve(TESTDATA, 'stats', '2018-06'),
//   path.resolve(TESTDATA, 'stats', '2018-05'),
//   path.resolve(TESTDATA, 'stats', '2018-04'),
// ];
const UPDATE = path.resolve(TESTDATA, 'stats', 'update.txt');
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
  movesets: { basic: string; detailed: string };
  metagame: string;
  display: string;
}
type CompareFn = (file: string, actual: string, expected: string) => void;

export function process() {
  const gens = newGenerations(Dex);

  const base = path.resolve(TESTDATA, 'logs');
  const parsed: Map<ID, stats.Battle[]> = new Map();
  for (const dir of fs.readdirSync(base)) {
    const format = toID(dir);
    const battles: stats.Battle[] = [];
    for (const log of fs.readdirSync(path.resolve(base, dir))) {
      const raw = JSON.parse(fs.readFileSync(path.resolve(base, dir, log), 'utf8'));
      const gen = genForFormat(gens, format);
      battles.push(stats.Parser.parse(gen, format, raw));
    }
    parsed.set(format, battles);
  }

  const formats: Map<ID, TaggedReports> = new Map();
  for (const [format, battles] of parsed.entries()) {
    const gen = genForFormat(gens, format);
    const taggedStats = {total: {}, tags: {}};
    for (const battle of battles) {
      stats.Stats.updateTagged(gen, format, battle, CUTOFFS, taggedStats /* , TAGS */);
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

  // TODO: add test data for gen8ou and figure out a stable way to test
  // const tiers = await stats.Reports.tierUpdateReport(gens.get(8), MONTHS, (month, format) => {
  //   const baseline = format.startsWith('gen8ou') ? 1695 : 1630;
  //   const file = path.resolve(`${month}`, `${format}-${baseline}.txt`);
  //   return new Promise((resolve, reject) => {
  //     fs.readFile(file, 'utf8', (err, data) => {
  //       if (err) {
  //         return err.code === 'ENOENT' ? resolve(undefined) : reject(err);
  //       }
  //       resolve(data);
  //     });
  //   });
  // });

  return {formats, tiers: ''};
}

export function update(reports: { formats: Map<ID, TaggedReports>; tiers: string }) {
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

  if (reports.tiers) fs.writeFileSync(UPDATE, reports.tiers);
}

export function compare(
  reports: { formats: Map<ID, TaggedReports>; tiers: string },
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

  if (reports.tiers) cmp(UPDATE, reports.tiers, fs.readFileSync(UPDATE, 'utf8'));
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
