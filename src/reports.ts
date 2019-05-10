import {ID, toID} from 'ps';

import {MetagameStatistics, Statistics, Usage} from './stats';
import * as util from './util';

interface MovesetStatistics {
  'Raw count': number;
  'Viability Ceiling': number;
  'Abilities': {[key: string]: number};
  'Items': {[key: string]: number};
  'Spreads': {[key: string]: number};
  'Moves': {[key: string]: number};
  'Teammates': {[key: string]: number};
  //'Checks and Counters': {[key: string]: number};
  'usage': number;
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

  movesetReport() {
    // batchMovesetCounter.py
    // 'Checks and Counters' = Encounter Matrix created in StatsCounter.py when
    // looking at matchups array
    //
  }

  detailedMovesetReport(
      format: ID, stats: Statistics, battles: number, cutoff = 1500, tag: ID|null = null) {
    const info = {
      'metagame': format,
      'cutoff': cutoff,
      'cutoff deviation': 0,
      'team type': tag,
      'number of battles': battles,
    };

    const data: {[key: string]: MovesetStatistics} = {};
    for (const [species, moveset] of toMovesetStatistics(format, stats).entries()) {
      if (moveset.usage < 0.0001) break;  // 1/100th of a percent
      data[species] = moveset;
    }

    return JSON.stringify({info, data});
  }

  metagameReport(metagame: MetagameStatistics, totalWeight: number) {
    const W = Math.max(1.0, totalWeight);

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

  risesAndDropsReport() {}
};

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

  const movesets: Map<string, MovesetStatistics> = new Map();
  for (const entry of sorted) {
    const species = entry[0];
    const pokemon = entry[1];
    const usage = real ? pokemon.usage.real : pokemon.usage.weighted;
    movesets.set(util.getSpecies(species, format).species, {
      'Raw count': pokemon.usage.raw,
      'Viability Ceiling': pokemon.viability,
      'Abilities': toObject(pokemon.abilities),
      'Items': toObject(pokemon.items),
      'Spreads': toObject(pokemon.spreads),
      'Moves': toObject(pokemon.moves),
      'Teammates': getTeammates(format, pokemon.teammates, pokemon.weight, stats),
      //'Checks and Counters': getChecksAndCounters(pokemon.encounters), // TODO only used by
      //detailed!
      'usage': usage,
    });
  }

  return movesets;
}

// function getChecksAndCounters(
// encounters: Map<ID, Map<Outcome, number>>): Map<string, [number, number, number]> {

//}

function getTeammates(format: ID, teammates: Map<ID, number>, weight: number, stats: Statistics):
    {[key: string]: number} {
  const real = ['challengecup1v1', '1v1'].includes(format);
  const m: Map<string, number> = new Map();
  for (const [id, w] of teammates.entries()) {
    const species = util.getSpecies(id, format).species;
    const s = stats.pokemon.get(id);
    m.set(species, s ? (w - weight * (real ? s.usage.real : s.usage.weighted)) : 0);
  }
  return toObject(m);
}

function toObject(map: Map<string, number>): {[key: string]: number} {
  const obj: {[key: string]: number} = {};
  const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted) {
    obj[k] = v;
  }
  return obj;
}
