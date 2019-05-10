import {ID} from 'ps';
import {Battle, Outcome, Player, Pokemon, Team} from './parser';

export interface TaggedStatistics {
  battles: number;
  total: WeightedStatistics;
  tags: Map<ID, WeightedStatistics>;
}

export type WeightedStatistics = Map</* cutoff */ number, Statistics>;

export interface Statistics {
  pokemon: Map<ID /* species */, UsageStatistics>;
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

  encounters: Map</* species */ ID, Map<Outcome, number>>;
  teammates: Map</* species */ ID, number>;
}

export interface Usage {
  raw: number;
  real: number;
  weighted: number;
}

export interface MetagameStatistics {
  tags: Map<ID /* tag */, number /* weight */>;
  stalliness: Array<[number /* stalliness */, number /* weight */]>;
}

export const Stats = new class {
  update(battle: Battle, stats?: TaggedStatistics) {
    // stats = stats || {battles: 0, total: newStatistics(), tags: new Map()};
    //// TODO
    // stats.battles++;
    // return stats;
  }
};
