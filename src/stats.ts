import {ID} from 'ps';
import {Battle, Outcome, Player, Pokemon, Team} from './parser';

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

  viability: number;
  weight: number;

  encounters: Map<ID, number[/* Outcome */]>;
  teammates: Map<ID, number>;
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

export const Stats = new class {
  update(battle: Battle, stats?: TaggedStatistics) {
    // stats = stats || {battles: 0, total: newStatistics(), tags: new Map()};
    //// TODO
    // stats.battles++;
    // return stats;
  }
};
