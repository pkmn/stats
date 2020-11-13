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

export function toID(text: any): ID {
  if (text?.id) text = text.id;
  if (typeof text !== 'string' && typeof text !== 'number') return '';
  return ('' + text).toLowerCase().replace(/[^a-z0-9]+/g, '') as ID;
}

export interface Configuration {
  input: string;
  output: string;
  checkpoints: string;

  begin?: Date;
  end?: Date;

  worker: {
    type: 'threads' | 'processes';
    path: string;
    num: {apply: number; combine: number};
  };

  maxFiles: number;
  batchSize: {apply: number; combine: number};
  strict: boolean;
  dryRun: boolean;
}

export const ALIASES = {
  input: ['i', 'in'],
  output: ['o', 'out'],
  worker: ['w'],
  checkpoints: ['c', 'checkpoint'],
  begin: ['b', 'start'],
  end: ['e', 'finish'],
  threads: ['t', 'thread'],
  processes: ['p', 'process'],
  maxFiles: ['n', 'files'],
  batchSize: ['s', 'size', 'batch'],
  debug: ['v', 'verbose'],
  dryRun: ['d', 'dry'],
  strict: [],
};

export function usage(
  code: number,
  preamble: string,
  options: Array<{name: string, options: {[option: string]: {desc: string}}}> = []
) {
  const out = !code ? console.log : console.error;

  for (const [i, line] of preamble.split('\n').entries()) {
    if (line) {
      out(i ? ` ${line}` : line);
    } else {
      out('');
    }
  }

  // FIXME Static Width (Plain Regex)
const wrap = (s: string) => s.replace(/(?![^\n]{1,80}$)([^\n]{1,80})\s/g, '$1\n');

  /* eslint-disable max-len */
  out('');
  out(' Options:');
  out('');
  out('   -i INPUT, --input INPUT');
  out('');
  out('      Process data from INPUT (see INPUT above).');
  out('');
  out('   -o OUTPUT, --output OUTPUT');
  out('');
  out('      Export results to OUTPUT (see OUPUT above).');
  out('');
  out('   -w WORKER, --worker WORKER');
  out('');
  out('      Process data with WORKER (see TYPE above).');
  out('');
  out('   -c WORKSPACE, --workspace WORKSPACE');
  out('');
  out('      Write intermediate information to WORKSPACE for recovery.');
  out('');
  out('   -b WHEN, --begin WHEN');
  out('')
  out('      If set, only process data which has a timestamp >= WHEN');
  out('');
  out('   -e WHEN, --end WHEN');
  out('')
  out('      If set, only process data which has a timestamp < WHEN');
  out('');
  out('   -t N, --threads N');
  out('')
  out('      Process the logs using N worker threads (default: NUM_CORES-1)');
  out('');
  out('   -p N, --processes N');
  out('')
  out('      Process the logs using N worker processes (default: NUM_CORES-1)');
  out('');
  out('   -n N, --maxFiles N');
  out('')
  out('      Open up to N files across all workers (default: 256)');
  out('');
  out('   -s N(,M), --batchSize N(,M)');
  out('')
  out('      Write checkpoints at least every N files per format (default: 8096)'); // TODO
  out('');
  out('   -d, --dryRun');
  out('')
  out('      Skip actually performing any processing (default: false)');
  out('');
  out('   -v, --verbose');
  out('')
  out('      Log output while processing (default: false)');
  out('');
  out('   --strict')
  out('')
  out('      TODO');
  out('');
  out('   --constrained')
  out('')
  out('      TODO');
  out('');
  /* eslint-enable max-len */

  for (const worker of options) {
    if (!worker.options) continue;
    out(` [${worker.name}] Worker Options:`);
    out('');
    for (const option in worker.options) {
      out(`   ${worker.options[option].desc}`);
      out('');
    }
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

type ComputedFields = 'worker' | 'batchSize' | 'begin' | 'end';
export interface Options extends Partial<Omit<Configuration, ComputedFields>> {
  // NOTE: merged with below - input/output/worker are required fields
  begin?: Date | string | number;
  end?: Date | string | number;
  threads?: Option;
  processes?: Option;
  batchSize?: Option;
}

export class Options {
  input!: string;
  output!: string;
  worker!: string;
  checkpoints!: string;

  private constructor() {}

  static toConfiguration(options: Options, parsers: {
    [option: string]: { parse?: (s: string) => any}
  } = {}): Configuration {
    let type: Configuration['worker']['type'] = 'processes';
    let num: Configuration['worker']['num'];

    if (!options.input) throw new Error('Input must be specified');
    if (!options.output) throw new Error('Output must be specified');
    if (!options.worker) throw new Error('Worker must be specified');

    for (const o in options) {
      const option = o as keyof Options;
      if (parsers[option]?.parse) {
        (options as any)[option] = parsers[option].parse!(options[option] as string);
      }
    }

    if (options.processes && options.threads) {
      throw new Error('Cannot simultaneously run with both threads and processes');
    } else if (options.processes) {
      num = parseOption(options.processes, w => typeof w === 'number' ? w : NUM_WORKERS);
    } else {
      type = 'threads';
      num = parseOption(options.threads, w => typeof w === 'number' ? w : NUM_WORKERS);
    }

    const worker = {path: options.worker, type, num};
    const batchSize =
      parseOption(options.batchSize, bs => (!bs || bs > 0 ? bs || BATCH_SIZE : Infinity));
    const maxFiles =
      typeof options.maxFiles !== 'number'
        ? MAX_FILES
        : options.maxFiles > 0
          ? options.maxFiles
          : Infinity;

    return {
      ...options,
      begin: parseDate(options.begin),
      end: parseDate(options.end),
      worker,
      maxFiles,
      batchSize,
      strict: !!options.strict,
      dryRun: !!options.dryRun,
    };
  }

  static number(n: string | number) {
    if (typeof n === 'number') return n;
    return Number(n) || undefined;
  }

  static boolean(b: string | boolean) {
    if (typeof b === 'boolean') return b;
    return ['true', 't', '1'].includes(b.toLowerCase());
  }
}

function parseOption(opt: Option | undefined, fallback: (n?: number) => number) {
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

function parseDate(date?: Date | string | number) {
  if (!date) return undefined;
  return (typeof date === 'string' || typeof date === 'number') ? new Date(date) : date;
}
