import {calcStat, Data, ID, Nature, PokemonSet, Stat, StatsTable, statToEV} from 'ps';

import {Battle, Outcome, Player, Pokemon, Team} from './parser';
import * as util from './util';

export interface TaggedStatistics {
  battles: number;
  total: WeightedStatistics;
  tags: Map<ID, WeightedStatistics>;
}

export type WeightedStatistics = Map<number, Statistics>;

export interface Statistics {
  pokemon: Map<ID, UsageStatistics>;
  leads: Usage;
  usage: Usage;
  metagame: MetagameStatistics;
}

export interface UsageStatistics {
  lead: Usage;
  usage: Usage;

  abilities: Map<ID, number>;
  items: Map<ID, number>;
  happinesses: Map<number, number>;
  spreads: Map<string, number>;
  moves: Map<ID, number>;

  count: number;
  weights: {sum: number, count: number};

  encounters: Map<ID, number[/* Outcome */]>;
  teammates: Map<ID, number>;
  gxes: Map<ID, number>;
}

export interface Usage {
  raw: number;
  real: number;
  weighted: number;
}

export interface MetagameStatistics {
  tags: Map<ID, number>;
  stalliness: Array<[number, number]>;
}

const EMPTY: Set<ID> = new Set();

export const Stats = new class {
  create() {
    return {battles: 0, total: new Map(), tags: new Map()};
  }

  update(
      format: string|Data, battle: Battle, cutoffs: number[], stats?: TaggedStatistics,
      tags = EMPTY) {
    stats = stats || this.create();

    const singles = !util.isNonSinglesFormat(format);
    const short =
        !util.isNon6v6Format(format) && (battle.turns < 2 || (battle.turns < 3 && singles));
    if (!short) stats.battles++;

    const weights: number[][] = [];
    for (const player of [battle.p1, battle.p2]) {
      const [w, save] = getWeights(player, cutoffs);
      const gxe = player.rating && player.rating.rprd ?
          Math.round(100 * util.victoryChance(player.rating.rpr, player.rating.rprd, 1500, 130)) :
          undefined;
      weights.push(w);
      for (const [i, cutoff] of cutoffs.entries()) {
        const weight = w[i];

        let s = stats.total.get(cutoff);
        if (!s) {
          s = newStatistics();
          stats.total.set(cutoff, s);
        }
        updateStats(format, player, battle, weight, gxe, save, short, s);

        for (const tag of tags) {
          let t = stats.tags.get(tag);
          if (!t) {
            t = new Map();
            stats.tags.set(tag, t);
          }
          s = t.get(cutoff);
          if (!s) {
            s = newStatistics();
            t.set(cutoff, s);
          }
          if (player.team.classification.tags.has(tag)) {
            updateStats(format, player, battle, weight, gxe, save, short, s, tag);
          }
        }
      }
    }

    if (singles) {
      const mins = weights[0].map((w, i) => Math.min(w, weights[1][i]));
      for (const [i, weight] of mins.entries()) {
        const pw = {p1: weights[0][i], p2: weights[1][i]};
        const cutoff = cutoffs[i];
        const s = stats.total.get(cutoff)!;
        updateEncounters(s, battle.matchups, weight);
        if (!short) updateLeads(s, battle, pw);

        for (const tag of tags) {
          const s = stats.tags.get(tag)!.get(cutoff)!;
          updateEncounters(s, battle.matchups, weight);
          if (!short) updateLeads(s, battle, pw);
        }
      }
    }

    return stats;
  }
};

function getWeights(player: Player, cutoffs: number[]): [number[], boolean] {
  let save = false;
  let rpr = 1500;
  let rprd = 130;
  if (player.rating) {
    if (player.rating.rprd !== 0) {
      rpr = player.rating.rpr;
      rprd = player.rating.rprd;
      save = true;
    }
  } else if (player.outcome) {
    rpr = player.outcome === 'win' ? 1540.16061434 : 1459.83938566;
    rprd = 122.858308077;
  }

  const w = [];
  for (const cutoff of cutoffs) {
    w.push(util.weighting(rpr, rprd, cutoff));
  }
  return [w, save];
}

function updateStats(
    format: string|Data, player: Player, battle: Battle, weight: number, gxe: number|undefined,
    save: boolean, short: boolean, stats: Statistics, tag?: ID) {
  const data = util.dataForFormat(format);
  for (const [index, pokemon] of player.team.pokemon.entries()) {
    if (pokemon.species === 'empty') continue;
    const set = pokemon.set;

    let p = stats.pokemon.get(pokemon.species);
    if (!p) {
      p = newUsageStatistics();
      stats.pokemon.set(pokemon.species, p);
    }
    p.count++;

    if (gxe !== undefined) {
      const g = p.gxes.get(player.name);
      if (!g || g < gxe) p.gxes.set(player.name, gxe);
    }

    if (save) {
      p.weights.sum += weight;
      p.weights.count++;
    }

    const ability = set.ability === 'unknown' ? 'illuminate' as ID : set.ability;
    const a = p.abilities.get(ability);
    p.abilities.set(ability, (a || 0) + weight);

    const i = p.items.get(set.item);
    p.items.set(set.item, (i || 0) + weight);

    const NEUTRAL = new Set(['serious', 'docile', 'quirky', 'bashful']);
    const nature = data.getNature(NEUTRAL.has(set.nature) ? 'hardy' as ID : set.nature)!;
    const spread = getSpread(nature, util.getSpecies(pokemon.species, data).baseStats, pokemon.set);
    const s = p.spreads.get(spread);
    p.spreads.set(spread, (s || 0) + weight);

    for (const move of set.moves) {
      // NOTE: We're OK with triple counting 'nothing'
      const m = p.moves.get(move);
      p.moves.set(move, (m || 0) + weight);
    }

    const h = p.happinesses.get(set.happiness!);
    p.happinesses.set(set.happiness!, (h || 0) + weight);

    if (!short) {
      p.usage.raw++;
      if (pokemon.turnsOut > 0) p.usage.real++;
      p.usage.weighted += weight;

      for (const tag of player.team.classification.tags) {
        stats.metagame.tags.set(tag, (stats.metagame.tags.get(tag) || 0) + weight);
        stats.metagame.stalliness.push([player.team.classification.stalliness, weight]);
      }

      updateTeammates(player.team.pokemon, index, pokemon.species, p.teammates, stats, weight);
    }
  }
}

function getSpread<T>(nature: Nature, base: StatsTable<number>, pokemon: PokemonSet<T>) {
  const evs: number[] = [];

  let stat: Stat;
  for (stat in pokemon.evs) {
    // FIXME: The intention of the original code was to clearly round all EVs,
    // but in reality on the last stat gets modified.
    if (stat === 'spe') {
      const val =
          calcStat(stat, base[stat], pokemon.ivs[stat], pokemon.evs[stat], pokemon.level, nature);
      evs.push(statToEV(stat, val, base[stat], pokemon.ivs[stat], pokemon.level, nature));
    } else {
      evs.push(pokemon.evs[stat]);
    }
  }
  return `${nature.name}:${evs.join('/')}`;
}

function updateTeammates(
    pokemon: Pokemon[], i: number, a: ID, ta: Map<ID, number>, stats: Statistics, weight: number) {
  for (let j = 0; j < i; j++) {
    const b = pokemon[j].species;

    let pb = stats.pokemon.get(b);
    if (!pb) {
      pb = newUsageStatistics();
      stats.pokemon.set(b, pb);
    }
    const tb = pb.teammates;

    const w = (ta.get(b) || 0) + weight;
    ta.set(b, w);
    tb.set(a, w);
  }
}

// lookup table for the outcomes if poke1 and poke2 were exchanged
// clang-format off
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
// clang-format on

function updateEncounters(stats: Statistics, matchups: Array<[ID, ID, Outcome]>, weight: number) {
  for (const [a, b, outcome] of matchups) {
    let ea = stats.pokemon.get(a);
    if (!ea) {
      ea = newUsageStatistics();
      stats.pokemon.set(a, ea);
    }

    let eb = stats.pokemon.get(b);
    if (!eb) {
      eb = newUsageStatistics();
      stats.pokemon.set(b, eb);
    }

    let eab = ea.encounters.get(b);
    if (!eab) {
      eab = new Array(13).fill(0);
      ea.encounters.set(b, eab);
    }

    let eba = eb.encounters.get(a);
    if (!eba) {
      eba = new Array(13).fill(0);
      eb.encounters.set(a, eba);
    }

    eab[outcome] += weight;
    eba[INVERSE_OUTCOMES[outcome]] += weight;
  }
}

function updateLeads(stats: Statistics, battle: Battle, weights: {p1: number, p2: number}) {
  const sides: Array<'p1'|'p2'> = ['p1', 'p2'];
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
  if (leads.p1 === 'empty' || leads.p2 === 'empty') return;

  for (const side of sides) {
    const usage = stats.pokemon.get(leads[side])!.lead;
    usage.raw++;
    stats.leads.raw++;

    usage.real++;
    stats.leads.real++;

    usage.weighted += weights[side];
    stats.leads.weighted += weights[side];
  }
}

function newStatistics() {
  return {
    pokemon: new Map(),
    leads: newUsage(),
    usage: newUsage(),
    metagame: {tags: new Map(), stalliness: []},
  };
}

function newUsageStatistics() {
  return {
    lead: newUsage(),
    usage: newUsage(),
    abilities: new Map(),
    items: new Map(),
    happinesses: new Map(),
    spreads: new Map(),
    moves: new Map(),
    viability: 0,
    weights: {sum: 0, count: 0},
    count: 0,
    encounters: new Map(),
    teammates: new Map(),
    gxes: new Map(),
  };
}

function newUsage() {
  return {raw: 0, real: 0, weighted: 0};
}
