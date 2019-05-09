import {Data, hiddenPower, ID, PokemonSet, Stat, toID} from 'ps';

import {Classifier} from './classifier';
import {getMegaEvolution, getSpecies, isMegaRayquazaAllowed, isNonSinglesFormat} from './util';

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

export interface Team {
  pokemon: Pokemon[];
  classification: {bias: number; stalliness: number; tags?: Set<ID>;};
}

export interface Pokemon {
  species: ID;
  set: PokemonSet<ID>;
  turnsOut: number;
  KOs: number;
}

export interface Rating {
  r: number;
  rd: number;
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

export const Parser = new class {
  parse(raw: Log, format? string|Data) {
    // https://github.com/Zarel/Pokemon-Showdown/commit/92a4f85e0abe9d3a9febb0e6417a7710cabdc303
    if (raw as unknown === '"log"') throw new Error('Log = "log"');

    const spacelog = !(raw.log && raw.log[0].startsWith('| '));
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

    const idents: {p1: string[], p2: string[]} = {p1: [], p2: []};
    const battle = ({matchups: [], turns: raw.turns, endType: raw.endType} as unknown) as Battle;
    for (const side of (['p1', 'p2'] as ('p1'|'p2')[])) {
      const team = this.canonicalizeTeam(raw[side === 'p1' ? 'p1team' : 'p2team']);

      const mons = [];
      for (let i = 0; i < 6; i++) {
        const pokemon = team[i];
        idents[side].push(`${side}: ${pokemon ? (pokemon.name || pokemon.species) : 'empty'}`);
        mons.push({
          species: pokemon ? pokemon.species : ('empty' as ID),
          set: pokemon || ({} as PokemonSet<ID>),
          turnsOut: 0,
          KOs: 0,
        });
      }

      const player: Player = {
        name: toID(raw[side]),
        rating: raw[side === 'p1' ? 'p1rating' : 'p2rating'],
        team: {
          pokemon: mons,
          classification: Classifier.classifyTeam(team),
        },
      };
      if (winner !== 'tie') player.outcome = winner === side ? 'win' : 'loss';
      battle[side] = player;
    }
    if (battle.p1 === battle.p2) throw new Error('Player battling themself.');
    if (!raw.log || isNonSinglesFormat(format)) return battle;

    // TODO
    let flags = {
      roar: false, uturn: false, fodder: false, hazard: false, uturnko: false,
      ko: [false, false], switch: [false, false],
    };
    let turnMatchups = [];

    for (const rawLine in log) {
      if (rawLine.length < 2 || !rawLine.startsWith('|')) continue;
      const line = rawLine.split('|').map(s => s.trim());
      if (line.length < 2) throw new Error(`Could not parse line '${rawLine}'`);

      switch (line[1]) {
        case 'turn':
          matchups = matchups.push(turnMatchups);
          flags = {
            roar: false, uturn: false, fodder: false, hazard: false, uturnko: false,
            ko: [false, false], switch: [false, false],
          };
          turnMatchups = [];
          turnsOut[active.p1]++;
          turnsOut[active.p2]++;
          break;
        case 'win':
        case 'tie':
          break;
        case 'move':
          break;
        case '-enditem':
          if (rawLine.lastIndexOf('Red Card') > -1) {
            roar = true;
          } else if (rawLine.lastIndexOf('Eject Button') > -1) {
            uturn = true;
          }
          break;
        case: 'faint':
          break;
        case 'replace':
          break;
        case 'switch':
        case 'drag': {
          if (line.length < 4) throw new Error(`Could not parse line '${rawLine}'`);
          const species = getSpecies(line[3].split(',')[0]);
          break;
        }
      }
    }
    // TODO

    return battle;
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
