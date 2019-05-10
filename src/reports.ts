import {ID, toID} from 'ps';
import {MetagameStatistics, Usage} from './stats';

export const Reports = new class {
  usageReport(format: ID, pokemon: Usage, battles: number) {
    const sorted = Array.from(pokemon.usage.entries());
    // TODO: verify sort orders...
    if (['challengecup1v1', '1v1'].includes(format)) {
      sorted.sort((a, b) => b[1].real - a[1].real);
    } else {
      sorted.sort((a, b) => b[1].weighted - a[1].weighted);
    }

    let s = ` Total battles: ${battles}\n`;
    const avg = battles ? Math.round(pokemon.total.weighted / battles / 12) : 0;
    s += ` Avg. weight/team: ${avg}\n`;
    s += ` + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n`;
    s += ` | Rank | Pokemon            | Usage %   | Raw    | %       | Real   | %       | \n`;
    s += ` + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n`;

    const total = {
      weighted: Math.max(1.0, pokemon.total.weighted) * 6.0,
      raw: Math.max(1.0, pokemon.total.raw) * 6.0,
      real: Math.max(1.0, pokemon.total.real) * 6.0,
    };

    for (const [i, entry] of sorted.entries()) {
      const species = entry[0];
      const usage = entry[1];
      if (species === 'empty') continue;
      if (usage.raw === 0) break;

      const rank = (i + 1).toFixed().padEnd(4);
      const poke = species.padEnd(18);
      const use = (100 * usage.weighted / total.weighted).toFixed(5).padStart(8);
      const raw = usage.raw.toFixed().padEnd(6);
      const rawp = (100 * usage.raw / total.raw).toFixed(3).padStart(6);
      const real = usage.real.toFixed().padEnd(6);
      const realp = (100 * usage.real / total.real).toFixed(3).padStart(6);
      s += ` | ${rank} | ${poke} | ${use}% | ${raw} | ${rawp}% | ${real} | ${realp}% | \n`;
    }
    s += ` + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + \n`;
    return s;
  }

  leadsReport(leads: Usage, battles: number) {
    let s = ` Total leads: ${battles * 2}\n`;
    s += ' + ---- + ------------------ + --------- + ------ + ------- + \n';
    s += ' | Rank | Pokemon            | Usage %   | Raw    | %       | \n';
    s += ' + ---- + ------------------ + --------- + ------ + ------- + \n';

    const total = {raw: 0, weighted: 0};
    total.raw = Math.max(1.0, leads.total.raw);
    total.weighted = Math.max(1.0, leads.total.weighted);

    const sorted = Array.from(leads.usage.entries())
                       .sort((a, b) => b[1].weighted - a[1].weighted);  // TODO: verify
    for (const [i, entry] of sorted.entries()) {
      const species = entry[0];
      const usage = entry[1];
      if (species === 'empty') continue;
      if (usage.raw === 0) break;

      const rank = (i + 1).toFixed().padEnd(4);
      const poke = species.padEnd(18);
      const use = (100 * usage.weighted / total.weighted).toFixed(5).padStart(8);
      const raw = usage.raw.toFixed().padEnd(6);
      const pct = (100 * usage.raw / total.raw).toFixed(3).padStart(6);
      s += ` | ${rank} | ${poke} | ${use}% | ${raw} | ${pct}% | \n`;
    }

    s += ' + ---- + ------------------ + --------- + ------ + ------- + \n';
    return s;
  }

  movesetReport() {
    // batchMovesetCounter.py
    // 'Checks and Counters' = Encounter Matrix created in StatsCounter.py when
    // looking at matchups array
    //
  }
  detailedMovesetReport() {  // 'chaos'
    // Just JSON from above
  }

  metagameReport(metagame: MetagameStatistics, totalWeight: number) {
    const W = Math.max(1.0, totalWeight);

    const tags = Object.entries(metagame.tags).sort((a, b) => b[1] - a[1]);  // TODO: verify
    let s = '';
    for (const [tag, weight] of tags) {
      s += ` ${tag}`.padEnd(30, '.');
      s += `${(weight / W).toFixed(5).padStart(8)}%\n`;
    }
    s += '\n';

    if (!metagame.stalliness.length) return s;
    const stalliness = metagame.stalliness.sort((a, b) => a[0] - b[0]);  // TODO: verify

    // Figure out a good bin range by looking at .1% and 99.9% points
    const index = Math.floor(stalliness.length / 1000);
    const low = Math.max(stalliness[index][0], 0);
    const high = Math.min(stalliness[stalliness.length - index - 1][0], 0);

    // Rough guess at number of bins - possible the minimum?
    let nbins = 13;
    const size = (high - low) / (nbins - 1);
    // Try to find a prettier bin size, zooming into 0.05 at most.
    const binSize =
        [10, 5, 2.5, 2, 1.5, 1, 0.5, 0.25, 0.2, 0.1, 0.05].find(bs => size > bs) || 0.05;
    let histogram = [[0, 0]];
    for (let x = binSize; x + binSize / 2 < high; x += binSize) {
      histogram.push([x, 0]);
    }
    for (let x = -binSize; x - binSize / 2 > low; x -= binSize) {
      histogram.push([x, 0]);
    }
    histogram = histogram.sort((a, b) => a[0] - b[0]);
    nbins = histogram.length;

    const start = 0;
    // FIXME: Python comparison of an array and a number = break immediately.
    // for (; start < stalliness.length; start++) {
    //   if (stalliness[start] >= histogram[0][0] - binSize / 2) break;
    // }
    let j = 0;
    for (let i = start; i < stalliness.length; i++) {
      while (stalliness[i][0] > histogram[0][0] + binSize * (j * 0.5)) j++;
      if (j >= nbins) break;
      histogram[j][1] = histogram[j][1] + stalliness[i][1];
    }
    let max = 0;
    for (let i = 0; i < nbins; i++) {
      if (histogram[i][1] > max) max = histogram[i][1];
    }

    // Maximum number of blocks to go across
    const MAX_BLOCKS = 30;
    const blockSize = max / MAX_BLOCKS;

    if (blockSize <= 0) return s;

    let x = 0;
    let y = 0;
    for (const [val, weight] of stalliness) {
      x += val * weight;
      y += weight;
    }

    s += ` Stalliness (mean: ${(x / y).toFixed(3).padStart(6)})\n`;
    for (const h of histogram) {
      let line = '     |';
      if (h[0] % (2 * binSize) < Math.floor(binSize / 2)) {
        line = ' ';
        if (h[0] > 0) {
          line += '+';
        } else if (h[0] === 0) {
          line += ' ';
        }
        line += `${h[0].toFixed(1).padStart(3)}|`;
      }
      s += line + '#'.repeat(Math.floor((h[1] + blockSize / 2) / blockSize)) + '\n';
    }
    s += ` more negative = more offensive, more positive = more stall\n`;
    s += ` one # = ${(100.0 * blockSize / y).toFixed(2).padStart(5)}%`;
    return s;
  }

  risesAndDropsReport() {}
};

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

  return {usage, battles};
}
