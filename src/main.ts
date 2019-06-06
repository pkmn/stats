import 'source-map-support/register';

import * as os from 'os';
import * as path from 'path';
import {ID, toID} from 'ps';
import {canonicalizeFormat} from 'stats';
import {Worker} from 'worker_threads';

import {Checkpoints, Offset} from './checkpoint';
import * as debug from './debug';
import * as fs from './fs';

interface Batch {
  format: string;  // FIXME: raw
  begin: Offset;
  end: Offset;
  size: number;
}

export interface Configuration {
  logs: string;
  reports: string;
  checkpoints: string;
  numWorkers: number;
  maxFiles: number;
  batchSize: number;
  verbose: number;
  dryRun: boolean;
  verify: boolean;
  all: boolean;
}

interface Options extends Partial<Configuration> {
  logs: string;
  reports: string;
  verbose?: boolean|number;
}

const WORKER = path.resolve(__dirname, 'worker.js');

// The maximum number of files we'll potentially have open at once. `ulimit -n` on most systems
// should be at least 1024 by default, but we'll set a more more conservative limit to avoid running
// into EMFILE errors. Each worker will be able to open (maxFiles / numWorkers) files which is also
// more conservative, but coordinating the exact number of files open across processes is more
// likely not worth the complexity or coordination overhead.
const MAX_FILES = 256;

// The maximum number of logs ('batch') for a particular format that will be aggregated into a
// single intermediate Stats object before it will persisted as a checkpoint written during
// processing. Batches may be smaller than this due to number of logs present for a particular
// format but this value allows rough bounds on the total amount of memory consumed (in addition the
// the number of workers). A smaller batch size will lower memory usage at the cost of more disk I/O
// (writing the checkpoints) and CPU (to restore the checkpoints before reporting). Stats objects
// mostly contain sums bounded by the number of possible combinations of options available, though
// in Pokemon this can be quite large. Furthermore, each additional battle processed usually
// requires unbounded growth of GXEs (player name + max GXE) and team stalliness (score and weight).
const BATCH_SIZE = 8192;

let mainData: {config: Configuration} = undefined!;

export async function main(options: Options) {
  mainData = {options};
  const config = init(options);

  // Per nodejs/node#27687, before v12.3.0 multiple threads logging to the console
  // will cause EventEmitter warnings because each thread unncessarily attaches its
  // own error handler around each write.
  if (config.verbose && Number(process.version.match(/^v(\d+\.\d+)/)![1]) < 12.3) {
    process.setMaxListeners(config.numWorkers + 1);
  }

  LOG('Splitting formats into batches');
  const formats = await Checkpoints.restore(config, accept);
  const sizes = formats.entries().map(e => ({format: e[0], size: e[1].size}));
  if (LOG()) {
    const sorted = sizes.sort((a, b) => b.size - a.size);
    LOG(`\n${sorted.map(e => `  ${e.format}: ${e.size}`).join('\n')}\n`);
  }

  const workerConfig = Object.assign({}, config);
  // If we fewer formats remaining than the number of workers each can open more files.
  workerConfig.maxFiles = Math.floor(config.maxFiles / Math.min(formats.size, config.numWorkers));

  const failures = await spawn('apply', partition(formats.values(), config.numWorkers).entries());
  // TODO: We could be immediately creating combine workers immediately after all batches for
  // the particular format have finished processing.
  failues += await spawn('combine', partition(sizes, config.numWorkers).entries());

  return failures;
}

async function spawn(type: 'apply'|'combine', batches: Array<Array<Batch|ID>>) {
  const workers: Array<Promise<void>> = [];

  for (const [i, formats]: batches) {
    const workerData = {type, formats, config: workerConfig, num: i + 1};
    LOG(`Creating ${type} worker:${workerData.num} to handle ${batches.length} format(s)`);
    workers.push(new Promise((resolve, reject) => {
      const worker = new Worker(WORKER, {workerData});
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code === 0) {
          LOG(`${capitalize(type)} worker:${workerData.num} exited cleanly`);
          // We need to wait for the worker to exit before resolving (as opposed to having
          // the worker message us when it is finished) so that we know it is safe to
          // terminate the main process (which will kill all the workers and result in
          // strange behavior where `console` output from the workers goes missing).
          resolve();
        } else {
          reject(new Error(
              `${capitalize(type)} worker:${workerData.num} stopped with exit code ${code}`));
        }
      });
    }));
  }

  let failures = 0;
  for (const [i, worker] of workers.entries()) {
    try {
      await worker;
    } catch (err) {
      console.error(err);
      failures++;
    }
  }
  return failures;
}

function capitalize(s: string) {
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

function init(options: Options) {
  options.checkpoints = Checkpoints.ensureDir(options.checkpoints);
  const config = toConfiguration(config);
  if (!config.dryRun) await createReportsDirectoryStructure(config.reports);
}

function toConfiguration(options: Options) {
  const numWorkers = options.numWorkers || (os.cpus().length - 1);
  const maxFiles = (!options.maxFiles || options.maxFiles > 0) ?
      Math.floor((options.maxFiles || MAX_FILES) / numWorkers) :
      Infinity;
  const batchSize =
      (!options.batchSize || options.batchSize > 0) ? (options.batchSize || BATCH_SIZE) : Infinity;
  return {
    logs: options.logs, reports: options.reports, checkpoints: options.checkpoints!;
    numWorkers, maxFiles, batchSize, verbose: +option.verbose, dryRun: !!options.dryRun,
        verbose: !!option.verify, all: !!options.all,
  };
}

function accept(raw: string) {
  const format = canonicalizeFormat(toID(raw));
  return (format.startsWith('seasonal') || format.includes('random') ||
          format.includes('metronome' || format.includes('superstaff'))) ?
      undefined :
      format;
}

// https://en.wikipedia.org/wiki/Partition_problem#The_greedy_algorithm
function partition(batches: Array<{format: string, size: number}>, partitions: number) {
  LOG(`Partitioning ${batches.length} batches into ${partitions} partitions`);
  batches.sort((a, b) => b.size - a.size || a.format.localeCompare(b.format));

  // Given partitions is expected to be small, using a priority queue here shouldn't be necessary
  const ps: Array<{total: number, batches: Batch[]}> = [];
  for (const batch of batches) {
    let min: {total: number, batches: Batch[]}|undefined;
    if (ps.length < partitions) {
      ps.push({total: batch.size, batches: [batch]});
      continue;
    }

    for (const p of ps) {
      if (!min || p.total < min.total) {
        min = p;
      }
    }
    // We must have a min here provided partitions > 0
    min!.total += batch.size;
    min!.batches.push(batch);
  }

  return ps.map(p => p.formats);
}

function LOG(...args: any[]) {
  if (!args.length) return mainData.options.verbose;
  if (!mainData.options.verbose) return;
  debug.log(`main`, 0, ...args);
}
