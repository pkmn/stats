import * as crypto from 'crypto';

import {Generation, ID, PokemonSet, SpeciesName, toID} from '@pkmn/data';
import {Nickname, PokemonDetails, PokemonIdent, Protocol, Username} from '@pkmn/protocol';

export interface Log {
  roomid: string;
  id: string;
  format: string;
  timestamp: string;
  winner: string;
  endType?: 'normal' | 'forced' | 'forfeit';
  seed: [number, number, number, number];
  turns: number;
  score: [number, number];

  p1: string;
  p2: string;

  p1team: PokemonSet[];
  p2team: PokemonSet[];

  p1rating: Rating | null;
  p2rating: Rating | null;

  log: string[];
  inputLog: string[];
}

export interface AnonymizedLog {
  // Unchanged
  format: string;
  endType?: 'normal' | 'forced' | 'forfeit';
  turns: number;
  score: [number, number];

  // Simplified
  p1rating: Rating | null;
  p2rating: Rating | null;

  // Anonymized
  p1: string;
  p2: string;
  winner: string;

  p1team: PokemonSet[];
  p2team: PokemonSet[];

  log: string[];
  inputLog: string[];
}

export interface Rating {
  rpr: number;
  rprd: number;
}

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export const Anonymizer = new class {
  anonymize(
    gen: Generation,
    raw: Log,
    options?: {
      salt?: string;
      verifier?: Verifier;
      copy?: boolean;
    }
  ): AnonymizedLog {
    const p1 = (options?.salt ? hash(raw.p1, options.salt) : 'Player 1') as Username;
    const p2 = (options?.salt ? hash(raw.p2, options.salt) : 'Player 2') as Username;
    const winner = raw.winner === raw.p1 ? p1 : raw.winner === raw.p2 ? p2 : '';

    const playerMap = new Map<ID, Username>();
    playerMap.set(toID(raw.p1), p1);
    playerMap.set(toID(raw.p2), p2);

    options?.verifier?.names.add(raw.p1);
    options?.verifier?.names.add(raw.p2);

    // Rating may actually contain more fields, we make sure to only copy over the ones we expose
    const p1rating = raw.p1rating ? {rpr: raw.p1rating.rpr, rprd: raw.p1rating.rprd} : null;
    const p2rating = raw.p2rating ? {rpr: raw.p2rating.rpr, rprd: raw.p2rating.rprd} : null;

    const pokemonMap = new Map<PokemonIdent | Nickname, SpeciesName | string>();
    options = options || {};
    options.copy = options.copy ?? false;
    return {
      format: raw.format,
      endType: raw.endType,
      turns: raw.turns,
      score: raw.score,
      p1rating,
      p2rating,
      p1team: this.anonymizeTeam(gen, raw.p1team, {...options, prefix: 'p1: ', pokemonMap}),
      p2team: this.anonymizeTeam(gen, raw.p2team, {...options, prefix: 'p2: ', pokemonMap}),
      p1,
      p2,
      winner,
      log: anonymizeLog(raw.log, playerMap, pokemonMap, options?.verifier),
      inputLog: anonymizeInputLog(raw.inputLog, options?.verifier),
    };
  }

  anonymizeTeam(
    gen: Generation,
    team: PokemonSet[],
    options?: {
      pokemonMap?: Map<PokemonIdent | Nickname, SpeciesName | string>;
      salt?: string;
      prefix?: string;
      verifier?: Verifier;
      copy?: boolean;
    }
  ) {
    const anonymized = [];
    for (let pokemon of team) {
      pokemon = (options?.copy ?? true) ? copyPokemonSet(pokemon) : pokemon;
      const name = pokemon.name;
      if (options?.salt) {
        pokemon.name = hash(pokemon.name, options.salt);
      } else {
        const species = gen.species.get(pokemon.species)!;
        pokemon.name = species.baseSpecies || species.name;
      }
      options?.pokemonMap?.set(`${options?.prefix || ''}${name}` as PokemonIdent, pokemon.name);
      if (pokemon.name !== name) options?.verifier?.names.add(name);
      anonymized.push(pokemon);
    }
    return anonymized;
  }
};

function anonymizeInputLog(raw: string[], verifier?: Verifier) {
  const log: string[] = [];
  const re = /^>p\d /;
  for (const line of raw) {
    if (re.test(line)) {
      if (verifier) verifier.verify(line, line);
      log.push(line);
    }
  }
  return log;
}

function anonymizeLog(
  raw: string[],
  playerMap: Map<ID, Username>,
  pokemonMap: Map<PokemonIdent | Nickname, SpeciesName | string>,
  verifier?: Verifier
) {
  const log: string[] = [];
  for (const line of raw) {
    const anon = anonymize(line, playerMap, pokemonMap);
    if (anon !== undefined) {
      if (verifier) verifier.verify(line, anon);
      log.push(anon);
    }
  }
  return log;
}

const IDENT = /^p\d[a-d]: .*$/;

function anonymize(
  line: string,
  playerMap: Map<ID, Username>,
  pokemonMap: Map<PokemonIdent | Nickname, SpeciesName | string>
) {
  if (line === '') return line;
  if (!line.startsWith('|')) return undefined;
  const {args: roArgs, kwArgs: roKWArgs} = Protocol.parseBattleLine(line);
  const args = roArgs as Writeable<typeof roArgs>;
  const kwArgs = roKWArgs as Writeable<typeof roKWArgs>;

  const combine = (a: string[]) => {
    const buf = `|${a.join('|')}`;
    const kws: string[] = [];
    for (const k in kwArgs) {
      let v = kwArgs[k as keyof typeof kwArgs] as string;
      if (k === 'of') {
        v = anonymizePokemon(v as PokemonIdent, pokemonMap);
      } else if (k === 'spread') {
        // TODO: why do we anonymize this - [spread] is currently just hit slots, not idents?
        v = v.split(',').map((s: string | PokemonIdent) =>
          IDENT.test(s) ? anonymizePokemon(s as PokemonIdent, pokemonMap) : s).join(',');
      }
      kws.push(`[${k}] ${v}`);
    }
    return kws.length ? `${buf}|${kws.join('|')}` : buf;
  };

  // Legacy protocol message
  if (args[0] as string === '-nothing') return combine(args as string[]);

  switch (args[0]) {
  case 'name': {
    const existing = playerMap.get(args[2]);
    if (existing) playerMap.set(toID(args[1]), existing);
    return undefined;
  }

  case 't:':
  case ':':
  case 'c:':
  case 'chat':
  case 'join':
  case 'leave':
  case 'unlink':
  case 'raw':
  case 'html':
  case 'uhtml':
  case 'uhtmlchange':
  case 'warning':
  case 'error':
  case 'bigerror':
  case 'chatmsg':
  case 'chatmsg-raw':
  case 'controlshtml':
  case 'fieldhtml':
  case 'inactive':
  case 'inactiveoff':
  case 'debug':
  case 'seed':
  case 'message':
  case '-message':
  case '-hint': {
    return undefined;
  }

  case 'done':
  case 'gametype':
  case 'gen':
  case 'tier':
  case 'rule':
  case 'teamsize':
  case 'clearpoke':
  case 'teampreview':
  case 'start':
  case 'rated':
  case 'turn':
  case 'upkeep':
  case 'tie': {
    return line;
  }

  case 'poke': {
    args[2] = anonymizePokemonDetails(args[2]);
    return combine(args);
  }

  case '-clearallboost':
  case '-weather':
  case '-fieldstart':
  case '-fieldend':
  case '-ohko':
  case '-center':
  case '-combine':
  case '-fieldactivate': {
    return combine(args);
  }

  case '-activate': {
    if (args[1] && IDENT.test(args[1])) args[1] = anonymizePokemon(args[1], pokemonMap);
    return combine(args);
  }

  case 'player': {
    if (!args[2]) return line;
    args[2] = anonymizePlayer(args[2], playerMap);
    args[3] = '1' as Protocol.AvatarIdent;
    args[4] = '' as Protocol.Num;
    return combine(args);
  }

  case '-sidestart':
  case '-sideend': {
    args[1] = anonymizeSide(args[1], playerMap);
    return combine(args);
  }

  case 'win': {
    args[1] = anonymizePlayer(args[1], playerMap);
    return combine(args);
  }

  case '-anim':
  case '-prepare': {
    args[1] = anonymizePokemon(args[1], pokemonMap);
    if (args[3]) args[3] = anonymizePokemon(args[3], pokemonMap);
    return combine(args);
  }

  case 'move': {
    args[1] = anonymizePokemon(args[1], pokemonMap);
    if (args[3] && args[3] !== 'null' && IDENT.test(args[3])) {
      args[3] = anonymizePokemon(args[3], pokemonMap);
    }
    return combine(args);
  }

  case '-notarget': {
    if (args[1]) args[1] = anonymizePokemon(args[1], pokemonMap);
    return combine(args);
  }

  case '-crit':
  case '-supereffective':
  case '-resisted':
  case '-immune':
  case '-invertboost':
  case '-clearboost':
  case '-clearnegativeboost':
  case '-endability':
  case '-cureteam':
  case '-mustrecharge':
  case '-primal':
  case '-zpower':
  case '-zbroken':
  case 'faint':
  case '-damage':
  case '-status':
  case '-curestatus':
  case '-hitcount':
  case '-singlemove':
  case '-singleturn':
  case '-mega':
  case '-start':
  case '-end':
  case '-item':
  case '-enditem':
  case '-fail':
  case 'cant':
  case 'swap':
  case '-boost':
  case '-unboost':
  case '-setboost':
  case '-burst': {
    args[1] = anonymizePokemon(args[1], pokemonMap);
    return combine(args as string[]);
  }

  case 'detailschange':
  case '-formechange':
  case 'switch':
  case 'drag':
  case 'replace': {
    args[1] = anonymizePokemon(args[1], pokemonMap);
    args[2] = anonymizePokemonDetails(args[2]);
    return combine(args);
  }

  case '-block': {
    args[1] = anonymizePokemon(args[1], pokemonMap);
    if (args[4]) anonymizePokemon(args[4], pokemonMap);
    args[4] = args[4] || '';
    return combine(args);
  }

  case '-sethp': {
    // '|-sethp|TARGET|TARGET HP|SOURCE|SOURCE HP' before 7e4929a39f
    args[1] = anonymizePokemon(args[1], pokemonMap);
    if (args[3]) args[3] = anonymizePokemon(args[3], pokemonMap);
    return combine(args);
  }

  case '-ability': {
    args[1] = anonymizePokemon(args[1], pokemonMap);
    if (args[3] && IDENT.test(args[3])) {
      args[3] = anonymizePokemon(args[3] as PokemonIdent, pokemonMap);
    } else if (args[3]?.includes(':')) {
      args[3] = anonymizeSide(args[3] as Protocol.Side, playerMap);
    } else if (args[4]) {
      args[4] = anonymizePokemon(args[4], pokemonMap);
    }
    return combine(args);
  }

  case '-heal': {
    args[1] = anonymizePokemon(args[1], pokemonMap);
    if ('wisher' in kwArgs) {
      // Not the actual position, but we don't really care, we just need the side
      const position = args[1].split(': ')[0];
      const full = anonymizePokemon(
        `${position}: ${kwArgs.wisher as string}` as PokemonIdent, pokemonMap
      );
      kwArgs.wisher = full.split(': ')[1] as Nickname;
    }
    return combine(args);
  }

  case '-transform':
  case '-miss':
  case '-waiting':
  case '-copyboost':
  case '-clearpositiveboost':
  case '-swapboost': {
    args[1] = anonymizePokemon(args[1], pokemonMap);
    if (args[2]) args[2] = anonymizePokemon(args[2], pokemonMap);
    return combine(args);
  }

  default:
    throw new Error(`Unknown protocol message ${args[0]}: '${line}'`);
  }
}

function anonymizePlayer(name: string, playerMap: Map<ID, Username>) {
  const anon = playerMap.get(toID(name));
  if (anon) return anon;
  throw new Error(`Unknown player: ${name}`);
}

const EXCEPTIONS: {[species: string]: string} = {
  'Farfetch\'d': 'Farfetch’d',
  'Farfetch\'d-Galar': 'Farfetch’d-Galar',
  'Sirfetch\'d': 'Sirfetch’d',
};

// NOTE: details/species should not require anonymization but PS mishandles certain names
function anonymizePokemonDetails<D extends PokemonDetails | SpeciesName>(details: D) {
  const split = details.split(',');
  split[0] = EXCEPTIONS[split[0]] || split[0];
  return split.join(',') as D;
}

function anonymizePokemon(
  pokemon: PokemonIdent, pokemonMap: Map<PokemonIdent | Nickname, SpeciesName | string>
) {
  const {player, position, name} = Protocol.parsePokemonIdent(pokemon);
  const anon = pokemonMap.get(`${player}: ${name}` as PokemonIdent);
  if (anon) return `${player}${position || ''}: ${anon}` as PokemonIdent;
  throw new Error(`Unknown Pokemon: ${pokemon}`);
}

function anonymizeSide(side: Protocol.Side, playerMap: Map<ID, Username>) {
  return `${side.slice(0, 4)}${anonymizePlayer(side.slice(4), playerMap)}` as Protocol.Side;
}

function hash(s: string, salt: string) {
  return crypto
    .createHash('md5')
    .update(`${s}${salt}`)
    .digest('hex')
    .slice(0, 10);
}

function copyPokemonSet(pokemon: PokemonSet) {
  const copy: PokemonSet = {
    name: pokemon.name,
    species: pokemon.species,
    item: pokemon.item,
    ability: pokemon.ability,
    moves: pokemon.moves.slice(),
    nature: pokemon.nature,
    gender: pokemon.gender,
    evs: {...pokemon.evs},
    ivs: {...pokemon.ivs},
    level: pokemon.level,
  };
  if ((pokemon as any).forcedLevel !== undefined) {
    (copy as any).forcedLevel = (pokemon as any).forcedLevel;
  }
  if (pokemon.shiny !== undefined) copy.shiny = pokemon.shiny;
  if (pokemon.happiness !== undefined) copy.happiness = pokemon.happiness;
  if (pokemon.pokeball !== undefined) copy.pokeball = pokemon.pokeball;
  if (pokemon.hpType !== undefined) copy.hpType = pokemon.hpType;
  return copy;
}

// We want to make sure that after anonymizing, none of the original names have leaked out.
// This can return false positives if someone use names or nicknames which are variants of
// a Pokemon species name, but this is fairly niche and its better to have false positives
// than negatives here.
export class Verifier {
  readonly names: Set<string> = new Set();
  readonly leaks: Array<{ input: string; output: string }> = [];

  private regex: RegExp | undefined = undefined;

  verify(input: string, output: string) {
    if (!this.regex) {
      const namesAndIDs = Array.from(this.names).flatMap(n => {
        const safe = n.replace(/[\\.+*?()|[\]{}^$]/g, '\\$&');
        const id = toID(n);
        return id ? [safe, id] : [safe];
      });
      this.regex = new RegExp(`\\b(${namesAndIDs.join('|')})\\b`);
    }
    if (this.regex.test(output)) {
      this.leaks.push({input, output});
      return false;
    }
    return true;
  }

  ok() {
    return this.leaks.length === 0;
  }
}
