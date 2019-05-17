// We expect the logs (YYYY-MM) directory to be structured as follows:
//
//     YYYY-MM
//     └── format
//         └── YYYY-MM-DD
//             └── battle-format-N.log.json
//
// The resulting reports will be written out in the following directory structure:
//
//     YYYY-MM
//     ├── chaos
//     │   └── format-N.json
//     ├── format-N.txt
//     ├── leads
//     │   └── format-N.txt
//     ├── metagame
//     │   └── format-N.txt
//     ├── monotype
//     │   ├── chaos
//     │   │   └── format-monoT-N.json
//     │   ├── format-monoT-N.txt
//     │   ├── leads
//     │   │   └── format-monoT-N.txt
//     │   ├── metagame
//     │   │   └── format-monoT-N.txt
//     │   └── moveset
//     │       └── format-monoT-N.txt
//     └── moveset
//         └── format-N.txt

import {canonicalizeFormat} from '@psim/stats';
import * as os from 'os';
import * as path from 'path';
import {ID, toID} from 'ps';
import {Worker} from 'worker_threads';

import * as fs from './fs';

export interface Options {
  numWorkers?: number;
  batchSize?: number;
  intermediatePath?: number;
}

const WORKER = path.resolve(__dirname, 'worker.js');

export async function process(month: string, reports: string, options: Options = {}) {
  // Set up out report output directory structure
  await rmrf(reports);
  await fs.mkdir(reports, {recursive: true, mode: 0o755});
  const monotype = path.resolve(reports, 'monotype');
  await fs.mkdir(monotype, {mode: 0o755});
  await Promise.all([...mkdirs(reports), ...mkdirs(monotype)]);

  const formatSizes: Array<Promise<[ID, string, number]>> = [];
  for (const f of await fs.readdir(month)) {
    const format = canonicalizeFormat(toID(f));
    if (format.startsWith('seasonal') || format.includes('random') ||
        format.includes('metronome' || format.includes('superstaff'))) {
      continue;
    }
    const dir = path.resolve(month, f);
    formatSizes.push(dirSize(dir).then(size => [format, dir, size]));
  }

  const numWorkers = options.numWorkers || (os.cpus().length - 1);
  const partitions = partition(await Promise.all(formatSizes), numWorkers);
  const workers: Array<Promise<void>> = [];
  const opts = Object.assign({}, options, {reportsPath: reports});
  for (const formats of partitions) {
    const workerData = {formats, options: opts};
    workers.push(new Promise((resolve, reject) => {
      const worker = new Worker(WORKER, {workerData});
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
      });
    }));
  }
  await Promise.all(workers);
}

async function dirSize(dir: string) {
  const dirs: Array<Promise<string[]>> = [];
  for (const d of await fs.readdir(dir)) {
    dirs.push(fs.readdir(path.resolve(dir, d)));
  }
  return (await Promise.all(dirs)).reduce((sum, d) => sum + d.length, 0);
}

// https://en.wikipedia.org/wiki/Partition_problem#The_greedy_algorithm
function partition(formatSizes: Array<[ID, string, number]>, partitions: number) {
  formatSizes.sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));
  console.log(formatSizes);

  // Given partitions is expected to be small, using a priority queue here shouldn't be necessary
  const ps: Array<{total: number, formats: Array<[ID, string]>}> = [];
  for (const [format, dir, size] of formatSizes) {
    let min: {total: number, formats: Array<[ID, string]>}|undefined;
    if (ps.length < partitions) {
      ps.push({total: size, formats: [[format, dir]]});
      continue;
    }

    for (const p of ps) {
      if (!min || p.total < min.total) {
        min = p;
      }
    }
    // We must have a min here provided partitions > 0
    min!.total += size;
    min!.formats.push([format, dir]);
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
