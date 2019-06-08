import 'source-map-support/register';
import './debug';

import * as os from 'os';
import * as path from 'path';
import {ID, toID} from 'ps';
import {canonicalizeFormat} from 'stats';
import {Worker} from 'worker_threads';

import {Batch, Checkpoints} from './checkpoint';
import {Configuration, Options} from './config';

const WORKERS = path.resolve(__dirname, 'workers');

export async function main(options: Options) {
  const config = await init(options);

  // Per nodejs/node#27687, before v12.3.0 multiple threads logging to the console
  // will cause EventEmitter warnings because each thread unncessarily attaches its
  // own error handler around each write.
  if (config.verbose && Number(process.version.match(/^v(\d+\.\d+)/)![1]) < 12.3) {
    process.setMaxListeners(config.numWorkers + 1);
  }

  LOG('Splitting formats into batches');
  const formats = await Checkpoints.restore(config, config.accept);
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
      const worker = new Worker(path.join(WORKERS, `${config.worker}.js`), {workerData});
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

async function init(options: Options) {
  options.checkpoints = Checkpoints.ensureDir(options.checkpoints);
  const config = Options.toConfiguration(config);
  const worker = await import(path.join(WORKERS, `${config.worker}.js`));
  if (worker.init) await worker.init(config);
  if (worker.accept) config.accept = worker.accept(config);
  return config;
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
