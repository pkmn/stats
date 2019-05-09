import {ID} from 'ps';
import {Battle, Outcome, Player, Pokemon, Team} from './parser';
// TODO WEIGHTED PAIRS!!!

// TODO: toJSON serialization
export interface TaggedStatistics {
  total: Statistics;
  battles: number;
  tags: Map<ID, Statistics>;
}

export interface Statistics {
  leads: Usage;
  pokemon: Usage;
  sets: SetStatistics;
  metagame: MetagameStatistics;
}

export interface Usage {
  usage: Map<ID /* Pokemon */, UsageCounts>;
  total: UsageCounts;
}

export interface UsageCounts {
  raw: number;
  real: number;
  weighted: number;
}

export interface MetagameStatistics {
  tags: Map<ID /* tag */, number /* weight */>;
  stalliness: Array<[number /* stalliness */, number /* weight */]>;
}

export interface SetStatistics {
  abilities: Map<ID, number>;
  items: Map<ID, number>;
  happinesses: Map<number, number>;
  spreads: Map<string, number>;  // Nature + EVs
  moves: Map<ID, number>;

  cutoff: number;
}

// Map<ID, Map<ID, number[/* Outcome */]>>
// TODO: can be stored pseudo-symmetrically
export interface EncounterMatrix {
  get(poke1: ID, poke2: ID, outcome: Outcome): number;
  increment(poke1: ID, poke2: ID, outcome: Outcome, weight: number): number;
}

// Map<ID, Map<ID, number>>
// TODO: can be stored symmetrically
export interface TeammateMatrix {
  get(poke1: ID, poke2: ID): number;
  increment(poke1: ID, poke2: ID, weight: number): number;
}

export const Stats = new class {
  update(battle: Battle, stats?: TaggedStatistics) {
    stats = stats || {battles: 0, total: newStatistics(), tags: new Map()};
    // TODO
    stats.battles++;
    return stats;
  }
};

function newStatistics() {
  return {
    leads: {
      usage: new Map(),
      total: {raw: 0, real: 0, weighted: 0},
    },
    pokemon: {
      usage: new Map(),
      total: {raw: 0, real: 0, weighted: 0},
    },
    sets: {
      abilities: new Map(),
      items: new Map(),
      happinesses: new Map(),
      spreads: new Map(),
      moves: new Map(),
      cutoff: 0,
    },
    metagame: {tags: new Map(), stalliness: []},
  };
}
