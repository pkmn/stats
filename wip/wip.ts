const TODO: any = undefined; // TODO

const lines = lines.split('][');
for (let i = 0; i < raw.length; i++) {
  if (i > 0) raw[i] = '[' + raw[i];
  if (i < raw.length - 1) raw[i] = raw[i] + ']';
}

//species = keyLookup[filename[string.rfind(filename,'/')+1:]]
//for alias in aliases:
  //if species in aliases[alias]:
    //species = alias
    //break
const species = TODO; 

const bias = [];
const stalliness = [];
const abilities = {};
const items = {};
const happinesses = {};
const spreads = {};
const moves = {};
const weights = []
const gxes = {};

let rawCount = 0;
for (const line of line) {
  for (const moveset of JSON.parse(line)) {
    if (teamType && moveset.tags.include(teamType)) continue;
    rawCount++;
  	let weight = weighting(1500.0, 130.0, cutoff);
    if (moveset.rating) {
      if (moveset.rating.rpr !== undefined && moveset.rating.rprd !== undefined) {
        const gxe = Math.round(100 * victoryChance(moveset.rating.rpr, moveset.rating.rprd, 1500, 130));

        if (!(gxes[moveset.trainer] && gxes[moveset.trainer] > gxe)) {
          gxes[moveset.trainer] = gxe;
        }

        if (moveset.rating.rprd !== 0) {
          weight = weighting(moveset.rating.rpr, moveset.rating.rprd, cutoff);
          weights.push(weight):
        }
      }
    } else if (moveset.outcome) {
      if (moveset.outcome === 'win') {
        weight=weighting(1540.16061434, 122.858308077, cutoff);
      } else if (moveset.outcome === 'loss') {
        weight=weighting(1459.83938566, 122.858308077, cutoff);
      } // else it's a tie, and we use 1500
    }

    if (!lookup(moveset.ability)) moveset.ability = 'illuminate';
    abilities[moveset.ability] = (abilities[moveset.ability] || 0) + weight;

    if (!lookup(moveset.item)) moveset.item = 'nothing';
    items[moveset.item] = (items[moveset.item] || 0) + weight;

    if (['serious','docile','quirky','bashful'].include(moveset.nature) || !lookup(moveset.nature)) {
      let nature = 'hardy'; // FIXME: moveset.nature?
    }

    // Round the EVs
    for (const stat in moveset.evs) {
      const ev = moveset.evs[stat];
      if (species === 'shedinja' && stat === 'hp') {
        stat = 1;
        moveset.evs.stat = 0;
        continue;
      }
      if (stat = 'hp') {
        n = -1;
    }

    




  }
}

//// METAGAME

const metagame = {tags: {}, stalliness: []};

for (const player in ['p1', 'p2') {
  const p = battle[player];
  const w = weight[player];
  for (const tag in p.tags) {
    metagame.tags[tag] = (metagame.tags[tag] || 0) + w;
    metagame.stalliness.push([p.stalliness, w]);
  }
}

// ENCOUNTER MATRIX


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


// MOVESETS
const TABLE_WIDTH = 40;

function displayMovesetStatistics() {


let sep = ` +${'-'.repeat(TABLE_WIDTH)}+ `;
let s = sep;
s += ` | ${species.padEnd(TABLE_WIDTH)}| `;
s += sep;
s += ` | Raw count: ${stats['Raw count']}`.padEnd(TABLE_WIDTH + 2) + '| ';



  
