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
    const stats = { total: {}, tags: {} };

    const size = end.index.global - begin.index.global + 1;
    const offset = `${format}: ${Checkpoints.formatOffsets(begin, end)}`;
    LOG(`Processing ${size} log(s) from batch ${i + 1}/${batches.length} - ${offset}`);
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
    MLOG(true);
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
    Stats.updateTagged(data, battle, cutoffs, stats, tags);
  } catch (err) {
    console.error(`${log}: ${err.message}`);
  }
}

async function combine(formats: ID[], config: StatsConfiguration) {
  for (const format of formats) {
    LOG(`Combining checkpoint(s) for ${format}`);
    const stats = config.dryRun ? { total: {}, tags: {} } : await aggregate(config, format);

    let writes = [];
    for (const [c, s] of Object.entries(stats.total)) {
      if (writes.length + REPORTS >= config.maxFiles) {
        LOG(`Waiting for ${writes.length} report(s) for ${format} to be written`);
        await Promise.all(writes);
        writes = [];
      }
      writes.push(...writeReports(config, format, Number(c), s));
    }

    for (const [t, ts] of Object.entries(stats.tags)) {
      for (const [c, s] of Object.entries(ts)) {
        if (writes.length + REPORTS >= config.maxFiles) {
          LOG(`Waiting for ${writes.length} report(s) for ${format} to be written`);
          await Promise.all(writes);
          writes = [];
        }
        writes.push(...writeReports(config, format, Number(c), s, t as ID));
      }
    }
    if (writes.length) {
      LOG(`Waiting for ${writes.length} report(s) for ${format} to be written`);
      await Promise.all(writes);
    }
    MLOG(true);
  }
}

async function aggregate(config: StatsConfiguration, format: ID): Promise<TaggedStatistics> {
  const checkpointStorage = CheckpointStorage.connect(config);
  const stats = { total: {}, tags: {} };
  // Floating point math is commutative but *not* necessarily associative, meaning that we can
  // potentially get different results depending on the order we add the Stats in. The sorting
  // CheckpointStorage#list *could* be used to help with stability, but we are letting the reads
  // race here to improve performance. Furthermore, there is no guarantee runs with different batch
  // sizes/checkpoints will return the same results or that they will be equivalent to arbitrary
  // precision with a run which does not use batches at all. For the best accuracy we should be
  // adding up the smallest values first, but this requires deeper architectural changes and has
  // performance implications. https://en.wikipedia.org/wiki/Floating-point_arithmetic
  let n = 0;
  let combines = [];
  const N = Math.min(config.maxFiles, config.batchSize.combine);
  const checkpoints = await checkpointStorage.list(format);
  const size = checkpoints.length;
  for (const [i, { begin, end }] of checkpoints.entries()) {
    if (n >= N) {
      LOG(`Waiting for ${combines.length}/${size} checkpoint(s) for ${format} to be aggregated`);
      await Promise.all(combines);
      n = 0;
      combines = [];
    }

    combines.push(
      StatsCheckpoint.read(checkpointStorage, format, begin, end).then(checkpoint => {
        LOG(`Aggregating checkpoint ${i + 1}/${size} <${checkpoint}>`);
        Stats.combineTagged(stats, checkpoint.stats);
        MLOG(true);
      })
    );
    n++;
  }
  if (combines.length) {
    LOG(`Waiting for ${combines.length} checkpoint(s) for ${format} to be aggregated`);
    await Promise.all(combines);
  }
  MLOG(true);

  return stats;
}

// TODO: pass in Data to all reports being written!
function writeReports(
  config: StatsConfiguration,
  format: ID,
  cutoff: number,
  stats: Statistics,
  tag?: ID
) {
  LOG(`Writing reports for ${format} for cutoff ${cutoff}` + (tag ? ` (${tag})` : ''));
  if (config.dryRun) return new Array(REPORTS).fill(Promise.resolve());

  const file = tag ? `${format}-${tag}-${cutoff}` : `${format}-${cutoff}`;
  const usage = Reports.usageReport(format, stats);

  const reports =
    format === 'gen7monotype' && tag ? path.join(config.reports, 'monotype') : config.reports;
  const min = config.all ? [0, -Infinity] : [20, 0.5];
  const writes = [];
  writes.push(fs.writeFile(path.resolve(reports, `${file}.txt`), usage));
  const leads = Reports.leadsReport(format, stats);
  writes.push(fs.writeFile(path.resolve(reports, 'leads', `${file}.txt`), leads));
  const movesets = Reports.movesetReports(format, stats, cutoff, tag, min);
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
