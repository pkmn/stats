import { Dex, ID, toID } from 'ps';
import { Usage, Statistics} from './stats';

import * as util from './util';

const PRECISION = 1e4;

export interface DisplayStatistics {
  battles: number;
  pokemon: { [name: string]: DisplayUsageStatistics };
  metagame: DisplayMetagameStatistics;
}

export interface DisplayUsageStatistics {
  lead: Usage;
  usage: Usage;

  count: number;
  weight: number | null;
  viability: [number, number, number, number];

  abilities: { [name: string]: number };
  items: { [name: string]: number };
  happinesses: { [num: number]: number };
  spreads: { [spread: string]: number };
  stats: { [spread: string]: number };
  moves: { [name: string]: number };
  teammates: { [name: string]: number };
  counters: { [name: string]: [number, number, number] };
}

export interface DisplayMetagameStatistics {
  tags: { [tag: string]: number };
  stalliness: {
    histogram: Array<[number, number]>;
    mean: number;
    total: number;
  };
}

export const Display = new (class {
  fromStatistics(dex: Dex, stats: Statistics, min = 20) {
    const N = (n: string) => dex.getSpecies(n)?.species!;
    const R = (v: number) => util.round(v, PRECISION);

    const q = Object.entries(stats.pokemon);
    const real = ['challengecup1v1', '1v1'].includes(dex.format);
    const total = Math.max(1.0, real ? stats.usage.real : stats.usage.weighted);
    if (['randombattle', 'challengecup', 'challengcup1v1', 'seasonal'].includes(dex.format)) {
      q.sort((a, b) => N(a[0]).localeCompare(N(b[0])));
    } else if (real) {
      q.sort((a, b) => b[1].usage.real - a[1].usage.real || N(a[0]).localeCompare(N(b[0])));
    } else {
      q.sort((a, b) => b[1].usage.weighted - a[1].usage.weighted || N(a[0]).localeCompare(N(b[0])));
    }

    const calcUsage = (n: Usage, d: Usage) => ({
      raw: R((n.raw / d.raw) * 6),
      real: R((n.real / d.real) * 6),
      weighted: R((n.weighted / d.weighted) * 6),
    });

    const formatES = (v: util.EncounterStatistics) =>
      [R(v.n), R(v.p), R(v.d)] as [number, number, number];

    const pokemon: { [name: string]: DisplayUsageStatistics } = {};
    for (const [species, p] of q) {
      if (species === 'empty') continue;
      const usage = calcUsage(p.usage, stats.usage);
      if (!usage.weighted) break;

      pokemon[N(species)] = {
        lead: calcUsage(p.lead, stats.lead),
        usage,

        count: p.raw.count,
        weight: p.saved.count ? R(p.saved.weight / p.saved.count) : null,
        viability: util.computeViability(Object.values(p.gxes)),

        abilities: toDisplayObject(p.abilities, p.raw.weight, ability => {
          const o = dex.getAbility(ability);
          return (o && o.name) || ability;
        }),
        items: toDisplayObject(p.items, p.raw.weight, item => {
          if (item === 'nothing') return 'Nothing';
          const o = dex.getItem(item);
          return (o && o.name) || item;
        }),
        happinesses: toDisplayObject(p.happinesses, p.raw.weight),
        spreads: toDisplayObject(p.spreads, p.raw.weight),
        stats: toDisplayObject(p.stats, p.raw.weight),
        moves: toDisplayObject(p.moves, p.raw.weight, move => {
          if (move === '') return 'Nothing';
          const o = dex.getMove(move);
          return (o && o.name) || move;
        }),
        teammates: getTeammates(dex, p.teammates, p.raw.weight, total, stats),
        counters: util.getChecksAndCounters(p.encounters, [N, formatES], min),
      };
    }

    const ts = Object.entries(stats.metagame.tags).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
    const W = Math.max(1.0, stats.usage.weighted);
    const tags: { [id: string]: number } = {};
    for (const [tag, weight] of ts) {
      const r = R(weight / W);
      if (!r) break;
      tags[tag] = r;
    }
    const { histogram, mean, total: tot } = util.stallinessHistogram(stats.metagame.stalliness);

    const stalliness = {
      histogram: histogram.map(([bin, num]) => [R(bin), R(num)]),
      mean: R(mean),
      total: R(tot),
    };
    return {
      battles: stats.battles,
      pokemon,
      metagame: { tags, stalliness },
    };
  }

  fromReports(usage: string, leads: string, movesets: string, detailed: any, metagame: string) {
    console.log(usage.length, leads.length, movesets.length, metagame.length);
    console.log(parseUsageReport(usage));
    return null! as DisplayUsageStatistics; // TODO
  }
})();

function toDisplayObject(
  map: { [k: string /* number|ID */]: number },
  weight: number,
  display?: (id: string) => string
) {
  const obj: { [key: string]: number } = {};
  const d = (k: number | string) => (typeof k === 'string' && display ? display(k) : k.toString());
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1] || d(a[0]).localeCompare(d(b[0])));
  for (const [k, v] of sorted) {
    const r = util.round(v / weight, PRECISION);
    if (!r) break;
    obj[d(k)] = r;
  }
  return obj;
}

function getTeammates(
  dex: Dex,
  teammates: { [id: string /* ID */]: number },
  weight: number,
  total: number,
  stats: Statistics
): { [key: string]: number } {
  const real = ['challengecup1v1', '1v1'].includes(dex.format);
  const m: { [species: string]: number } = {};
  for (const [id, w] of Object.entries(teammates)) {
    const species = dex.getSpecies(id)?.species!;
    const s = stats.pokemon[id];
    if (!s) {
      m[species] = 0;
      continue;
    }
    const usage = ((real ? s.usage.real : s.usage.weighted) / total) * 6;
    m[species] = w - weight * usage;
  }
  return toDisplayObject(m, weight);
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
    if (line.length < 3) break;
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
