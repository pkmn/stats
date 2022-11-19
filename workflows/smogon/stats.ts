import * as path from 'path';
import stringify from 'json-stringify-pretty-compact';

import {Dex} from '@pkmn/dex';
import {Generation} from '@pkmn/data';
import {
  canonicalizeFormat, Parser, newGenerations, Stats, WeightedStatistics, Reports,
} from '@pkmn/stats';
import {
  Batch, Checkpoints, CombineWorker, fs, ID, toID,
  JSONCheckpoint, Options, register, WorkerConfiguration,
} from '@pkmn/logs';

interface Configuration extends WorkerConfiguration {
  formats?: Set<ID>;
  legacy?: boolean;
  all?: boolean;
}

interface ApplyState {
  gen: Generation;
  format: ID;
  stats: WeightedStatistics;
  cutoffs: number[];
}

interface CombineState {
  gen: Generation;
  stats: WeightedStatistics;
}

const GENS = newGenerations(Dex);
const forFormat = (format: ID) =>
  format.startsWith('gen') ? GENS.get(format.charAt(3)) : GENS.get(6);
const MONOTYPES = new Set(Array.from(GENS.get(9).types).map(type => `mono${type.id}` as ID));
const MONOTYPE = 'gen9monotype' as ID;
const SKIP = [
  'random', 'custom', 'petmod', 'factory', 'challengecup',
  'hackmonscup', 'digimon', 'crazyhouse', 'superstaff',
];

const POPULAR = {
  6: [
    'ou', 'oususpecttest', 'doublesou', 'randombattle',
    'smogondoubles', 'doublesou', 'doublesoususpecttest',
  ],
  7: [
    'gen7ou', 'gen7oususpecttest', 'gen7doublesou', 'gen7doublesoususpecttest',
    'gen7pokebankou', 'gen7pokebankoususpecttest', 'gen7pokebankdoublesou',
  ],
  8: ['gen8doublesou', 'gen8doublesoususpect', 'gen8ou', 'gen8oususpecttest'],
  9: ['gen9doublesou', 'gen9doublesoususpect', 'gen9ou', 'gen9oususpecttest'],
};

const CUTOFFS = {
  default: [0, 1500, 1630, 1760],
  popular: [0, 1500, 1695, 1825],
};

function cutoffsFor(format: ID, date: string) {
  // NOTE: Legacy format notation is signficant here: gen6ou was only 'popular' while it was still
  // called 'ou' and thus we don't really care about the date.
  if (POPULAR[6].includes(format)) return CUTOFFS.popular;
  // Gen 7 formats ceased to be 'popular' from 2020-02 onwards, though we need to check
  // gen7doublesou first as it had a weird discontinuity at the beginning of the format.
  if (format === 'gen7doublesou' && date < '2017-02') return CUTOFFS.default;
  if (POPULAR[7].includes(format)) return date > '2020-01' ? CUTOFFS.default : CUTOFFS.popular;
  // smogondoublessuspecttest only has two months of date, but 2015-04 had a higher weighting.
  if (format === 'smogondoublessuspecttest' && date === '2015-04') return CUTOFFS.popular;
  const popular = POPULAR[8].includes(format) || POPULAR[9].includes(format);
  return popular ? CUTOFFS.popular : CUTOFFS.default;
}

const StatsWorker = new class extends CombineWorker<Configuration, ApplyState, CombineState> {
  options = {
    formats: {
      alias: ['f', 'format'],
      desc: [
        '-f, --formats',
        'Only generate reports for the formats specified instead of all formats.',
      ],
      parse: (s: string) => new Set(s.split(',').map(toID)),
    },
    legacy: {
      alias: ['l'],
      desc: ['-l, --legacy', 'Generate legacy reports and use legacy compatibility mode.'],
      parse: Options.boolean,
    },
    all: {
      alias: ['a'],
      desc: ['-a, --all', 'Include all checks and counters in moveset reports (default: false).'],
      parse: Options.boolean,
    },
  };

  async init(config: Configuration) {
    if (config.dryRun) return;

    await fs.mkdir(config.output, {recursive: true});
    if (config.legacy) {
      if (!(config.formats && !config.formats.has(MONOTYPE))) {
        const monotype = path.resolve(config.output, 'monotype');
        await fs.mkdir(monotype);
        // we're just assuming here that maxFiles is > 10 for each worker ¯\_(ツ)_/¯
        await Promise.all([...mkdirs(config.output), ...mkdirs(monotype)]);
      }
    }
  }

  accept(config: Configuration) {
    return (format: ID) => {
      if ((config.formats && !config.formats.has(format)) ||
        format.startsWith('seasonal') || SKIP.some(f => format.includes(f))) {
        return false;
      } else if (format === MONOTYPE) {
        return [...MONOTYPES, ''];
      } else {
        return true;
      }
    };
  }

  async setupApply(batch: Batch) {
    const format = canonicalizeFormat(batch.format);
    return {
      gen: forFormat(format),
      format,
      stats: {},
      cutoffs: cutoffsFor(format, batch.day.slice(0, -3)),
    };
  }

  async processLog(log: string, state: ApplyState, shard?: string) {
    const raw = JSON.parse(await this.storage.logs.read(log));
    const battle = Parser.parse(state.gen, state.format, raw);
    Stats.updateWeighted(
      state.gen, state.format, battle, state.cutoffs, state.stats, this.config.legacy
    );
  }

  createCheckpoint(batch: Batch, state: ApplyState, shard?: string) {
    return Checkpoints.json(batch.format, batch.day, state.stats, shard);
  }

  async setupCombine(format: ID): Promise<CombineState> {
    return {
      gen: forFormat(canonicalizeFormat(format)),
      stats: {},
    };
  }

  async aggregateCheckpoint({format, day}: Batch, state: CombineState, shard?: string) {
    const checkpoint =
      await JSONCheckpoint.read<WeightedStatistics>(this.storage.checkpoints, format, day, shard);
    Stats.combineWeighted(state.stats, checkpoint.data);
  }

  async writeResults(format: ID, state: CombineState, shard?: string) {
    const reports = format === MONOTYPE && shard
      ? path.join(this.config.output, 'monotype')
      : this.config.output;
    const min = this.config.all ? [0, -Infinity] : [20, 0.5];

    const writes = [];
    for (const [c, stats] of Object.entries(state.stats)) {
      const cutoff = Number(c);
      const file = shard ? `${format}-${shard}-${cutoff}` : `${format}-${cutoff}`;
      if (this.config.legacy) {
        writes.push(this.limit(() => fs.writeFile(
          path.join(reports, `${file}.txt`),
          Reports.usageReport(state.gen, format, stats)
        )));
        writes.push(this.limit(() => fs.writeFile(
          path.join(reports, 'leads', `${file}.txt`),
          Reports.leadsReport(state.gen, stats)
        )));
        const movesets =
          Reports.movesetReports(state.gen, format, stats, cutoff, shard as ID, min);
        writes.push(this.limit(() =>
          fs.writeFile(path.join(reports, 'moveset', `${file}.txt`), movesets.basic)));
        writes.push(this.limit(() =>
          fs.writeFile(path.join(reports, 'chaos', `${file}.json`), movesets.detailed)));
        writes.push(this.limit(() => fs.writeFile(
          path.join(reports, 'metagame', `${file}.txt`),
          Reports.metagameReport(stats)
        )));
      } else {
        writes.push(this.limit(() => fs.writeFile(
          path.join(reports, `${file}.json`),
          stringify(stats.Display.fromStatistics(state.gen, format, stats, min[0]))
        )));
      }
    }
    if (writes.length) await Promise.all(writes);
  }
};

function mkdirs(dir: string) {
  const mkdir = (d: string) => fs.mkdir(path.resolve(dir, d));
  return [mkdir('chaos'), mkdir('leads'), mkdir('moveset'), mkdir('metagame')];
}

void register(StatsWorker);
export = StatsWorker;
