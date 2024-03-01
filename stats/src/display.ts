import {Generation, ID, toID} from '@pkmn/data';

import {
  Statistics, UniqueStatistics, Usage, UsageStatistics, combineUnique, newUsage,
} from './stats';
import * as util from './util';

const R = (v: number) => util.round(v, 1e4);

export interface DisplayStatistics<T = DisplayUsageStatistics> {
  battles: number;
  pokemon: {[name: string]: T};
  metagame?: DisplayMetagameStatistics;
}

export interface DisplayUsageStatistics {
  lead?: Usage;
  usage: Usage;
  unique: Usage;
  win: Usage;

  count: number;
  weight: number | null;
  viability: [number, number, number, number];

  abilities: {[name: string]: number};
  items: {[name: string]: number};
  stats: {[stats: string]: number};
  moves: {[name: string]: number};
  teammates: {[name: string]: number};
  counters: {[name: string]: [number, number, number]};
}

export interface LegacyDisplayUsageStatistics
  extends Omit<DisplayUsageStatistics, 'unique' | 'win' | 'stats'> {
  happinesses?: {[happiness: string]: number};
  spreads: {[spreads: string]: number};
}

export interface DisplayMetagameStatistics {
  tags: {[tag: string]: number};
  stalliness: {
    histogram: Array<[number, number]>;
    mean: number;
    total: number;
  };
}

// TODO: this doesnt really belong here
export interface DetailedUsageStatistics {
  info: {
    metagame: string;
    cutoff: number;
    'cutoff deviation': 0;
    'team type': ID | null;
    'number of battles': number;
  };
  data: {[name: string]: DetailedMovesetStatistics};
}

export interface DetailedMovesetStatistics {
  'Raw count': number;
  usage: number;
  // num GXE, max GXE, 1% GXE, 20% GXE
  'Viability Ceiling': [number, number, number, number];
  Abilities: {[ability: string]: number};
  Items: {[item: string]: number};
  Spreads: {[spread: string]: number};
  Happiness?: {[happiness: string]: number};
  Moves: {[move: string]: number};
  // FIXME: this changed 2021-04 from deltas to raw usage
  Teammates: {[pokemon: string]: number};
  // n = sum(POKE1_KOED...DOUBLE_SWITCH)
  // p = POKE1_KOED + POKE1_SWITCHED_OUT / n
  // d = sqrt((p * (1 - p)) / n)
  'Checks and Counters': {[pokemon: string]: [number, number, number]};
}

// Corrections for Pokémon who have had their names changed over time by developers.
const FIX: {[id: string]: string} = {
  mimikyutotembusted: 'mimikyubustedtotem',
};

const SPECIES = /\| (.*) [-+.0-9]+ \([-+.0-9]+±[-+.0-9]+\)/;
const OUTCOME = /\|\W+\(([-+.0-9]+)% KOed \/ ([-+.0-9]+)% switched out\)/;

export const Display = new class {
  fromStatistics(gen: Generation, format: ID, stats: Statistics, min = 20): DisplayStatistics {
    const N = (n: string) => gen.species.get(FIX[toID(n)] || n)?.name || n;

    const q = Object.entries(stats.pokemon);
    const real = ['challengecup1v1', '1v1'].includes(format);
    // const total = Math.max(1.0, real ? stats.usage.real : stats.usage.weighted);
    if (['randombattle', 'challengecup', 'challengcup1v1', 'seasonal'].includes(format)) {
      q.sort((a, b) => N(a[0]).localeCompare(N(b[0])));
    } else if (real) {
      q.sort((a, b) => b[1].usage.real - a[1].usage.real || N(a[0]).localeCompare(N(b[0])));
    } else {
      q.sort((a, b) => b[1].usage.weighted - a[1].usage.weighted || N(a[0]).localeCompare(N(b[0])));
    }

    const unique = computeUnique(stats.pokemon);

    const pokemon: {[name: string]: DisplayUsageStatistics} = {};
    for (const [species, p] of q) {
      if (species === 'empty') continue;
      const usage = calcUsage(p.usage, stats.usage, 6);
      if (!usage.weighted) break;

      const u = unique.pokemon[species];
      pokemon[N(species)] = {
        lead: calcUsage(p.lead, stats.lead), // BUG: remove for non singles?
        usage,
        unique: calcUsage(u.usage, unique.total, 6),
        win: calcUsage(p.win, p.usage),

        count: p.raw.count,
        weight: p.saved.count ? R(p.saved.weight / p.saved.count) : null,
        viability: util.computeViability(u.gxes),

        abilities: toDisplayObject(p.abilities, p.raw.weight, ability => {
          const o = gen.abilities.get(ability);
          return (o?.name) ?? ability;
        }),
        items: toDisplayObject(p.items, p.raw.weight, item => {
          if (item === 'nothing') return 'Nothing';
          const o = gen.items.get(item);
          return (o?.name) ?? item;
        }),
        stats: toDisplayObject(p.stats, p.raw.weight),
        moves: toDisplayObject(p.moves, p.raw.weight, move => {
          if (move === '') return 'Nothing';
          const o = gen.moves.get(move);
          return (o?.name) ?? move;
        }),
        // teammates: getTeammates(gen, format, p.teammates, p.raw.weight, total, stats),
        teammates: getTeammates(gen, p.teammates, p.raw.weight, stats),
        counters: util.getChecksAndCounters(p.encounters, [N, formatEncounterStatistics], min),
      };
    }

    const ts = Object.entries(stats.metagame.tags).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
    const W = Math.max(1.0, stats.usage.weighted);
    const tags: {[id: string]: number} = {};
    for (const [tag, weight] of ts) {
      const r = R(weight / W);
      if (!r) break;
      tags[tag] = r;
    }
    const {histogram, mean, total: tot} = util.stallinessHistogram(stats.metagame.stalliness);

    const stalliness = {
      histogram: histogram.map(([bin, num]) => [R(bin), R(num)] as [number, number]),
      mean: R(mean),
      total: R(tot),
    };
    return {
      battles: stats.battles,
      pokemon,
      metagame: {tags, stalliness},
    };
  }

  fromReports(
    gen: Generation,
    usageReport: string,
    movesetReport: string,
    detailedReport: string,
    metagameReport?: string,
    leadsReport?: string
  ): DisplayStatistics<LegacyDisplayUsageStatistics> {
    const N = (n: string) => gen.species.get(FIX[toID(n)] || n)?.name || n;

    const dr = JSON.parse(detailedReport) as DetailedUsageStatistics;
    const ur = parseUsageReport(usageReport);
    const pmr = partialParseMovesetReport(movesetReport);
    const mr = metagameReport ? parseMetagameReport(metagameReport) : undefined;
    const lr = leadsReport ? parseLeadsReport(leadsReport) : undefined;

    const pokemon: {[name: string]: LegacyDisplayUsageStatistics} = {};
    for (const [species, {weight: w, outcomes}] of Object.entries(pmr)) {
      if (species === 'empty') continue;
      const p = dr.data[species];
      if (!p) continue;

      const id = toID(species);
      const rawWeight = Object.values(p.Abilities).reduce((acc, v) => acc + v, 0);
      const weight = w ? R(w) : null;

      const urp = ur.usage[id];
      if (!urp) break;
      const usage = {
        raw: R(urp.rawp),
        real: R(urp.realp),
        weighted: R(urp.weightedp),
      };
      if (!usage.weighted) break;

      let lead: Usage | undefined = undefined;
      const lrp = lr?.usage[id];
      if (lrp) {
        lead = {raw: R(lrp.rawp), real: 0, weighted: R(lrp.weightedp)};
        lead.real = lead.raw;
      }

      const scored: {[name: string]: {score: number; val: [number, number, number]}} = {};
      for (const [k, [n]] of Object.entries(p['Checks and Counters'])) {
        if (!outcomes[k]) continue;
        const {koedn, switchedn} = outcomes[k];
        const q = R((koedn * n + switchedn * n) / n);
        const d = R(Math.sqrt((q * (1.0 - q)) / n));
        const score = R(q - 4 * d);
        scored[N(k)] = {score, val: [R(n), R(koedn), R(switchedn)]};
      }

      const counters: LegacyDisplayUsageStatistics['counters'] = {};
      const sorted = Object.entries(scored).sort((a, b) =>
        b[1].score - a[1].score || a[0].localeCompare(b[0]));
      for (const [k, v] of sorted) {
        counters[k] = v.val;
      }

      delete p.Teammates.empty;
      pokemon[N(species)] = {
        lead,
        usage,
        count: p['Raw count'],
        weight,
        viability: p['Viability Ceiling'],

        abilities: toDisplayObject(p.Abilities, rawWeight, ability => {
          const o = gen.abilities.get(ability);
          return (o?.name) ?? ability;
        }),
        items: toDisplayObject(p.Items, rawWeight, item => {
          if (item === 'nothing') return 'Nothing';
          const o = gen.items.get(item);
          return (o?.name) ?? item;
        }),
        happinesses: p.Happiness ? toDisplayObject(p.Happiness, rawWeight) : undefined,
        spreads: toDisplayObject(p.Spreads, rawWeight),
        moves: toDisplayObject(p.Moves, rawWeight, move => {
          if (move === '') return 'Nothing';
          const o = gen.moves.get(move);
          return (o?.name) ?? move;
        }),
        teammates: toDisplayObject(p.Teammates, rawWeight, N),
        counters,
      };
    }

    let metagame: DisplayMetagameStatistics | undefined = undefined;
    if (mr) {
      const tags: {[tag: string]: number} = {};
      for (const tag in mr.tags) {
        const r = R(mr.tags[tag]);
        if (!r) break;
        tags[tag] = r;
      }

      // BUG: this probably wrong
      const total = mr.histogram.reduce((acc, [, num]) => acc + num, 0) / Math.E;
      const stalliness = {
        histogram: mr.histogram.map(([bin, num]) =>
          [R(bin), R(num * mr.legend * total)] as [number, number]),
        mean: R(mr.mean),
        total: R(total),
      };
      metagame = {tags, stalliness};
    }

    return {
      battles: dr.info['number of battles'],
      pokemon,
      metagame,
    };
  }
};

function calcUsage(n: Usage, d: Usage, f = 1) {
  return {
    raw: R((n.raw / d.raw) * f),
    real: R((n.real / d.real) * f),
    weighted: R((n.weighted / d.weighted) * f),
  };
}

function formatEncounterStatistics(v: util.EncounterStatistics) {
  return [R(v.n), R(v.koed / v.n), R(v.switched / v.n)] as [number, number, number];
}

function toDisplayObject(
  map: {[k: string /* number|ID */]: number},
  weight: number,
  display?: (id: string) => string
) {
  const obj: {[key: string]: number} = {};
  const d = (k: number | string) => (typeof k === 'string' && display ? display(k) : k.toString());
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1] || d(a[0]).localeCompare(d(b[0])));
  for (const [k, v] of sorted) {
    const r = R(v / weight);
    if (!r) break;
    obj[d(k)] = r;
  }
  return obj;
}

function getTeammates(
  gen: Generation,
  // format: ID,
  teammates: {[id: string /* ID */]: number},
  weight: number,
  // total: number,
  stats: Statistics
): {[key: string]: number} {
  // const real = ['challengecup1v1', '1v1'].includes(format);
  const m: {[species: string]: number} = {};
  for (const [id, w] of Object.entries(teammates)) {
    const species = gen.species.get(id)?.name;
    if (!species) continue;
    const s = stats.pokemon[id];
    if (!s) {
      m[species] = 0;
      continue;
    }
    // const usage = ((real ? s.usage.real : s.usage.weighted) / total) * 6;
    // m[species] = w - weight * usage;
    m[species] = w;
  }
  return toDisplayObject(m, weight);
}

function computeUnique(stats: {[id: string /* ID */]: UsageStatistics}) {
  const pokemon: {[id: string /* ID */]: {usage: Usage; gxes: number[]}} = {};
  const all: {[id: string /* ID */]: UniqueStatistics} = {};

  for (const p in stats) {
    const usage = newUsage();
    const gxes = [];
    const unique = stats[p].unique;
    for (const player in unique) {
      const u = unique[player];

      usage.raw++;
      if ('r' in u) usage.real += u.r;
      if ('w' in u) usage.weighted += u.w;
      if ('g' in u) gxes.push(u.g);

      all[player] = combineUnique(u, all[player]);
    }
    pokemon[p] = {usage, gxes};
  }

  const total = newUsage();
  for (const player in all) {
    const u = all[player];

    total.raw++;
    if ('r' in u) total.real += u.r;
    if ('w' in u) total.weighted += u.w;
  }

  return {pokemon, total};
}

interface UsageReportRowData {
  weightedp: number;
  raw: number;
  rawp: number;
  real: number;
  realp: number;
}

function parseUsageReport(report: string) {
  const usage: {[id: string]: UsageReportRowData} = {};
  const lines = report.split('\n');
  const battles = Number(lines[0].slice(16));
  const avg = Number(lines[1].slice(19));

  for (let i = 5; i < lines.length; i++) {
    const line = lines[i].split('|');
    if (line.length < 7) break;
    const name = line[2].slice(1).trim();
    const weightedp = Number(line[3].slice(1, line[3].indexOf('%'))) / 100;
    const raw = Number(line[4].slice(1, -1));
    const rawp = Number(line[5].slice(1, line[5].indexOf('%'))) / 100;
    const real = Number(line[6].slice(1, -1));
    const realp = Number(line[7].slice(1, line[7].indexOf('%'))) / 100;
    usage[toID(name)] = {weightedp, raw, rawp, real, realp};
  }

  return {battles, avg, usage};
}

interface LeadsReportRowData {
  weightedp: number;
  raw: number;
  rawp: number;
}

function parseLeadsReport(report: string) {
  const usage: {[id: string]: LeadsReportRowData} = {};
  const lines = report.split('\n');
  const total = Number(lines[0].slice(13));

  for (let i = 4; i < lines.length; i++) {
    const line = lines[i].split('|');
    if (line.length < 5) break;
    const name = line[2].slice(1).trim();
    const weightedp = Number(line[3].slice(1, line[3].indexOf('%'))) / 100;
    const raw = Number(line[4].slice(1, -1));
    const rawp = Number(line[5].slice(1, line[5].indexOf('%'))) / 100;
    usage[toID(name)] = {weightedp, raw, rawp};
  }

  return {total, usage};
}

function partialParseMovesetReport(report: string) {
  const movesets: {
    [name: string]: {
      weight: number;
      outcomes: {[species: string]: {koedn: number; switchedn: number}};
    };
  } = {};
  let section = 0;
  let i = 0;
  let species = '';
  let s = '';
  for (const line of report.split('\n')) {
    i++;
    if (line.startsWith(' +')) {
      section++;
      i = 0;
      continue;
    }
    if (section % 9 === 1) {
      species = line.slice(3, line.indexOf('  '));
    }
    if (section % 9 === 2 && i === 2) {
      movesets[species] = {weight: Number(line.slice(17, line.indexOf(' ', 17))), outcomes: {}};
    }
    if (section % 9 === 8 && i >= 2) {
      if (i % 2 === 0) {
        s = SPECIES.exec(line)![1];
      } else {
        const outcome = OUTCOME.exec(line)!;
        movesets[species].outcomes[s] = {
          koedn: Number(outcome[1]) / 100,
          switchedn: Number(outcome[2]) / 100,
        };
      }
    }
  }

  return movesets;
}

function parseMetagameReport(report: string) {
  const tags: {[tag: string]: number} = {};
  const lines = report.split('\n');

  let i = 0;
  for (; i < lines.length; i++) {
    const d = lines[i].indexOf('.');
    if (d < 0) break;
    const tag = lines[i].slice(1, d);
    const weight = Number(lines[i].slice(lines[i].search(/\d/), lines[i].lastIndexOf('%'))) / 100;
    tags[tag] = weight;
  }
  i++;
  if (i >= lines.length) return {tags, mean: 0, histogram: [], legend: 0};
  const mean = Number(lines[i].slice(lines[i].search(/\d/), lines[i].lastIndexOf(')')));

  let j = 0;
  let start: number | null = null;
  let step: number | null = null;
  const values = [];
  const begin = ++i;
  for (; i < lines.length; i++) {
    const line = lines[i].split('|');
    if (line.length < 2) break;
    if (start === null || !step) {
      if (line[0].search(/\d/) >= 0) {
        const n = Number(line[0]);
        if (start === null) {
          start = n;
          j = i;
          if (i !== begin) step = 0;
        } else {
          const s: number = (n - start) / (i - j);
          if (step === 0) start -= (j - begin) * s;
          step = s;
        }
      }
    }
    values.push(line[1].length);
  }
  const histogram: Array<[number, number]> = [];
  for (const value of values) {
    histogram.push([start as number, value]);
    (start as number) += step!;
  }
  i++;
  const legend =
    lines[i] ? Number(lines[i].slice(lines[i].search(/\d/), lines[i].lastIndexOf('%'))) / 100 : 0;
  return {tags, mean, histogram, legend};
}
