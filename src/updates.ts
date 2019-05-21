import {ID, toID} from 'ps';

type Months = [string]|[string, string]|[string, string, string];
type UsageTier = 'OU'|'UU'|'RU'|'NU'|'PU';
type Tier = UsageTier|'Uber'|'BL'|'BL2'|'BL3'|'BL4';

const USAGE_TIERS: UsageTier[] = ['OU', 'UU', 'RU', 'NU', 'PU'];
const TIERS: Tier[] = ['Uber', 'OU', 'BL', 'UU', 'BL2', 'RU', 'BL3', 'NU', 'BL4', 'PU'];

const WEIGHTS = [[20, 3, 1], [20, 4], [24]];

type Usage<T> = {
  OU: T,
  UU: T,
  RU: T,
  NU: T,
  PU: T,
};

const SUFFIXES = ['', 'suspecttest', 'alpha', 'beta'];

function main(months: Months) {
  const rise = [0.06696700846, 0.04515839608, 0.03406367107][months.length - 1];
  const drop = [0.01717940145, 0.02284003156, 0.03406367107][months.length - 1];

  const pokemon: Map<ID, Usage<number>> = new Map();

  const remaining = 24;
  for (const [i, month] of months.entries()) {
    const weight = WEIGHTS[months.length - 1][i];
    for (const tier of USAGE_TIERS) {
      const baseline = tier === 'OU' ? 1695 : 1630;
      const n: {[suffix: string]: number} = {};
      const u: {[suffix: string]: Map<ID, number>} = {};
      const ntot = 0;
      for (const suffix of SUFFIXES) {
        const file = `${month}/Stats/gen7${toID(tier)}${suffix}-${baseline}.txt`;
        // TODO
        // u[suffix], n[suffix] = readTable(file);
        // ntot += n[suffix]
      }
      for (const suffix in u) {
        for (const [p, usage] of u[suffix].entries()) {
          let v = pokemon.get(p);
          if (!v) {
            v = {OU: 0, UU: 0, RU: 0, NU: 0, PU: 0};
            pokemon.set(p, v);
          }
          if (p !== 'empty') v[tier] += weight * n[suffix] / ntot * usage / 24;
        }
      }
    }
  }

  const tiers: Usage<Array<[ID, number]>> = {
    OU: [],
    UU: [],
    RU: [],
    NU: [],
    PU: [],
  };

  for (const [species, usage] of pokemon.entries()) {
    for (const tier of USAGE_TIERS) {
      if (usage[tier] > 0) tiers[tier].push([species, usage[tier]]);
    }
  }
  for (const tier of USAGE_TIERS) {
    const sorted = tiers[tier].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    process.stdout.write(makeTable(sorted, tier));
  }

  // TODO rises and drops
}

function makeTable(pokemon: Array<[ID, number]>, tier: UsageTier) {
  let s = `[HIDE=${tier}][CODE]\n`;
  s += `Combined usage for ${tier}\n`;
  s += ' + ---- + ------------------ + ------- + \n';
  s += ' | Rank | Pokemon            | Percent | \n';
  s += ' + ---- + ------------------ + ------- + \n';
  // TODO
  s += ' + ---- + ------------------ + ------- + \n';
  s += '[/CODE][/HIDE]\n';
  return s;
}

function parseUsageReport(report: string) {
  const usage: Map<ID, number> = new Map();
  const lines = report.split('\n');
  const battles = Number(lines[0].slice(16));

  for (let i = 5; i < lines.length; i++) {
    const line = lines[i].split('|');
    if (line.length < 3) break;
    const name = line[2].slice(1).trim();
    const pct = Number(line[3].slice(1, line[3].indexOf('%'))) / 100;
    usage.set(toID(name), pct);
  }

  return [usage, battles];
}
