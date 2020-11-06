import {LOG} from './debug';

import * as threads from 'bthreads';
import {ID, Options, Configuration} from './config';
import {Random} from './random';
import {Batch, Checkpoints} from './checkpoints';
import {CheckpointStorage} from './storage';


export type WorkerConfiguration = Omit<Configuration, 'worker'>;

export type WorkerOptions<C extends WorkerConfiguration> = {
  [option in keyof C]?: {
    desc: string;
    alias?: string | string[];
    parse?: (s: string) => C[keyof C];
  }
};

export interface Worker<C extends WorkerConfiguration> {
  init?(config: C): Promise<void>;
  accept?(config: C): (format: ID) => number;
  apply(batches: Batch[], config: C, stats: Statistics): Promise<void>;
  combine?(formats: ID[], config: C): Promise<void>;
  options?: WorkerOptions<C>;
}

export interface WorkerData<C extends WorkerConfiguration> {
  type: 'apply' | 'combine';
  num: number;
  formats: Batch[] | ID[];
  config: C;
  stats: Statistics;
}

export interface Statistics {
  sizes: {[format: string]: number},
  total: number;
}

export var workerData = threads.workerData as unknown;

export async function handle<C extends WorkerConfiguration>(
  worker: Worker<C>,
  data: WorkerData<C>
) {
  if (data.type === 'apply') {
    await worker.apply(data.formats as Batch[], data.config, data.stats)
  } else if (worker?.combine) {
    await worker.combine(data.formats as ID[], data.config);
  }
}

// Default 'accept' function which accepts all formats with equal weight
const ACCEPT = () => 1;

export async function process(options: Options, random = new Random()) {
  // Initialializing sets turns our Options into Configuration, initializing the checkpoint storage
  // and our worker logic if the Worker has an init(...) function. This is also where the worker's
  // accept(...) method gets set up so that we know which formats to consider.
  const {config, worker} = await init(options);
  // FIXME
  const all = await split(config, worker.accept);

  config.worker.type

  let failures = 0;
  if (all.batches.length) {
    const batches = partition(all.batches, Math.max(worker.num.apply, 1));
    failures += await spawn('apply', config, batches, all.stats, random);
  }
  // This partitioning only accounts for the number of logs handled in this processing run,
  // which isn't necesarily equal to the size of the total logs being combined (eg. due to
  // restarts). Given the cost of combine is generally small and that this only effects the
  // atypical case it's not really worth bothering to try to get this to be more precise.
  // TODO: We could be immediately creating combine workers immediately after all batches for
  // the particular format have finished processing.
  if (worker.code.combine && all.sizes.length) {
    const batches = partition(all.sizes, Math.max(worker.num.combine, 1), config.uneven);
    failures += await spawn('combine', config, batches, all.stats, random);
  }
  return failures;
}

async function init(options: Options) {
  // In order to convert Options into a Configuration we need to initialize the checkpoint storage.
  // CheckpointStorage's init(...) method provides an identifier that can be used by the worker
  // processes/threads to connect.
  const checkpoints = await CheckpointStorage.connect(options).init();
  LOG(`Checkpoints storage: ${checkpoints}`);
  const config = Options.toConfiguration({...options, checkpoints});

  // We also need to initialize the worker and set up its accept function. Note that we import the
  // worker code once here into the main process and later spawn many copies of the same code in the
  // worker process/thread.
  const code = await import(config.worker.path) as Worker<Configuration>;
  if (code.init) await code.init(config);
  const worker = {...config.worker, code, accept: code.accept?.(config) || ACCEPT};

  return {config, worker};
}

async function split(config: Configuration, accept: (format: ID) => number) {
  LOG('Splitting formats into batches');
  const formatBatches = await Checkpoints.restore(config, accept);

  const batchSize = (b: Batch) => b.end.index.global - b.begin.index.global + 1;
  const all: {
    batches: Array<{data: Batch; size: number}>;
    sizes: Array<{data: ID; size: number}>;
    stats: Statistics;
  } = {batches: [], sizes: [], stats: {sizes: {}, total: 0}};
  const formatSizes: Map<ID, {remaining: number; total: number}> = new Map();
  for (const [format, {batches, size}] of formatBatches.entries()) {
    let remaining = 0;
    for (const batch of batches) {
      const bs = batchSize(batch);
      all.batches.push({data: batch, size: accept(format) * bs});
      remaining += bs;
    }
    formatSizes.set(format, {remaining, total: size});
    all.stats.total += (all.stats.sizes[format] = size);
  }
  for (const [format, {size}] of formatBatches.entries()) {
    all.sizes.push({data: format, size});
  }
  if (LOG()) {
    const sorted = Array.from(formatSizes.entries()).sort((a, b) => b[1].total - a[1].total);
    LOG(`\n\n${sorted.map(e => `  ${e[0]}: ${e[1].remaining}/${e[1].total}`).join('\n')}\n`);
  }

  return all;
}

async function spawn(
  type: 'apply' | 'combine',
  workerConfig: Omit<Configuration, 'accept'>,
  batches: Array<Batch[] | ID[]>,
  stats: Statistics,
  random: Random,
) {
  return 0;
}

// https://en.wikipedia.org/wiki/Partition_problem#The_greedy_algorithm
function partition<T>(batches: Array<{data: T; size: number}>, partitions: number, uneven = 1) {
  const unmsg = uneven === 1 ? '' : ` (uneven=${uneven})`;
  LOG(`Partitioning ${batches.length} batches into ${partitions} partitions${unmsg}`);
  batches.sort((a, b) => b.size - a.size);
  const total = batches.reduce((tot, b) => tot + b.size, 0);

  // Given partitions is expected to be small, using a priority queue here shouldn't be necessary
  const ps: Array<{total: number; data: T[]}> = [];
  for (const batch of batches) {
    let min: {total: number; data: T[]} | undefined;
    if (ps.length && batch.size / total > uneven) {
      ps[0].total += batch.size;
      ps[0].data.push(batch.data);
      continue;
    }
    if (ps.length < partitions) {
      ps.push({total: batch.size, data: [batch.data]});
      continue;
    }

    for (const p of ps) {
      if (!min || p.total < min.total) {
        min = p;
      }
    }
    // We must have a min here provided partitions > 0
    min!.total += batch.size;
    min!.data.push(batch.data);
  }

  return ps.map(p => p.data);
}
