import * as os from 'os';

// The maximum number of files we'll potentially have open at once. `ulimit -n` on most systems
// should be at least 1024 by default, but we'll set a more more conservative limit to avoid running
// into EMFILE errors. Each worker will be able to open (maxFiles / numWorkers) files which is also
// more conservative, but coordinating the exact number of files open across processes is most
// likely not worth the complexity or coordination overhead.
const MAX_FILES = 256;

// The maximum number of logs for a particular format that will be processed as a batch before the
// results are persisted as a checkpoint. Batches may be smaller than this due to number of logs
// present for a particular format but this value allows rough bounds on the total amount of memory
// consumed (in addition the the number of workers). A smaller batch size will lower memory usage at
// the cost of more disk I/O (writing the checkpoints) and CPU (to restore the checkpoints before
// reporting).
//
// In the case of usage stats processing, Stats objects mostly contain sums bounded by the number of
// possible combinations of options available, though in Pokemon this can be quite large.
// Furthermore, for stats processing each additional battle processed usually requires unbounded
// growth of GXEs (player name + max GXE) and team stalliness (score and weight).
const BATCH_SIZE = 8192;

// The default number of workers to use - one per core after setting aside a core for garbage
// collection and other system tasks.
const NUM_WORKERS = os.cpus().length - 1;

export type ID = (string & { __brand: 'ID' }) | (string & { __isID: true }) | '';

export interface Configuration {
  input: string;
  output: string;
  checkpoints?: string;

  worker: string;
  workerType: 'threads' | 'processes';
  numWorkers: {apply: number; combine: number};

  maxFiles: number;
  batchSize: {apply: number; combine: number};
  uneven: number;
  dryRun: boolean;
  all: boolean;

  accept: (format: ID) => number;
}

export const ALIASES = {
  input: ['i', 'in'],
  output: ['o', 'out'],
  worker: ['w'],
  checkpoints: ['c', 'checkpoint'],
  threads: ['t', 'thread'],
  processes: ['p', 'processes'],
  maxFiles: ['n', 'files'],
  batchSize: ['b', 'batch'],
  debug: ['v', 'verbose'],
  dryRun: ['d', 'dry'],
  uneven: ['u'],
};

export function usage(code: number, preamble: string, options: string[] = []) {
  const out = !code ? console.log : console.error;

  for (const [i, line] of preamble.split('\n').entries()) {
    if (line) {
      out(i ? ` ${line}` : line);
    } else {
      out('');
    }
  }

  /* eslint-disable max-len */
  out('');
  out(' Options:');
  out('');
  out('   -i/--input=INPUT: process data from INPUT');
  out('');
  out('   -o/--output=OUTPUT: export results to OUTPUT');
  out('');
  out('   -w/--worker=WORKER: process data with WORKER');
  out('');
  out('   -c/--checkpoint=CHECKPOINTS: enable checkpointing and write intermediate information to CHECKPOINTS for recovery');
  out('');
  out('   -t/--threads=N: process the logs using N worker threads (default: NUM_CORES-1)');
  out('');
  out('   -p/--processes=N: process the logs using N worker processes (default: NUM_CORES-1)');
  out('');
  out('   -n/--maxFiles=N: open up to N files across all workers (should be < `ulimit -n`, default: 256)');
  out('');
  out('   -b/--batchSize=N: if checkpointing, write checkpoints at least every N files per format (default: 8096)');
  out('');
  out('   -d/--dryRun: skip actually performing any processing (default: false)');
  out('');
  out('   -v/--verbose: log output while processing (default: false)');
  out('');
  out('   -u/--uneven=N: fraction which determines which formats can be combined concurrently (default: 1/numWorkers)');
  out('');
  /* eslint-enable max-len */

  for (const line of options) {
    out(`   ${line}`);
    out('');
  }

  out('NOTE: A negative value can be used to disable specific default sizes/limits.');
  process.exit(code);
}


type Option =
  | {apply: number; combine: number}
  | {apply?: number; combine?: number}
  | number
  | [number, number]
  | string;

type ComputedFields = 'batchSize' | 'numWorkers' | 'workerType';
export interface Options extends Partial<Omit<Configuration, ComputedFields>> {
  // NOTE: merged with below - input/output/worker are required fields
  threads: Option;
  processes: Option;
  batchSize: Option;
}

export class Options {
  input!: string;
  output!: string;
  worker!: string;

  private constructor() {}

  static toConfiguration(options: Options): Configuration {
    let workerType = 'processes' as Configuration['workerType'];
    let numWorkers: Configuration['numWorkers'];

    if (options.processes && options.threads) {
      throw new Error('Cannot simultaneously run with both threads and processes');
    } else if (options.processes) {
      workerType = 'processes';
      numWorkers = parse(options.processes, w => typeof w === 'number' ? w : NUM_WORKERS);
    } else {
      numWorkers = parse(options.threads, w => typeof w === 'number' ? w : NUM_WORKERS);
    }

    const batchSize = parse(options.batchSize, bs => (!bs || bs > 0 ? bs || BATCH_SIZE : Infinity));
    const maxFiles =
      typeof options.maxFiles !== 'number'
        ? MAX_FILES
        : options.maxFiles > 0
          ? options.maxFiles
          : Infinity;

    return {
      ...options,
      workerType,
      numWorkers,
      maxFiles,
      batchSize,
      uneven: options.uneven || (numWorkers.combine ? 1 / numWorkers.combine : 1),
      dryRun: !!options.dryRun,
      all: !!options.all,
      accept: () => 1,
    };
  }
}

function parse(opt: Option | undefined, fallback: (n?: number) => number) {
  if (typeof opt === 'number') {
    const val = fallback(opt);
    return {apply: val, combine: val};
  } else if (typeof opt === 'string') {
    const [a, c] = opt.split(',').map(n => Number(n));
    const val = fallback(a);
    return {apply: val, combine: c ? fallback(c) : val};
  } else if (Array.isArray(opt)) {
    const val = fallback(opt[0]);
    return {apply: val, combine: opt.length > 1 ? fallback(opt[1]) : val};
  } else if (typeof opt === 'object') {
    return {apply: fallback(opt.apply), combine: fallback(opt.combine)};
  } else {
    const val = fallback();
    return {apply: val, combine: val};
  }
}
