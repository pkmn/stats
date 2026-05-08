import {Generation, ID, toID} from '@pkmn/data';

import {Statistics} from './stats';
import * as util from './util';

const round = (v: number, p = util.PRECISION) => util.round(v, p);

interface MovesetStatistics {
  'Raw count': number;
  usage: number;
  'Viability Ceiling': [number, number, number, number];
  Abilities: {[key: string]: number};
  Items: {[key: string]: number};
  'Tera Types': {[key: string]: number};
  Spreads: {[key: string]: number};
  Happiness: {[key: string]: number};
  Moves: {[key: string]: number};
  Teammates: {[key: string]: number};
  'Checks and Counters': {[key: string]: util.EncounterStatistics};
}

type ReportType = 'singles' | 'doubles' | 'nationaldex' | 'littlecup';

type UsageTier = 'OU' | 'UU' | 'RU' | 'NU' | 'PU';
type Tier = UsageTier | 'Uber' | 'UUBL' | 'RUBL' | 'NUBL' | 'PUBL' | 'ZUBL' | 'ZU';
interface UsageTiers<T> {OU: T; UU: T; RU: T; NU: T; PU: T}

type DoublesUsageTier = 'DOU' | 'DUU';
type DoublesTier = DoublesUsageTier | 'DUber' | 'DNU';
interface DoublesUsageTiers<T> {DOU: T; DUU: T}

type NationalDexUsageTier = 'OU' | 'UU';
type NationalDexTier = NationalDexUsageTier | 'UUBL' | 'NU';
interface NationalDexUsageTiers<T> {OU: T; UU: T}

type LittleCupUsageTier = 'LC';
type LittleCupTier = LittleCupUsageTier | 'LC Uber' | 'LCUU';
interface LittleCupUsageTiers<T> {LC: T}

type CombinedTier = Tier | DoublesTier | NationalDexTier | LittleCupTier;
type CombinedUsageTier =
  UsageTier | DoublesUsageTier | NationalDexUsageTier | LittleCupUsageTier;
type CombinedUsageTiers<T> =
  UsageTiers<T> | DoublesUsageTiers<T> | NationalDexUsageTiers<T> | LittleCupUsageTiers<T>;

const USAGE_TIERS = {
  singles: ['OU', 'UU', 'RU', 'NU', 'PU'] as UsageTier[],
  doubles: ['DOU', 'DUU'] as DoublesUsageTier[],
  nationaldex: ['OU', 'UU'] as NationalDexUsageTier[],
  littlecup: ['LC'] as LittleCupUsageTier[],
};

const TIERS = {
  singles: [
    'Uber', 'OU', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', 'PUBL', 'PU', 'ZUBL', 'ZU',
  ] as Tier[],
  doubles: ['DUber', 'DOU', 'DUU', 'DNU'] as DoublesTier[],
  nationaldex: [
    'Uber', 'OU', 'UUBL', 'UU', 'RUBL', 'RU', 'NUBL', 'NU', 'PUBL', 'PU', 'ZUBL', 'ZU',
  ] as NationalDexTier[],
  littlecup: ['LC', 'LCBL', 'LCUU'] as LittleCupTier[],
};

const SUFFIXES = ['', 'suspecttest', 'alpha', 'beta'];

const MIN = [20, 0.5];

export const Reports = new class {
  BL: {[tier in Tier]?: Set<string>} = {
    UU: new Set([
      'baxcalibur', 'blaziken', 'ceruledge', 'espathra', 'garchomp', 'garganacl',
      'hoopaunbound', 'ironboulder', 'ironhands', 'kommoo', 'latias', 'meowscarada',
      'moltresgalar', 'okidogi', 'pelipper', 'polteageist', 'quaquaval', 'rillaboom',
      'ursaluna',
    ]),
    RU: new Set([
      'blastoise', 'comfey', 'enamorustherian', 'hawlucha', 'haxorus', 'hoopaunbound',
      'hydreigon', 'ironjugulis', 'ironleaves', 'manaphy', 'moltresgalar',
      'polteageist', 'ogerpon', 'oricoriopompom', 'salamence', 'serperior',
      'thundurus', 'thundurustherian', 'yanmega', 'zarude', 'zoroarkhisui',
    ]),
    NU: new Set([
      'armarouge', 'cetitan', 'cloyster', 'cresselia', 'deoxysdefense', 'feraligatr',
      'gallade', 'gyarados', 'ironthorns', 'lilliganthisui', 'lucario', 'lycanrocdusk',
      'mew', 'mienshao', 'necrozma', 'oricoriopompom', 'oricoriosensu', 'politoed',
      'porygonz', 'regidrago', 'suicune',
    ]),
    PU: new Set([
      'dragalge', 'drednaw', 'duraludon', 'flamigo', 'indeedee', 'inteleon',
      'oricoriopompom', 'raikou', 'scyther', 'torterra',
    ]),
    ZU: new Set([
      'alcremie', 'articunogalar', 'bruxish', 'delphox', 'dudunsparce', 'electrodehisui',
      'emboar', 'hariyama', 'kingdra', 'oricoriosensu', 'porygon2', 'tornadus', 'uxie',
    ]),
  };

  usageReport(gen: Generation, format: ID, stats: Statistics, legacy = true) {
    const sorted = Object.entries(stats.pokemon).filter(p => p[0] !== 'empty');
    if (['challengecup1v1', '1v1'].includes(format)) {
      sorted.sort((a, b) => b[1].usage.real - a[1].usage.real || a[0].localeCompare(b[0]));
    } else {
      sorted.sort((a, b) => b[1].usage.weighted - a[1].usage.weighted || a[0].localeCompare(b[0]));
    }

    let s = `Total battles: ${stats.battles}\n`;
    const avg = stats.battles
      ? util.roundStr(stats.usage.weighted / stats.battles / 12, 1e3)
      : '0.0';
    s += `Avg. weight/team: ${avg}\n`;
    s += '+ ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n';
    s += '| Rank | Pokemon            | Usage %   | Raw    | %       | Real   | %       | \n';
    s += '+ ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n';

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
      const poke = util.displaySpecies(gen, species, legacy).padEnd(18);
      const use = (((100 * usage.weighted) / total.weighted) * 6).toFixed(5).padStart(8);
      const raw = usage.raw.toFixed().padEnd(6);
      const rawp = (((100 * usage.raw) / total.raw) * 6).toFixed(3).padStart(6);
      const real = usage.real.toFixed().padEnd(6);
      const realp = (((100 * usage.real) / total.real) * 6).toFixed(3).padStart(6);
      s += `| ${rank} | ${poke} | ${use}% | ${raw} | ${rawp}% | ${real} | ${realp}% | \n`;
    }
    s += '+ ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n';
    return s;
  }

  leadsReport(gen: Generation, stats: Statistics, legacy = true) {
    let s = `Total leads: ${stats.battles * 2}\n`;
    s += '+ ---- + ------------------ + --------- + ------ + ------- + \n';
    s += '| Rank | Pokemon            | Usage %   | Raw    | %       | \n';
    s += '+ ---- + ------------------ + --------- + ------ + ------- + \n';

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
      const poke = util.displaySpecies(gen, species, legacy).padEnd(18);
      const use = ((100 * usage.weighted) / total.weighted).toFixed(5).padStart(8);
      const raw = usage.raw.toFixed().padEnd(6);
      const pct = ((100 * usage.raw) / total.raw).toFixed(3).padStart(6);
      s += `| ${rank} | ${poke} | ${use}% | ${raw} | ${pct}% | \n`;
    }

    s += '+ ---- + ------------------ + --------- + ------ + ------- + \n';
    return s;
  }

  movesetReports(
    gen: Generation,
    format: ID,
    stats: Statistics,
    cutoff = 1500,
    tag: ID | null = null,
    min = MIN,
    legacy = true,
  ) {
    const movesetStats = toMovesetStatistics(gen, format, stats, min[0], legacy);
    const basic = this.movesetReport(gen, format, stats, movesetStats, min, legacy);
    const detailed =
      this.detailedMovesetReport(gen, format, stats, cutoff, tag, movesetStats, min[0], legacy);
    return {basic, detailed};
  }

  movesetReport(
    gen: Generation,
    format: ID,
    stats: Statistics,
    movesetStats?: Map<ID, MovesetStatistics>,
    min = MIN,
    legacy = true,
  ) {
    movesetStats = movesetStats || toMovesetStatistics(gen, format, stats, min[0]);

    gen = util.ignoreGen(gen, legacy);
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

      const p = stats.pokemon[species];

      s += sep;
      s += ` | ${util.displaySpecies(gen, species, legacy)}`.padEnd(WIDTH + 2) + '| \n';
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
      s += heading('Tera Types');
      for (const teraType of Object.keys(moveset['Tera Types'])) {
        if (total > 0.95) {
          s += other(total);
          break;
        }
        const weight = moveset['Tera Types'][teraType] / p.raw.weight;
        s += display(teraType[0].toUpperCase() + teraType.slice(1), weight);
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
        if (total > 0.95 || i > 10) break;
        const w = moveset['Teammates'][teammate];
        if (w < 0.005 * p.raw.weight) break;
        const weight = w / p.raw.weight;
        const val = 100 * weight;
        s += ` | ${teammate} ${val.toFixed(3).padStart(5)}%`.padEnd(WIDTH + 2) + '| \n';
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
    min = 20,
    legacy = true,
  ) {
    movesetStats = movesetStats || toMovesetStatistics(gen, format, stats, min);

    const info = {
      metagame: format,
      cutoff,
      'cutoff deviation': 0,
      'team type': tag,
      'number of battles': stats.battles,
    };

    gen = util.ignoreGen(gen, legacy);
    const data: { [key: string]: object } = {}; // eslint-disable-line
    for (const [species, moveset] of movesetStats.entries()) {
      if (moveset.usage < 0.0001) break; // 1/100th of a percent
      const m: any = {...moveset};
      m['Checks and Counters'] = forDetailed(m['Checks and Counters']);
      data[util.displaySpecies(gen, species, legacy)] = m;
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
      const dots = '.'.repeat(Math.max(0, 18 - tag.length));
      s += `${tag}${dots}${(100.0 * weight / W * 6.0).toFixed(5)}%\n`;
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

    s += `Stalliness (mean: ${mean.toFixed(3)})\n`;
    for (const h of histogram) {
      let line = '    |';
      if (fmod(h[0], 2 * binSize) < binSize / 2) {
        line = '';
        if (h[0] > 0) {
          line += '+';
        } else if (h[0] === 0) {
          line += ' ';
        }
        line += `${h[0].toFixed(1)}|`;
      }
      s += line + '#'.repeat(Math.round(h[1] / blockSize)) + '\n';
    }
    s += 'more negative = more offensive, more positive = more stall\n';
    s += `one # = ${((100.0 * blockSize) / total).toFixed(2)}%\n`;
    return s;
  }

  async tierUpdateReport(
    gen: Generation,
    months: [string] | [string, string] | [string, string, string],
    read: (month: string, format: string) => Promise<[number, string] | undefined>,
    type: ReportType = 'singles',
    legacy = true,
  ) {
    gen = util.ignoreGen(gen, legacy);

    const cutoffs: CombinedUsageTiers<number> = usageTiers(type, () => 0);
    const pokemon: Map<ID, CombinedUsageTiers<number>> = new Map();
    for (const month of months) {
      for (const tier of USAGE_TIERS[type]) {
        const reports: Array<Promise<[string, [number, Map<ID, number>, number] | undefined]>> = [];
        for (const suffix of SUFFIXES) {
          reports.push(maybeParseUsageReport(
            read(month, `gen${gen.num}${usageTierName(type, tier)}${suffix}`)
          ).then(r => [suffix, r]));
        }

        const n: {[suffix: string]: number} = {};
        const u: {[suffix: string]: Map<ID, number>} = {};
        let ntot = 0;
        for (const [suffix, report] of await Promise.all(reports)) {
          if (report) {
            [(cutoffs as any)[tier], u[suffix], n[suffix]] = report;
            ntot += n[suffix];
          }
        }
        for (const suffix in u) {
          for (const [p, usage] of u[suffix].entries()) {
            let v = pokemon.get(p);
            if (!v) {
              v = usageTiers(type, () => 0);
              pokemon.set(p, v);
            }
            if (p !== 'empty') {
              (v as any)[tier] += (((n[suffix]) / ntot) * usage) / months.length;
            }
          }
        }
      }
    }

    const tiers: CombinedUsageTiers<Array<[ID, number]>> = usageTiers(type, () => []);
    for (const [species, usage] of pokemon.entries()) {
      for (const tier of USAGE_TIERS[type]) {
        const ut: number = (usage as any)[tier];
        if (ut > 0) (tiers as any)[tier].push([species, ut]);
      }
    }
    let s = '';
    for (const tier of USAGE_TIERS[type]) {
      const sorted = (tiers as any)[tier].sort((a: [string, number], b: [string, number]) =>
        b[1] - a[1] || a[0].localeCompare(b[0]));
      s += makeTable(gen, sorted, type, tier, (cutoffs as any)[tier], legacy);
    }
    s += '\n';

    const rise = 0.04515839608;
    const drop = rise;

    if (type === 'littlecup') {
      const bl = [];
      for (const [species, usage] of pokemon.entries()) {
        if ((usage as any)['LC'] > drop) bl.push(species);
      }
      s += '[b]LC UU Banlist:[/b] ';
      s += bl.sort().map(p => gen.species.get(p)!.name).join(', ');
      return s;
    }

    const {current, updated, NFE} = updateTiers(gen, pokemon, rise, drop, type);

    const sorted = Array.from(current.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [id, tier] of sorted) {
      const update = updated.get(id)!;
      if (type !== 'doubles' && (tier === 'ZU' && NFE.has(id))) continue;
      if (tier !== update) {
        const species = gen.species.get(id)!;
        if (species.forme &&
          (species.forme.startsWith('Mega') || species.forme.startsWith('Primal'))) {
          const base = toID(species.baseSpecies);
          // Skip if the base is already in a higher tier
          const t = TIERS[type] as any;
          if (t.indexOf(updated.get(base)!) < t.indexOf(update)) {
            continue;
          }
        }
        const prefix = type === 'nationaldex' ? 'ND' : '';
        s += `${species.name} moved from ${prefix}${tier} to ${prefix}${update}\n`;
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

function usageTiers<T>(type: ReportType, t: () => T): CombinedUsageTiers<T> {
  switch (type) {
    case 'singles': return {OU: t(), UU: t(), RU: t(), NU: t(), PU: t()};
    case 'doubles': return {DOU: t(), DUU: t()};
    case 'nationaldex': return {OU: t(), UU: t()};
    default: return {LC: t()};
  }
}

function usageTierName(type: ReportType, tier: CombinedUsageTier) {
  if (type === 'doubles' && tier === 'DOU') return 'doublesou';
  if (type === 'doubles' && tier === 'DUU') return 'doublesuu';
  if (type === 'nationaldex' && tier === 'OU') return 'nationaldex';
  if (type === 'nationaldex' && tier === 'UU') return 'nationaldexuu';
  return toID(tier);
}

function updateTiers(
  gen: Generation,
  pokemon: Map<ID, CombinedUsageTiers<number>>,
  rise: number,
  drop: number,
  type: ReportType,
) {
  const current: Map<ID, CombinedTier> = new Map();
  const updated: Map<ID, CombinedTier> = new Map();
  const NFE = new Set<ID>();
  for (const species of gen.species) {
    const doubles = type === 'doubles';
    let tier: string = (doubles
      ? species.doublesTier : type === 'nationaldex'
        ? species.natDexTier : undefined) ?? species.tier;

    if (SKIP.has(species.id) ||
      (type !== 'nationaldex' && species.isNonstandard) ||
      !tier ||
      tier === 'Illegal' ||
      tier === 'Unreleased') {
      continue;
    }
    if (doubles) {
      if (tier[0] === '(') {
        // old = old === '(DUU)') ? 'DNU' : old.slice(1, -1);
        tier = 'DNU'; // BUG: is only true for (DUU)
      }
      if (['NFE', 'LC', 'LC Uber'].includes(tier)) NFE.add(species.id);
      tier = TIERS.doubles.includes(tier as DoublesTier) ? (tier) : 'DNU';
    } else {
      if (tier[0] === '(' && tier[1] !== 'P') tier = tier.slice(1, -1);
      if (tier[0] === '(' && tier[1] === 'P') tier = 'ZU';
      if (['NFE', 'LC', 'LC Uber'].includes(tier)) NFE.add(species.id);
      tier = (TIERS[type] as string[]).includes(tier) ? tier : 'ZU';
    }
    current.set(species.id, tier as CombinedTier);

    const uber = doubles ? 'DUber' : 'Uber';
    if (tier === uber) {
      updated.set(species.id, uber);
      continue;
    }
    const update = pokemon.get(species.id);
    if (!update) {
      updated.set(species.id, tier as CombinedTier);
      continue;
    }

    if (updated.has(species.id)) continue;

    const riseAndDrop =
      (r: CombinedUsageTier, d: CombinedTier, b?: Tier | NationalDexTier) =>
        computeRiseAndDrop(species.id, update, updated, tier as CombinedTier, rise, drop, {
          rise: r,
          drop: d,
          ban: b,
        });
    if (doubles) {
      if (riseAndDrop('DOU', 'DUU')) continue;
      if (riseAndDrop('DUU', 'DNU')) continue;
    } else {
      if (riseAndDrop('OU', 'UU', 'UUBL')) continue;
      if (riseAndDrop('UU', 'RU', 'RUBL')) continue;
      if (riseAndDrop('RU', 'NU', 'NUBL')) continue;
      if (riseAndDrop('NU', 'PU', 'PUBL')) continue;
      if (riseAndDrop('PU', 'ZU', 'ZUBL')) continue;
    }

    if (!updated.has(species.id)) updated.set(species.id, doubles ? 'DNU' : 'ZU');

    const newTier = updated.get(species.id);
    if (newTier && Reports.BL[newTier as Tier]?.has(species.id)) {
      updated.set(species.id, `${newTier}BL` as Tier);
    }
  }
  return {current, updated, NFE};
}

function computeRiseAndDrop(
  species: ID,
  update: CombinedUsageTiers<number>,
  updated: Map<ID, CombinedTier>,
  tier: CombinedTier,
  rise: number,
  drop: number,
  tiers: {
    rise: CombinedUsageTier;
    drop: CombinedTier;
    ban?: CombinedTier;
  }
) {
  if ((update as any)[tiers.rise] > rise) {
    updated.set(species, tiers.rise);
    return true;
  }
  if (tier === tiers.rise) {
    if ((update as any)[tiers.rise] < drop) {
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

function toMovesetStatistics(
  gen: Generation,
  format: ID,
  stats: Statistics,
  min = 20,
  legacy = true,
) {
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
  gen = util.ignoreGen(gen, legacy);

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
      'Tera Types': util.toDisplayObject(pokemon.teraTypes,
        teraType => teraType[0].toUpperCase() + teraType.slice(1)),
      Spreads: util.toDisplayObject(pokemon.spreads),
      Happiness: util.toDisplayObject(pokemon.happinesses),
      Moves: util.toDisplayObject(pokemon.moves, move => {
        if (move === '') return 'Nothing';
        const o = gen.moves.get(move);
        return (o?.name) ?? move;
      }),
      // Teammates: getTeammates(gen, format, pokemon.teammates, pokemon.raw.weight, total, stats),
      Teammates: getTeammates(gen, pokemon.teammates, stats),
      'Checks and Counters': util.getChecksAndCounters(
        pokemon.encounters,
        [s => util.displaySpecies(gen, s, legacy), es => es],
        min
      ),
    });
  }

  return movesets;
}

// NOTE: https://www.smogon.com/forums/posts/8841061
function getTeammates(
  gen: Generation,
  teammates: {[id: string /* ID */]: number},
  stats: Statistics,
  legacy = true,
): {[key: string]: number} {
  // const real = ['challengecup1v1', '1v1'].includes(format);
  const m: {[species: string]: number} = {};
  for (const [id, w] of Object.entries(teammates)) {
    const species = util.displaySpecies(gen, id, legacy);
    const s = stats.pokemon[id];
    if (!s) {
      m[species] = 0;
      continue;
    }
    // const usage = ((real ? s.usage.real : s.usage.weighted) / total) * 6;
    // m[species] = w - round(weight) * round(usage, 1e7);
    m[species] = w;
  }
  return util.toDisplayObject(m);
}

function forDetailed(cc: {[key: string]: util.EncounterStatistics}) {
  const obj: {[key: string]: {n: number; p: number; d: number}} = {};
  for (const [k, v] of Object.entries(cc)) {
    obj[k] = {n: round(v.n), p: round(v.p), d: round(v.d)};
  }
  return obj;
}

function makeTable(
  gen: Generation,
  pokemon: Array<[ID, number]>,
  type: ReportType,
  tier: CombinedUsageTier,
  cutoff: number,
  legacy: boolean,
) {
  const prefix = type === 'nationaldex' ? 'National Dex ' : '';
  const title = `${prefix}${tier} (${cutoff} stats)`;
  let s = `[HIDE=${title}][CODE]\n`;
  s += `Combined usage for ${title}\n`;
  s += ' + ---- + ------------------ + ------- + \n';
  s += ' | Rank | Pokemon            | Percent | \n';
  s += ' + ---- + ------------------ + ------- + \n';
  for (const [i, pair] of pokemon.entries()) {
    const [id, usage] = pair;
    if (usage < 0.001) break;
    const rank = (i + 1).toFixed().padEnd(4);
    const poke = util.displaySpecies(gen, id, legacy).padEnd(18);
    const percent = (100 * usage).toFixed(3).padStart(6);
    s += ` | ${rank} | ${poke} | ${percent}% |\n`;
  }
  s += ' + ---- + ------------------ + ------- + \n';
  s += '[/CODE][/HIDE]\n';
  return s;
}

async function maybeParseUsageReport(report: Promise<[number, string] | undefined>) {
  const r = await report;
  return r ? parseUsageReport(r) : undefined;
}

function parseUsageReport([baseline, report]: [number, string]): [number, Map<ID, number>, number] {
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

  return [baseline, usage, battles];
}
