import {Data, ID, toID} from 'ps';

import {Outcome} from './parser';
import {MetagameStatistics, Statistics, Usage} from './stats';
import * as util from './util';

const PRECISION = 1e10;

interface MovesetStatistics {
  'Raw count': number;
  'usage': number;
  'Viability Ceiling': [number, number, number, number];
  'Abilities': {[key: string]: number};
  'Items': {[key: string]: number};
  'Spreads': {[key: string]: number};
  'Happiness': {[key: string]: number};
  'Moves': {[key: string]: number};
  'Teammates': {[key: string]: number};
  'Checks and Counters': {[key: string]: EncounterStatistics};
}

interface EncounterStatistics {
  koed: number;
  switched: number;
  n: number;
  p: number;
  d: number;
  score: number;
}

type UsageTier = 'OU'|'UU'|'RU'|'NU'|'PU';
type Tier = UsageTier|'Uber'|'BL'|'BL2'|'BL3'|'BL4';
type UsageTiers<T> = {
  OU: T,
  UU: T,
  RU: T,
  NU: T,
  PU: T,
};

const USAGE_TIERS: UsageTier[] = ['OU', 'UU', 'RU', 'NU', 'PU'];
const TIERS: Tier[] = ['Uber', 'OU', 'BL', 'UU', 'BL2', 'RU', 'BL3', 'NU', 'BL4', 'PU'];

const WEIGHTS = [[20, 3, 1], [20, 4], [24]];

const SUFFIXES = ['', 'suspecttest', 'alpha', 'beta'];

export const Reports = new class {
  usageReport(format: ID, stats: Statistics, battles: number) {
    const sorted = Array.from(stats.pokemon.entries());
    if (['challengecup1v1', '1v1'].includes(format)) {
      sorted.sort((a, b) => b[1].usage.real - a[1].usage.real || a[0].localeCompare(b[0]));
    } else {
      sorted.sort((a, b) => b[1].usage.weighted - a[1].usage.weighted || a[0].localeCompare(b[0]));
    }

    let s = ` Total battles: ${battles}\n`;
    const avg = battles ? Math.round((stats.usage.weighted / battles / 12) * 1e3) / 1e3 : 0;
    const avgd = avg === Math.floor(avg) ? `${avg.toFixed(1)}` : `${avg}`;
    s += ` Avg. weight/team: ${avgd}\n`;
    s += ` + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n`;
    s += ` | Rank | Pokemon            | Usage %   | Raw    | %       | Real   | %       | \n`;
    s += ` + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n`;

    const total = {
      raw: Math.max(1.0, stats.usage.raw),
      real: Math.max(1.0, stats.usage.real),
      weighted: Math.max(1.0, stats.usage.weighted),
    };

    for (const [i, entry] of sorted.entries()) {
      const species = entry[0];
      const usage = entry[1].usage;
      if (usage.raw === 0) break;

      const rank = (i + 1).toFixed().padEnd(4);
      const poke = displaySpecies(species, format).padEnd(18);
      const use = (100 * usage.weighted / total.weighted * 6).toFixed(5).padStart(8);
      const raw = usage.raw.toFixed().padEnd(6);
      const rawp = (100 * usage.raw / total.raw * 6).toFixed(3).padStart(6);
      const real = usage.real.toFixed().padEnd(6);
      const realp = (100 * usage.real / total.real * 6).toFixed(3).padStart(6);
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

    const sorted = Array.from(stats.pokemon.entries())
                       .sort(
                           (a, b) => b[1].lead.weighted - a[1].lead.weighted ||
                               b[1].lead.raw - a[1].lead.raw || a[0].localeCompare(b[0]));
    for (const [i, entry] of sorted.entries()) {
      const species = entry[0];
      const usage = entry[1].lead;
      if (usage.raw === 0) break;

      const rank = (i + 1).toFixed().padEnd(4);
      const poke = displaySpecies(species, format).padEnd(18);
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

    const data = util.dataForFormat(format);
    const WIDTH = 40;

    const heading = (n: string) => ` | ${n}`.padEnd(WIDTH + 2) + '| \n';
    const other = (t: number, f = 1) =>
        ` | Other ${(f * 100 * (1 - t)).toFixed(3).padStart(6)}%`.padEnd(WIDTH + 2) + '| \n';
    const display = (n: string, w: number) =>
        ` | ${n} ${(100 * w).toFixed(3).padStart(6)}%`.padEnd(WIDTH + 2) + '| \n';

    const sep = ` +${'-'.repeat(WIDTH)}+ \n`;
    let s = '';
    for (const [species, moveset] of movesetStats.entries()) {
      if (moveset.usage < 0.0001) break;  // 1/100th of a percent

      const p = stats.pokemon.get(species)!;

      s += sep;
      s += ` | ${displaySpecies(species, data)}`.padEnd(WIDTH + 2) + '| \n';
      s += sep;
      s += ` | Raw count: ${moveset['Raw count']}`.padEnd(WIDTH + 2) + '| \n';
      const avg =
          p.weights.count ? `${Math.floor(p.weights.sum / p.weights.count).toFixed(1)}` : '---';
      s += ` | Avg. weight: ${avg}`.padEnd(WIDTH + 2) + '| \n';
      const ceiling = Math.floor(moveset['Viability Ceiling'][1]);
      s += ` | Viability Ceiling: ${ceiling}`.padEnd(WIDTH + 2) + '| \n';
      s += sep;

      let total = 0;
      s += heading('Abilities');
      for (const [i, ability] of Object.keys(moveset['Abilities']).entries()) {
        if (i > 5) {
          s += other(total);
          break;
        }
        const weight = moveset['Abilities'][ability] / p.count;
        const o = data.getAbility(ability);
        s += display((o && o.name) || ability, weight);
        total += weight;
      }
      s += sep;
      total = 0;
      s += heading('Items');
      for (const [i, item] of Object.keys(moveset['Items']).entries()) {
        if (total > 0.95) {
          s += other(total);
          break;
        }
        const weight = moveset['Items'][item] / p.count;
        const o = data.getItem(item);
        s += display(item === 'nothing' ? 'Nothing' : (o && o.name) || item, weight);
        total += weight;
      }
      s += sep;
      total = 0;
      s += heading('Spreads');
      for (const [i, spread] of Object.keys(moveset['Spreads']).entries()) {
        if (total > 0.95 || i > 5) {
          s += other(total);
          break;
        }
        const weight = moveset['Spreads'][spread] / p.count;
        s += display(spread, weight);
        total += weight;
      }
      s += sep;
      total = 0;
      s += heading('Moves');
      for (const [i, move] of Object.keys(moveset['Moves']).entries()) {
        if (total > 0.95) {
          s += other(total, 4);
          break;
        }
        const weight = moveset['Moves'][move] / p.count;
        const o = data.getMove(move);
        s += display(move === '' ? 'Nothing' : (o && o.name) || move, weight);
        total += weight / 4;
      }
      s += sep;
      total = 0;
      s += heading('Teammates');
      for (const [i, teammate] of Object.keys(moveset['Teammates']).entries()) {
        if (total > 0.95 || i > 10) break;
        const w = moveset['Teammates'][teammate];
        const weight = w / p.count;
        s += ` | ${teammate} +${(100 * weight).toFixed(3).padStart(6)}%`.padEnd(WIDTH + 2) + '| \n';
        if (w < 0.005 * p.count) break;
        total += weight / 5;
      }
      s += sep;
      s += heading('Checks and Counters');
      for (const [i, cc] of Object.keys(moveset['Checks and Counters']).entries()) {
        if (i > 10) break;
        const v = moveset['Checks and Counters'][cc];
        if (v.score < 0.5) break;

        const score = (100 * v.score).toFixed(3).padStart(6);
        const p = (100 * v.p).toFixed(2).padStart(3);
        const d = (100 * v.d).toFixed(2).padStart(3);
        s += ` | ${cc} ${score} (${p}\u00b1${d})`.padEnd(WIDTH + 1) + '| \n';
        const ko = 100 * v.koed / v.n;
        const koed = ko.toFixed(1).padStart(2);
        const sw = (100 * v.switched / v.n);
        const switched = sw.toFixed(1).padStart(2);
        s += ` |\t (${koed}% KOed / ${switched}% switched out)`.padEnd(WIDTH + 2) + '| \n';
        if (ko < 10 || sw < 10) s += ' ';
      }
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

    const d = util.dataForFormat(format);
    const data: {[key: string]: object} = {};
    for (const [species, moveset] of movesetStats.entries()) {
      if (moveset.usage < 0.0001) break;  // 1/100th of a percent
      const m: any = Object.assign({}, moveset);
      m['Checks and Counters'] = forDetailed(m['Checks and Counters']);
      data[displaySpecies(species, d)] = m;
    }

    return JSON.stringify({info, data});
  }

  metagameReport(stats: Statistics) {
    const metagame = stats.metagame;
    const W = Math.max(1.0, stats.usage.weighted);

    const tags =
        Array.from(metagame.tags.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    let s = '';
    for (const [tag, weight] of tags) {
      s += ` ${tag}`.padEnd(31, '.');
      s += `${(100 * weight / W).toFixed(5).padStart(8)}%\n`;
    }
    s += '\n';

    if (!metagame.stalliness.length) return s;
    const stalliness = metagame.stalliness.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    // Figure out a good bin range by looking at .1% and 99.9% points
    const index = Math.floor(stalliness.length / 1000);
    let low = stalliness[index][0];
    let high = stalliness[stalliness.length - index - 1][0];
    if (low > 0) {
      low = 0;
    } else if (high < 0) {
      high = 0;
    }

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
    histogram = histogram.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    nbins = histogram.length;

    const start = 0;
    // FIXME: Python comparison of an array and a number = break immediately.
    // for (; start < stalliness.length; start++) {
    //   if (stalliness[start] >= histogram[0][0] - binSize / 2) break;
    // }
    let j = 0;
    for (let i = start; i < stalliness.length; i++) {
      while (stalliness[i][0] > histogram[0][0] + binSize * (j + 0.5)) j++;
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
      if (fmod(h[0], 2 * binSize) < binSize / 2) {
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
    s += ` one # = ${(100.0 * blockSize / y).toFixed(2).padStart(5)}%\n`;
    return s;
  }

  async tierUpdateReport(
      months: [string]|[string, string]|[string, string, string],
      read: (month: string, format: string) => Promise<string | undefined>) {
    const data = Data.forFormat();

    const pokemon: Map<ID, UsageTiers<number>> = new Map();
    for (const [i, month] of months.entries()) {
      const weight = WEIGHTS[months.length - 1][i];
      for (const tier of USAGE_TIERS) {
        const reports: Array<Promise<[string, [Map<ID, number>, number]|undefined]>> = [];
        for (const suffix of SUFFIXES) {
          reports.push(maybeParseUsageReport(read(month, `gen7${toID(tier)}${suffix}`)).then(r => [suffix, r]));
        }
     
        const n: {[suffix: string]: number} = {};
        const u: {[suffix: string]: Map<ID, number>} = {};
        let ntot = 0;
        for (const [suffix, report] of await Promise.all(reports)) {
          if (report) {
            [u[suffix], n[suffix]] = report;
            ntot += n[suffix];
          }
        }
        for (const suffix in u) {
          for (const [p, usage] of u[suffix].entries()) {
            let v = pokemon.get(p);
            if (!v) {
              v = {OU: 0, UU: 0, RU: 0, NU: 0, PU: 0};
              pokemon.set(p, v);
            }
            if (p !== 'empty') v[tier] += weight * n[suffix] / ntot * usage / 24;
          }
        }
      }
    }

    const tiers: UsageTiers<Array<[ID, number]>> = {
      OU: [],
      UU: [],
      RU: [],
      NU: [],
      PU: [],
    };

    for (const [species, usage] of pokemon.entries()) {
      for (const tier of USAGE_TIERS) {
        if (usage[tier] > 0) tiers[tier].push([species, usage[tier]]);
      }
    }
    let s = '';
    for (const tier of USAGE_TIERS) {
      const sorted = tiers[tier].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      s += makeTable(sorted, tier, data);
    }

    const rise = [0.06696700846, 0.04515839608, 0.03406367107][months.length - 1];
    const drop = [0.01717940145, 0.02284003156, 0.03406367107][months.length - 1];
    const {current, updated} = updateTiers(pokemon, rise, drop, data);

    s += '\n';
    for (const [id, tier] of current.entries()) {
      const update = updated.get(id)!;
      if (tier !== update) {
        const species = data.getSpecies(id)!;
        if (species.forme &&
            (species.forme.startsWith('Mega') || species.forme.startsWith('Primal'))) {
          const base = toID(species.baseSpecies);
          // Skip if the base is already in a higher tier
          if (TIERS.indexOf(updated.get(base)!) < TIERS.indexOf(update)) continue;
        }
        s += `${species.name} moved from ${tier} to ${update}\n`;
      }
    }
    return s;
  }
};

const SKIP = new Set([
  'pichuspikyeared', 'unownb',         'unownc',         'unownd',         'unowne',
  'unownf',          'unowng',         'unownh',         'unowni',         'unownj',
  'unownk',          'unownl',         'unownm',         'unownn',         'unowno',
  'unownp',          'unownq',         'unownr',         'unowns',         'unownt',
  'unownu',          'unownv',         'unownw',         'unownx',         'unowny',
  'unownz',          'unownem',        'unownqm',        'burmysandy',     'burmytrash',
  'cherrimsunshine', 'shelloseast',    'gastrodoneast',  'deerlingsummer', 'deerlingautumn',
  'deerlingwinter',  'sawsbucksummer', 'sawsbuckautumn', 'sawsbuckwinter', 'keldeoresolution',
  'genesectdouse',   'genesectburn',   'genesectshock',  'genesectchill',  'basculinbluestriped',
  'darmanitanzen',   'keldeoresolute', 'pikachucosplay'
]);

function updateTiers(pokemon: Map<ID, UsageTiers<number>>, rise: number, drop: number, data: Data) {
  const current: Map<ID, Tier> = new Map();
  const updated: Map<ID, Tier> = new Map();
  for (const name of Object.keys(data.Species)) {
    const species = data.getSpecies(name)!;
    if (SKIP.has(species.id) || species.isNonstandard || !species.tier ||
        species.tier === 'Illegal' || species.tier === 'Unreleased') {
      continue;
    }
    // FIXME: Code which is either undesirable or unused
    // if (old[0] === '(') old = old.slice(1, -1);
    // if (species.tier === 'NFE' || species.tier === 'LC') NFE.push(species.id);
    const tier = TIERS.includes(species.tier as Tier) ? species.tier as Tier : 'PU';
    current.set(species.id, tier);

    if (tier === 'Uber') {
      updated.set(species.id, 'Uber');
      continue;
    }
    const update = pokemon.get(species.id);
    if (!update) {
      updated.set(species.id, tier);
      continue;
    }
    if (updated.has(species.id)) continue;
    if (update.OU > rise) {
      updated.set(species.id, 'OU');
      continue;
    }
    if (tier === 'OU') {
      if (update.OU < drop) {
        updated.set(species.id, 'UU');
      } else {
        updated.set(species.id, 'OU');
      }
      continue;
    }
    if (tier === 'BL') {
      updated.set(species.id, 'BL');
      continue;
    }
    if (update.UU > rise) {
      updated.set(species.id, 'UU');
      continue;
    }
    if (tier === 'UU') {
      if (update.UU < drop) {
        updated.set(species.id, 'RU');
      } else {
        updated.set(species.id, 'UU');
      }
      continue;
    }
    if (tier === 'BL2') {
      updated.set(species.id, 'BL2');
      continue;
    }
    if (update.RU > rise) {
      updated.set(species.id, 'RU');
      continue;
    }
    if (tier === 'RU') {
      if (update.UU < drop) {
        updated.set(species.id, 'NU');
      } else {
        updated.set(species.id, 'RU');
      }
      continue;
    }
    if (tier === 'BL3') {
      updated.set(species.id, 'BL3');
      continue;
    }
    if (update.NU > rise) {
      updated.set(species.id, 'NU');
      continue;
    }
    if (tier === 'NU') {
      if (update.UU < drop) {
        updated.set(species.id, 'PU');
      } else {
        updated.set(species.id, 'NU');
      }
      continue;
    }
    if (tier === 'BL4') {
      updated.set(species.id, 'BL4');
      continue;
    }
    if (!updated.has(species.id)) updated.set(species.id, 'PU');
  }
  return {current, updated};
}

function fmod(a: number, b: number, f = 1e3) {
  a = Math.round(a * f) / f;
  b = Math.round(b * f) / f;
  return (Math.abs(a * f) % (b * f)) / f;
}

function toMovesetStatistics(format: ID, stats: Statistics) {
  const sorted = Array.from(stats.pokemon.entries());
  const real = ['challengecup1v1', '1v1'].includes(format);
  if (['randombattle', 'challengecup', 'challengcup1v1', 'seasonal'].includes(format)) {
    sorted.sort((a, b) => a[0].localeCompare(b[0]));
  } else if (real) {
    sorted.sort((a, b) => b[1].usage.real - a[1].usage.real || a[0].localeCompare(b[0]));
  } else {
    sorted.sort((a, b) => b[1].usage.weighted - a[1].usage.weighted || a[0].localeCompare(b[0]));
  }
  const data = util.dataForFormat(format);

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
      'usage': round(usage),
      'Viability Ceiling': viability,
      'Abilities': toObject(pokemon.abilities),
      'Items': toObject(pokemon.items),
      'Spreads': toObject(pokemon.spreads),
      'Happiness': toObject(pokemon.happinesses),
      'Moves': toObject(pokemon.moves),
      'Teammates': getTeammates(format, pokemon.teammates, pokemon.count, stats),  // TODO empty
      'Checks and Counters':
          getChecksAndCounters(pokemon.encounters, s => displaySpecies(species, data)),
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

  const sorted = cc.sort((a, b) => (b[1].score - a[1].score || a[0].localeCompare(b[0])));
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

function toObject(map: Map<number|string, number>) {
  const obj: {[key: string]: number} = {};
  const sorted = Array.from(map.entries())
                     .sort((a, b) => b[1] - a[1] || a[0].toString().localeCompare(b[0].toString()));
  for (const [k, v] of sorted) {
    obj[k.toString()] = round(v);
  }
  return obj;
}

function round(v: number) {
  return Math.round(v * PRECISION) / PRECISION;
}

function makeTable(pokemon: Array<[ID, number]>, tier: UsageTier, data: Data) {
  let s = `[HIDE=${tier}][CODE]\n`;
  s += `Combined usage for ${tier}\n`;
  s += ' + ---- + ------------------ + ------- + \n';
  s += ' | Rank | Pokemon            | Percent | \n';
  s += ' + ---- + ------------------ + ------- + \n';
  for (const [i, pair] of pokemon.entries()) {
    const [id, usage] = pair;
    if (usage < 0.001) break;
    const rank = (i + 1).toFixed().padEnd(4);
    const poke = displaySpecies(id, data).padEnd(18);
    const percent = (100 * usage).toFixed(3).padStart(6);
    s += ` | ${rank} | ${poke} | ${percent}% |\n`;
  }
  s += ' + ---- + ------------------ + ------- + \n';
  s += '[/CODE][/HIDE]\n';
  return s;
}

async function maybeParseUsageReport(report: Promise<string|undefined>) {
  const r = await report;
  return r ? parseUsageReport(r) : undefined;
}

function parseUsageReport(report: string): [Map<ID, number>, number] {
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

  return [usage, battles];
}

function displaySpecies(name: string, format: string|Data) {
  const species = util.getSpecies(name, format).species;
  // FIXME: remove bad display of Nidoran-M / Nidoran-F
  return species.startsWith('Nidoran') ? species.replace('-', '') : species;
}
