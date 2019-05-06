interface MovesetStatistics {
  'Raw count': number;
  'Viability Ceiling': number;
  'Abilities': abilities,
  'Items': items,
  'Spreads': spreads,
  'Moves': moves,
  'Happiness' : happinesses,
  'Teammates': teammates,
  'Checks and Counters': cc
};

const TABLE_WIDTH = 40;

function displayMovesetStatistics() {


let sep = ` +${'-'.repeat(TABLE_WIDTH)}+ `;
let s = sep;
s += ` | ${species.padEnd(TABLE_WIDTH)}| `;
s += sep;
s += ` | Raw count: ${stats['Raw count']}`.padEnd(TABLE_WIDTH + 2) + '| ';


