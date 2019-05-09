import {Data, hiddenPower, ID, PokemonSet, Stat, toID} from 'ps';

import {getMegaEvolution, getSpecies, isMegaRayquazaAllowed} from './util';

export interface Log {
  id: string;         // gen1randombattle-12345
  format: string;     // gen1randombattle;
  timestamp: string;  // Date.toString();
  winner: string;     // Name
  endType?: 'normal'|'forced'|'forfeit';
  seed: [number, number, number, number];
  turns: number;
  score: [number, number];

  p1: string;  // Name
  p2: string;  // Name

  p1team: Array<PokemonSet<string>>;
  p2team: Array<PokemonSet<string>>;

  p1rating: Rating;
  p2rating: Rating;

  log: string[];
  inputLog: string[];
}

export interface Battle {
  p1: Player;
  p2: Player;
  matchups: Array<[ID, ID, Outcome]>;
  turns: number;
  endType?: 'normal'|'forced'|'forfeit';
}

export interface Player {
  name: ID;
  rating: Rating;
  outcome?: 'win'|'loss';
  team: Team;
}

export interface Rating {
  r: number;
  rd: number;
  rpr: number;
  rprd: number;
}

export interface Team {
  pokemon: Pokemon[];
  tags: Set<ID>;
}

export interface Pokemon {
  species: ID;
  set: PokemonSet<ID>;
  turnsOut: number;
  KOs: number;
  tags: Set<ID>;
}

export const enum Outcome {
  POKE1_KOED = 0,
  POKE2_KOED = 1,
  DOUBLE_DOWN = 2,
  POKE1_SWITCHED_OUT = 3,
  POKE2_SWITCHED_OUT = 4,
  DOUBLE_SWITCH = 5,
  POKE1_FORCED_OUT = 6,
  POKE2_FORCED_OUT = 7,
  POKE1_UTURN_KOED = 8,
  POKE2_UTURN_KOED = 9,
  POKE1_FODDERED = 10,
  POKE2_FODDERED = 11,
  UNKNOWN = 12
}

export const Parser = new class {
  parse(raw: Log) {
    /*
    // https://github.com/Zarel/Pokemon-Showdown/commit/92a4f85e0abe9d3a9febb0e6417a7710cabdc303
    if (raw as unknown === '"log"') throw new Error('Log = "log"');

    const spacelog = !(raw.log && raw.log[0].startsWith('| '));
    if (raw.turns === undefined) throw new Error('No turn count');

    const ts = []; // TODO: name
    const rating = {};

    // 0 for tie/unknown, 1 for p1 and 2 for p2
    let winner: 0|1|2 = 0;
    if (raw.log) {
      // TODO: scan log just once?
      const winners = raw.log.filter(line => line.startsWith('|win|'));
      if (winners.includes(`|win|${raw.p1}`)) winner = 1;
      if (winners.includes(`|win|${raw.p2}`)) {
        if (winner === 1) throw new Error('Battle had two winners');
        winner = 2;
      }
    }

    if (!ratings) {
      for (const sideid of [1, 2]) {
        const logRating = sideid === 1 ? raw.p1rating : raw.p2rating;
        if (!logRating) continue;
        const r = rating[`p${sideid}team`] = {};
        // TODO: logRating is dict?
        for (const k of ['r', 'rd', 'rpr', 'rprd']) {
          const n = Number(logRating[k]);
          if (!isNaN(n)) r[k] = n;
        }
      }
    } else {
      for (const player of [raw.p1, raw.p2]) {
        ratings[player] = ratings[player] || Glicko.newPlayer();
      }
      Glicko.update(ratings[raw.p1], ratings[raw.p2], winner);
      for (const player of [[raw.p1, 'p1team'], [raw.p2, 'p2team']]) {
        const provisional = Glicko.provisional(ratings[player[0]]);
        const r = ratings[player[0]].R
        const rd = ratings[player[0]].RD
        const rpr = provisional.R
        const rprd = provisional.RD
        rating[player[1]] = {r, rd, rpr, rprd};
      }
    }

    const teams = [];
    for (const team of [raw.p1team, raw.p2team]) {
      teams.push(this.canonicalizeTeam(team));
    }

    for (const team of ['p1team', 'p2team']) {
      const trainer = raw[team.slice(0, 2)];
      for (const pokemon in teams[team]) {
        ts.push([trainer, pokemon.species]);
      }

      while (log[team].length < 6) {
        ts.push([trainer, 'empty']);
      }


      teams[team].push(analyzeTeam(teams[team])); */



    // return Battle;
  }

  canonicalizeTeam(team: Array<PokemonSet<string>>, format?: string|Data): Array<PokemonSet<ID>> {
    const data = Data.forFormat(format);
    const mray = isMegaRayquazaAllowed(data);
    for (const pokemon of team) {
      const item = pokemon.item && data.getItem(pokemon.item);
      pokemon.item = item ? item.id : 'nothing';
      pokemon.happiness = pokemon.happiness === undefined ? 255 : pokemon.happiness;
      const nature = data.getNature(pokemon.nature);
      pokemon.nature = nature ? nature.id : 'hardy';

      const evs = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
      for (const [stat, ev] of Object.entries(pokemon.evs)) {
        evs[stat as Stat] = Number(ev);
      }
      const ivs = {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31};
      for (const [stat, iv] of Object.entries(pokemon.ivs)) {
        ivs[stat as Stat] = Number(iv);
      }
      pokemon.evs = evs;
      pokemon.ivs = ivs;
      for (let i = 0; i < 4; i++) {
        let move = toID(pokemon.moves[i]);
        if (move === 'hiddenpower') {
          move = (move +
                  toID(/* pokemon.hpType ? pokemon.hpType : */ hiddenPower(ivs, data.gen)!.type)) as
              ID;
        }
        pokemon.moves[i] = move;
      }

      pokemon.level = pokemon.forcedLevel || pokemon.level || 100;
      const ability = pokemon.ability && data.getAbility(pokemon.ability);
      pokemon.ability = ability ? ability.id : 'unknown';
      pokemon.species = getSpecies(pokemon.species || pokemon.name, data).id;
      if (mray && pokemon.species === 'rayquaza' && pokemon.moves.includes('dragonascent')) {
        pokemon.species = 'rayquazamega';
        pokemon.ability = 'deltastream';
      } else if (pokemon.species === 'greninja' && pokemon.ability === 'battlebond') {
        pokemon.species = 'greninjaash';
      } else {
        const mega = getMegaEvolution(pokemon, data);
        if (mega) {
          pokemon.species = mega.species;
          pokemon.ability = mega.ability;
        }
      }
      pokemon.pokeball = toID(pokemon.pokeball);
    }
    return team as Array<PokemonSet<ID>>;
  }
};
