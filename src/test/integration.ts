import * as fs from 'fs';
import * as path from 'path';

import {ID, toID} from 'ps';

import * as stats from '../index';


const TESTDATA = path.resolve(__dirname, 'testdata');

const CUTOFFS = [0, 1500, 1630, 1760];
const TAGS = new Set(['monowater', 'monosteel'] as ID[]);

interface TaggedReports {
  total: WeightedReports;
  tags: Map<ID, WeightedReports>;
}
type WeightedReports = Map<number, Reports>;
interface Reports {
  usage: string;
  leads: string;
  movesets: {basic: string, detailed: string};
  metagame: string;
  // TODO update: string;
}

export function process() {
  const parsed: Map<ID, stats.Battle[]> = new Map();
  for (const dir of fs.readdirSync(path.resolve(TESTDATA, 'logs'))) {
    const format = toID(path.basename(dir));
    const battles: stats.Battle[] = [];
    for (const log of fs.readdirSync(dir)) {
      const raw = JSON.parse(fs.readFileSync(path.resolve(dir, log), 'utf8'));
      battles.push(stats.Parser.parse(raw, format));
    }
    parsed.set(format, battles);
  }

  const reports: Map<ID, TaggedReports> = new Map();
  for (const [format, battles] of parsed.entries()) {
    const taggedStats = stats.Stats.create();
    for (const battle of battles) {
      stats.Stats.update(format, battle, CUTOFFS, taggedStats, TAGS);
    }

    const trs = {total: new Map, tags: new Map()};
    const b = taggedStats.battles;  // === battles.length

    for (const [c, s] of taggedStats.total.entries()) {
      trs.total.set(c, createReports(format, s, b, c));
    }

    for (const [t, ts] of taggedStats.tags.entries()) {
      const wrs: WeightedReports = new Map();
      for (const [c, s] of ts.entries()) {
        wrs.set(c, createReports(format, s, b, c, t));
      }
      trs.tags.set(t, wrs);
    }
    reports.set(format, trs);
  }

  return reports;
}

export function update(reports: Map<ID, TaggedReports>) {
  const dir = path.resolve(TESTDATA, 'reports');
  rmrf(dir);
  fs.mkdirSync(dir);

  for (const [format, taggedReports] of reports.entries()) {
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
}

export function compare(reports: Map<ID, TaggedReports>, assert: (a: string, b: string) => void) {
  const dir = path.resolve(TESTDATA, 'reports');
  for (const [format, taggedReports] of reports.entries()) {
    const d = path.resolve(dir, format);

    for (const [c, rs] of taggedReports.total.entries()) {
      compareReports(d, rs, c, assert);
    }

    for (const [t, trs] of taggedReports.tags.entries()) {
      const td = path.resolve(d, t);

      for (const [c, rs] of trs.entries()) {
        compareReports(td, rs, c, assert);
      }
    }
  }
}

function createReports(
    format: ID, s: stats.Statistics, battles: number, cutoff?: number, tag: ID|null = null) {
  return {
    usage: stats.Reports.usageReport(format, s, battles),
    leads: stats.Reports.leadsReport(format, s, battles),
    movesets: stats.Reports.movesetReports(format, s, battles, cutoff, tag),
    metagame: stats.Reports.metagameReport(s),
  };
}

function writeReports(dir: string, reports: Reports, cutoff: number) {
  eachReport(dir, reports, cutoff, (name, data) => fs.writeFileSync(path.resolve(dir, name), data));
}

function compareReports(
    dir: string, reports: Reports, cutoff: number, assert: (a: string, b: string) => void) {
  eachReport(
      dir, reports, cutoff,
      (name, data) => assert(fs.readFileSync(path.resolve(dir, name), 'utf8'), data));
}

function eachReport(
    dir: string, reports: Reports, cutoff: number, fn: (name: string, data: string) => void) {
  fn(`usage.${cutoff}.txt`, reports.usage);
  fn(`leads.${cutoff}.txt`, reports.leads);
  fn(`movesets.${cutoff}.txt`, reports.movesets.basic);
  fn(`detailed.${cutoff}.json`, reports.movesets.detailed);
  fn(`metagame.${cutoff}.txt`, reports.metagame);
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