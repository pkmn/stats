import {ID, PokemonSet, Data, StatName, toID, hiddenPower} from 'ps';
import { getSpecies, isMegaRayquazaAllowed, getMegaEvolution } from './util';

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

  p1team: PokemonSet[];
  p2team: PokemonSet[];

  p1rating: {};
  p2rating: {};

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
  rpr: number;
  rprd: number;
}

export interface Team {
  pokemon: Pokemon[];
  tags: Set<ID>;
}

export interface Pokemon {
  species: ID;
  set: PokemonSet; // all ID
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
    // return Battle;
  }
};

function normalizeTeam(team: PokemonSet[], format?: string|Data) {
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
      evs[stat as StatName] = Number(ev);
    }
    const ivs = {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31};
    for (const [stat, iv] of Object.entries(pokemon.ivs)) {
      ivs[stat as StatName] = Number(iv);
    }
    pokemon.evs = evs;
    pokemon.ivs = ivs;
    for (let i = 0; i < 4; i++) {
     let move = toID(pokemon.moves[i]);
     if (move === 'hiddenpower') {
       move = (move + toID(hiddenPower(ivs, data.gen)!.type)) as ID;
     }
     pokemon.moves[i] = move;
    }
    // tslint:disable-next-line: no-any
    pokemon.level = (pokemon as any).forcedLevel || pokemon.level || 100;
    const ability = pokemon.ability && data.getAbility(pokemon.ability);
    pokemon.ability = ability ? ability.id : 'unknown';
    pokemon.species = getSpecies(pokemon.species || pokemon.name, data).id;
    if (mray && pokemon.species === 'rayquaza' && pokemon.moves.includes('dragonascent')) {
      pokemon.species = 'megarayquaza';
      pokemon.ability = 'deltastream';
    } else if (pokemon.species === 'greninja' && pokemon.ability === 'battlebond') {
      pokemon.species = 'ashgreninja';
    } else {
      const mega = getMegaEvolution(pokemon, data);
      if (mega) {
        pokemon.species = mega.species;
        pokemon.ability = mega.ability;
      }
    }
  }
  return team;
}