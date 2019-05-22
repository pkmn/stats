import * as fs from 'fs';

import {ID, toID, Data} from 'ps';

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

const SKIP = new Set(['pichuspikyeared', 'unownb', 'unownc', 'unownd', 'unowne', 'unownf', 'unowng', 'unownh', 'unowni', 'unownj', 'unownk', 'unownl', 'unownm', 'unownn', 'unowno', 'unownp', 'unownq', 'unownr', 'unowns', 'unownt', 'unownu', 'unownv', 'unownw', 'unownx', 'unowny', 'unownz', 'unownem', 'unownqm', 'burmysandy', 'burmytrash', 'cherrimsunshine', 'shelloseast', 'gastrodoneast', 'deerlingsummer', 'deerlingautumn', 'deerlingwinter', 'sawsbucksummer', 'sawsbuckautumn', 'sawsbuckwinter', 'keldeoresolution', 'genesectdouse', 'genesectburn', 'genesectshock', 'genesectchill', 'basculinbluestriped', 'darmanitanzen','keldeoresolute','pikachucosplay']);

export function update(months: [string]|[string, string]|[string, string, string]) {
  const data = Data.forFormat();

  const pokemon: Map<ID, Usage<number>> = new Map();
  for (const [i, month] of months.entries()) {
    const weight = WEIGHTS[months.length - 1][i];
    for (const tier of USAGE_TIERS) {
      const baseline = tier === 'OU' ? 1695 : 1630;
      const n: {[suffix: string]: number} = {};
      const u: {[suffix: string]: Map<ID, number>} = {};
      let ntot = 0;
      for (const suffix of SUFFIXES) {
        const file = `${month}/Stats/gen7${toID(tier)}${suffix}-${baseline}.txt`;
        try {
          [u[suffix], n[suffix]] = parseUsageReport(fs.readFileSync(file, 'utf8'));
          ntot += n[suffix];
        } catch (err) {
          if (err.code === 'ENOENT') continue;
          throw err;
        }
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
    process.stdout.write(makeTable(sorted, tier, data));
  }

  const rise = [0.06696700846, 0.04515839608, 0.03406367107][months.length - 1];
  const drop = [0.01717940145, 0.02284003156, 0.03406367107][months.length - 1];

  const current: Map<ID, Tier> = new Map();
  const updated: Map<ID, Tier> = new Map();
  for (const name of Object.keys(data.Species)) {
    const species = data.getSpecies(name)!;
    if (SKIP.has(species.id) || species.isNonstandard || !species.tier || species.tier === 'Illegal' || species.tier === 'Unreleased') continue;
    // FIXME: Code which is either undesirable or unused
    // if (old[0] === '(') old = old.slice(1, -1);
    // if (species.tier === 'NFE' || species.tier === 'LC') NFE.push(species.id);
    const tier = TIERS.includes(species.tier as Tier) ? species.tier as Tier : 'PU';
    current.set(species.id, tier);

    if (tier === 'Uber') {
      updated.set(species.id, 'Uber');
      continue;
    }
    const update = pokemon.get(species.id);
    if (!update) {
      updated.set(species.id, tier);
      continue;
    }
    if (updated.has(species.id)) continue;
    if (update.OU > rise) {
      updated.set(species.id, 'OU');
      continue;
    }
    if (tier === 'OU') {
      if (update.OU < drop) {
        updated.set(species.id, 'UU');
      } else {
        updated.set(species.id, 'OU');
      }
      continue;
    }
    if (tier === 'BL') {
      updated.set(species.id, 'BL');
      continue;
    }
    if (update.UU > rise) {
      updated.set(species.id, 'UU');
      continue;
    }
    if (tier === 'UU') {
      if (update.UU < drop) {
        updated.set(species.id, 'RU');
      } else {
        updated.set(species.id, 'UU');
      }
      continue;
    }
    if (tier === 'BL2') {
      updated.set(species.id, 'BL2');
      continue;
    }
    if (update.RU > rise) {
      updated.set(species.id, 'RU');
      continue;
    }
    if (tier === 'RU') {
      if (update.UU < drop) {
        updated.set(species.id, 'NU');
      } else {
        updated.set(species.id, 'RU');
      }
      continue;
    }
    if (tier === 'BL3') {
      updated.set(species.id, 'BL3');
      continue;
    }
    if (update.NU > rise) {
      updated.set(species.id, 'NU');
      continue;
    }
    if (tier === 'NU') {
      if (update.UU < drop) {
        updated.set(species.id, 'PU');
      } else {
        updated.set(species.id, 'NU');
      }
      continue;
    }
    if (tier === 'BL4') {
      updated.set(species.id, 'BL4');
      continue;
    }
    if (!updated.has(species.id)) updated.set(species.id, 'PU');
  }

  process.stdout.write('\n');
  for (const [id, tier] of current.entries()) {
    const update = updated.get(id)!;
    if (tier !== update) {
      const species = data.getSpecies(id)!;
      if (species.forme && (species.forme.startsWith('Mega') || species.forme.startsWith('Primal'))) {
        const base = toID(species.baseSpecies);
        // Skip if the base is already in a higher tier
        if (TIERS.indexOf(updated.get(base)!) < TIERS.indexOf(update)) continue; 
      }
      process.stdout.write(`${species.name} moved from ${tier} to ${update}\n`);
    }
  }
}

function makeTable(pokemon: Array<[ID, number]>, tier: UsageTier, data: Data) {
  let s = `[HIDE=${tier}][CODE]\n`;
  s += `Combined usage for ${tier}\n`;
  s += ' + ---- + ------------------ + ------- + \n';
  s += ' | Rank | Pokemon            | Percent | \n';
  s += ' + ---- + ------------------ + ------- + \n';
  for (const [i, pair] of pokemon.entries()) {
    const [id, usage] = pair;
    if (usage < 0.001) break;
    const rank = (i + 1).toFixed().padEnd(4);
    const poke = displaySpecies(id, data).padEnd(18);
    const percent = (100 * usage).toFixed(3).padStart(6);
    s += ` | ${rank} | ${poke} | ${percent}% |\n`;
  }
  s += ' + ---- + ------------------ + ------- + \n';
  s += '[/CODE][/HIDE]\n';
  return s;
}

function displaySpecies(name: string, data: Data) {
  const species = data.getSpecies(name)!.species;
  // FIXME: remove bad display of Nidoran-M / Nidoran-F
  return species.startsWith('Nidoran') ? species.replace('-', '') : species;
}

function parseUsageReport(report: string): [Map<ID, number>, number] {
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
