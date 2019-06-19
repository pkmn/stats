import 'source-map-support/register';
import './debug';

import * as path from 'path';
import { ID } from 'ps';
import { Worker } from 'worker_threads';

import { Batch, Checkpoints } from './checkpoint';
import { Configuration, Options } from './config';
import { Random } from './random';
import { CheckpointStorage } from './storage';

const WORKERS = path.resolve(__dirname, 'workers');
const RANDOM = new Random();

export async function main(options: Options) {
  const config = await init(options);

  // Per nodejs/node#27687, before v12.3.0 multiple threads logging to the console
  // will cause EventEmitter warnings because each thread unncessarily attaches its
  // own error handler around each write.
  if (process.env.DEBUG && Number(process.version.match(/^v(\d+\.\d+)/)![1]) < 12.3) {
    process.setMaxListeners(Math.max(config.numWorkers.apply, config.numWorkers.combine) + 1);
  }

  LOG('Splitting formats into batches');
  const formatBatches = await Checkpoints.restore(config, config.accept);

  const batchSize = (b: Batch) => b.end.index.global - b.begin.index.global + 1;
  const allBatches: Array<{ data: Batch; size: number }> = [];
  const formatSizes: Map<ID, { remaining: number; total: number }> = new Map();
  for (const [format, { batches, size }] of formatBatches.entries()) {
    let remaining = 0;
    for (const batch of batches) {
      const bs = batchSize(batch);
      allBatches.push({ data: batch, size: config.accept(format) * bs });
      remaining += bs;
    }
    formatSizes.set(format, { remaining, total: size });
  }
  const allSizes: Array<{ data: ID; size: number }> = [];
  for (const [format, { size }] of formatBatches.entries()) {
    allSizes.push({ data: format, size });
  }
  if (LOG()) {
    const sorted = Array.from(formatSizes.entries()).sort((a, b) => b[1].total - a[1].total);
    LOG(`\n\n${sorted.map(e => `  ${e[0]}: ${e[1].remaining}/${e[1].total}`).join('\n')}\n`);
  }

  const workerConfig = Object.assign({}, config);
  delete workerConfig.accept;

  let failures = !allBatches.length
    ? 0
    : await spawn(
        'apply',
        workerConfig,
        config.maxFiles,
        partition(allBatches, Math.max(config.numWorkers.apply, 1))
      );
  // This partitioning only accounts for the number of logs handled in this processing run,
  // which isn't necesarily equal to the size of the total logs being combined (eg. due to
  // restarts). Given the cost of combine is generally small and that this only effects the
  // atypical case it's not really worth bothering to try to get this to be more precise.
  // TODO: We could be immediately creating combine workers immediately after all batches for
  // the particular format have finished processing.
  failures += !allSizes.length
    ? 0
    : await spawn(
        'combine',
        workerConfig,
        config.maxFiles,
        partition(allSizes, Math.max(config.numWorkers.combine, 1), config.uneven)
      );
  return failures;
}

async function spawn(
  type: 'apply' | 'combine',
  workerConfig: Configuration,
  maxFiles: number,
  batches: Array<Batch[] | ID[]>
) {
  const workers: Array<Promise<void>> = [];

  // If we have fewer formats remaining than the number of workers each can open more files.
  workerConfig.maxFiles = Math.max(Math.floor(maxFiles / batches.length), 1);
  let num = batches.length;
  if (workerConfig.numWorkers[type]) {
    for (const [i, formats] of batches.entries()) {
      // We shuffle the batches so that formats will be processed more evenly. Without this shake
      // up, all logs for a given format will be processed at approximately the same time across
      // all workers, which can lead to issues if a format is more expensive to process than others.
      // NOTE: This is really Batch[]|ID[] but Typescript is too dumb to realize thats still T[]...
      RANDOM.shuffle(formats as Array<Batch | ID>);
      const workerData = { type, formats, config: workerConfig, num: i + 1 };
      LOG(`Creating ${type} worker:${workerData.num} to handle ${formats.length} batch(es)`);
      workers.push(
        new Promise((resolve, reject) => {
          const worker = new Worker(path.join(WORKERS, `${workerConfig.worker}.js`), {
            workerData,
          });
          worker.on('error', reject);
          worker.on('exit', code => {
            num--;
            if (code === 0) {
              LOG(`${capitalize(type)} worker:${workerData.num} exited cleanly, ${num} remaining`);
              // We need to wait for the worker to exit before resolving (as opposed to having
              // the worker message us when it is finished) so that we know it is safe to
              // terminate the main process (which will kill all the workers and result in
              // strange behavior where `console` output from the workers goes missing).
              resolve();
            } else {
              reject(
                new Error(
                  `${capitalize(type)} worker:${workerData.num} stopped with exit code ${code}`
                )
              );
            }
          });
        })
      );
    }
  } else {
    const worker = await import(path.join(WORKERS, `${workerConfig.worker}.js`));
    for (const [i, formats] of batches.entries()) {
      workers.push(worker[type](RANDOM.shuffle(formats as Array<Batch | ID>), workerConfig));
    }
  }

  let failures = 0;
  for (const worker of workers) {
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

async function init(options: Options) {
  const checkpoints = await CheckpointStorage.connect(options).init();
  LOG(`Checkpoints storage: ${checkpoints}`);
  const config = Options.toConfiguration(options);
  config.checkpoints = checkpoints;
  const worker = await import(path.join(WORKERS, `${config.worker}.js`));
  if (worker.init) await worker.init(config);
  if (worker.accept) config.accept = worker.accept(config);
  return config;
}

// https://en.wikipedia.org/wiki/Partition_problem#The_greedy_algorithm
function partition<T>(
  batches: Array<{ data: T; size: number }>,
  partitions: number,
  uneven: number
) {
  LOG(`Partitioning ${batches.length} batches into ${partitions} partitions (uneven=${uneven})`);
  batches.sort((a, b) => b.size - a.size);
  const total = batches.reduce((tot, b) => tot + b.size, 0);

  // Given partitions is expected to be small, using a priority queue here shouldn't be necessary
  const ps: Array<{ total: number; data: T[] }> = [];
  for (const batch of batches) {
    let min: { total: number; data: T[] } | undefined;
    if (ps.length && batch.size / total > uneven) {
      ps[0].total += batch.size;
      ps[0].data.push(batch.data);
      continue;
    }
    if (ps.length < partitions) {
      ps.push({ total: batch.size, data: [batch.data] });
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
