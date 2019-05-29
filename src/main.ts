import * as os from 'os';
import * as path from 'path';
import {ID, toID} from 'ps';
import {canonicalizeFormat} from 'stats';
import {Worker} from 'worker_threads';

import * as fs from './fs';

export interface Options {
  maxFiles?: number;
  numWorkers?: number;
  debug?: boolean;
}

export interface FormatData {
  format: ID;
  size: number;
  files: string[];
}

// `ulimit -n` on most systems should be at least 1024 by default, but we'll set a more
// more conservative limit to avoid running into EMFILE errors. Each worker will be able
// to open (maxFiles / numWorkers) files which is also more conservative, but coordinating
// the exact number of files open across processes is more likely not worth the complexity
// or coordination overhead.
const MAX_FILES = 256;

const WORKER = path.resolve(__dirname, 'worker.js');

export async function process(month: string, reports: string, options: Options = {}) {
  console.log(new Date());
  // Set up out report output directory structure
  await rmrf(reports);
  await fs.mkdir(reports, {recursive: true});
  const monotype = path.resolve(reports, 'monotype');
  await fs.mkdir(monotype);
  await Promise.all([...mkdirs(reports), ...mkdirs(monotype)]);
  console.log(new Date());

  // We read several million filenames into memory to partition the formats and then process their
  // contents. Depending on the length of the path to each file, at 2 bytes per character in ES6
  // this ends up amounting to an appreciable amount of memory overhead (1-2GiB) which we could
  // potentially improve by only reading in a few formats at a time (or sharding a format in the
  // case of something like current gen OU which amounts to ~35-40% of the total data...), but for
  // now we're simply going to eat the overhead. Our other memory usage comes from actually reading
  // and parsing the logs (some multiple of ~10KB * maxFiles), as well as keeping the Stats objects
  // in memory (which are mostly sums, save for gxes and team stalliness which also requires memory
  // proportional to the number of battles and which we bounded through checkpointing).
  // TODO: revisit whether we want to limit the number of filenames we read at this stage
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

  const maxFiles = options.maxFiles || MAX_FILES;
  const numWorkers = options.debug ? 1 : (options.numWorkers || (os.cpus().length - 1));
  const partitions = partition(await Promise.all(formatData), numWorkers);
  const workers: Array<[ID[], Promise<void>]> = [];
  const opts = Object.assign({}, options, {
    reportsPath: reports,
    maxFiles: Math.floor(maxFiles / numWorkers),
  });
  console.log(new Date());
  debug(partitions);
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

function numberWithCommas(x: number) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function humanFileSize(size: number) {
    var i = Math.floor(Math.log(size) / Math.log(1024));
    return (size / Math.pow(1024, i)).toFixed(2) + ' ' + ['B', 'KiB', 'MiB', 'GiB', 'TiB'][i];
}

function debug(partitions: FormatData[][]) {
  const total = {files: 0, ram: 0};
  

  for (const [i, formats] of partitions.entries()) {
    for (const {format, size, files} of formats) {
      total.files += size;
      const ram = files.reduce((a, b) => a + b.length, 0);
      total.ram += ram;
      console.log(`${i + 1}: [${format}] = ${numberWithCommas(size)} (${humanFileSize(ram)})`);
    }
  }

  console.log(`TOTAL: ${numberWithCommas(total.files)} (${humanFileSize(total.ram)})`);
  throw new Error('end');
}
