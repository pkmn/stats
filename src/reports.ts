import {PokemonUsage, UsageCounts, MetagameStatistics} from './stats';


export const Reporter = new class {
  usageReport(pokemon: PokemonUsage, total: UsageCounts, battles: number) {
    // StatCounter.py
    // Need 'turnsOut' to determine real %
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

    const tags =
        Object.entries(metagame.tags).sort((a, b) => b[1] - a[1]);  // TODO: verify
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
    const binSize = [10, 5, 2.5, 2, 1.5, 1, 0.5, 0.25, 0.2, 0.1, 0.05].find(
                        bs => size > bs) ||
        0.05;
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
      s += line + '#'.repeat(Math.floor((h[1] + blockSize / 2) / blockSize)) +
          '\n';
    }
    s += ` more negative = more offensive, more positive = more stall\n`;
    s += ` one # = ${(100.0 * blockSize / y).toFixed(2).padStart(5)}%`;
    return s;
  }

  leadsReport(leads: LeadUsage, battles: number) {
    // looks at matchups array and grabs first pair
  }

  risesAndDropsReport() {}
};
