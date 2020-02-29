import { calcStat, Dex, ID, Nature, PokemonSet, Stat, StatsTable, statToEV } from 'ps';

import { Battle, Player, Pokemon, Team } from './parser';
import { Outcome } from './util';
import * as util from './util';

const PRECISION = 1e4;

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
  leads: Usage;
  usage: Usage;
  metagame: MetagameStatistics;
}

export interface UsageStatistics {
  lead: Usage;
  usage: Usage;

  abilities: { [id: string /* ID */]: number };
  items: { [id: string /* ID */]: number };
  happinesses: { [num: number]: number };
  spreads: { [spread: string]: number };
  moves: { [id: string /* ID */]: number };

  raw: { weight: number; count: number };
  saved: { weight: number; count: number };

  encounters: { [id: string /* ID */]: number /* Outcome */[] };
  teammates: { [id: string /* ID */]: number };
  gxes: { [id: string /* ID */]: number };
}

export interface Usage {
  raw: number;
  real: number;
  weighted: number;
}

export interface MetagameStatistics {
  tags: { [id: string /* ID */]: number };
  stalliness: Array<[number, number]>;
}

export interface DisplayStatistics {
  battles: number;
  pokemon: { [name: string]: DisplayUsageStatistics };
  metagame: DisplayMetagameStatistics;
}

export interface DisplayUsageStatistics {
  lead: Usage;
  usage: Usage;

  count: number;
  weight: number;
  viability: [number, number, number, number];

  abilities: { [name: string]: number };
  items: { [name: string]: number };
  happinesses: { [num: number]: number };
  spreads: { [spread: string]: number }; // TODO !!!
  moves: { [name: string]: number };
  teammates: { [name: string]: number };
  counters: { [name: string]: [number, number, number] };
}

export interface DisplayMetagameStatistics {
  tags: { [tag: string]: number };
  stalliness: {
    histogram: Array<[number, number]>;
    binSize: number;
    mean: number;
    total: number;
  };
}

const EMPTY: Set<ID> = new Set();

export const Stats = new (class {
  create() {
    return {
      battles: 0,
      pokemon: {},
      leads: newUsage(),
      usage: newUsage(),
      metagame: { tags: {}, stalliness: [] },
    };
  }

  update(dex: Dex, battle: Battle, cutoff: number, stats?: Statistics, tag?: ID) {
    const tagged: TaggedStatistics = { total: {}, tags: {} };
    if (tag) {
      tagged.tags[tag] = {};
      tagged.tags[tag][cutoff] = stats || this.create();
      this.updateTagged(dex, battle, [cutoff], tagged, new Set([tag]), true);
      return tagged.tags[tag][cutoff];
    } else {
      tagged.total = {};
      tagged.total[cutoff] = stats || this.create();
      this.updateTagged(dex, battle, [cutoff], tagged);
      return tagged.total[cutoff];
    }
  }

  updateWeighted(
    dex: Dex,
    battle: Battle,
    cutoffs: number[],
    stats?: WeightedStatistics,
    tag?: ID
  ) {
    const tagged: TaggedStatistics = { total: {}, tags: {} };
    if (tag) {
      tagged.tags[tag] = stats || {};
      this.updateTagged(dex, battle, cutoffs, tagged, new Set([tag]), true);
      return tagged.tags[tag];
    } else {
      tagged.total = stats || {};
      this.updateTagged(dex, battle, cutoffs, tagged);
      return tagged.total;
    }
  }

  updateTagged(
    dex: Dex,
    battle: Battle,
    cutoffs: number[],
    stats?: TaggedStatistics,
    tags = EMPTY,
    tagsOnly = false
  ) {
    stats = stats || { total: {}, tags: {} };

    const singles = !util.isNonSinglesFormat(dex);
    const short = !util.isNon6v6Format(dex) && (battle.turns < 2 || (battle.turns < 3 && singles));

    const playerWeights: number[][] = [];
    for (const player of [battle.p1, battle.p2]) {
      const [ws, save] = getWeights(player, cutoffs);
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
          updateStats(dex, player, battle, wsm, gxe, save, short, s);
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
            updateStats(dex, player, battle, wsm, gxe, save, short, s, tag);
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
          const pw = { p1: playerWeights[0][i], p2: playerWeights[1][i] };
          const cutoff = cutoffs[i];
          if (!tagsOnly) {
            const s = stats.total[cutoff]!;
            if (updateLeads(s, battle, pw, playerTags)) {
              updateEncounters(s, battle.matchups, weight);
              s.battles++;
            }
          }

          for (const [j, tag] of tags.entries()) {
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
    a.leads = combineCounts(a.leads, b.leads);
    a.usage = combineCounts(a.usage, b.usage);
    a.metagame = combineMetagame(a.metagame, b.metagame);
    return a;
  }

  display(dex: Dex, stats: Statistics, min = 20) {
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
        lead: calcUsage(p.lead, stats.leads),
        usage,

        count: p.raw.count,
        weight: R(p.saved.weight / p.saved.count),
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
      const r = R((100 * weight) / W);
      if (!r) break;
      tags[tag] = r;
    }
    // TODO: should this be rounded?
    const stalliness = util.stallinessHistogram(stats.metagame.stalliness);
    return {
      battles: stats.battles,
      pokemon,
      metagame: { tags, stalliness },
    };
  }
})();

function getWeights(player: Player, cutoffs: number[]): [Array<{ s: number; m: number }>, boolean] {
  let save = false;
  let rpr = 1500;
  let rprd = 130;
  // FIXME: StatCounter and batchMovesetCounter treat rprd === 0 differently :(
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
    if (!valid) {
      weights.push({ s: w, m: util.weighting(1500, 130, cutoff) });
    } else {
      weights.push({ s: w, m: w });
    }
  }

  return [weights, save];
}

function updateStats(
  dex: Dex,
  player: Player,
  battle: Battle,
  weights: { s: number; m: number },
  gxe: number | undefined,
  save: boolean,
  short: boolean,
  stats: Statistics,
  tag?: ID
) {
  dex = util.dexForFormat(dex);
  for (const [index, pokemon] of player.team.pokemon.entries()) {
    if (!short) {
      stats.usage.raw++;
      stats.usage.weighted += weights.s;

      for (const tag of player.team.classification.tags) {
        stats.metagame.tags[tag] = (stats.metagame.tags[tag] || 0) + weights.s;
      }
      stats.metagame.stalliness.push([player.team.classification.stalliness, weights.s]);
    }
    if (pokemon.species === 'empty') {
      // FIXME: Stop including 'empty' in teammate stats!
      if (!short) {
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
      const g = p.gxes[player.name];
      if (!g || g < gxe) p.gxes[player.name] = gxe;
    }

    const set = pokemon.set;
    const ability = set.ability === 'unknown' ? ('illuminate' as ID) : set.ability;
    const a = p.abilities[ability];
    p.abilities[ability] = (a || 0) + weights.m;

    const i = p.items[set.item];
    p.items[set.item] = (i || 0) + weights.m;

    // FIXME: batchMovesetCounter is actually outputing 'Serious' instead of 'Hardy'...
    // const NEUTRAL = new Set(['serious', 'docile', 'quirky', 'bashful']);
    const nature = dex.getNature(/* NEUTRAL.has(set.nature) ? 'hardy' as ID : */ set.nature)!;
    const spread = getSpread(nature, util.getSpecies(pokemon.species, dex).baseStats, pokemon.set);
    const s = p.spreads[spread];
    p.spreads[spread] = (s || 0) + weights.m;

    for (const move of set.moves) {
      // NOTE: We're OK with triple counting 'nothing'
      const m = p.moves[move];
      p.moves[move] = (m || 0) + weights.m;
    }

    const h = p.happinesses[set.happiness!];
    p.happinesses[set.happiness!] = (h || 0) + weights.m;

    if (!short) {
      p.usage.raw++;
      if (pokemon.turnsOut > 0) {
        p.usage.real++;
        stats.usage.real++;
      }
      p.usage.weighted += weights.s;

      updateTeammates(player.team.pokemon, index, pokemon.species, p.teammates, stats, weights.s);
    }
  }
}

function getSpread<T>(nature: Nature, base: StatsTable<number>, pokemon: PokemonSet<T>) {
  const evs: number[] = [];

  let stat: Stat;
  for (stat in pokemon.evs) {
    // FIXME: The intention of the original code was to clearly round all EVs
    if (stat === 'def') {
      const val = calcStat(
        stat,
        base[stat],
        pokemon.ivs[stat],
        pokemon.evs[stat],
        pokemon.level,
        nature
      );
      evs.push(statToEV(stat, val, base[stat], pokemon.ivs[stat], pokemon.level, nature));
    } else {
      evs.push(pokemon.evs[stat]);
    }
  }
  return `${nature.name}:${evs.join('/')}`;
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
// prettier-ignore
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
  const leads = { p1: 'empty' as ID, p2: 'empty' as ID };
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
    stats.leads.raw++;

    usage.real++;
    stats.leads.real++;

    usage.weighted += weights[side];
    stats.leads.weighted += weights[side];
  }

  return true;
}

function newUsageStatistics() {
  return {
    lead: newUsage(),
    usage: newUsage(),
    abilities: {},
    items: {},
    happinesses: {},
    spreads: {},
    moves: {},
    viability: 0,
    raw: { weight: 0, count: 0 },
    saved: { weight: 0, count: 0 },
    encounters: {},
    teammates: {},
    gxes: {},
  };
}

function newUsage() {
  return { raw: 0, real: 0, weighted: 0 };
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
  for (const player in b.gxes) {
    const gxe = b.gxes[player];
    const g = a.gxes[player];
    if (!g || g < gxe) a.gxes[player] = gxe;
  }
  return a;
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
