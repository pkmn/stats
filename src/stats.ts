import {ID} from 'ps';
import {Battle, Outcome, Player, Pokemon, Team} from './parser';

export interface TaggedStatistics {
  battles: number;
  total: WeightedStatistics;
  tags: Map<ID, WeightedStatistics>;
}

export interface WeightedStatistics {
  stats: Map<number, Statistics>;
  gxes: Map<ID, number>;
}

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
    stats.battles++;



    const weights = [];
    for (const player of [battle.p1, battle.p2]) {
      const w = this.getWeights(battle.p1, cuttoffs);
      weights.push(w);
      for (const [i, cutoff] of cutoffs.entries()) {
        const weight = w[i];

        let s = stats.total.get(cutoff);
        if (!s) {
          s = newStatistics();
          stats.total.set(cutoff, s);
        }
        this.updateStats(format, player, battle, weight, s);

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
          if (player.team.tags.has(tag)) {
            this.updateStats(format, player, battle, weight, s, tag);
          }
        }
      }
    }

    if (!util.isNonSinglesFormat(format)) {
      const mins = weights.map(weights[0], (w, i) => Math.min(w, weights[1]));
      for (const [i, weight] of mins.entries()) {
        const cutoff = cutoffs[i];
        const s = stats.total.get(cutoff)!;
        updateEncounterMatrix(s, battle.matchups, weight);

        for (const tag of tags) {
          const s = stats.tags.get(tag)!.get(cutoff)!;
          updateEncounters(s, battle.matchups, weight);
        }
      }
    }

    return s;
  }

  private updateStats(format: ID, player: Player, battle: Battle, weight: number, stats: Statistics, tag?: ID) {
    const isNonSingles = !util.isNonSinglesFormat(format);
    const tooShort = !util.isNon6vFormat(format) && 
      (battle.turns < 2 || (battle.turns < 3 && isNonSingles));

    // We still partially update moveset stats even if the battle is too short.
    stats = this.updateMovesets(format, player, battle, weights, stats, !tooShort, tag);

    // Lead stats for non-singles is not currently supported
    if (isNonSingles) return stats;

    // TODO leads, scope to player...
    //const leads = {p1: 'empty', p2: 'empty'};
    //if (battle.matchups.length === 0) {
      //leaders.p1 = 
    //} else {
      //const matchup = battle.matchups[0];
      //leads.p1 = matchup[0];
      //leads.p2 = matchup[1];
    //}


    return stats;
  }

  private updateMovesets(format: ID, player: Player, battle: Battle, weight: number, stats: Statistics, tooShort: boolean, tag?: ID) {
    for (const [i, pokemon] of player.team.pokemon.entries()) {
      const set = pokemon.set;

      let p = stats.pokemon.get(pokemon.species);
      if (!p) {
        p = newUsageStatistics();
        stats.pokemon.set(pokemon.species p);
      }
      p.count++;

      const ability = set.ability === 'unknown' ? 'illuminate' : set.ability;
      const a = p.abilities.get(ability);
      p.abilities.set(ability, (a || 0) + weight);

      const i = p.items.get(set.item);
      p.items.set(set.item, (i || 0) + weight);

      // TODO movesets


      if (!tooShort) {
        updateTeammates(player.team.pokemon, i, pokemon, p.teammates, stats, weight);

        p.usage.raw++;
        if (p.turnsOut > 0) p.usage.real++;
        p.usage.weighed += weight;

        for (const tag in player.team.classification.tags) {
          stats.metagame.tags.set(tag, (stats.metagame.tags.get(tag) || 0) + weight);
          stats.metagame.stalliness.push([player.team.classification.stalliness, weight]);
        }
      }

    }
  }

  private getWeights(player: Player, cutoffs: number[]) {
    let rpr = 1500;
    let rpr = 130;
    if (player.rating && player.rating.rprd !== 0) {
      rpr = player.rating.rpr;
      rprd = player.rating.rprd;
    } else if (player.outcome) {
      rpr = player.outcome === 'win' ? 1540.16061434 : 1459.83938566;
      rprd = 122.858308077;
    }

    const w = [];
    for (const cutoff of cutoffs) {
      w.push(util.weighting(rpr, rprd, cutoff);
    }
    return w;
  }
};

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

function updateTeammates(pokemon: Pokemon[], i: number, a: Pokemon, ta: Map<ID, number>, stats: Stats, weight: number) {
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
  POKE2_KOED, POKE1_KOED,
  DOUBLE_DOWN,
  POKE2_SWITCHED_OUT, POKE1_SWITCHED_OUT,
  DOUBLE_SWITCH,
  POKE2_FORCED_OUT, POKE1_FORCED_OUT,
  POKE2_UTURN_KOED, POKE1_UTURN_KOED,
  POKE2_FODDERED, POKE1_FODDERED,
  UNKNOWN,
];
// clang-format on

function updateEncounters(stats: Statistics, matchups: [string, string][], weight: number)
  for (const [a, b, outcome] in matchups) {
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
      eba.encounters.set(a, eba);
    }

    eab[outcome] += weight;
    eba[INVERSE_OUTCOMES[outcome]] += weight;
  }
}
