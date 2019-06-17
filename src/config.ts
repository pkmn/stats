import * as os from 'os';
import { ID } from 'ps';

// The maximum number of files we'll potentially have open at once. `ulimit -n` on most systems
// should be at least 1024 by default, but we'll set a more more conservative limit to avoid running
// into EMFILE errors. Each worker will be able to open (maxFiles / numWorkers) files which is also
// more conservative, but coordinating the exact number of files open across processes is more
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

export interface Configuration {
  logs: string;
  worker: 'stats' | 'anon';
  checkpoints?: string;
  numWorkers: { apply: number; combine: number };
  maxFiles: number;
  batchSize: { apply: number; combine: number };
  dryRun: boolean;
  all: boolean;
  accept: (format: ID) => number;
}

type Option =
  | { apply: number; combine: number }
  | { apply?: number; combine?: number }
  | number
  | [number, number]
  | string;

export interface Options extends Partial<Omit<Configuration, 'batchSize' | 'numWorkers'>> {
  logs: string;
  worker: 'stats' | 'anon';
  batchSize: Option;
  numWorkers: Option;
}

export class Options {
  logs: string;

  constructor(logs: string) {
    this.logs = logs;
  }

  toOptions() {
    return Options.toConfiguration(this);
  }

  static toConfiguration(options: Options) {
    const numWorkers = parse(options.numWorkers, w => w || os.cpus().length - 1);
    const batchSize = parse(options.batchSize, bs => (!bs || bs > 0 ? bs || BATCH_SIZE : Infinity));
    const maxFiles =
      typeof options.maxFiles !== 'number'
        ? MAX_FILES
        : options.maxFiles > 0
        ? options.maxFiles
        : Infinity;
    return Object.assign({}, options, {
      numWorkers,
      maxFiles,
      batchSize,
      dryRun: !!options.dryRun,
      all: !!options.all,
      accept: () => 1,
    });
  }
}

function parse(opt: Option | undefined, fallback: (n?: number) => number) {
  if (typeof opt === 'number') {
    return { apply: fallback(opt), combine: fallback() };
  } else if (typeof opt === 'string') {
    const [a, c] = opt.split(',').map(n => Number(n));
    return { apply: fallback(a), combine: fallback(c) };
  } else if (Array.isArray(opt)) {
    return { apply: fallback(opt[0]), combine: fallback(opt[1]) };
  } else if (typeof opt === 'object') {
    return { apply: fallback(opt.apply), combine: fallback(opt.combine) };
  } else {
    return { apply: fallback(), combine: fallback() };
  }
}
