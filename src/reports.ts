import {Data, ID, toID} from 'ps';

import {Outcome} from './parser';
import {MetagameStatistics, Statistics, Usage} from './stats';
import * as util from './util';

interface MovesetStatistics {
  'Raw count': number;
  'Viability Ceiling': [number, number, number, number];
  'Abilities': {[key: string]: number};
  'Items': {[key: string]: number};
  'Spreads': {[key: string]: number};
  'Moves': {[key: string]: number};
  'Teammates': {[key: string]: number};
  'Checks and Counters': {[key: string]: EncounterStatistics};
  'usage': number;
}

interface EncounterStatistics {
  koed: number;
  switched: number;
  n: number;
  p: number;
  d: number;
  score: number;
}

export const Reports = new class {
  usageReport(format: ID, stats: Statistics, battles: number) {
    const sorted = Array.from(stats.pokemon.entries());
    if (['challengecup1v1', '1v1'].includes(format)) {
      sorted.sort((a, b) => b[1].usage.real - a[1].usage.real);
    } else {
      sorted.sort((a, b) => b[1].usage.weighted - a[1].usage.weighted);
    }

    let s = ` Total battles: ${battles}\n`;
    const avg = battles ? Math.round(stats.usage.weighted / battles / 12) : 0;
    s += ` Avg. weight/team: ${avg}\n`;
    s += ` + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n`;
    s += ` | Rank | Pokemon            | Usage %   | Raw    | %       | Real   | %       | \n`;
    s += ` + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n`;

    const total = {
      raw: Math.max(1.0, stats.usage.raw) * 6.0,
      real: Math.max(1.0, stats.usage.real) * 6.0,
      weighted: Math.max(1.0, stats.usage.weighted) * 6.0,
    };

    for (const [i, entry] of sorted.entries()) {
      const species = entry[0];
      const usage = entry[1].usage;
      if (species === 'empty') continue;
      if (usage.raw === 0) break;

      const rank = (i + 1).toFixed().padEnd(4);
      const poke = util.getSpecies(species, format).species.padEnd(18);
      const use = (100 * usage.weighted / total.weighted).toFixed(5).padStart(8);
      const raw = usage.raw.toFixed().padEnd(6);
      const rawp = (100 * usage.raw / total.raw).toFixed(3).padStart(6);
      const real = usage.real.toFixed().padEnd(6);
      const realp = (100 * usage.real / total.real).toFixed(3).padStart(6);
      s += ` | ${rank} | ${poke} | ${use}% | ${raw} | ${rawp}% | ${real} | ${realp}% | \n`;
    }
    s += ` + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n`;
    return s;
  }

  leadsReport(format: ID, stats: Statistics, battles: number) {
    let s = ` Total leads: ${battles * 2}\n`;
    s += ' + ---- + ------------------ + --------- + ------ + ------- + \n';
    s += ' | Rank | Pokemon            | Usage %   | Raw    | %       | \n';
    s += ' + ---- + ------------------ + --------- + ------ + ------- + \n';

    const total = {raw: 0, weighted: 0};
    total.raw = Math.max(1.0, stats.leads.raw);
    total.weighted = Math.max(1.0, stats.leads.weighted);

    const sorted =
        Array.from(stats.pokemon.entries()).sort((a, b) => b[1].lead.weighted - a[1].lead.weighted);
    for (const [i, entry] of sorted.entries()) {
      const species = entry[0];
      const usage = entry[1].lead;
      if (species === 'empty') continue;
      if (usage.raw === 0) break;

      const rank = (i + 1).toFixed().padEnd(4);
      const poke = util.getSpecies(species, format).species.padEnd(18);
      const use = (100 * usage.weighted / total.weighted).toFixed(5).padStart(8);
      const raw = usage.raw.toFixed().padEnd(6);
      const pct = (100 * usage.raw / total.raw).toFixed(3).padStart(6);
      s += ` | ${rank} | ${poke} | ${use}% | ${raw} | ${pct}% | \n`;
    }

    s += ' + ---- + ------------------ + --------- + ------ + ------- + \n';
    return s;
  }

  movesetReports(
      format: ID, stats: Statistics, battles: number, cutoff = 1500, tag: ID|null = null) {
    const movesetStats = toMovesetStatistics(format, stats);
    const basic = this.movesetReport(format, stats, movesetStats);
    const detailed = this.detailedMovesetReport(format, stats, battles, cutoff, tag, movesetStats);
    return {basic, detailed};
  }

  movesetReport(format: ID, stats: Statistics, movesetStats?: Map<ID, MovesetStatistics>) {
    movesetStats = movesetStats || toMovesetStatistics(format, stats);

    const data = Data.forFormat(format);
    const WIDTH = 40;

    const sep = ` +${'-'.repeat(WIDTH)}+ `;
    let s = '';
    for (const [species, moveset] of movesetStats.entries()) {
      if (moveset.usage < 0.0001) break;  // 1/100th of a percent

      const p = stats.pokemon.get(species)!;

      s += sep;
      s += ` | ${util.getSpecies(species, data).species}`.padEnd(WIDTH + 2) + '| ';
      s += sep;
      s += ` | Raw count: ${moveset['Raw count']}`.padEnd(WIDTH + 2) + '| ';
      const avg = p.weights.count ? `${Math.floor(p.weights.sum / p.weights.count)}` : '---';
      s += ` | Avg. weight: ${avg}`.padEnd(WIDTH + 2) + '| ';
      const ceiling = Math.floor(moveset['Viability Ceiling'][1]);
      s += ` | Viability Ceiling: ${ceiling}`.padEnd(WIDTH + 2) + '| ';
      s += sep;

      let total = 0;
      s += ' | Abilities'.padEnd(WIDTH + 2) + '| ';
      for (const [i, ability] of Object.keys(moveset['Abilities']).entries()) {
        if (i > 5) {
          s += ` | Other ${(100 * (1 - total)).toFixed(3).padStart(6)}%`.padEnd(WIDTH + 2) + ' |';
          break;
        }
        const weight = moveset['Abilities'][ability];
        s += ` | ${ability} ${weight.toFixed(3).padStart(6)}%`.padEnd(WIDTH + 2) + ' |';
        // total = total + (weight / count); // TODO
      }
      s += sep;
      total = 0;
      s += ' | Items'.padEnd(WIDTH + 2) + '| ';
      // TODO
      s += sep;
      total = 0;
      s += ' | Spreads'.padEnd(WIDTH + 2) + '| ';
      // TODO
      s += sep;
      total = 0;
      s += ' | Moves'.padEnd(WIDTH + 2) + '| ';
      // TODO
      s += sep;
      total = 0;
      s += ' | Teammates'.padEnd(WIDTH + 2) + '| ';
      // TODO
      s += sep;
      total = 0;
      s += ' | Checks and Counters'.padEnd(WIDTH + 2) + '| ';
      // TODO
      s += sep;
    }

    return s;
  }

  detailedMovesetReport(
      format: ID, stats: Statistics, battles: number, cutoff = 1500, tag: ID|null = null,
      movesetStats?: Map<ID, MovesetStatistics>) {
    movesetStats = movesetStats || toMovesetStatistics(format, stats);

    const info = {
      'metagame': format,
      'cutoff': cutoff,
      'cutoff deviation': 0,
      'team type': tag,
      'number of battles': battles,
    };

    const d = Data.forFormat(format);
    const data: {[key: string]: object} = {};
    for (const [species, moveset] of movesetStats.entries()) {
      if (moveset.usage < 0.0001) break;  // 1/100th of a percent
      // tslint:disable-next-line: no-any
      const m: any = Object.assign({}, moveset);
      m['Checks and Counters'] = forDetailed(m['Checks and Counters']);
      data[util.getSpecies(species, d).species] = m;
    }

    return JSON.stringify({info, data});
  }

  metagameReport(stats: Statistics) {
    const metagame = stats.metagame;
    const W = Math.max(1.0, stats.usage.weighted);

    const tags = Object.entries(metagame.tags).sort((a, b) => b[1] - a[1]);
    let s = '';
    for (const [tag, weight] of tags) {
      s += ` ${tag}`.padEnd(30, '.');
      s += `${(weight / W).toFixed(5).padStart(8)}%\n`;
    }
    s += '\n';

    if (!metagame.stalliness.length) return s;
    const stalliness = metagame.stalliness.sort((a, b) => a[0] - b[0]);

    // Figure out a good bin range by looking at .1% and 99.9% points
    const index = Math.floor(stalliness.length / 1000);
    const low = Math.max(stalliness[index][0], 0);
    const high = Math.min(stalliness[stalliness.length - index - 1][0], 0);

    // Rough guess at number of bins - possible the minimum?
    let nbins = 13;
    const size = (high - low) / (nbins - 1);
    // Try to find a prettier bin size, zooming into 0.05 at most.
    const binSize =
        [10, 5, 2.5, 2, 1.5, 1, 0.5, 0.25, 0.2, 0.1, 0.05].find(bs => size > bs) || 0.05;
    let histogram = [[0, 0]];
    for (let x = binSize; x + binSize / 2 < high; x += binSize) {
      histogram.push([x, 0]);
    }
    for (let x = -binSize; x - binSize / 2 > low; x -= binSize) {
      histogram.push([x, 0]);
    }
    histogram = histogram.sort((a, b) => a[0] - b[0]);
    nbins = histogram.length;

    const start = 0;
    // FIXME: Python comparison of an array and a number = break immediately.
    // for (; start < stalliness.length; start++) {
    //   if (stalliness[start] >= histogram[0][0] - binSize / 2) break;
    // }
    let j = 0;
    for (let i = start; i < stalliness.length; i++) {
      while (stalliness[i][0] > histogram[0][0] + binSize * (j * 0.5)) j++;
      if (j >= nbins) break;
      histogram[j][1] = histogram[j][1] + stalliness[i][1];
    }
    let max = 0;
    for (let i = 0; i < nbins; i++) {
      if (histogram[i][1] > max) max = histogram[i][1];
    }

    // Maximum number of blocks to go across
    const MAX_BLOCKS = 30;
    const blockSize = max / MAX_BLOCKS;

    if (blockSize <= 0) return s;

    let x = 0;
    let y = 0;
    for (const [val, weight] of stalliness) {
      x += val * weight;
      y += weight;
    }

    s += ` Stalliness (mean: ${(x / y).toFixed(3).padStart(6)})\n`;
    for (const h of histogram) {
      let line = '     |';
      if (h[0] % (2 * binSize) < Math.floor(binSize / 2)) {
        line = ' ';
        if (h[0] > 0) {
          line += '+';
        } else if (h[0] === 0) {
          line += ' ';
        }
        line += `${h[0].toFixed(1).padStart(3)}|`;
      }
      s += line + '#'.repeat(Math.floor((h[1] + blockSize / 2) / blockSize)) + '\n';
    }
    s += ` more negative = more offensive, more positive = more stall\n`;
    s += ` one # = ${(100.0 * blockSize / y).toFixed(2).padStart(5)}%`;
    return s;
  }

  updateReport() {}  // TODO rises and drops
};

function toMovesetStatistics(format: ID, stats: Statistics) {
  const sorted = Array.from(stats.pokemon.entries());
  const real = ['challengecup1v1', '1v1'].includes(format);
  if (['randombattle', 'challengecup', 'challengcup1v1', 'seasonal'].includes(format)) {
    sorted.sort((a, b) => a[0].localeCompare(b[0]));
  } else if (real) {
    sorted.sort((a, b) => b[1].usage.real - a[1].usage.real);
  } else {
    sorted.sort((a, b) => b[1].usage.weighted - a[1].usage.weighted);
  }
  const data = Data.forFormat(format);

  const movesets: Map<ID, MovesetStatistics> = new Map();
  for (const entry of sorted) {
    const species = entry[0];
    const pokemon = entry[1];
    const usage = real ? pokemon.usage.real : pokemon.usage.weighted;
    const gxes = Array.from(pokemon.gxes.values()).sort((a, b) => b - a);
    const viability: [number, number, number, number] = gxes.length ?
        [
          gxes.length, gxes[0], gxes[Math.ceil(0.01 * gxes.length) - 1],
          gxes[Math.ceil(0.2 * gxes.length) - 1]
        ] :
        [0, 0, 0, 0];
    movesets.set(species, {
      'Raw count': pokemon.count,
      'Viability Ceiling': viability,
      'Abilities': toObject(
          pokemon.abilities,
          a => {
            const o = data.getAbility(a);
            return (o && o.name) || a;
          }),
      'Items': toObject(
          pokemon.items,
          i => {
            if (i === 'nothing') return 'Nothing';
            const o = data.getItem(i);
            return (o && o.name) || i;
          }),
      'Spreads': toObject(pokemon.spreads),
      'Moves': toObject(
          pokemon.moves,
          m => {
            const o = data.getMove(m);
            return (o && o.name) || m;
          }),
      'Teammates': getTeammates(format, pokemon.teammates, pokemon.count, stats),
      'Checks and Counters':
          getChecksAndCounters(pokemon.encounters, s => util.getSpecies(species, data).species),
      'usage': usage,
    });
  }

  return movesets;
}

function getTeammates(format: ID, teammates: Map<ID, number>, count: number, stats: Statistics):
    {[key: string]: number} {
  const real = ['challengecup1v1', '1v1'].includes(format);
  const m: Map<string, number> = new Map();
  for (const [id, w] of teammates.entries()) {
    const species = util.getSpecies(id, format).species;
    const s = stats.pokemon.get(id);
    m.set(species, s ? (w - count * (real ? s.usage.real : s.usage.weighted)) : 0);
  }
  return toObject(m);
}

function getChecksAndCounters(
    encounters: Map<ID, number[/* Outcome */]>, display: (id: string) => string) {
  const cc: Array<[string, EncounterStatistics]> = [];
  for (const [id, outcomes] of encounters.entries()) {
    // Outcome.POKE1_KOED...Outcome.DOUBLE_SWITCH
    const n = outcomes.slice(6).reduce((a, b) => a + b);
    if (n <= 20) continue;

    const koed = outcomes[Outcome.POKE1_KOED];
    const switched = outcomes[Outcome.POKE2_SWITCHED_OUT];
    const p = (koed + switched) / n;
    const d = Math.sqrt(p * (1.0 - p) / n);
    const score = p - 4 * d;
    cc.push([id, {koed, switched, n, p, d, score}]);
  }

  const sorted = cc.sort((a, b) => (b[1].score - a[1].score));
  const obj: {[key: string]: EncounterStatistics} = {};
  for (const [k, v] of sorted) {
    obj[display(k)] = v;
  }
  return obj;
}

function forDetailed(cc: {[key: string]: EncounterStatistics}) {
  const obj: {[key: string]: [number, number, number]} = {};
  for (const [k, v] of Object.entries(cc)) {
    obj[k] = [v.n, v.p, v.d];
  }
  return obj;
}

function toObject(
    map: Map<string, number>, display?: (id: string) => string): {[key: string]: number} {
  const obj: {[key: string]: number} = {};
  const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted) {
    const d = display ? display(k) : k;
    obj[d] = v;
  }
  return obj;
}

function parseUsageReport(report: string) {
  const usage: Map<ID, number> = new Map();
  const lines = report.split('\n');
  const battles = Number(lines[0].slice(16));

  for (let i = 5; i < lines.length; i++) {
    const line = lines[i].split('|');
    if (line.length < 3) break;
    const name = line[2].slice(1).trim();
    const pct = Number(line[3].slice(1, line[3].indexOf('%'))) / 100;
    usage.set(toID(name), pct);
  }

  return {usage, battles};
}
