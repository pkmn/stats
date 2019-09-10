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

    const names = new Set<string>([raw.p1, raw.p2]);

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
      p1team: this.anonymizeTeam(raw.p1team, format, salt, pokemonMap, 'p1: ', names),
      p2team: this.anonymizeTeam(raw.p2team, format, salt, pokemonMap, 'p2: ', names),
      p1,
      p2,
      winner,
      log: anonymizeLog(raw.log, playerMap, pokemonMap, names),
    };
  }

  anonymizeTeam(
    team: Array<PokemonSet<string>>, // NOTE: mutated!
    format?: string | Data,
    salt?: string,
    nameMap = new Map<string, string>(),
    prefix = '',
    names?: Set<string>
  ) {
    const data = Data.forFormat(format);
    for (const pokemon of team) {
      const name = pokemon.name;
      if (salt) {
        pokemon.name = hash(pokemon.name, salt);
      } else {
        const species = data.getSpecies(pokemon.species)!;
        pokemon.name = species.baseSpecies || species.species;
      }
      nameMap.set(`${prefix}${name}`, pokemon.name);
      if (names && pokemon.name !== name) names.add(name);
    }
    return team;
  }
})();

function anonymizeLog(
  raw: string[],
  playerMap: Map<ID, string>,
  pokemonMap: Map<string, string>,
  names: Set<string>
) {
  // We want to make sure that after anonymizing, none of the original names have leaked out.
  // This can return false positives if someone use names or nicknames which are variants of
  // a Pokemon species name, but this is fairly niche and its better to have false positives
  // than negatives here.
  const namesAndIDs = Array.from(names).flatMap(n => [n, toID(n)]);
  const re = new RegExp(`\b(${namesAndIDs.join('|')})\b`);
  const log: string[] = [];
  for (const line of raw) {
    // console.log(`\x1b[90m${line}\x1b[0m`); // DEBUG
    const anon = anonymize(line, playerMap, pokemonMap);
    if (anon !== undefined) {
      // console.log(anon); // DEBUG
      if (re.test(line)) {
        const err = new Error(`Leaked name from {${Array.from(names)}} in log: '${line}'`);
        // console.error(err);
        throw err;
      }
      log.push(anon);
    }
  }
  return log;
}

function anonymize(line: string, playerMap: Map<ID, string>, pokemonMap: Map<string, string>) {
  if (line === '') return line;
  const split = line.split('|'); // This is OK because elide messages with '|' anyway
  const cmd = split[1];
  if (!cmd) return line === '|' ? line : undefined; // '||MESSAGE' or 'MESSAGE' is not safe to display
  switch (cmd) {
    case 'name': // |name|USER|OLDID
    case 'n':
    case 'N': {
      const existing = playerMap.get(split[3] as ID);
      if (existing) playerMap.set(toID(split[2]), existing);
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
    case 'seed': // |seed|SEED
    case 'message':
    case '-message': // |-message|MESSAGE
    case '-hint': // |-hint|MESSAGE
    case '-anim': /* |-anim|POKEMON|MOVE|TARGET */ {
      return undefined;
    }

    case 'gametype': // |gametype|GAMETYPE
    case 'gen': // |gen|GENNUM
    case 'tier': // |tier|FORMATNAME
    case 'rule': // |rule|RULE: DESCRIPTION
    case 'teamsize': // |teamsize|PLAYER|NUMBER
    case 'clearpoke': // |clearpoke
    case 'poke': // |poke|PLAYER|DETAILS|ITEM
    case 'teampreview': // |teampreview
    case 'start': // |start
    case 'rated': // |rated, |rated|MESSAGE
    case 'turn': // |turn|NUMBER
    case 'upkeep': // |upkeep
    case 'tie': /* |tie */ {
      return line;
    }

    case '-clearallboost': // |-clearallboost
    case '-weather': // |-weather|WEATHER ([from] EFFECT, [of] POKEMON, [upkeep])
    case '-fieldstart': // |-fieldstart|CONDITION
    case '-fieldend': // |-fieldend|CONDITION ([of] POKEMON)
    case '-ohko': // |-ohko
    case '-center': // |-center
    case '-combine': // |-combine
    case '-nothing': // |-nothing (DEPRECATED)
    case '-activate': // |-activate|EFFECT ([from] EFFECT, [of] POKEMON, [consumed], [damage], [block] MOVE, [broken])
    case '-fieldactivate': /* |-fieldactivate|MOVE */ {
      return anonymizeOf(split, pokemonMap).join('|');
    }

    case 'player': /* |player|PLAYER|, |player|PLAYER|USERNAME|AVATAR|RATING */ {
      if (!split[3]) return line;
      split[3] = anonymizePlayer(split[3], playerMap);
      split[4] = '1';
      split[5] = '';
      return split.join('|');
    }

    case '-sidestart': // |-sidestart|SIDE|CONDITION
    case '-sideend': /* |-sideend|SIDE|CONDITION ([from] EFFECT, [of] POKEMON) */ {
      split[2] = `${split[2].slice(0, 4)}${anonymizePlayer(split[2].slice(4), playerMap)}`;
      return anonymizeOf(split, pokemonMap).join('|');
    }

    case 'win': /* |win|USER */ {
      split[2] = anonymizePlayer(split[2], playerMap);
      return split.join('|');
    }

    case '-prepare': // |-prepare|ATTACKER|MOVE|DEFENDER
    case 'move': /* |move|POKEMON|MOVE|TARGET */ {
      split[2] = anonymizePokemon(split[2], pokemonMap);
      split[4] = anonymizePokemon(split[4], pokemonMap);
      return split.join('|');
    }

    case '-crit': // |-crit|POKEMON
    case '-supereffective': // |-supereffective|POKEMON
    case '-resisted': // |-resisted|POKEMON
    case '-immune': // |-immune|POKEMON ([from] EFFECT, [ohko])
    case '-invertboost': // |-invertboost|POKEMON ([from] EFFECT)
    case '-clearboost': // |-clearboost|POKEMON
    case '-clearnegativeboost': // |-clearnegativeboost|POKEMON ([silent], [zeffect])
    case '-endability': // |-endability|POKEMON ([from] EFFECT)
    case '-cureteam': // |-cureteam|POKEMON ([from] EFFECT)
    case '-mustrecharge': // |-mustrecharge|POKEMON
    case '-primal': // |-primal|POKEMON
    case '-zpower': // |-zpower|POKEMON
    case '-zbroken': // |-zbroken|POKEMON
    case 'faint': // |faint|POKEMON
    case '-notarget': // |-notarget, |-notarget|POKEMON TODO FIXME
    case '-damage': // |-damage|POKEMON|HP STATUS ([from] EFFECT, [of] POKEMON, [partiallytrapped], [silent])
    case '-heal': // |-heal|POKEMON|HP STATUS ([from] EFFECT, [of] POKEMON, [zeffect], [wisher] POKEMON, [silent])
    case '-sethp': // |-sethp|POKEMON|HP ([from] EFFECT, [silent])
    case '-status': // |-status|POKEMON|STATUS ([from] EFFECT, [of] POKEMON, [silent])
    case '-curestatus': // |-curestatus|POKEMON|STATUS ([from] EFFECT, [silent], [msg])
    case '-hitcount': // |-hitcount|POKEMON|NUM
    case '-singlemove': // |-singlemove|POKEMON|MOVE
    case '-singleturn': // |-singleturn|POKEMON|MOVE ([of] POKEMON, [zeffect])
    case '-transform': // |-transform|POKEMON|SPECIES ([from] EFFECT)
    case '-mega': // |-mega|POKEMON|MEGASTONE
    case '-start': // |-start|POKEMON|EFFECT ([from] EFFECT, [of] POKEMON, [silent], [upkeep], [fatigue], [zeffect])
    case '-end': // |-end|POKEMON|EFFECT ([from] EFFECT, [of] POKEMON, [partiallytrapped], [silent], [interrupt])
    case '-item': // |-item|POKEMON|ITEM ([from] EFFECT, [of] POKEMON, [identify])
    case '-enditem': // |-enditem|POKEMON|ITEM ([from] EFFECT, [of] POKEMON, [move] MOVE, [silent], [weaken])
    case '-ability': // |-ability|POKEMON|ABILITY ([from] EFFECT, [of] POKEMON, [fail], [silent])
    case '-fail': // |-fail|POKEMON|ACTION ([from] EFFECT, [of]: POKEMON, [forme], [heavy], [weak], [msg])
    case 'cant': // |cant|POKEMON|REASON, |cant|POKEMON|REASON|MOVE ([of] POKEMON)
    case 'swap': // |swap|POKEMON|POSITION
    case '-boost': // |-boost|POKEMON|STAT|AMOUNT ([from] EFFECT, [silent], [zeffect])
    case '-unboost': // |-unboost|POKEMON|STAT|AMOUNT ([from] EFFECT, [silent], [zeffect])
    case '-setboost': // |-setboost|POKEMON|STAT|AMOUNT ([from] EFFECT)
    case 'detailschange': // |detailschange|POKEMON|DETAILS|HP STATUS
    case '-formechange': // |-formechange|POKEMON|DETAILS|HP STATUS ([from] EFFECT)
    case '-burst': // |-burst|POKEMON|SPECIES|ITEM
    case 'switch': // |switch|POKEMON|DETAILS|HP STATUS
    case 'drag': // |drag|POKEMON|DETAILS|HP STATUS
    case 'replace': /* |replace|POKEMON|DETAILS|HP STATUS */ {
      split[2] = anonymizePokemon(split[2], pokemonMap);
      return anonymizeOf(split, pokemonMap).join('|');
    }

    case '-miss': // |-miss|SOURCE, |-miss|SOURCE|TARGET
    case '-waiting': // |-waiting|SOURCE|TARGET
    case '-copyboost': // |-copyboost|SOURCE|TARGET ([from] EFFECT)
    case '-clearpositiveboost': // |-clearpositiveboost|TARGET|POKEMON|EFFECT
    case '-swapboost': /* |-swapboost|SOURCE|TARGET|STATS ([from] EFFECT) */ {
      split[2] = anonymizePokemon(split[2], pokemonMap);
      if (split[3]) split[3] = anonymizePokemon(split[3], pokemonMap);
      return split.join('|');
    }

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

function anonymizeOf(split: string[], pokemonMap: Map<string, string>) {
  return split.map(s =>
    s.startsWith('[of] ') ? `[of] ${anonymizePokemon(s.slice(5), pokemonMap)}` : s
  );
}

function hash(s: string, salt: string) {
  return crypto
    .createHash('md5')
    .update(`${s}${salt}`)
    .digest('hex')
    .slice(0, 10);
}
