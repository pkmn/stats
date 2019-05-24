import * as os from 'os';
import * as path from 'path';
import {ID, toID} from 'ps';
import {canonicalizeFormat} from 'stats';
import {Worker} from 'worker_threads';

import * as fs from './fs';

export interface Options {
  numWorkers?: number;
  debug?: boolean;
}

export interface FormatData {
  format: ID;
  size: number;
  files: string[];
}

const WORKER = path.resolve(__dirname, 'worker.js');

export async function process(month: string, reports: string, options: Options = {}) {
  // Set up out report output directory structure
  await rmrf(reports);
  await fs.mkdir(reports, {recursive: true});
  const monotype = path.resolve(reports, 'monotype');
  await fs.mkdir(monotype);
  await Promise.all([...mkdirs(reports), ...mkdirs(monotype)]);

  const formatData: Array<Promise<FormatData>> = [];
  for (const f of await fs.readdir(month)) {
    const format = canonicalizeFormat(toID(f));
    if (format.startsWith('seasonal') || format.includes('random') ||
        format.includes('metronome' || format.includes('superstaff'))) {
      continue;
    }
    const dir = path.resolve(month, f);
    formatData.push(listLogs(dir).then(files => ({format, size: files.length, files})));
  }

  const numWorkers = options.debug ? 1 : (options.numWorkers || (os.cpus().length - 1));
  const partitions = partition(await Promise.all(formatData), numWorkers);
  const workers: Array<[ID[], Promise<void>]> = [];
  const opts = Object.assign({}, options, {reportsPath: reports});
  for (const [i, formats] of partitions.entries()) {
    const workerData = {formats, options: opts, num: i + 1};
    workers.push([
      formats.map(f => f.format), new Promise((resolve, reject) => {
        const worker = new Worker(WORKER, {workerData});
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code === 0) {
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

async function listLogs(dir: string) {
  const dirs: Array<Promise<string[]>> = [];
  for (const d of await fs.readdir(dir)) {
    const p = path.resolve(dir, d);
    dirs.push(fs.readdir(p).then(files => files.map(f => path.resolve(p, f))));
  }
  const all: string[] = [];
  for (const files of await Promise.all(dirs)) {
    all.push(...files);
  }
  return all.sort();
}

// https://en.wikipedia.org/wiki/Partition_problem#The_greedy_algorithm
function partition(formatData: FormatData[], partitions: number) {
  formatData.sort((a, b) => b.size - a.size || a.format.localeCompare(b.format));

  // Given partitions is expected to be small, using a priority queue here shouldn't be necessary
  const ps: Array<{total: number, formats: FormatData[]}> = [];
  for (const data of formatData) {
    let min: {total: number, formats: FormatData[]}|undefined;
    if (ps.length < partitions) {
      ps.push({total: data.size, formats: [data]});
      continue;
    }

    for (const p of ps) {
      if (!min || p.total < min.total) {
        min = p;
      }
    }
    // We must have a min here provided partitions > 0
    min!.total += data.size;
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
