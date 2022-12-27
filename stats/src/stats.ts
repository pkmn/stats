import {Generation, ID, PokemonSet, Nature, StatID, StatsTable} from '@pkmn/data';

import {Battle, Player, Pokemon} from './parser';
import {Outcome} from './util';
// eslint-disable-next-line no-duplicate-imports
import * as util from './util';

export interface TaggedStatistics {
  total: WeightedStatistics;
  tags: { [id: string /* ID */]: WeightedStatistics };
}

export interface WeightedStatistics {
  [num: number]: Statistics;
}

export interface Statistics {
  battles: number;
  pokemon: { [id: string /* ID */]: UsageStatistics };
  lead: Usage;
  usage: Usage;
  win: Usage;
  metagame: MetagameStatistics;
}

export interface UsageStatistics {
  lead: Usage;
  usage: Usage;
  win: Usage;

  abilities: { [id: string /* ID */]: number };
  items: { [id: string /* ID */]: number };
  happinesses: { [num: number]: number };
  spreads: { [spread: string]: number };
  stats: { [stats: string]: number };
  moves: { [id: string /* ID */]: number };

  raw: { weight: number; count: number };
  saved: { weight: number; count: number };

  encounters: { [id: string /* ID */]: number /* Outcome */[] };
  teammates: { [id: string /* ID */]: number };
  unique: { [id: string /* ID */]: UniqueStatistics };
}

export type UniqueStatistics =
  | { r: 0 | 1; w: number; g: number }
  | { r: 0 | 1; w: number }
  | { g: number };

export interface Usage {
  raw: number;
  real: number;
  weighted: number;
}

export interface MetagameStatistics {
  tags: { [id: string /* ID */]: number };
  stalliness: Array<[number, number]>;
}

const EMPTY: Set<ID> = new Set();

const NEUTRAL = new Set(['serious', 'docile', 'quirky', 'bashful']);

export const Stats = new class {
  create() {
    return {
      battles: 0,
      pokemon: {},
      lead: newUsage(),
      usage: newUsage(),
      win: newUsage(),
      metagame: {tags: {}, stalliness: []},
    };
  }

  update(
    gen: Generation,
    format: ID,
    battle: Battle,
    cutoff: number,
    stats?: Statistics,
    legacy = false,
    tag?: ID,
  ) {
    const tagged: TaggedStatistics = {total: {}, tags: {}};
    if (tag) {
      tagged.tags[tag] = {};
      tagged.tags[tag][cutoff] = stats || this.create();
      this.updateTagged(gen, format, battle, [cutoff], tagged, legacy, new Set([tag]), true);
      return tagged.tags[tag][cutoff];
    } else {
      tagged.total = {};
      tagged.total[cutoff] = stats || this.create();
      this.updateTagged(gen, format, battle, [cutoff], tagged, legacy);
      return tagged.total[cutoff];
    }
  }

  updateWeighted(
    gen: Generation,
    format: ID,
    battle: Battle,
    cutoffs: number[],
    stats?: WeightedStatistics,
    legacy = false,
    tag?: ID
  ) {
    const tagged: TaggedStatistics = {total: {}, tags: {}};
    if (tag) {
      tagged.tags[tag] = stats || {};
      this.updateTagged(gen, format, battle, cutoffs, tagged, legacy, new Set([tag]), true);
      return tagged.tags[tag];
    } else {
      tagged.total = stats || {};
      this.updateTagged(gen, format, battle, cutoffs, tagged, legacy);
      return tagged.total;
    }
  }

  updateTagged(
    gen: Generation,
    format: ID,
    battle: Battle,
    cutoffs: number[],
    stats?: TaggedStatistics,
    legacy = false,
    tags = EMPTY,
    tagsOnly = false
  ) {
    stats = stats || {total: {}, tags: {}};

    const singles = !util.isNonSinglesFormat(format);
    const short =
      !util.isNon6v6Format(format) && (battle.turns < 2 || (battle.turns < 3 && singles));

    const playerWeights: number[][] = [];
    for (const player of [battle.p1, battle.p2]) {
      const [ws, save] = getWeights(player, cutoffs, legacy);
      const gxe = player.rating
        ? Math.round(100 * util.victoryChance(player.rating.rpr, player.rating.rprd, 1500, 130))
        : undefined;
      playerWeights.push(ws.map(w => w.s));
      for (const [i, cutoff] of cutoffs.entries()) {
        const wsm = ws[i];

        let s = stats.total[cutoff];
        if (!tagsOnly) {
          if (!s) {
            s = this.create();
            stats.total[cutoff] = s;
          }
          updateStats(gen, player, wsm, gxe, save, short, s, legacy);
        }

        for (const tag of tags) {
          let t = stats.tags[tag];
          if (!t) {
            t = {};
            stats.tags[tag] = t;
          }
          s = t[cutoff];
          if (!s) {
            s = this.create();
            t[cutoff] = s;
          }
          if (player.team.classification.tags.has(tag)) {
            updateStats(gen, player, wsm, gxe, save, short, s, legacy);
          }
        }
      }
    }

    if (!short) {
      if (singles) {
        const playerTags = {
          p1: battle.p1.team.classification.tags,
          p2: battle.p2.team.classification.tags,
        };
        const mins = playerWeights[0].map((w, i) => Math.min(w, playerWeights[1][i]));
        for (const [i, weight] of mins.entries()) {
          const pw = {p1: playerWeights[0][i], p2: playerWeights[1][i]};
          const cutoff = cutoffs[i];
          if (!tagsOnly) {
            const s = stats.total[cutoff]!;
            if (updateLeads(s, battle, pw, playerTags)) {
              updateEncounters(s, battle.matchups, weight);
              s.battles++;
            }
          }

          for (const tag of tags) {
            const s = stats.tags[tag]![cutoff]!;
            if (updateLeads(s, battle, pw, playerTags, tag)) {
              updateEncounters(s, battle.matchups, weight);
              s.battles++;
            }
          }
        }
      } else {
        for (const cutoff of cutoffs) {
          if (!tagsOnly) stats.total[cutoff].battles++;
          for (const tag of tags) {
            stats.tags[tag][cutoff].battles++;
          }
        }
      }
    }

    return stats;
  }

  combineTagged(a: TaggedStatistics, b: TaggedStatistics | undefined) {
    if (!b) return a;
    a.total = this.combineWeighted(a.total, b.total);
    for (const tag in b.tags) {
      a.tags[tag] = this.combineWeighted(b.tags[tag], a.tags[tag]);
    }
    return a;
  }

  combineWeighted(a: WeightedStatistics, b: WeightedStatistics | undefined) {
    if (!b) return a;
    for (const c in b) {
      const cutoff = Number(c);
      a[cutoff] = this.combine(b[cutoff], a[cutoff]);
    }
    return a;
  }

  combine(a: Statistics, b: Statistics | undefined) {
    if (!b) return a;
    a.battles += b.battles;
    for (const pokemon in b.pokemon) {
      a.pokemon[pokemon] = combineUsage(b.pokemon[pokemon], a.pokemon[pokemon]);
    }
    a.lead = combineCounts(a.lead, b.lead);
    a.usage = combineCounts(a.usage, b.usage);
    a.metagame = combineMetagame(a.metagame, b.metagame);
    return a;
  }
};

function getWeights(player: Player, cutoffs: number[], legacy: boolean) {
  let save = false;
  let rpr = 1500;
  let rprd = 130;
  const valid = player.rating && player.rating.rprd !== 0;
  if (valid) {
    rpr = player.rating!.rpr;
    rprd = player.rating!.rprd;
    save = true;
  } else if (player.outcome) {
    rpr = player.outcome === 'win' ? 1540.16061434 : 1459.83938566;
    rprd = 122.858308077;
  }

  const weights = [];
  for (const cutoff of cutoffs) {
    const w = util.weighting(rpr, rprd, cutoff);
    if (legacy && !valid) {
      weights.push({s: w, m: util.weighting(1500, 130, cutoff)});
    } else {
      weights.push({s: w, m: w});
    }
  }

  return [weights, save] as [Array<{ s: number; m: number }>, boolean];
}

function updateStats(
  gen: Generation,
  player: Player,
  weights: { s: number; m: number },
  gxe: number | undefined,
  save: boolean,
  short: boolean,
  stats: Statistics,
  legacy: boolean,
) {
  gen = util.ignoreGen(gen, legacy);
  const win = player.outcome === 'win';
  for (const [index, pokemon] of player.team.pokemon.entries()) {
    if (!short) {
      stats.usage.raw++;
      stats.usage.weighted += weights.s;
      if (win) {
        stats.win.raw++;
        stats.win.weighted += weights.s;
      }

      for (const tag of player.team.classification.tags) {
        stats.metagame.tags[tag] = (stats.metagame.tags[tag] || 0) + weights.s;
      }
      stats.metagame.stalliness.push([player.team.classification.stalliness, weights.s]);
    }
    if (pokemon.species === 'empty') {
      if (legacy && !short) {
        updateTeammates(player.team.pokemon, index, pokemon.species, {}, stats, weights.s);
      }
      continue;
    }

    let p = stats.pokemon[pokemon.species];
    if (!p) {
      p = newUsageStatistics();
      stats.pokemon[pokemon.species] = p;
    }

    p.raw.weight += weights.m;
    p.raw.count++;
    if (save) {
      p.saved.weight += weights.m;
      p.saved.count++;
    }

    if (gxe !== undefined) {
      const u = p.unique[player.name];
      if (!u) {
        p.unique[player.name] = {g: gxe};
      } else if (!('g' in u)) {
        (u as { r: 0 | 1; w: number; g: number }).g = gxe;
      } else if (u.g < gxe) {
        u.g = gxe;
      }
    }

    const set = pokemon.set;
    const ability = set.ability === 'unknown' ? ('illuminate' as ID) : set.ability;
    const a = p.abilities[ability];
    p.abilities[ability] = (a || 0) + weights.m;

    const i = p.items[set.item];
    p.items[set.item] = (i || 0) + weights.m;

    const nature =
      gen.natures.get(!legacy && NEUTRAL.has(set.nature) ? 'hardy' as ID : set.nature)!;
    const baseStats = util.getSpecies(gen, pokemon.species, legacy).baseStats;
    const spread = getSpread(gen, nature, baseStats, pokemon.set, legacy);
    const s = p.spreads[spread];
    p.spreads[spread] = (s || 0) + weights.m;
    const computed = computeStats(gen, nature, baseStats, pokemon.set);
    p.stats[computed] = (s || 0) + weights.m;

    for (const move of set.moves) {
      // NOTE: We're OK with triple counting 'nothing'
      const m = p.moves[move];
      p.moves[move] = (m || 0) + weights.m;
    }

    const h = p.happinesses[set.happiness!];
    p.happinesses[set.happiness!] = (h || 0) + weights.m;


    if (!short) {
      p.usage.raw++;
      if (win) p.win.raw++;
      const real = pokemon.turnsOut > 0 ? 1 : 0;
      if (real) {
        p.usage.real++;
        stats.usage.real++;
        if (win) {
          p.win.real++;
          stats.win.real++;
        }
      }
      p.usage.weighted += weights.s;
      if (win) p.win.weighted += weights.s;

      const u = p.unique[player.name];
      const c = u as { r: 0 | 1; w: number; g: number };
      if (!u) {
        p.unique[player.name] = {r: real, w: weights.s};
      } else if (!('r' in u)) {
        c.r = real;
        c.w = weights.s;
      } else {
        c.r = (u.r | real) as 0 | 1;
        c.w = Math.max(u.w, weights.s);
      }

      updateTeammates(player.team.pokemon, index, pokemon.species, p.teammates, stats, weights.s);
    }
  }
}

function getSpread<T>(
  gen: Generation,
  nature: Nature,
  base: StatsTable,
  pokemon: PokemonSet<T>,
  legacy: boolean,
) {
  const evs: number[] = [];

  let stat: StatID;
  for (stat in pokemon.evs) {
    if (!legacy || stat === 'def') {
      const val = gen.stats.calc(
        stat, base[stat], pokemon.ivs[stat], pokemon.evs[stat], pokemon.level, nature
      );
      evs.push(statToEV(gen, stat, val, base[stat], pokemon.ivs[stat], pokemon.level, nature));
    } else {
      evs.push(pokemon.evs[stat]);
    }
  }
  return `${nature.name}:${evs.join('/')}`;
}

function computeStats<T>(
  gen: Generation,
  nature: Nature,
  base: StatsTable,
  pokemon: PokemonSet<T>
) {
  const stats: number[] = [];
  let stat: StatID;
  for (stat in pokemon.evs) {
    stats.push(
      gen.stats.calc(stat, base[stat], pokemon.ivs[stat], pokemon.evs[stat], pokemon.level, nature)
    );
  }
  return stats.join('/');
}

function statToEV(
  gen: Generation,
  stat: StatID,
  val: number,
  base: number,
  iv: number,
  level: number,
  nature: Nature
) {
  if (gen.num < 3) iv = gen.stats.toDV(iv) * 2;
  if (stat === 'hp') {
    if (base === 1) return 0;
    return Math.max(0, (Math.ceil(((val - level - 10) * 100) / level) - 2 * base - iv) * 4);
  } else {
    const n = !nature ? 1 : nature.plus === stat ? 1.1 : nature.minus === stat ? 0.9 : 1;
    return Math.max(0, (Math.ceil(((Math.ceil(val / n) - 5) * 100) / level) - 2 * base - iv) * 4);
  }
}

function updateTeammates(
  pokemon: Pokemon[],
  i: number,
  a: ID,
  ta: { [id: string /* ID */]: number },
  stats: Statistics,
  weight: number
) {
  for (let j = 0; j < i; j++) {
    const b = pokemon[j].species;

    let pb = stats.pokemon[b];
    if (!pb) {
      pb = newUsageStatistics();
      stats.pokemon[b] = pb;
    }
    const tb = pb.teammates;

    const w = (ta[b] || 0) + weight;
    ta[b] = w;
    tb[a] = w;
  }
}

// Lookup table for the outcomes if poke1 and poke2 were exchanged
const INVERSE_OUTCOMES: Outcome[] = [
  Outcome.POKE2_KOED, Outcome.POKE1_KOED,
  Outcome.DOUBLE_DOWN,
  Outcome.POKE2_SWITCHED_OUT, Outcome.POKE1_SWITCHED_OUT,
  Outcome.DOUBLE_SWITCH,
  Outcome.POKE2_FORCED_OUT, Outcome.POKE1_FORCED_OUT,
  Outcome.POKE2_UTURN_KOED, Outcome.POKE1_UTURN_KOED,
  Outcome.POKE2_FODDERED, Outcome.POKE1_FODDERED,
  Outcome.UNKNOWN,
];

function updateEncounters(stats: Statistics, matchups: Array<[ID, ID, Outcome]>, weight: number) {
  for (const [a, b, outcome] of matchups) {
    let ea = stats.pokemon[a];
    if (!ea) {
      ea = newUsageStatistics();
      stats.pokemon[a] = ea;
    }

    let eb = stats.pokemon[b];
    if (!eb) {
      eb = newUsageStatistics();
      stats.pokemon[b] = eb;
    }

    let eab = ea.encounters[b];
    if (!eab) {
      eab = new Array(13).fill(0);
      ea.encounters[b] = eab;
    }

    let eba = eb.encounters[a];
    if (!eba) {
      eba = new Array(13).fill(0);
      eb.encounters[a] = eba;
    }

    eab[outcome] += weight;
    eba[INVERSE_OUTCOMES[outcome]] += weight;
  }
}

function updateLeads(
  stats: Statistics,
  battle: Battle,
  weights: { p1: number; p2: number },
  tags: { p1: Set<ID>; p2: Set<ID> },
  tag?: ID
) {
  const sides: Array<'p1' | 'p2'> = ['p1', 'p2'];
  const leads = {p1: 'empty' as ID, p2: 'empty' as ID};
  const matchups = battle.matchups;
  if (matchups.length) {
    leads.p1 = matchups[0][0];
    leads.p2 = matchups[0][1];
  } else {
    for (const side of sides) {
      for (const pokemon of battle[side].team.pokemon) {
        if (pokemon.turnsOut > 0) {
          leads[side] = pokemon.species;
          break;
        }
      }
    }
  }

  // Possible in the case of a 1v1 or similar battle which was forfeited before starting
  if (leads.p1 === 'empty' || leads.p2 === 'empty') return false;

  for (const side of sides) {
    if (tag && !tags[side].has(tag)) continue;
    const usage = stats.pokemon[leads[side]]!.lead;
    usage.raw++;
    stats.lead.raw++;

    usage.real++;
    stats.lead.real++;

    usage.weighted += weights[side];
    stats.lead.weighted += weights[side];
  }

  return true;
}

function newUsageStatistics() {
  return {
    lead: newUsage(),
    usage: newUsage(),
    win: newUsage(),
    abilities: {},
    items: {},
    happinesses: {},
    spreads: {},
    stats: {},
    moves: {},
    viability: 0,
    raw: {weight: 0, count: 0},
    saved: {weight: 0, count: 0},
    encounters: {},
    teammates: {},
    gxes: {},
    unique: {},
  };
}

export function newUsage() {
  return {raw: 0, real: 0, weighted: 0};
}

function combineUsage(a: UsageStatistics, b: UsageStatistics | undefined) {
  if (!b) return a;
  a.lead = combineCounts(a.lead, b.lead);
  a.usage = combineCounts(a.usage, b.usage);
  a.abilities = combineMap(a.abilities, b.abilities);
  a.items = combineMap(a.items, b.items);
  for (const k in b.happinesses) {
    const n = Number(k);
    a.happinesses[n] = (a.happinesses[n] || 0) + b.happinesses[n];
  }
  a.spreads = combineMap(a.spreads, b.spreads);
  a.stats = combineMap(a.stats, b.stats);
  a.moves = combineMap(a.moves, b.moves);
  a.raw.weight += b.raw.weight;
  a.raw.count += b.raw.count;
  a.saved.weight += b.saved.weight;
  a.saved.count += b.saved.count;
  for (const k in b.encounters) {
    const ae = a.encounters[k];
    const be = b.encounters[k];
    if (!ae) {
      a.encounters[k] = be;
      continue;
    }
    for (let i = 0; i < ae.length; i++) {
      ae[i] += be[i];
    }
  }
  a.teammates = combineMap(a.teammates, b.teammates);
  for (const player in b.unique) {
    a.unique[player] = combineUnique(b.unique[player], a.unique[player]);
  }
  return a;
}

export function combineUnique(a: UniqueStatistics, b: UniqueStatistics) {
  if (!b) return a;
  const c = a as { r?: 0 | 1; w?: number; g?: number };
  if ('r' in b) c.r = ((c.r ?? 0) | b.r) as 0 | 1;
  if ('w' in b) c.w = 'w' in c ? Math.max(c.w!, b.w) : b.w;
  if ('g' in b) c.g = 'g' in c ? Math.max(c.g!, b.g) : b.g;
  return c as UniqueStatistics;
}

function combineMetagame(a: MetagameStatistics, b: MetagameStatistics | undefined) {
  if (!b) return a;
  a.tags = combineMap(a.tags, b.tags);
  // NOTE: a.stalliness.push(...b.stalliness) can exceed Node's call stack...
  for (const s of b.stalliness) {
    a.stalliness.push(s);
  }
  return a;
}

function combineMap(a: { [key: string]: number }, b: { [key: string]: number } | undefined) {
  if (!b) return a;
  for (const k in b) {
    a[k] = (a[k] || 0) + b[k];
  }
  return a;
}

function combineCounts(a: Usage, b: Usage | undefined) {
  if (!b) return a;
  a.raw += b.raw;
  a.real += b.real;
  a.weighted += b.weighted;
  return a;
}
