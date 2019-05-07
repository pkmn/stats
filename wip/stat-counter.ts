import {Outcome} from './batch-log-reader';

interface EncounterMatrix {
  [poke1: string]: {
    [poke2: string]: Outcome[];
  }
};

// lookup table for the outcomes if poke1 and poke2 were exchanged
// clang-format off
const INVERSE_OUTCOMES: Outcome[] = [
  POKE2_KOED, POKE1_KOED,
  DOUBLE_DOWN,
  POKE2_SWITCHED_OUT, POKE1_SWITCHED_OUT,
  DOUBLE_SWITCH,
  POKE2_FORCED_OUT, POKE1_FORCED_OUT,
  POKE2_UTURN_KOED, POKE1_UTURN_KOED,
  POKE2_FODDERED, POKE1_FODDERED,
  UNKNOWN,
];
// clang-format on


//function encounterMatrix(tier: string, cutoff = 1500, type?: string) {
//tier = tier.endsWith('suspecttest') ? t.slice(0, -11) : tier;

function updateEncounterMatrix(encounters: EncounterMatrix, matchups: [string, string][], weight: number)
  for (const [a, b, outcome] in matchups) {
    if (!encounters[a]) encounter[a] = {};
    if (!encounters[b]) encounter[b] = {};
    if (!encounters[a][b]) {
      encounters[a][b] = new Array(13).fill(0);
      encounters[b][a] = new Array(13).fill(0);
    }
    encounters[a][b][outcome] += weight;
    encounters[b][a][INVERSE_OUTCOMES[outcome]] += weight;
  }
}

// Only consider battles which are long enough
const tooShort = battle.turns && !NON_6V6_FORMATS.has(tier) &&
  (battle.turns < 2 || battle.turns < 3 && !NON_SINGLES_FORMATS.has(tier));

