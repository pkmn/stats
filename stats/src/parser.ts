import {Data, hiddenPower, ID, PokemonSet, Stat, toID} from 'ps';

import {Classifier} from './classifier';
import * as util from './util';

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

  p1rating: Rating|null;
  p2rating: Rating|null;

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
  rating?: Rating;
  outcome?: 'win'|'loss';
  team: Team;
}

export interface Team {
  pokemon: Pokemon[];
  classification: {bias: number; stalliness: number; tags: Set<ID>;};
}

export interface Pokemon {
  species: ID;
  set: PokemonSet<ID>;
  turnsOut: number;
  kos: number;
}

export interface Rating {
  rpr: number;
  rprd: number;
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

type Slot = 0|1|2|3|4|5;

const ROAR = new Set(['Roar', 'Whirlwind', 'Circle Throw', 'Dragon Tail']);
const UTURN = new Set(['U-Turn', 'U-turn', 'Volt Switch', 'Baton Pass']);

export const Parser = new class {
  parse(raw: Log, format: string|Data) {
    // https://github.com/Zarel/Pokemon-Showdown/commit/92a4f85e0abe9d3a9febb0e6417a7710cabdc303
    if (raw as unknown === '"log"') throw new Error('Log = "log"');

    if (raw.turns === undefined) throw new Error('No turn count');

    let winner: 'tie'|'p1'|'p2' = 'tie';
    if (raw.log) {
      const winners = raw.log.filter(line => line.startsWith('|win|'));
      if (winners.includes(`|win|${raw.p1}`)) winner = 'p1';
      if (winners.includes(`|win|${raw.p2}`)) {
        if (winner === 'p1') throw new Error('Battle had two winners');
        winner = 'p2';
      }
    }
    if (raw.p1 === raw.p2) throw new Error('Player battling themself');

    const idents: {p1: string[], p2: string[]} = {p1: [], p2: []};
    const battle = ({matchups: [], turns: raw.turns, endType: raw.endType} as unknown) as Battle;
    if (typeof format === 'string') format = util.canonicalizeFormat(toID(format));
    for (const side of (['p1', 'p2'] as Array<'p1'|'p2'>)) {
      const team = this.canonicalizeTeam(raw[side === 'p1' ? 'p1team' : 'p2team'], format);

      const mons = [];
      for (let i = 0; i < 6; i++) {
        const pokemon = team[i];
        idents[side].push(pokemon ? (pokemon.name || pokemon.species) : 'empty');
        mons.push({
          species: pokemon ? pokemon.species : ('empty' as ID),
          set: pokemon || ({} as PokemonSet<ID>),
          turnsOut: 0,
          kos: 0,
        });
      }

      const player: Player = {
        name: toID(raw[side]),
        rating: raw[side === 'p1' ? 'p1rating' : 'p2rating'] || undefined,
        team: {
          pokemon: mons,
          classification: Classifier.classifyTeam(team, format),
        },
      };
      if (winner !== 'tie') player.outcome = winner === side ? 'win' : 'loss';
      battle[side] = player;
    }
    if (!raw.log || util.isNonSinglesFormat(format)) return battle;

    const active: {p1?: Slot, p2?: Slot} = {};
    let flags = {
      roar: false,
      uturn: false,
      fodder: false,
      hazard: false,
      uturnko: false,
      ko: {p1: false, p2: false},
      switch: {p1: false, p2: false},
    };
    let turnMatchups: Array<[ID, ID, Outcome]> = [];

    for (const rawLine of raw.log) {
      if (rawLine.length < 2 || !rawLine.startsWith('|')) continue;
      const line = rawLine.split('|').map(s => s.trim());

      switch (line[1]) {
        case 'turn':
          battle.matchups.push(...turnMatchups);
          flags = {
            roar: false,
            uturn: false,
            fodder: false,
            hazard: false,
            uturnko: false,
            ko: {p1: false, p2: false},
            switch: {p1: false, p2: false},
          };
          turnMatchups = [];
          battle.p1.team.pokemon[active.p1!].turnsOut++;
          battle.p2.team.pokemon[active.p2!].turnsOut++;
          break;
        case 'win':
        case 'tie': {
          if (flags.ko.p1 || flags.ko.p2) {
            // Close out the last matchup
            const poke1 = battle.p1.team.pokemon[active.p1!];
            const poke2 = battle.p2.team.pokemon[active.p2!];
            const matchup: [ID, ID, Outcome] = [poke1.species, poke2.species, Outcome.UNKNOWN];
            if (flags.ko.p2 && flags.ko.p2) {
              poke1.kos++;
              poke2.kos++;
              matchup[2] = Outcome.DOUBLE_DOWN;
            } else {
              (flags.ko.p1 ? poke1 : poke2).kos++;
              if (flags.uturnko) {
                turnMatchups.pop();
                matchup[2] = flags.ko.p1 ? Outcome.POKE1_UTURN_KOED : Outcome.POKE2_UTURN_KOED;
              } else {
                matchup[2] = flags.ko.p1 ? Outcome.POKE1_KOED : Outcome.POKE2_KOED;
              }
            }
            turnMatchups.push(matchup);
          }
          battle.matchups.push(...turnMatchups);
          break;
        }
        case 'move':
          if (line.length < 4) throw new Error(`Could not parse line: '${rawLine}'`);
          flags.hazard = false;
          const move = line[3];
          if (ROAR.has(move)) {
            flags.roar = true;
          } else if (UTURN.has(move)) {
            flags.uturn = true;
          }
          break;
        case '-enditem':
          if (rawLine.lastIndexOf('Red Card') > -1) {
            flags.roar = true;
          } else if (rawLine.lastIndexOf('Eject Button') > -1) {
            flags.uturn = true;
          }
          break;
        case 'faint': {
          const side = line[2].startsWith('p1') ? 'p1' : 'p2';
          flags.ko[side] = true;
          if (flags.switch[side] === true) flags.fodder = true;
          if (flags.uturn) {
            flags.uturn = false;
            flags.uturnko = true;
          }
          break;
        }
        case 'replace':
        case 'switch':
        case 'drag': {
          if (line.length < 4) throw new Error(`Could not parse line: '${rawLine}'`);
          const name = line[3].split(',')[0];
          const side = line[2].startsWith('p1') ? 'p1' : 'p2';
          if (line[0] === 'replace' || active.p1 !== undefined && active.p2 !== undefined) {
            flags.switch[side] = true;
            if (flags.switch.p1 && flags.switch.p2 && !flags.fodder) {
              // need to review previous matchup
              const matchup = turnMatchups[turnMatchups.length - 1];
              const p = flags.ko.p1 ? 'p1' : 'p2';
              if (!flags.ko.p1 && !flags.ko.p2) {
                matchup[2] = Outcome.DOUBLE_SWITCH;
              } else if (flags.ko.p1 && flags.ko.p2) {
                // FIXME: Shouldn't both pokemon be incremented in a double down?
                battle[p].team.pokemon[active[p]!].kos++;
                matchup[2] = Outcome.DOUBLE_DOWN;
              } else {
                // NOTE: includes hit-by-red-card-and-dies and roar-then-die-by-residual-damage
                battle[p].team.pokemon[active[p]!].kos++;
                matchup[2] = flags.ko.p1 ? Outcome.POKE1_UTURN_KOED : Outcome.POKE2_UTURN_KOED;
              }
            } else {
              // close out old matchup
              const poke1 = battle.p1.team.pokemon[active.p1!];
              const poke2 = battle.p2.team.pokemon[active.p2!];
              const matchup: [ID, ID, Outcome] = [poke1.species, poke2.species, Outcome.UNKNOWN];
              if (flags.ko.p1 || flags.ko.p2) {
                if (flags.fodder && flags.hazard) {
                  matchup[2] = flags.ko.p1 ? Outcome.POKE1_FODDERED : Outcome.POKE2_FODDERED;
                } else {
                  // if dies on switch-in due to an attack it's still considered 'KOed'
                  (flags.ko.p1 ? poke1 : poke2).kos++;
                  matchup[2] = flags.ko.p1 ? Outcome.POKE1_KOED : Outcome.POKE2_KOED;
                }
              } else {
                if (flags.roar) {
                  matchup[2] =
                      flags.switch.p1 ? Outcome.POKE1_FORCED_OUT : Outcome.POKE2_FORCED_OUT;
                } else {
                  matchup[2] =
                      flags.switch.p1 ? Outcome.POKE1_SWITCHED_OUT : Outcome.POKE2_SWITCHED_OUT;
                }
              }
              turnMatchups.push(matchup);
            }
            // new matchup!
            flags.uturn = flags.roar = flags.fodder = false;
            flags.hazard = true;
          }

          // FIXME: in the replace case we need to go back and fix the previously affected matchups!
          active[side] = identify(name, side, battle, idents, format);
          break;
        }
      }
    }

    return battle;
  }

  canonicalizeTeam(team: Array<PokemonSet<string>>, format: string|Data): Array<PokemonSet<ID>> {
    const data = Data.forFormat(format);
    const mray = util.isMegaRayquazaAllowed(data);
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
      pokemon.species = util.getSpecies(pokemon.species || pokemon.name, data).id;
      if (mray && pokemon.species === 'rayquaza' && pokemon.moves.includes('dragonascent')) {
        pokemon.species = 'rayquazamega';
        pokemon.ability = 'deltastream';
      } else if (pokemon.species === 'greninja' && pokemon.ability === 'battlebond') {
        pokemon.species = 'greninjaash';
      } else {
        const mega = util.getMegaEvolution(pokemon, data);
        if (mega) {
          pokemon.species = mega.species;
          pokemon.ability = mega.ability;
        }
      }
      pokemon.pokeball = toID(pokemon.pokeball);
    }
    return team as Array<PokemonSet<ID>>;
  }

  // TODO
  // serialize(battle: Battle) { }
  // deserialize(obj: util.AnyObject) { }
};

// FIXME: meloettapiroutte? darmanitanzen?
const FORMES =
    new Set(['greninjaash', 'zygardecomplete', 'mimikyubusted', 'shayminsky', 'necrozmaultra']);

function identify(
    name: string, side: 'p1'|'p2', battle: Battle, idents: {p1: string[], p2: string[]},
    format: string|Data) {
  const team = battle[side].team.pokemon;
  const names = idents[side];

  // Check if the name we've been given is the nickname
  if (name.startsWith(`${side}a: `) || name.startsWith(`${side}: `)) {
    name = name.substr(name.indexOf(' ') + 1);
    const found = [];
    for (const [i, n] of names.entries()) {
      // In the happy case we have an exact match
      if (n === name) return i as Slot;
      // Otherwise the nickname could have been truncated, track all matches
      if (name.startsWith(n)) found.push({index: i, name: n});
    }
    if (found.length) {
      // If we found names, we assume the longest match is correct
      let longest = found[0];
      for (let i = 1; i < found.length; i++) {
        if (found[i].name.length > longest.name.length) longest = found[i];
      }
      // We update our identity mappings for future searches
      names[longest.index] = longest.name;
      return longest.index as Slot;
    }
  } else {
    // Maybe its a pokemon name (or possibly an alias)?
    let species = util.getSpecies(name, format);
    let index = team.findIndex(p => p.species === species!.id);
    if (index !== -1) return index as Slot;

    // Try undoing a forme change to see if that solves things?
    if (util.isMega(species) || FORMES.has(species.id)) {
      species = util.getBaseSpecies(species.id, format);
      index = team.findIndex(p => p.species === species.id);
    }
    if (index !== -1) return index as Slot;

    // Maybe the pokemon hasn't changed forme yet?
    index = team.findIndex(p => util.getBaseSpecies(p.species, format).id === species!.id);
    if (index !== -1) return index as Slot;
  }

  const state = {
    p1: {team: battle.p1.team.pokemon.map(p => p.species), idents: idents.p1},
    p2: {team: battle.p2.team.pokemon.map(p => p.species), idents: idents.p2},
  };
  throw new Error(`Unable to locate ${side}'s '${name}' in ${JSON.stringify(state)}`);
}
