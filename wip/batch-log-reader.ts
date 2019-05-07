import {getSpecies, getBaseSpecies} from './common';

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

type Slot = 1|2|3|4|5|6;

//const teams = {
  //p1: new Array(6).fill('empty'),
  //p2: new Array(6).fill('empty'),
//};

export function parse(log: string[], teams: {p1: string, p2: string}) {
  // Index into teams - null until we figure out the lead
  const active: {p1: Slot|null, p2: Slot|null} = {p1: null, p2: null};

  // Turns out on the field (a measure of stall)
  const turnsOut = {
    p1: new Array(6).fill(0),
    p2: new Array(6).fill(0),
  };

  // Number of KOs in the battle
  const KOs = {
    p1: new Array(6).fill(0),
    p2: new Array(6).fill(0),
  };

  // (Pokemon, Pokemon, Outcome)
  const matchups: [string, string, Outcome][];

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
}

function cleanTier(tier: string) {
  if (tier.endsWith('current')) tier = tier.slice(0, -7);
  if (tier.startsWith('pokebank')) tier = tier.slice(8, -4);
  if (tier.startsWith('oras')) tier.slice(4);
  if (tier === 'capbeta') return 'cap';
  if (tier === 'vgc2014beta') return 'vgc2014';
  if (tier.startsWith('xybattlespot') && tier.endsWith('beta')) {
    tier = tier.slice(0, -4);
  }
  if (['battlespotdoubles', 'battlespotdoublesvgc2015'].includes(tier)) {
    return 'vgc2015';
  }
  if (tier === 'smogondoubles') return 'doublesou';
  if (tier === 'smogondoublesubers') return 'doublesubers';
  if (tier === 'smogondoublesuu') return 'doublesuu';
  return tier;
}
