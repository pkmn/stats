import {Generation, ID, toID} from '@pkmn/data';

import {Statistics} from './stats';
import * as util from './util';

const round = (v: number, p = util.PRECISION) => util.round(v, p);

interface MovesetStatistics {
  'Raw count': number;
  usage: number;
  'Viability Ceiling': [number, number, number, number];
  Abilities: { [key: string]: number };
  Items: { [key: string]: number };
  Spreads: { [key: string]: number };
  Happiness: { [key: string]: number };
  Moves: { [key: string]: number };
  Teammates: { [key: string]: number };
  'Checks and Counters': { [key: string]: util.EncounterStatistics };
}

type UsageTier = 'OU' | 'UU' | 'RU' | 'NU' | 'PU' | 'ZU';
type Tier = UsageTier | 'Uber' | 'UUBL' | 'RUBL' | 'NUBL' | 'PUBL' | 'ZUBL';
interface UsageTiers<T> { OU: T; UU: T; RU: T; NU: T; PU: T; ZU: T }

const USAGE_TIERS: UsageTier[] = ['OU', 'UU', 'RU', 'NU', 'PU', 'ZU'];
const TIERS: Tier[] = [
  'Uber', 'OU', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', 'PUBL', 'PU', 'ZUBL', 'ZU',
];

// TODO: implement!

// type DoublesUsageTier = 'DOU' | 'DUU';
// type DoublesTier = DoublesUsageTier | 'DUber';
// interface DoublesUsageTiers<T> {
//   DOU: T;
//   DUU: T;
// }

// const DOUBLES_USAGE_TIERS: DoublesUsageTier[] = ['DOU', 'DUU'];
// const DOUBLES_TIERS: DoublesTier[] = ['DUber', 'DOU', 'DUU'];

const WEIGHTS = [[24], [20, 4], [20, 3, 1]];

const SUFFIXES = ['', 'suspecttest', 'alpha', 'beta'];

const MIN = [20, 0.5];

export const Reports = new class {
  usageReport(gen: Generation, format: ID, stats: Statistics) {
    const sorted = Object.entries(stats.pokemon).filter(p => p[0] !== 'empty');
    if (['challengecup1v1', '1v1'].includes(format)) {
      sorted.sort((a, b) => b[1].usage.real - a[1].usage.real || a[0].localeCompare(b[0]));
    } else {
      sorted.sort((a, b) => b[1].usage.weighted - a[1].usage.weighted || a[0].localeCompare(b[0]));
    }

    let s = ` Total battles: ${stats.battles}\n`;
    const avg = stats.battles
      ? util.roundStr(stats.usage.weighted / stats.battles / 12, 1e3)
      : '0.0';
    s += ` Avg. weight/team: ${avg}\n`;
    s += ' + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n';
    s += ' | Rank | Pokemon            | Usage %   | Raw    | %       | Real   | %       | \n';
    s += ' + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n';

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
      const poke = util.displaySpecies(gen, species).padEnd(18);
      const use = (((100 * usage.weighted) / total.weighted) * 6).toFixed(5).padStart(8);
      const raw = usage.raw.toFixed().padEnd(6);
      const rawp = (((100 * usage.raw) / total.raw) * 6).toFixed(3).padStart(6);
      const real = usage.real.toFixed().padEnd(6);
      const realp = (((100 * usage.real) / total.real) * 6).toFixed(3).padStart(6);
      s += ` | ${rank} | ${poke} | ${use}% | ${raw} | ${rawp}% | ${real} | ${realp}% | \n`;
    }
    s += ' + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n';
    return s;
  }

  leadsReport(gen: Generation, stats: Statistics) {
    let s = ` Total leads: ${stats.battles * 2}\n`;
    s += ' + ---- + ------------------ + --------- + ------ + ------- + \n';
    s += ' | Rank | Pokemon            | Usage %   | Raw    | %       | \n';
    s += ' + ---- + ------------------ + --------- + ------ + ------- + \n';

    const total = {raw: 0, weighted: 0};
    total.raw = Math.max(1.0, stats.lead.raw);
    total.weighted = Math.max(1.0, stats.lead.weighted);

    const sorted = Object.entries(stats.pokemon)
      .filter(p => p[0] !== 'empty')
      .sort(
        (a, b) =>
          b[1].lead.weighted - a[1].lead.weighted ||
          b[1].lead.raw - a[1].lead.raw ||
          a[0].localeCompare(b[0])
      );
    for (const [i, entry] of sorted.entries()) {
      const species = entry[0];
      const usage = entry[1].lead;
      if (usage.raw === 0) break;

      const rank = (i + 1).toFixed().padEnd(4);
      const poke = util.displaySpecies(gen, species).padEnd(18);
      const use = ((100 * usage.weighted) / total.weighted).toFixed(5).padStart(8);
      const raw = usage.raw.toFixed().padEnd(6);
      const pct = ((100 * usage.raw) / total.raw).toFixed(3).padStart(6);
      s += ` | ${rank} | ${poke} | ${use}% | ${raw} | ${pct}% | \n`;
    }

    s += ' + ---- + ------------------ + --------- + ------ + ------- + \n';
    return s;
  }

  movesetReports(
    gen: Generation,
    format: ID,
    stats: Statistics,
    cutoff = 1500,
    tag: ID | null = null,
    min = MIN
  ) {
    const movesetStats = toMovesetStatistics(gen, format, stats, min[0]);
    const basic = this.movesetReport(gen, format, stats, movesetStats, min);
    const detailed =
      this.detailedMovesetReport(gen, format, stats, cutoff, tag, movesetStats, min[0]);
    return {basic, detailed};
  }

  movesetReport(
    gen: Generation,
    format: ID,
    stats: Statistics,
    movesetStats?: Map<ID, MovesetStatistics>,
    min = MIN
  ) {
    movesetStats = movesetStats || toMovesetStatistics(gen, format, stats, min[0]);

    gen = util.ignoreGen(gen);
    const WIDTH = 40;

    const heading = (n: string) => ` | ${n}`.padEnd(WIDTH + 2) + '| \n';
    const other = (t: number, f = 1) =>
      ` | Other ${Math.abs(f * 100 * (1 - t))
        .toFixed(3)
        .padStart(6)}%`.padEnd(WIDTH + 2) + '| \n';
    const display = (n: string, w: number) =>
      ` | ${n} ${(100 * w).toFixed(3).padStart(6)}%`.padEnd(WIDTH + 2) + '| \n';

    const sep = ` +${'-'.repeat(WIDTH)}+ \n`;
    let s = '';
    for (const [species, moveset] of movesetStats.entries()) {
      if (moveset.usage < 0.0001) break; // 1/100th of a percent

      const p = stats.pokemon[species]!;

      s += sep;
      s += ` | ${util.displaySpecies(gen, species)}`.padEnd(WIDTH + 2) + '| \n';
      s += sep;
      s += ` | Raw count: ${moveset['Raw count']}`.padEnd(WIDTH + 2) + '| \n';
      const avg = p.saved.count ? util.roundStr(p.saved.weight / p.saved.count, 1e12) : '---';
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
        const weight = moveset['Abilities'][ability] / p.raw.weight;
        const o = gen.abilities.get(ability);
        s += display((o?.name) ?? ability, weight);
        total += weight;
      }
      s += sep;
      total = 0;
      s += heading('Items');
      for (const item of Object.keys(moveset['Items'])) {
        if (total > 0.95) {
          s += other(total);
          break;
        }
        const weight = moveset['Items'][item] / p.raw.weight;
        const o = gen.items.get(item);
        s += display(item === 'nothing' ? 'Nothing' : (o?.name) ?? item, weight);
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
        const weight = moveset['Spreads'][spread] / p.raw.weight;
        s += display(spread, weight);
        total += weight;
      }
      s += sep;
      total = 0;
      s += heading('Moves');
      for (const move of Object.keys(moveset['Moves'])) {
        if (total > 0.95) {
          s += other(total, 4);
          break;
        }
        const weight = moveset['Moves'][move] / p.raw.weight;
        const o = gen.moves.get(move);
        s += display(move === '' ? 'Nothing' : (o?.name) ?? move, weight);
        total += weight / 4;
      }
      s += sep;
      total = 0;
      s += heading('Teammates');
      for (const [i, teammate] of Object.keys(moveset['Teammates']).entries()) {
        if (total > 0.95 || i > 11) break;
        const w = moveset['Teammates'][teammate];
        if (w < 0.005 * p.raw.weight) break;
        const weight = w / p.raw.weight;
        const val = 100 * weight;
        const sign = Math.sign(val) ? '+' : '-';
        s += ` | ${teammate} ${sign}${val.toFixed(3).padStart(5)}%`.padEnd(WIDTH + 2) + '| \n';
        total += weight / 5;
      }
      s += sep;
      s += heading('Checks and Counters');
      for (const [i, cc] of Object.keys(moveset['Checks and Counters']).entries()) {
        if (i > 11) break;
        const v = moveset['Checks and Counters'][cc];
        if (v.score < min[1]) break;

        const score = (100 * v.score).toFixed(3).padStart(6);
        const vp = (100 * v.p).toFixed(2).padStart(3);
        const vd = (100 * v.d).toFixed(2).padStart(3);
        let line = ` | ${cc} ${score} (${vp}\u00b1${vd})`.padEnd(WIDTH + 1) + ' |\n';

        const ko = (100 * v.koed) / v.n;
        const koed = ko.toFixed(1).padStart(2);
        const sw = (100 * v.switched) / v.n;
        const switched = sw.toFixed(1).padStart(2);
        // FIXME: Remove the \t and pad properly base on the 2 different lines, not 1.
        line += ` |\t (${koed}% KOed / ${switched}% switched out)`;
        if (ko < 10) line += ' ';
        if (sw < 10) line += ' ';
        s += line.padEnd(WIDTH + 2) + '| \n';
      }
      s += sep;
    }

    return s;
  }

  // FIXME: Just use names everywhere instead of a hybrid of names and IDs.
  detailedMovesetReport(
    gen: Generation,
    format: ID,
    stats: Statistics,
    cutoff = 1500,
    tag: ID | null = null,
    movesetStats?: Map<ID, MovesetStatistics>,
    min = 20
  ) {
    movesetStats = movesetStats || toMovesetStatistics(gen, format, stats, min);

    const info = {
      metagame: format,
      cutoff,
      'cutoff deviation': 0,
      'team type': tag,
      'number of battles': stats.battles,
    };

    gen = util.ignoreGen(gen);
    const data: { [key: string]: object } = {}; // eslint-disable-line
    for (const [species, moveset] of movesetStats.entries()) {
      if (moveset.usage < 0.0001) break; // 1/100th of a percent
      const m: any = Object.assign({}, moveset);
      m['Checks and Counters'] = forDetailed(m['Checks and Counters']);
      data[util.displaySpecies(gen, species)] = m;
    }

    return JSON.stringify({info, data});
  }

  metagameReport(stats: Statistics) {
    const metagame = stats.metagame;
    const W = Math.max(1.0, stats.usage.weighted);

    const tags = Object.entries(metagame.tags).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
    let s = '';
    for (const [tag, weight] of tags) {
      s += ` ${tag}`.padEnd(31, '.');
      s += `${((100 * weight) / W).toFixed(5).padStart(8)}%\n`;
    }
    s += '\n';

    if (!metagame.stalliness.length) return s;
    const {histogram, binSize, mean, total} = util.stallinessHistogram(metagame.stalliness);

    let max = 0;
    for (const h of histogram) {
      if (h[1] > max) max = h[1];
    }

    // Maximum number of blocks to go across
    const MAX_BLOCKS = 30;
    const blockSize = max / MAX_BLOCKS;

    if (blockSize <= 0) return s;

    s += ` Stalliness (mean: ${mean.toFixed(3).padStart(6)})\n`;
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
    s += ' more negative = more offensive, more positive = more stall\n';
    s += ` one # = ${((100.0 * blockSize) / total).toFixed(2).padStart(5)}%\n`;
    return s;
  }

  // TODO: Add support for Doubles and OM (other metagames)
  async tierUpdateReport(
    gen: Generation,
    months: [string] | [string, string] | [string, string, string],
    read: (month: string, format: string) => Promise<string | undefined>
  ) {
    gen = util.ignoreGen(gen);

    const pokemon: Map<ID, UsageTiers<number>> = new Map();
    for (const [i, month] of months.entries()) {
      const weight = WEIGHTS[months.length - 1][i];
      for (const tier of USAGE_TIERS) {
        const reports: Array<Promise<[string, [Map<ID, number>, number] | undefined]>> = [];
        for (const suffix of SUFFIXES) {
          reports.push( // FIXME: gen8!
            maybeParseUsageReport(read(month, `gen7${toID(tier)}${suffix}`)).then(r => [suffix, r])
          );
        }

        const n: { [suffix: string]: number } = {};
        const u: { [suffix: string]: Map<ID, number> } = {};
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
              v = {OU: 0, UU: 0, RU: 0, NU: 0, PU: 0, ZU: 0};
              pokemon.set(p, v);
            }
            if (p !== 'empty') {
              v[tier] += (((weight * n[suffix]) / ntot) * usage) / 24;
            }
          }
        }
      }
    }

    const tiers: UsageTiers<Array<[ID, number]>> = {OU: [], UU: [], RU: [], NU: [], PU: [], ZU: []};

    for (const [species, usage] of pokemon.entries()) {
      for (const tier of USAGE_TIERS) {
        if (usage[tier] > 0) tiers[tier].push([species, usage[tier]]);
      }
    }
    let s = '';
    for (const tier of USAGE_TIERS) {
      const sorted = tiers[tier].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      s += makeTable(gen, sorted, tier);
    }

    const rise = [0.06696700846, 0.04515839608, 0.03406367107][months.length - 1];
    const drop = [0.01717940145, 0.02284003156, 0.03406367107][months.length - 1];
    const {current, updated, NFE} = updateTiers(gen, pokemon, rise, drop);

    s += '\n';
    const sorted = Array.from(current.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [id, tier] of sorted) {
      const update = updated.get(id)!;
      if (tier === 'ZU' && NFE.has(id)) continue;
      if (tier !== update) {
        const species = gen.species.get(id)!;
        if (species.forme &&
          (species.forme.startsWith('Mega') || species.forme.startsWith('Primal'))) {
          const base = toID(species.baseSpecies);
          // Skip if the base is already in a higher tier
          if (TIERS.indexOf(updated.get(base)!) < TIERS.indexOf(update)) {
            continue;
          }
        }
        s += `${species.name} moved from ${tier} to ${update}\n`;
      }
    }
    return s;
  }
};

const SKIP = new Set([
  'pichuspikyeared', 'unownb', 'unownc', 'unownd', 'unowne', 'unownf', 'unowng', 'unownh',
  'unowni', 'unownj', 'unownk', 'unownl', 'unownm', 'unownn', 'unowno', 'unownp', 'unownq',
  'unownr', 'unowns', 'unownt', 'unownu', 'unownv', 'unownw', 'unownx', 'unowny', 'unownz',
  'unownem', 'unownqm', 'burmysandy', 'burmytrash', 'cherrimsunshine', 'shelloseast',
  'gastrodoneast', 'deerlingsummer', 'deerlingautumn', 'deerlingwinter', 'sawsbucksummer',
  'sawsbuckautumn', 'sawsbuckwinter', 'keldeoresolution', 'genesectdouse', 'genesectburn',
  'genesectshock', 'genesectchill', 'basculinbluestriped', 'darmanitanzen', 'keldeoresolute',
  'pikachucosplay',
]);

const UUBL = new Set([
  'alakazam', 'azumarill', 'breloom', 'buzzwole', 'charizardmegay', 'conkeldurr', 'dianciemega',
  'diggersby', 'dragonite', 'gallademega', 'gardevoirmega', 'gyarados', 'heracrossmega',
  'hoopaunbound', 'jirachi', 'kyuremblack', 'latiasmega', 'latios', 'latiosmega', 'manaphy',
  'ninetalesalola', 'porygonz', 'salamence', 'scolipede', 'staraptor', 'thundurus',
  'thundurustherian', 'tornadustherian', 'venusaurmega', 'victini', 'volcarona', 'weavile',
  'xurkitree',
]);
const RUBL = new Set([
  'slowbromega', 'suicune', 'hawlucha', 'crawdaunt', 'lucario', 'heracross', 'venomoth',
  'houndoommega', 'entei', 'sceptilemega', 'sharpedo', 'absolmega', 'zoroark', 'reuniclus',
  'mienshao', 'durant', 'tornadus', 'kyurem', 'talonflame', 'darmanitan', 'meloetta',
]);
const NUBL = new Set([
  'yanmega', 'slurpuff', 'emboar', 'porygon2', 'noivern', 'moltres', 'ribombee', 'kingdra',
  'exploud', 'necrozma', 'tyrantrum', 'cofagrigus', 'meloetta', 'barbaracle', 'bruxish',
  'cameruptmega', 'venusaur', 'gigalith', 'hoopa',
]);
const PUBL = new Set([
  'vivillon', 'klinklang', 'hariyama', 'barbaracle', 'vanilluxe', 'medicham', 'passimian',
  'magmortar', 'kingler', 'charizard', 'tauros', 'typhlosion', 'gallade', 'samurott', 'sawk',
  'archeops', 'pyroar', 'aromatisse', 'minior', 'exeggutoralola',
]);
const ZUBL = new Set([
  'carracosta', 'crabominable', 'exeggutor', 'gorebyss', 'jynx', 'musharna', 'raticatealola',
  'raticatealolatotem', 'throh', 'turtonator', 'typenull', 'ursaring', 'victreebel', 'zangoose',
]);

function updateTiers(
  gen: Generation,
  pokemon: Map<ID, UsageTiers<number>>,
  rise: number,
  drop: number
) {
  const current: Map<ID, Tier> = new Map();
  const updated: Map<ID, Tier> = new Map();
  const NFE = new Set<ID>();
  for (const species of gen.species) {
    if (SKIP.has(species.id) ||
      species.isNonstandard ||
      !species.tier ||
      species.tier === 'Illegal' ||
      species.tier === 'Unreleased') {
      continue;
    }
    // FIXME: Code which is either undesirable or unused
    let old = species.tier as string;
    if (old[0] === '(' && old[1] !== 'P') old = old.slice(1, -1);
    if (old[0] === '(' && old[1] === 'P') old = 'ZU';
    if (['NFE', 'LC', 'LC Uber'].includes(old)) NFE.add(species.id);
    const tier = TIERS.includes(old as Tier) ? (old as Tier) : 'ZU';
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

    const riseAndDrop = (r: UsageTier, d: UsageTier, b: Tier) =>
      computeRiseAndDrop(species.id, update, updated, tier, rise, drop, {
        rise: r,
        drop: d,
        ban: b,
      });
    if (riseAndDrop('OU', 'UU', 'UUBL')) continue;
    if (riseAndDrop('UU', 'RU', 'RUBL')) continue;
    if (riseAndDrop('RU', 'NU', 'NUBL')) continue;
    if (riseAndDrop('NU', 'PU', 'PUBL')) continue;
    if (riseAndDrop('PU', 'ZU', 'ZUBL')) continue;

    if (!updated.has(species.id)) updated.set(species.id, 'ZU');

    const newTier = updated.get(species.id);
    if (newTier === 'UU' && UUBL.has(species.id)) updated.set(species.id, 'UUBL');
    if (newTier === 'RU' && RUBL.has(species.id)) updated.set(species.id, 'RUBL');
    if (newTier === 'NU' && NUBL.has(species.id)) updated.set(species.id, 'NUBL');
    if (newTier === 'PU' && PUBL.has(species.id)) updated.set(species.id, 'PUBL');
    if (newTier === 'ZU' && ZUBL.has(species.id)) updated.set(species.id, 'ZUBL');
  }
  return {current, updated, NFE};
}

function computeRiseAndDrop(
  species: ID,
  update: UsageTiers<number>,
  updated: Map<ID, Tier>,
  tier: Tier,
  rise: number,
  drop: number,
  tiers: { rise: UsageTier; drop: UsageTier; ban: Tier }
) {
  if (update[tiers.rise] > rise) {
    updated.set(species, tiers.rise);
    return true;
  }
  if (tier === tiers.rise) {
    if (update[tiers.rise] < drop) {
      updated.set(species, tiers.drop);
    } else {
      updated.set(species, tiers.rise);
    }
    return true;
  }
  if (tier === tiers.ban) {
    updated.set(species, tiers.ban);
    return true;
  }
  return false;
}

function fmod(a: number, b: number, f = 1e3) {
  a = Math.round(a * f) / f;
  b = Math.round(b * f) / f;
  return (Math.abs(a * f) % (b * f)) / f;
}

function toMovesetStatistics(gen: Generation, format: ID, stats: Statistics, min = 20) {
  const sorted = Object.entries(stats.pokemon);
  const real = ['challengecup1v1', '1v1'].includes(format);
  const total = Math.max(1.0, real ? stats.usage.real : stats.usage.weighted);
  // FIXME: Sort without this stupid rounding to avoid incorrect ordering
  const usage = (n: number) => round((n / total) * 6, 1e7);
  if (['randombattle', 'challengecup', 'challengcup1v1', 'seasonal'].includes(format)) {
    sorted.sort((a, b) => a[0].localeCompare(b[0]));
  } else if (real) {
    sorted.sort(
      (a, b) => usage(b[1].usage.real) - usage(a[1].usage.real) || a[0].localeCompare(b[0])
    );
  } else {
    sorted.sort(
      (a, b) => usage(b[1].usage.weighted) - usage(a[1].usage.weighted) || a[0].localeCompare(b[0])
    );
  }
  gen = util.ignoreGen(gen);

  const movesets: Map<ID, MovesetStatistics> = new Map();
  for (const entry of sorted) {
    const species = entry[0];
    const pokemon = entry[1];
    const gxes = [];
    for (const player in pokemon.unique) {
      const u = pokemon.unique[player];
      if ('g' in u) gxes.push(u.g);
    }
    const viability = util.computeViability(gxes);
    movesets.set(species as ID, {
      'Raw count': pokemon.raw.count,
      usage: usage(real ? pokemon.usage.real : pokemon.usage.weighted),
      'Viability Ceiling': viability,
      Abilities: util.toDisplayObject(pokemon.abilities, ability => {
        const o = gen.abilities.get(ability);
        return (o?.name) ?? ability;
      }),
      Items: util.toDisplayObject(pokemon.items, item => {
        if (item === 'nothing') return 'Nothing';
        const o = gen.items.get(item);
        return (o?.name) ?? item;
      }),
      Spreads: util.toDisplayObject(pokemon.spreads),
      Happiness: util.toDisplayObject(pokemon.happinesses),
      Moves: util.toDisplayObject(pokemon.moves, move => {
        if (move === '') return 'Nothing';
        const o = gen.moves.get(move);
        return (o?.name) ?? move;
      }),
      Teammates: getTeammates(gen, format, pokemon.teammates, pokemon.raw.weight, total, stats),
      'Checks and Counters': util.getChecksAndCounters(
        pokemon.encounters,
        [s => util.displaySpecies(gen, s), es => es],
        min
      ),
    });
  }

  return movesets;
}

function getTeammates(
  gen: Generation,
  format: ID,
  teammates: { [id: string /* ID */]: number },
  weight: number,
  total: number,
  stats: Statistics
): { [key: string]: number } {
  const real = ['challengecup1v1', '1v1'].includes(format);
  const m: { [species: string]: number } = {};
  for (const [id, w] of Object.entries(teammates)) {
    const species = util.displaySpecies(gen, id);
    const s = stats.pokemon[id];
    if (!s) {
      m[species] = 0;
      continue;
    }
    const usage = ((real ? s.usage.real : s.usage.weighted) / total) * 6;
    m[species] = w - round(weight) * round(usage, 1e7);
  }
  return util.toDisplayObject(m);
}

function forDetailed(cc: { [key: string]: util.EncounterStatistics }) {
  const obj: { [key: string]: [number, number, number] } = {};
  for (const [k, v] of Object.entries(cc)) {
    obj[k] = [round(v.n), round(v.p), round(v.d)];
  }
  return obj;
}

function makeTable(gen: Generation, pokemon: Array<[ID, number]>, tier: UsageTier) {
  let s = `[HIDE=${tier}][CODE]\n`;
  s += `Combined usage for ${tier}\n`;
  s += ' + ---- + ------------------ + ------- + \n';
  s += ' | Rank | Pokemon            | Percent | \n';
  s += ' + ---- + ------------------ + ------- + \n';
  for (const [i, pair] of pokemon.entries()) {
    const [id, usage] = pair;
    if (usage < 0.001) break;
    const rank = (i + 1).toFixed().padEnd(4);
    const poke = util.displaySpecies(gen, id).padEnd(18);
    const percent = (100 * usage).toFixed(3).padStart(6);
    s += ` | ${rank} | ${poke} | ${percent}% |\n`;
  }
  s += ' + ---- + ------------------ + ------- + \n';
  s += '[/CODE][/HIDE]\n';
  return s;
}

async function maybeParseUsageReport(report: Promise<string | undefined>) {
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
