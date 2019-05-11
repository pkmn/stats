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
  count: number;

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

// TODO: 'empty'
export const Stats = new class {
  update(format: ID, battle: Battle, cutoffs: number[], stats?: TaggedStatistics, tags?: Set<ID>) {
    stats = stats || {battles: 0, total: new Map(), tags: new Map()};
    stats = this.updateMovesets(format, battle, cutoffs, stats, tags);

    // Non-moveset statistics only consider battles which are long enough
    const tooShort = !util.isNon6vFormat(format) && 
      (battle.turns < 2 || (battle.turns < 3 && !util.isNonSinglesFormat(tier)));
    if (tooShort) return stats;

    // TODO
     stats.battles++;
     return stats;
  }

  private updateMovesets(format: ID, battle: Battle, cutoffs: number[], stats: TaggedStatistics, tags?: Set<ID>) {
    const update = updateEach(stats, cutoffs, tags);
    for (const player of [battle.p1, battle.p2]) {
          const weight = 1234; // TODO based on cutoff!
      for (const pokemon of player.team.pokemon) {
        const set = pokemon.set;
        updatePokemon((s, w) => {
          s.count++;

          const ability = set.ability === 'unknown' ? 'illuminate' : set.ability;
          const a = s.abilities.get(ability);
          s.abilities.set(ability, (a || 0) + weight);

          const i = items.get(set.item);
          s.items.set(set.item, (i || 0) + weight);

        });
      }
    }
  }
};

function updatePokemon(species: ID, each: (u: (s: Statistics, cutoff: number) => void) => void) {
  return (update: (s: UsageStatistics, cutoff: number) => void)) = each((s, c) => {
    let p = stats.pokemon.get(id);
    if (!p) {
      p = newUsageStatistics();
      stats.pokemon.set(id, p);
    }
    update(p, c);
  });
}

function updateEach(stats: TaggedStatistics, cutoffs: number[], tags: Set<ID>) {
  return (update: (s: Statistics, cutoff: number) => void) = {
    for (const cutoff of cutoffs) {
      // TODO compute weight
      let s = stats.total.get(cutoff);
      if (!s) {
        s = newStatistics();
        stats.total.set(cutoff, s);
      }
      update(s, cutoff);
      for (const tag of tags) {
        const t = stats.tags.get(tag);
        if (!t) {
          t = new Map();
          stats.tags.set(tag, t);
        }
        s = t.get(cutoff);
        if (!s) {
          s = newStatistics();
          t.set(cutoff, s);
        }
        update(s, cutoff);
      }
    }
  };
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
    weight: 0,
    count: 0,
    encounters: new Map(),
    teammates: new Map(),
  };
}

function newUsage() {
  return {raw: 0, real: 0, weighted: 0};
}
