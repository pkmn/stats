import * as crypto from 'crypto';
import { Data, ID, toID, PokemonSet } from 'ps';

export interface Log {
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

  p1team: Array<PokemonSet<string>>;
  p2team: Array<PokemonSet<string>>;

  p1rating: Rating | null;
  p2rating: Rating | null;

  log: string[];
  inputLog: string[];
}

export interface AnonymizedLog {
  // Unchanged
  id: string;
  format: string;
  endType?: 'normal' | 'forced' | 'forfeit';
  turns: number;
  score: [number, number];
  p1rating: Rating | null;
  p2rating: Rating | null;

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

export const Anonymizer = new (class {
  anonymize(raw: Log, format?: string | Data, salt?: string, index = 0): AnonymizedLog {
    const p1 = salt ? hash(raw.p1, salt) : 'Player 1';
    const p2 = salt ? hash(raw.p2, salt) : 'Player 2';
    const winner = raw.winner === raw.p1 ? p1 : raw.winner === raw.p2 ? p2 : '';

    const playerMap = new Map<ID, string>();
    playerMap.set(toID(raw.p1), p1);
    playerMap.set(toID(raw.p2), p2);

    // Rating may actually contain more fields, we make sure to only copy over the ones we expose
    const p1rating = raw.p1rating ? { rpr: raw.p1rating.rpr, rprd: raw.p1rating.rprd } : null;
    const p2rating = raw.p2rating ? { rpr: raw.p2rating.rpr, rprd: raw.p2rating.rprd } : null;

    const pokemonMap = new Map<string, string>();
    return {
      id: raw.id,
      format: raw.format,
      endType: raw.endType,
      turns: raw.turns,
      score: raw.score,
      p1rating,
      p2rating,
      timestamp: index,
      p1team: this.anonymizeTeam(raw.p1team, format, pokemonMap, 'p1: ', salt),
      p2team: this.anonymizeTeam(raw.p2team, format, pokemonMap, 'p2: ', salt),
      p1,
      p2,
      winner,
      log: anonymizeLog(raw.log, playerMap, pokemonMap),
    };
  }

  anonymizeTeam(
    team: Array<PokemonSet<string>>,
    format?: string | Data,
    nameMap = new Map<string, string>(),
    prefix = '',
    salt?: string
  ) {
    const data = Data.forFormat(format);
    // TODO: nameMap
    for (const pokemon of team) {
      const name = pokemon.name;
      pokemon.name = salt ? hash(pokemon.name, salt) : data.getSpecies(pokemon.species)!.species;
      nameMap.set(`${prefix}${name}`, pokemon.name);
    }
    return team;
  }
})();

function anonymizeLog(raw: string[], playerMap: Map<ID, string>, pokemonMap: Map<string, string>) {
  const log: string[] = [];
  for (const line of raw) {
    const anon = anonymize(line, playerMap, pokemonMap);
    if (anon) log.push(anon);
  }
  return log;
}

// FIXME |[from] EFFECT|[of] SOURCE
function anonymize(line: string, playerMap: Map<ID, string>, pokemonMap: Map<string, string>) {
  const index = line.indexOf('|', 1);
  const cmd = line.slice(1, index);

  switch (cmd) {
    case 'name': // |name|USER|OLDID
    case 'n':
    case 'N': {
      const [, user, oldID] = line.split('|');
      const existing = playerMap.get(oldID as ID);
      if (existing) playerMap.set(toID(user), existing);
      return undefined;
    }

    case ':': // |:|TIMESTAMP
    case 'c:': // |c:|TIMESTAMP|USER|MESSAGE
    case 'chat': // |chat|USER|MESSAGE
    case 'c':
    case 'join': // |join|USER
    case 'j':
    case 'J':
    case 'leave': // |leave|USER
    case 'l':
    case 'L':
    case 'raw': // |raw|HTML
    case 'html': // |html|HTML
    case 'uhtml': // |uhtml|NAME|HTML
    case 'uhtmlchange': // |uhtmlchange|NAME|HTML
    case 'warning': // |warning|MESSAGE
    case 'error': // |error|MESSAGE
    case 'bigerror': // |bigerror|MESSAGE
    case 'chatmsg': // |chatmsg|MESSAGE
    case 'chatmsg-raw': // |chatmsg-raw|MESSAGE
    case 'controlshtml': // |controlshtml|MESSAGE
    case 'fieldhtml': // |fieldhtml|MESSAGE
    case 'inactive': // |inactive|MESSAGE
    case 'inactiveoff': // |inactiveoff|MESSAGE
    case 'debug': // |debug|MESSAGE
    case 'message':
    case '-message': // |-message|MESSAGE
    case '-hint': // |-hint|MESSAGE
    case '-anim': {
      // |-anim|POKEMON|MOVE|TARGET
      return undefined;
    }

    case 'gametype': // |gametype|GAMETYPE
    case 'gen': // |gen|GENNUM
    case 'tier': // |tier|FORMATNAME
    case '': // |, aka done
    case 'rule': // |rule|RULE: DESCRIPTION
    case 'teamsize': // |teamsize|PLAYER|NUMBER
    case 'clearpoke': // |clearpoke
    case 'poke': // |poke|PLAYER|DETAILS|ITEM
    case 'teampreview': // |teampreview
    case 'start': // |start
    case 'rated': // |rated, |rated|MESSAGE
    case 'turn': // |turn|NUMBER
    case 'upkeep': // |upkeep
    case 'tie': // |tie
    case '-clearallboost': // |-clearallboost
    case '-weather': // |-weather|WEATHER
    case '-fieldstart': // |-fieldstart|CONDITION
    case '-fieldend': // |-fieldend|CONDITION
    case '-ohko': // |-ohko
    case '-center': // |-center
    case '-combine': // |-combine
    case '-nothing': // |-nothing (DEPRECATED)
    case '-sidestart': // |-sidestart|SIDE|CONDITION
    case '-sideend': // |-sideend|SIDE|CONDITION
    case '-fieldactivate': {
      // |-fieldactivate|MOVE
      return line;
    }

    case 'player': {
      // |player|PLAYER|USERNAME|AVATAR|RATING
      const [, player, username] = line.split('|');
      return [cmd, player, anonymizePlayer(username, playerMap), 1].join('|');
    }

    case 'win': {
      // |win|USER
      const [, user] = line.split('|');
      return [cmd, anonymizePlayer(user, playerMap)].join('|');
    }
    case 'move': {
      // |move|POKEMON|MOVE|TARGET (|[miss], |[still], |[anim])
      const [, pokemon, move, target] = line.split('|');
      return [cmd, anonymizePokemon(pokemon, pokemonMap), move /* FIXME */].join('|');
    }

    case '-crit': // |-crit|POKEMON
    case '-supereffective': // |-supereffective|POKEMON
    case '-resisted': // |-resisted|POKEMON
    case '-immune': // |-immune|POKEMON
    case '-invertboost': // |-invertboost|POKEMON
    case '-clearboost': // |-clearboost|POKEMON
    case '-clearnegativeboost': // |-clearnegativeboost|POKEMON
    case '-endability': // |-endability|POKEMON
    case '-cureteam': // |-cureteam|POKEMON
    case '-mustrecharge': // |-mustrecharge|POKEMON
    case '-primal': // |-primal|POKEMON
    case '-zpower': // |-zpower|POKEMON
    case '-zbroken': // |-zbroken|POKEMON
    case 'faint': // |faint|POKEMON
    case '-notarget': {
      // |-notarget|POKEMON
      const [, pokemon] = line.split('|');
      return [cmd, anonymizePokemon(pokemon, pokemonMap)].join('|');
    }

    case '-damage': // |-damage|POKEMON|HP STATUS
    case '-heal': // |-heal|POKEMON|HP STATUS
    case '-sethp': // |-sethp|POKEMON|HP
    case '-status': // |-status|POKEMON|STATUS
    case '-curestatus': // |-curestatus|POKEMON|STATUS
    case '-hitcount': // |-hitcount|POKEMON|NUM
    case '-singlemove': // |-singlemove|POKEMON|MOVE
    case '-singleturn': // |-singleturn|POKEMON|MOVE
    case '-transform': // |-transform|POKEMON|SPECIES
    case '-mega': // |-mega|POKEMON|MEGASTONE
    case '-start': // |-start|POKEMON|EFFECT
    case '-end': // |-end|POKEMON|EFFECT
    case '-item': // |-item|POKEMON|ITEM
    case '-enditem': // |-enditem|POKEMON|ITEM
    case '-ability': // |-ability|POKEMON|ABILITY
    case '-fail': // |-fail|POKEMON|ACTION
    case 'swap': {
      // |swap|POKEMON|POSITION
      const [, pokemon, arg] = line.split('|');
      return [cmd, anonymizePokemon(pokemon, pokemonMap), arg].join('|');
    }

    case '-boost': // |-boost|POKEMON|STAT|AMOUNT
    case '-unboost': // |-unboost|POKEMON|STAT|AMOUNT
    case '-setboost': // |-setboost|POKEMON|STAT|AMOUNT
    case 'detailschange': // |detailschange|POKEMON|DETAILS|HP STATUS
    case '-formechange': // |-formechange|POKEMON|DETAILS|HP STATUS
    case '-burst': // |-burst|POKEMON|SPECIES|ITEM
    case 'switch': // |switch|POKEMON|DETAILS|HP STATUS
    case 'drag': // |drag|POKEMON|DETAILS|HP STATUS
    case 'replace': {
      // |replace|POKEMON|DETAILS|HP STATUS
      const [, pokemon, arg1, arg2] = line.split('|');
      return [cmd, anonymizePokemon(pokemon, pokemonMap), arg1, arg2].join('|');
    }

    case '-miss': // |-miss|SOURCE, |-miss|SOURCE|TARGET
    case '-copyboost': // |-copyboost|SOURCE|TARGET
    case '-waiting': {
      // |-waiting|SOURCE|TARGET
      const [, source, target] = line.split('|');
      const anonSource = anonymizePokemon(source, pokemonMap);
      if (!target) return [cmd, anonSource].join('|');
      return [cmd, anonSource, anonymizePokemon(target, pokemonMap)].join('|');
    }
    case '-swapboost': {
      // |-swapboost|SOURCE|TARGET|STATS
      const [, source, target, stats] = line.split('|');
      if (!target) return [cmd, anonymizePokemon(source, pokemonMap)].join('|');
      return [
        cmd,
        anonymizePokemon(source, pokemonMap),
        anonymizePokemon(target, pokemonMap),
        stats,
      ].join('|');
    }

    // TODO
    case 'cant': // |cant|POKEMON|REASON, |cant|POKEMON|REASON|MOVE
    case '-clearpositiveboost': // |-clearpositiveboost|TARGET|POKEMON|EFFECT
    case '-activate': // |-activate|EFFECT
    case '-prepare': // |-prepare|ATTACKER|MOVE|DEFENDER

    default:
      throw new Error(`Unknown protocol message ${cmd}: '${line}'`);
  }
}

function anonymizePlayer(name: string, playerMap: Map<ID, string>) {
  const anon = playerMap.get(toID(name));
  if (anon) return anon;
  throw new Error(`Unknown player: ${name}`);
}

function anonymizePokemon(pokemon: string, pokemonMap: Map<string, string>) {
  const [position, name] = pokemon.split(': ');
  const qualified = position.startsWith('p1') ? `p1: ${name}` : `p2: ${name}`;
  const anon = pokemonMap.get(qualified);
  if (anon) return `${position}: ${anon}`;
  throw new Error(`Unknown Pokemon: ${pokemon}`);
}

function hash(s: string, salt: string) {
  return crypto
    .createHash('md5')
    .update(`${s}${salt}`)
    .digest('hex')
    .slice(0, 10);
}
