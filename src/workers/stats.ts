import 'source-map-support/register';
import '../debug';

import * as path from 'path';
import { Data, ID, toID } from 'ps';
import { Parser, Reports, Statistics, Stats, TaggedStatistics } from 'stats';
import { workerData } from 'worker_threads';

import { Batch, Checkpoint, Checkpoints, Offset } from '../checkpoint';
import { Configuration } from '../config';
import * as fs from '../fs';
import { CheckpointStorage, LogStorage } from '../storage';

class StatsCheckpoint extends Checkpoint {
  readonly stats: TaggedStatistics;

  constructor(format: ID, begin: Offset, end: Offset, stats: TaggedStatistics) {
    super(format, begin, end);
    this.stats = stats;
  }

  serialize() {
    return JSON.stringify(this.stats);
  }

  static async read(storage: CheckpointStorage, format: ID, begin: Offset, end: Offset) {
    const serialized = await storage.read(format, begin, end);
    const stats = JSON.parse(serialized);
    return new StatsCheckpoint(format, begin, end, stats);
  }
}

const POPULAR = new Set([
  'ou',
  'doublesou',
  'randombattle',
  'oususpecttest',
  'smogondoublessuspecttest',
  'doublesoususpecttest',
  'gen7pokebankou',
  'gen7ou',
  'gen7pokebankdoublesou',
  'gen7pokebankoususpecttest',
  'gen7oususpecttest',
  'gen7pokebankdoublesoususpecttest',
  'gen7doublesoususpecttest',
  'gen7doublesou',
] as ID[]);

const CUTOFFS = {
  default: [0, 1500, 1630, 1760],
  popular: [0, 1500, 1695, 1825],
};

// The number of report files written by `writeReports` (usage, leads, moveset, chaos, metagame).
const REPORTS = 5;

const MONOTYPES = new Set(
  Object.keys(Data.forFormat('gen7monotype').Types).map(t => `mono${toID(t)}` as ID)
);

interface StatsConfiguration extends Configuration {
  reports: string;
}

export async function init(config: StatsConfiguration) {
  if (config.dryRun) return;

  await fs.rmrf(config.reports);
  await fs.mkdir(config.reports, { recursive: true });
  const monotype = path.resolve(config.reports, 'monotype');
  await fs.mkdir(monotype);
  await Promise.all([...mkdirs(config.reports), ...mkdirs(monotype)]);
}

export function accept(config: StatsConfiguration) {
  return (format: ID) => {
    if (
      format.startsWith('seasonal') ||
      format.includes('random') ||
      format.includes('metronome' || format.includes('superstaff'))
    ) {
      return 0;
    } else if (format === 'gen7monotype') {
      // Given that we compute all the monotype team tags for gen7monotype, we need to
      // weight the format to make sure a batch uses up approximately the same amount
      // of memory during computation compared to the other formats.
      return MONOTYPES.size + 1;
    } else {
      return 1;
    }
  };
}

function mkdirs(dir: string) {
  const mkdir = (d: string) => fs.mkdir(path.resolve(dir, d));
  return [mkdir('chaos'), mkdir('leads'), mkdir('moveset'), mkdir('metagame')];
}

async function apply(batches: Batch[], config: StatsConfiguration) {
  const logStorage = LogStorage.connect(config);
  const checkpointStorage = CheckpointStorage.connect(config);

  for (const [i, { format, begin, end }] of batches.entries()) {
    const cutoffs = POPULAR.has(format) ? CUTOFFS.popular : CUTOFFS.default;
    const data = Data.forFormat(format);
    const stats = Stats.create();

    const size = end.index.global - begin.index.global + 1;
    const offset = `${format}: ${Checkpoints.formatOffsets(begin, end)}`;
    LOG(`Processing ${size} log(s) from batch ${i}/${batches.length} - ${offset}`);
    let processed: Array<Promise<void>> = [];
    for (const log of await logStorage.select(format, begin, end)) {
      if (processed.length >= config.maxFiles) {
        LOG(`Waiting for ${processed.length} log(s) from ${format} to be parsed`);
        await Promise.all(processed);
        processed = [];
      }

      processed.push(processLog(logStorage, data, log, cutoffs, stats, config.dryRun));
    }
    if (processed.length) {
      LOG(`Waiting for ${processed.length} log(s) from ${format} to be parsed`);
      await Promise.all(processed);
    }
    const checkpoint = new StatsCheckpoint(format, begin, end, stats);
    LOG(`Writing checkpoint <${checkpoint}>`);
    await checkpointStorage.write(checkpoint);
    LOGMEM();
  }
}

async function processLog(
  logStorage: LogStorage,
  data: Data,
  log: string,
  cutoffs: number[],
  stats: TaggedStatistics,
  dryRun?: boolean
) {
  VLOG(`Processing ${log}`);
  if (dryRun) return;
  try {
    const raw = JSON.parse(await logStorage.read(log));
    const battle = Parser.parse(raw, data);
    const tags = data.format === 'gen7monotype' ? MONOTYPES : undefined;
    Stats.update(data, battle, cutoffs, stats, tags);
  } catch (err) {
    console.error(`${log}: ${err.message}`);
  }
}

async function combine(formats: ID[], config: StatsConfiguration) {
  for (const format of formats) {
    LOG(`Combining checkpoint(s) for ${format}`);
    const stats = config.dryRun ? Stats.create() : await aggregate(config, format);

    const b = stats.battles;
    let writes = [];
    for (const [c, s] of Object.entries(stats.total)) {
      if (writes.length + REPORTS >= config.maxFiles) {
        LOG(`Waiting for ${writes.length} report(s) for ${format} to be written`);
        await Promise.all(writes);
        writes = [];
      }
      writes.push(...writeReports(config, format, Number(c), s, b));
    }

    for (const [t, ts] of Object.entries(stats.tags)) {
      for (const [c, s] of Object.entries(ts)) {
        if (writes.length + REPORTS >= config.maxFiles) {
          LOG(`Waiting for ${writes.length} report(s) for ${format} to be written`);
          await Promise.all(writes);
          writes = [];
        }
        writes.push(...writeReports(config, format, Number(c), s, b, t as ID));
      }
    }
    LOG(`Waiting for ${writes.length} report(s) for ${format} to be written`);
    await Promise.all(writes);
    LOGMEM();
  }
}

async function aggregate(config: StatsConfiguration, format: ID): Promise<TaggedStatistics> {
  const checkpointStorage = CheckpointStorage.connect(config);
  const stats = Stats.create();
  // Floating point math is commutative but *not* necessarily associative, meaning that we can
  // potentially get different results depending on the order we add the Stats in. The sorting
  // CheckpointStorage#list does helps with stability, but there is no guarantee runs with
  // different batch sizes/checkpoints will return the same results or that they will be equivalent
  // to arbitrary precision with a run which does not use batches at all. For the best accuracy we
  // should be adding up the smallest values first, but this requires deeper architectural changes
  // and has performance implications. https://en.wikipedia.org/wiki/Floating-point_arithmetic
  for (const { begin, end } of await checkpointStorage.list(format)) {
    // Checkpoints aggregate a batch of log files into a single file and are thus be significantly
    // larger than log files. As such, instead of reading up to config.maxFiles, we only read in
    // one at a time to reduce memory pressure. We'll still be reading in numWorker files across
    // all processes, but a single worker won't potentially be forced to choke by reading in a large
    // batch of checkpoints for a format like gen7ou or gen7monotype.
    const checkpoint = await StatsCheckpoint.read(checkpointStorage, format, begin, end);
    LOG(`Aggregating ${checkpoint}`);
    Stats.combine(stats, checkpoint.stats);
    LOGMEM();
  }
  return stats;
}

function writeReports(
  config: StatsConfiguration,
  format: ID,
  cutoff: number,
  stats: Statistics,
  battles: number,
  tag?: ID
) {
  LOG(`Writing reports for ${format} for cutoff ${cutoff}` + (tag ? ` (${tag})` : ''));
  if (config.dryRun) return new Array(REPORTS).fill(Promise.resolve());

  const file = tag ? `${format}-${tag}-${cutoff}` : `${format}-${cutoff}`;
  const usage = Reports.usageReport(format, stats, battles);

  const reports =
    format === 'gen7monotype' && tag ? path.join(config.reports, 'monotype') : config.reports;
  const min = config.all ? [0, -Infinity] : [20, 0.5];
  const writes = [];
  writes.push(fs.writeFile(path.resolve(reports, `${file}.txt`), usage));
  const leads = Reports.leadsReport(format, stats, battles);
  writes.push(fs.writeFile(path.resolve(reports, 'leads', `${file}.txt`), leads));
  const movesets = Reports.movesetReports(format, stats, battles, cutoff, tag, min);
  writes.push(fs.writeFile(path.resolve(reports, 'moveset', `${file}.txt`), movesets.basic));
  writes.push(fs.writeFile(path.resolve(reports, 'chaos', `${file}.json`), movesets.detailed));
  const metagame = Reports.metagameReport(stats);
  writes.push(fs.writeFile(path.resolve(reports, 'metagame', `${file}.txt`), metagame));
  return writes;
}

if (workerData) {
  (async () =>
    workerData.type === 'apply'
      ? apply(workerData.formats, workerData.config)
      : combine(workerData.formats, workerData.config))().catch(err => console.error(err));
}
