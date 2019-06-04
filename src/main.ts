import * as os from 'os';
import * as path from 'path';
import {performance} from 'perf_hooks';
import {ID, toID} from 'ps';
import {canonicalizeFormat} from 'stats';
import * as util from 'util';
import {Worker} from 'worker_threads';

import {Checkpoints, Offset} from './checkpoint';
import * as fs from './fs';
import {Storage} from './storage';

const WORKER = path.resolve(__dirname, 'worker.js');

// The maximum number of files we'll potentially have open at once. `ulimit -n` on most systems
// should be at least 1024 by default, but we'll set a more more conservative limit to avoid running
// into EMFILE errors. Each worker will be able to open (maxFiles / numWorkers) files which is also
// more conservative, but coordinating the exact number of files open across processes is more
// likely not worth the complexity or coordination overhead.
const MAX_FILES = 256;

// The 'working set' contains the names of all the logs we're read in for processing. This
// most matters when processing millions of lohgs, as even holding each name in memory
// begins to take up an appreciable amount of memory. With filesystem logs, each log looks like:
//
//   2018-02/gen2ou/2018-02-15/battle-gen2ou-704864953.log.json
//
// But could be considerably longer (consider 'gen7balancedhackmonssuspecttest'). At 2 bytes
// per character (ES6), this amounts to ~120-220+ (though 'genNou' is likely to be the most
// popular, so the lower end is more likely). The default of 1048576 (2**20) means we will
// be allocating up to ~128MiB for the working set of log names before accounting for any of the
// memory requiring for reading in the logs and aggregating statistics. Tweaking this in addition to
// the batch size and number of workers (below) allows for reigning in the amount of memory required
// for proceses
const WORKING_SET_SIZE = 1048576;

// The maximum number of logs ('batch') for a particular format that will be aggregated into a
// single intermediate Stats object before it will persisted as a checkppint written during
// processing. Batches may be smaller than this due to working set restrictions or the number of
// logs present for a particular format but this value allows rough bounds on the total amount of
// memory consumed (in addition the the number of workers and working set size). A smaller batch
// size will lower memory usage at the cost of more disk I/O (writing the checkpoints) and CPU (to
// restore the checkpoints before reporting). Stats objects mostly contain sums bounded by the
// number of possible combinations of options available, though in Pokemon this can be quite large.
// Furthermore, each additional battle processed usually requires unbounded growth of GXEs (player
// name + max GXE) and team stalliness (score and weight).
const BATCH_SIZE = 8192;

export interface Options {
  numWorkers?: number;
  workingSet?: number;

  maxFiles?: number;

  checkpoint?: string;
  batchSize?: number;

  dryRun?: boolean;
  verbose?: boolean;
  all?: boolean;
}

export interface WorkerOptions extends Options {
  dir: string;
  reportsPath: string;
  maxFiles: number;
}

export interface FormatData {
  format: ID;
  logs: string[];
}

const mainData: any = undefined;

export async function process(input: string, output: string, options: Options = {}) {
  mainData.options = options;
  const storage = Storage.connect({dir: input});

  const numWorkers = options.numWorkers || (os.cpus().length - 1);
  const workingSetSize = options.workingSet || WORKING_SET_SIZE;
  const workerOptions = createWorkerOptions(input, output, numWorkers, options);
  debug('Creating reports directory structure');
  await createReportsDirectoryStructure(output);

  debug('Determining formats');
  const formats: Map<ID, {raw: string, offset: Offset}> = new Map();
  for (const raw of await storage.listFormats()) {
    const format = canonicalizeFormat(toID(raw));
    if (format.startsWith('seasonal') || format.includes('random') ||
        format.includes('metronome' || format.includes('superstaff'))) {
      continue;
    }
    formats.set(format, {raw, offset: {day: '', log: ''}});
  }

  if (options.checkpoint) {
    debug('Restoring formats from checkpoints');
    await Checkpoints.restore(options.checkpoint, formats);
  }

  let failures = 0;
  // Without checkpointing, we can't handle only processing part of a format, so we have to attempt
  // to read in the entire thing. This may force us to only use a single process to keep memory
  // down, and we may still be over the requested total working set size, but there's not a ton we
  // can do here without dramatically increasing complexity.
  const formatWorkingSetSize =
      options.checkpoint ? Math.floor(workingSetSize / numWorkers) : Infinity;
  for (let left = Array.from(formats.entries()); left.length > 0;
       left = Array.from(formats.entries())) {
    debug(`Building working set (${left.length} formats remaining)`);
    // Build up a 'working set' of logs to process. Note: the working set size is not considered
    // to be a hard max, as we may exceed by a day's worth of logs from whatever format we end on.
    const workingSet: FormatData[] = [];
    for (const [format, {raw, offset}] of left) {
      const [next, logs] = await storage.listLogs(raw, offset, formatWorkingSetSize);
      workingSet.push({format: format as ID, logs});
      if (next) {
        debug(`Only able to partially process ${format}, will begin from ${offset} next iteration`);
        formats.get(format)!.offset = next;
      } else {
        debug(`All of ${format} has been read into the working set`);
        formats.delete(format);
      }
      if (workingSet.length >= workingSetSize) {
        debug(`Working set of size ${workingSet.length} >= ${workingSetSize}`);
        break;
      }
    }

    // TODO: Consider leaving the worker processes running and posting work each iteration - if we
    // are able post to the same worker process a format was previously handled by we could get
    // around the not being able to partially process formats without checkpointing.
    failures += await processWorkingSet(workingSet, numWorkers, workerOptions);
  }

  return failures;
}

function createWorkerOptions(input: string, output: string, numWorkers: number, options: Options) {
  const opts: WorkerOptions = {
    dir: input,
    reportsPath: output,
    maxFiles: (options.maxFiles && options.maxFiles > 0) ?
        Math.floor((options.maxFiles || MAX_FILES) / numWorkers) :
        Infinity,
  };
  if (options.checkpoint) {
    opts.checkpoint = options.checkpoint;
    opts.batchSize =
        (options.batchSize && options.batchSize > 0) ? (options.batchSize || BATCH_SIZE) : Infinity;
  }
  opts.dryRun = options.dryRun;
  opts.verbose = options.verbose;
  opts.all = options.all;
  return opts;
}

async function createReportsDirectoryStructure(output: string) {
  await rmrf(output);
  await fs.mkdir(output, {recursive: true});
  const monotype = path.resolve(output, 'monotype');
  await fs.mkdir(monotype);
  await Promise.all([...mkdirs(output), ...mkdirs(monotype)]);
}

async function processWorkingSet(
    workingSet: FormatData[], numWorkers: number, options: WorkerOptions) {
  debug(`Partitioning working set of size ${workingSet.length} into ${numWorkers} partitions`);
  const partitions = partition(await Promise.all(workingSet), numWorkers);
  const workers: Array<[ID[], Promise<void>]> = [];
  for (const [i, formats] of partitions.entries()) {
    const workerData = {formats, options, num: i + 1};
    debug(`Creating worker ${i + 1} to handle ${formats.length} formats`);
    workers.push([
      formats.map(f => f.format), new Promise((resolve, reject) => {
        const worker = new Worker(WORKER, {workerData});
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code === 0) {
            debug(`Worker ${workerData.num} exited cleanly`);
            // We need to wait for the worker to exit before resolving (as opposed to having
            // the worker message us when it is finished) so that we know it is safe to
            // terminate the main process (which will kill all the workers and result in
            // strange behavior where `console` output from the workers goes missing).
            resolve();
          } else {
            reject(new Error(`Worker stopped with exit code ${code}`));
          }
        });
      })
    ]);
  }

  let failures = 0;
  for (const [formats, worker] of workers) {
    try {
      await worker;
    } catch (err) {
      console.error(`Error occurred when processing formats: ${formats.join(', ')}`, err);
      failures++;
    }
  }

  return failures;
}

// https://en.wikipedia.org/wiki/Partition_problem#The_greedy_algorithm
function partition(formatData: FormatData[], partitions: number) {
  formatData.sort((a, b) => b.logs.length - a.logs.length || a.format.localeCompare(b.format));

  // Given partitions is expected to be small, using a priority queue here shouldn't be necessary
  const ps: Array<{total: number, formats: FormatData[]}> = [];
  for (const data of formatData) {
    let min: {total: number, formats: FormatData[]}|undefined;
    if (ps.length < partitions) {
      ps.push({total: data.logs.length, formats: [data]});
      continue;
    }

    for (const p of ps) {
      if (!min || p.total < min.total) {
        min = p;
      }
    }
    // We must have a min here provided partitions > 0
    min!.total += data.logs.length;
    min!.formats.push(data);
  }

  return ps.map(p => p.formats);
}

function mkdirs(dir: string) {
  const mkdir = (d: string) => fs.mkdir(path.resolve(dir, d));
  return [mkdir('chaos'), mkdir('leads'), mkdir('moveset'), mkdir('metagame')];
}

async function rmrf(dir: string) {
  if (await fs.exists(dir)) {
    const rms: Array<Promise<void>> = [];
    for (const file of await fs.readdir(dir)) {
      const f = path.resolve(dir, file);
      if ((await fs.lstat(f)).isDirectory()) {
        rms.push(rmrf(f));
      } else {
        rms.push(fs.unlink(f));
      }
    }
    await Promise.all(rms);
    await fs.rmdir(dir);
  }
}

function debug(...args: any[]) {
  if (!mainData.options.verbose) return;
  const tag = util.format('[%s] \x1b[31m%s\x1b[0m', Math.round(performance.now()), 'main');
  console.log(tag, ...args);
}
