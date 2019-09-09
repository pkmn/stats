import * as crypto from 'crypto';
import { Data, PokemonSet } from 'ps';

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
  anonymize(raw: Log, format?: string | Data, salt?: string, index = 0) {
    const p1 = salt ? hash(raw.p1, salt) : 'Player 1';
    const p2 = salt ? hash(raw.p2, salt) : 'Player 2';
    const winner = raw.winner === raw.p1 ? p1 : raw.winner === raw.p2 ? p2 : '';
    // Rating may actually contain more fields, we make sure to only copy over the ones we expose
    const p1rating = raw.p1rating ? { rpr: raw.p1rating.rpr, rprd: raw.p1rating.rprd } : null;
    const p2rating = raw.p2rating ? { rpr: raw.p2rating.rpr, rprd: raw.p2rating.rprd } : null;
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

  anonymizeTeam(team: Array<PokemonSet<string>>, format?: string | Data, salt?: string) {
    const data = Data.forFormat(format);
    for (const pokemon of team) {
      pokemon.name = salt ? hash(pokemon.name, salt) : data.getSpecies(pokemon.species)!.species;
    }
    return team;
  }
})();

function hash(s: string, salt: string) {
  return crypto
    .createHash('md5')
    .update(`${s}${salt}`)
    .digest('hex')
    .slice(0, 10);
}

function anonymize(raw: string[], salt?: string) {
  const log: string[] = [];
  // TODO: whitelist based on line type and anonymize names/nicknames
  const args: string[] = ['foo'];
  switch (args[0]) {
    /* GENERAL */

    case ':': // |:|TIMESTAMP

    case 'c:': // |c:|TIMESTAMP|USER|MESSAGE
    case 'chat':
    case 'c': // |chat|USER|MESSAGE

    case 'join':
    case 'j':
    case 'J': // |join|USER
    case 'leave':
    case 'l':
    case 'L': // |leave|USER
    case 'name':
    case 'n':
    case 'N': // |name|USER|OLDID

    case 'raw': // |raw|HTML
    case 'html': // |html|HTML
    case 'uhtml': // |uhtml|NAME|HTML
    case 'uhtmlchange': // |uhtmlchange|NAME|HTML

    case 'warning': // |warning|MESSAGE
    case 'error': // |error|MESSAGE
    case 'bigerror': // |bigerror|MESSAGE

    // ???
    case 'chatmsg': // |chatmsg|MESSAGE
    case 'chatmsg-raw': // |chatmsg-raw|MESSAGE
    case 'controlshtml': // |controlshtml|MESSAGE
    case 'fieldhtml': // |fieldhtml|MESSAGE

    /* BATTLE (MAJOR) */

    case 'player': // |player|PLAYER|USERNAME|AVATAR|RATING
    case 'teamsize': // |teamsize|PLAYER|NUMBER
    case 'gametype': // |gametype|GAMETYPE
    case 'gen': // |gen|GENNUM
    case 'tier': // |tier|FORMATNAME
    case 'rated': // |rated, |rated|MESSAGE
    case 'rule': // |rule|RULE: DESCRIPTION
    case 'clearpoke': // |clearpoke
    case 'poke': // |poke|PLAYER|DETAILS|ITEM
    case 'teampreview': // |teampreview
    case '': // |, aka done
    case 'start': // |start

    case 'inactive': // |inactive|MESSAGE
    case 'inactiveoff': // |inactiveoff|MESSAGE

    case 'upkeep': // |upkeep
    case 'turn': // |turn|NUMBER

    case 'win': // |win|USER
    case 'tie': // |tie

    case 'move': // |move|POKEMON|MOVE|TARGET

    case 'switch': // |switch|POKEMON|DETAILS|HP STATUS
    case 'drag': // |drag|POKEMON|DETAILS|HP STATUS
    case 'replace': // |replace|POKEMON|DETAILS|HP STATUS

    case 'swap': // |swap|POKEMON|POSITION

    case 'detailschange': // |detailschange|POKEMON|DETAILS|HP STATUS
    case '-formechange': // |-formechange|POKEMON|DETAILS|HP STATUS

    case 'cant': // |cant|POKEMON|REASON, |cant|POKEMON|REASON|MOVE

    case 'faint': // |faint|POKEMON

    // Deprecated
    case 'callback':

    // Should not be present...
    case 'request': // |request|REQUEST

    // ???
    case 'debug': // |debug|MESSAGE
    case 'message':
    case '-message': // |-message|MESSAGE

    // Client (synthetic)
    // case 'switchout':
    // case 'prematureend': // replay end
    // case 'done': // '|'

    /* BATTLE (MINOR) */

    case '-fail': // |-fail|POKEMON|ACTION
    case '-notarget': // |-notarget|POKEMON
    case '-miss': // |-miss|SOURCE|TARGET
    case '-damage': // |-damage|POKEMON|HP STATUS

    case '-heal': // |-heal|POKEMON|HP STATUS
    case '-sethp': // |-sethp|POKEMON|HP

    case '-status': // |-status|POKEMON|STATUS
    case '-curestatus': // |-curestatus|POKEMON|STATUS
    case '-cureteam': // |-cureteam|POKEMON

    case '-boost': // |-boost|POKEMON|STAT|AMOUNT
    case '-unboost': // |-unboost|POKEMON|STAT|AMOUNT
    case '-setboost': // |-setboost|POKEMON|STAT|AMOUNT
    case '-swapboost': // |-swapboost|SOURCE|TARGET|STATS
    case '-invertboost': // |-invertboost|POKEMON
    case '-clearboost': // |-clearboost|POKEMON
    case '-clearallboost': // |-clearallboost
    case '-clearpositiveboost': // |-clearpositiveboost|TARGET|POKEMON|EFFECT
    case '-clearnegativeboost': // |-clearnegativeboost|POKEMON
    case '-copyboost': // |-copyboost|SOURCE|TARGET

    case '-weather': // |-weather|WEATHER

    case '-fieldstart': // |-fieldstart|CONDITION
    case '-fieldend': // |-fieldend|CONDITION

    case '-sidestart': // |-sidestart|SIDE|CONDITION
    case '-sideend': // |-sideend|SIDE|CONDITION

    case '-start': // |-start|POKEMON|EFFECT
    case '-end': // |-end|POKEMON|EFFECT

    case '-crit': // |-crit|POKEMON

    case '-supereffective': // |-supereffective|POKEMON
    case '-resisted': // |-resisted|POKEMON
    case '-immune': // |-immune|POKEMON

    case '-item': // |-item|POKEMON|ITEM
    case '-enditem': // |-enditem|POKEMON|ITEM

    case '-ability': // |-ability|POKEMON|ABILITY
    case '-endability': // |-endability|POKEMON

    case '-transform': // |-transform|POKEMON|SPECIES

    case '-mega': // |-mega|POKEMON|MEGASTONE
    case '-primal': // |-primal|POKEMON
    case '-burst': // |-burst|POKEMON|SPECIES|ITEM

    case '-zpower': // |-zpower|POKEMON
    case '-zbroken': // |-zbroken|POKEMON

    case '-activate': // |-activate|EFFECT

    case '-hint': // |-hint|MESSAGE

    case '-center': // |-center

    case '-combine': // |-combine
    case '-waiting': // |-waiting|SOURCE|TARGET
    case '-prepare': // |-prepare|ATTACKER|MOVE|DEFENDER
    case '-mustrecharge': // |-mustrecharge|POKEMON
    case '-nothing': // |-nothing (DEPRECATED)
    case '-hitcount': // |-hitcount|POKEMON|NUM
    case '-singlemove': // |-singlemove|POKEMON|MOVE
    case '-singleturn': // |-singleturn|POKEMON|MOVE

    // ???
    case '-fieldactivate': // |-fieldactivate|MOVE
    case '-anim': // |-anim|POKEMON|MOVE|TARGET
    case '-ohko': // |-ohko

    // Client (synthetic)
    // case '-block':

    default:
      return log;
  }
}
