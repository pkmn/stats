import {ID, PokemonSet} from 'ps';

export interface Log {
	id: string; // gen1randombattle-12345
	format: string; // gen1randombattle;
	timestamp: string; // Date.toString();
	winner: string; // Name
  endType?: 'normal' | 'forced' | 'forfeit';
	seed: [number, number, number, number];
	turns: number;
  score: [number, number];

	p1: string; // Name
	p2: string; // Name

	p1team: PokemonSet[];
	p2team: PokemonSet[];

	p1rating: {};
	p2rating: {};

	log: string[];
	inputLog: string[];
};

export interface Battle {
  p1: Player;
  p2: Player;
  matchups: Array<[ID, ID, Outcome]>; // [ID, ID, Outcome] ?
  turns: number;
  endType?: 'normal' | 'forced' | 'forfeit';
};

export interface Player {
  name: string; // ID?
  rating: number;
  outcome?: 'win' | 'loss';
  team: Team;
};

export interface Team {
  pokemon: Pokemon[];
  tags: ID[];
};

export interface Pokemon {
  species: string; // ID?
  turnsOut: number;
  KOs: number;
  tags: ID[];
};

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
};

export const Parser = new class {
  parse(raw: Log) {
    // return Battle;
  }
};
