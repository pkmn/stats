import * as crypto from 'crypto';
import {Data, PokemonSet} from 'ps';

export interface Log {
  id: string;
  format: string;
  timestamp: string;
  winner: string;
  endType?: 'normal'|'forced'|'forfeit';
  seed: [number, number, number, number];
  turns: number;
  score: [number, number];

  p1: string;
  p2: string;

  p1team: Array<PokemonSet<string>>;
  p2team: Array<PokemonSet<string>>;

  p1rating: Rating|null;
  p2rating: Rating|null;

  log: string[];
  inputLog: string[];
}

export interface AnonymizedLog {
  // Unchanged
  id: string;
  format: string;
  endType?: 'normal'|'forced'|'forfeit';
  turns: number;
  score: [number, number];
  p1rating: Rating|null;
  p2rating: Rating|null;

  // Changed to index
  timestamp: number;

  // Anonymized
  p1: string;
  p2: string;
  winner: string;

  p1team: Array<PokemonSet<string>>;
  p2team: Array<PokemonSet<string>>;

  log: string[];

  // Elided
  // inputLog: string[];
}

export interface Rating {
  rpr: number;
  rprd: number;
}

export const Anonymizer = new class {
  anonymize(raw: Log, format?: string|Data, salt?: string, index = 0) {
    const p1 = salt ? hash(raw.p1, salt) : 'Player 1';
    const p2 = salt ? hash(raw.p2, salt) : 'Player 2';
    const winner = raw.winner === raw.p1 ? p1 : raw.winner === raw.p2 ? p2 : '';
    // Rating may actually contain more fields, we make sure to only copy over the ones we expose
    const p1rating = raw.p1rating ? {rpr: raw.p1rating.rpr, rprd: raw.p1rating.rprd} : null;
    const p2rating = raw.p2rating ? {rpr: raw.p2rating.rpr, rprd: raw.p2rating.rprd} : null;
    return {
      id: raw.id,
      format: raw.format,
      endType: raw.endType,
      turns: raw.turns,
      score: raw.score,
      p1rating,
      p2rating,
      timestamp: index,
      p1team: this.anonymizeTeam(raw.p1team, format, salt),
      p2team: this.anonymizeTeam(raw.p2team, format, salt),
      p1,
      p2,
      winner,
    };
  }

  anonymizeTeam(team: Array<PokemonSet<string>>, format?: string|Data, salt?: string) {
    const data = Data.forFormat(format);
    for (const pokemon of team) {
      pokemon.name = salt ? hash(pokemon.name, salt) : data.getSpecies(pokemon.species)!.species;
    }
    return team;
  }
};

function hash(s: string, salt: string) {
  return crypto.createHash('md5').update(`${s}${salt}`).digest('hex').slice(0, 10);
}

function anonymize(raw: string[], salt?: string) {
  const log: string[] = [];
  // TODO: whitelist based on line type and anonymize names/nicknames
  return log;
}
