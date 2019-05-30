import * as os from 'os';
import * as path from 'path';
import {ID, toID} from 'ps';
import {canonicalizeFormat} from 'stats';
import {Worker} from 'worker_threads';

import * as fs from './fs';

export interface Options {
  maxFiles?: number;
  numWorkers?: number;
  workingSet?: number;
  checkpoint?: string;
  batchSize?: number;
  timeBucket?: number;
  debug?: boolean;
}

export interface FormatData {
  format: ID;
  size: number;
  files: string[];
}

// The maximum number of files we'll potentially have open at once. `ulimit -n` on most systems
// should be at least 1024 by default, but we'll set a more more conservative limit to avoid running
// into EMFILE errors. Each worker will be able to open (maxFiles / numWorkers) files which is also
// more conservative, but coordinating the exact number of files open across processes is more
// likely not worth the complexity or coordination overhead.
const MAX_FILES = 256;

// The 'working set' contains the names of all the files we're read in for processing. This
// most matters when processing millions of files, as even holding each filename in memory
// begins to take up an appreciable amount of memory. Each filename looks like:
//
//   2018-02/gen2ou/gen2ou/2018-02-15/battle-gen2ou-704864953.log.json
//
// But could be considerably longer (consider 'gen7balancedhackmonssuspecttest'). At 2 bytes
// per character (ES6), this amounts to ~130-280+ (though 'genNou' is likely to be the most
// popular, so the lower end is more likely). The default of 1048576 (2**20) means we will
// be allocating up to ~128-256MiB for the working set of file names before accounting for
// any of the memory requiring for reading in files and aggregating statistics. Tweaking this in
// addition to the batch size and number of workers (below) allows for reigning in the amount of
// memory required for proceses
const WORKING_SET_SIZE = 1048576;

// The maximum number of logs ('batch') for a particular format that will be aggregated into a
// single intermediate Stats object before it will persisted as a checkppint written during
// processing. Batches may be smaller than this due to working set restrictions, the number of logs
// present for a particular format, or when time based checkpointing is enabled, but this value
// allows rough bounds on the total amount of memory consumed (in addition the the number of workers
// and working set size). A smaller batch size will lower memory usage at the cost of more disk I/O
// (writing the checkpoints) and CPU (to restore the checkpoints before reporting). Stats objects
// mostly contain sums bounded by the number of possible combinations of options available, though
// in Pokemon this can be quite large. Furthermore, each additional battle processed usually
// requires unbounded growth of GXEs (player name + max GXE) and team stalliness (score and weight).
const BATCH_SIZE = 8192;

// Each log file contains a timestamp field, and whenever we see that 'time bucket' seconds has
// passed since the beginning of the time period (ie. month) we write a checkpoint, independent of
// the configured max batch size. This setting is less relevant for bounding memory behavior than
// for providing the ability to compute statistics/reports over meaningful subranges of checkpoints.
const TIME_BUCKET = 86400;

const WORKER = path.resolve(__dirname, 'worker.js');

export async function process(month: string, reports: string, options: Options = {}) {
  // Set up out report output directory structure
  await rmrf(reports);
  await fs.mkdir(reports, {recursive: true});
  const monotype = path.resolve(reports, 'monotype');
  await fs.mkdir(monotype);
  await Promise.all([...mkdirs(reports), ...mkdirs(monotype)]);

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

  const numWorkers = options.debug ? 1 : (options.numWorkers || (os.cpus().length - 1));
  const opts: Options&{reportsPath: string} = {reportsPath: reports};
  opts.maxFiles = (options.maxFiles && options.maxFiles > 0) ?
      Math.floor((options.maxFiles || MAX_FILES) / numWorkers) :
      Infinity;
  if (options.checkpoint) {
    opts.batchSize =
        (options.batchSize && options.batchSize > 0) ? (options.batchSize || BATCH_SIZE) : Infinity;
    opts.timeBucket = (options.timeBucket && options.timeBucket > 0) ?
        (options.timeBucket || TIME_BUCKET) :
        Infinity;
  }

  const partitions = partition(await Promise.all(formatData), numWorkers);
  const workers: Array<[ID[], Promise<void>]> = [];
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