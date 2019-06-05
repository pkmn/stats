import * as os from 'os';
import * as path from 'path';
import {ID, toID} from 'ps';
import {canonicalizeFormat} from 'stats';
import * as util from 'util';
import {Worker} from 'worker_threads';

import {Checkpoints, Offset} from './checkpoint';
import * as debug from './debug';
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
  verbose?: boolean|number;
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

let mainData: {options: Options} = undefined!;

export async function process(input: string, output: string, options: Options = {}) {
  mainData = {options};
  const storage = Storage.connect({dir: input});

  const numWorkers = options.numWorkers || (os.cpus().length - 1);
  const workingSetSize = options.workingSet || WORKING_SET_SIZE;
  const workerOptions = createWorkerOptions(input, output, numWorkers, options);
  vlog('Creating reports directory structure');
  if (!options.dryRun) await createReportsDirectoryStructure(output);

  vlog('Determining formats');
  const formats: Map<ID, {raw: string, size: number, offset: Offset}> = new Map();
  const formatSizes = await storage.formatSizes();
  for (const [raw, size] of Object.entries(formatSizes)) {
    const format = canonicalizeFormat(toID(raw));
    if (format.startsWith('seasonal') || format.includes('random') ||
        format.includes('metronome' || format.includes('superstaff'))) {
      continue;
    }
    formats.set(format, {raw, size, offset: {day: '', log: ''}});
  }

  if (options.checkpoint) {
    vlog('Restoring formats from checkpoints');
    // The 'size' field should really be updated when restoring from checkpoint so that we
    // prioritize processing the formats with the most *remaining* logs as opposed to the formats
    // with the most logs in *total*, however, in practical terms this is unlikely to matter and
    // results in more complex code.
    await Checkpoints.restore(options.checkpoint, formats, options.dryRun);
  }

  let failures = 0;
  for (let left = Array.from(formats.entries()); left.length > 0;
       left = Array.from(formats.entries())) {
    // We sort formats by total size (which potentially should be remaining size, see above) to make
    // sure the formats which are going to take the most iterations get scheduled first.
    const sorted = left.sort((a, b) => b[1].size - a[1].size);
    if (options.verbose) {
      const sizes = sorted.map(e => `  ${e[0]}: ${e[1].size}`).join('\n');
      vlog(`Building working set (${left.length} remaining)\n\n${sizes}\n`);
    }

    // Without checkpointing, we can't handle only processing part of a format, so we have to
    // attempt to read in the entire thing. This may force us to only use a single process to keep
    // memory down, and we may still be over the requested total working set size, but there's not a
    // ton we can do here without dramatically increasing complexity.
    const formatWorkingSetSize = options.checkpoint ?
        Math.floor(workingSetSize / Math.min(left.length, numWorkers)) :
        Infinity;
    // Build up a 'working set' of logs to process. Note: the working set size is not considered
    // to be a hard max, as we may exceed by a day's worth of logs from whatever format we end on.
    const workingSet: FormatData[] = [];
    for (const [format, metadata] of sorted) {
      const [next, trimmed] =
          await storage.listLogs(metadata.raw, metadata.offset, formatWorkingSetSize);
      workingSet.push({format: format as ID, logs: trimmed});
      if (next) {
        vlog(
            `Only able to include part of ${format} in the working set, will begin from ` +
            `${util.inspect(next)} next iteration`);
        // NOTE: we're mutating the underlying metadata object in order to mutate `formats`.
        metadata.offset = next;
        metadata.size -= trimmed.length;
      } else {
        vlog(`All of ${format} has been read into the working set`);
        formats.delete(format);
      }
      if (workingSet.length >= workingSetSize) {
        vlog(`Working set of size ${workingSet.length} >= ${workingSetSize}`);
        break;
      }
    }

    // If we have fewer formats remaining than the number of workers each can open more files.
    if (workerOptions.maxFiles !== Infinity && left.length < numWorkers) {
      workerOptions.maxFiles = Math.floor((options.maxFiles || MAX_FILES) / left.length);
    }
    // TODO: Consider leaving the worker processes running and posting work each iteration - if we
    // are able post to the same worker process a format was previously handled by we could get
    // around the not being able to partially process formats without checkpointing.
    failures += await processWorkingSet(workingSet, numWorkers, workerOptions);
  }

  return failures;
}

export function getOffset(full: string): Offset {
  const [format, day, log] = full.split(path.sep);
  return {day, log};
}

function createWorkerOptions(input: string, output: string, numWorkers: number, options: Options) {
  const opts: WorkerOptions = {
    dir: input,
    reportsPath: output,
    maxFiles: (!options.maxFiles || options.maxFiles > 0) ?
        Math.floor((options.maxFiles || MAX_FILES) / numWorkers) :
        Infinity,
  };
  if (options.checkpoint) {
    opts.checkpoint = options.checkpoint;
    opts.batchSize = (!options.batchSize || options.batchSize > 0) ?
        (options.batchSize || BATCH_SIZE) :
        Infinity;
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
  vlog(`Partitioning working set of size ${workingSet.length} into ${numWorkers} partitions`);
  const partitions = partition(await Promise.all(workingSet), numWorkers);
  const workers: Array<[ID[], Promise<void>]> = [];
  for (const [i, formats] of partitions.entries()) {
    const workerData = {formats, options, num: i + 1};
    vlog(`Creating worker ${i + 1} to handle ${formats.length} format(s)`);
    workers.push([
      formats.map(f => f.format), new Promise((resolve, reject) => {
        const worker = new Worker(WORKER, {workerData});
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code === 0) {
            vlog(`Worker ${workerData.num} exited cleanly`);
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

function vlog(...args: any[]) {
  if (!mainData.options.verbose) return;
  debug.log(`main`, 0, ...args);
}
