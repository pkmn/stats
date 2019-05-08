import {Battle, Player, Team, Pokemon, Outcome} from './parser';

export interface TaggedStatistics {
  [tag: string]: Statistics;
}

export interface Statistics {
  leads: {
    [poke: string]: {raw: number, weighted: number};
  };
  counts: {
    [poke: string]: {raw: number, real: number, weighted: number};
  };
  total: { raw: number, real: number, weighted: number };
  metagame: { 
    tags: {[tag: string]: number };
    stalliness: Array<[number, number]>;
  };
}

export interface EncounterMatrix {
  [poke1: string]: {
    [poke2: string]: number[/* Outcome */];
  }
};

export interface TeammateMatrix {
  [poke1: string]: {
    [poke2: string]: number;
  }
};

export const Stats = new class {
  update(battle: Battle, stats: TaggedStatistics = {}) {
    // TODO
    return stats;
  }
};
