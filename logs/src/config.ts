import * as os from 'os';
import * as path from 'path';

// The maximum number of files we'll potentially have open at once. `ulimit -n` on most systems
// should be at least 1024 by default, but we'll set a more more conservative limit to avoid running
// into EMFILE errors. Each worker will be able to open (maxFiles / numWorkers) files which is also
// more conservative, but coordinating the exact number of files open across processes is most
// likely not worth the complexity or coordination overhead.
const MAX_FILES = 256;

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
  workspace: string;

  begin?: string;
  end?: string;

  worker: {
    type: 'threads' | 'processes';
    path: string;
    num: {apply: number; combine: number};
  };

  maxFiles: number;
  strict: boolean;
  dryRun: boolean;
}

export const ALIASES = {
  input: ['i', 'in'],
  output: ['o', 'out'],
  worker: ['w'],
  workspace: ['s'],
  begin: ['b', 'start'],
  end: ['e', 'finish'],
  threads: ['t', 'thread'],
  processes: ['p', 'process'],
  maxFiles: ['n', 'files'],
  debug: ['v', 'verbose'],
  dryRun: ['d', 'dry'],
  strict: [],
};

export function usage(
  code: number,
  preamble: string,
  options: Array<{name: string; options: {[option: string]: {desc: string | string[]}}}> = []
) {
  const out = !code ? console.log : console.error;

  for (const [i, line] of preamble.split('\n').entries()) {
    if (line) {
      out(i ? `  ${line}` : line);
    } else {
      out('');
    }
  }

  out('');
  out('Options:');
  out('');
  out('  -i INPUT, --input INPUT');
  out('');
  out('    Process data from INPUT. This can either be a path to the root of a logs');
  out('    corpus (e.g. smogon/pokemon-showdown\'s logs/ directory), the path to a');
  out('    logs archive, or an individual month worth of logs (in which case --begin');
  out('    and --end are inferred');
  out('');
  out('  -o OUTPUT, --output OUTPUT');
  out('');
  out('    Export results to OUTPUT - this currently must be a path to a directory');
  out('    that will be created if it does not already exist.');
  out('');
  out('  -w WORKER, --worker WORKER');
  out('');
  out('    Process data with WORKER, where the worker may either be a predefined');
  out('    identifier or the path to the worker code to be used.');
  out('');
  out('  -s WORKSPACE, --workspace WORKSPACE');
  out('');
  out('    Write intermediate information to WORKSPACE for recovery. If this flag is');
  out('    not provided, a temporary directory will be created to serve as the');
  out('    workspace and will be deleted upon exit. To allow for rerunning in the');
  out('    event that an error occurs, passing in a path to a directory here is');
  out('    strongly recommended. The directory will be created if it does not already');
  out('    exist.');
  out('');
  out('  -b WHEN, --begin WHEN');
  out('');
  out('    If set, only process data from directories in the INPUT that are >= WHEN,');
  out('    where WHEN is a \'YYYY-MM\' or \'YYYY-MM-DD\' date string. Note that');
  out('    smogon/pokemon-showdown logs are written in the server\'s local time zone');
  out('    (not UTC). Note *both* --begin and --end are inclusive.');
  out('');
  out('  -e WHEN, --end WHEN');
  out('');
  out('    If set, only process data from directories in the INPUT that are <= WHEN,');
  out('    where WHEN is a \'YYYY-MM\' or \'YYYY-MM-DD\' date string. Note that');
  out('    smogon/pokemon-showdown logs are written in the server\'s local time zone');
  out('    (not UTC). Note *both* --begin and --end are inclusive.');
  out('');
  out('  -t N(,M), --threads N(,M)');
  out('');
  out('    Process the logs using N worker threads (default: NUM_CORES-1). Using this');
  out('    in combination with the --processes flag will result in an error. Threads');
  out('    will be used as the concurrency primitive by default. If M is also provided');
  out('    then max{N, M} threads will be started but at most N workers will be used');
  out('    concurrently during the apply stage and M during the combine stage.');
  out('');
  out('  -p N(,M), --processes N(,M)');
  out('');
  out('    Process the logs using N worker processes (default: NUM_CORES-1). Using');
  out('    this in combination with the --threads flag will result in an error.');
  out('    Threads will be used as the concurrency primitive by default. If M is also');
  out('    provided then max{N, M} processes will be started but at most N workers');
  out('    will be used concurrently during the apply stage and M during the combine');
  out('    stage.');
  out('');
  out('  -n N, --maxFiles N');
  out('');
  out('    Open up to N files across all workers (default: 256). This should always');
  out('    be configured to be less than `ulimit -n`.');
  out('');
  out('  -d, --dryRun');
  out('');
  out('    Skip actually performing any processing (default: false). Useful when');
  out('    combined with the --verbose flag to see what work might be done.');
  out('');
  out('  -v, --verbose');
  out('');
  out('    Log output while processing (default: false). Logging output (especially');
  out('    to a terminal) will naturally have negative performance implications.');
  out('');
  out('  --strict');
  out('');
  out('    Exit immediately when an error occurs as opposed to simply logging.');
  out('');

  for (const worker of options) {
    if (!worker.options) continue;
    out(`[${worker.name}] Worker Options:`);
    out('');
    for (const option in worker.options) {
      const desc = worker.options[option].desc;
      if (typeof desc === 'string') {
        out(`   ${desc}`);
      } else {
        for (const [i, d] of desc.entries()) {
          out(`${i ? '    ' : '  '}${d}`);
          if (!i && desc.length > 1) out('');
        }
      }
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

type ComputedFields = 'worker' | 'begin' | 'end';
export interface Options extends Partial<Omit<Configuration, ComputedFields>> {
  // NOTE: merged with below - input/output/worker are required fields
  begin?: string;
  end?: string;
  threads?: Option;
  processes?: Option;
}

const YYYYMM = /^\d{4}-\d{2}$/;
const DATE = /^\d{4}-\d{2}(-\d{2})?$/;

export class Options {
  input!: string;
  output!: string;
  worker!: string;
  workspace!: string;

  private constructor() {}

  static toConfiguration(options: Options, parsers: {
    [option: string]: { parse?: (s: string) => any};
  } = {}): Configuration {
    let type: Configuration['worker']['type'] = 'processes';
    let num: Configuration['worker']['num'];

    if (!options.input) throw new Error('Input must be specified');
    if (!options.output) throw new Error('Output must be specified');
    if (!options.worker) throw new Error('Worker must be specified');

    let input = options.input;
    let begin: string | undefined;
    let end: string | undefined;
    if (YYYYMM.test(path.basename(options.input))) {
      input = path.dirname(options.input);
      begin = end = path.basename(options.input);
    }

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
    const maxFiles =
      typeof options.maxFiles !== 'number'
        ? MAX_FILES
        : options.maxFiles > 0
          ? options.maxFiles
          : Infinity;

    return {
      ...options,
      input,
      begin: parseDate(options.begin, begin),
      end: parseDate(options.end, end),
      worker,
      maxFiles,
      strict: !!options.strict,
      dryRun: !!options.dryRun,
    };
  }

  static number(n: string | number) {
    if (typeof n === 'number') return n;
    return isNaN(Number(n)) ? undefined : Number(n);
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

function parseDate(date?: string, fallback?: string) {
  if (!date) return fallback;
  if (!DATE.test(date)) throw new Error(`Invalid YYYY-MM(-DD) date '${date}'`);
  if (fallback && date && !date.startsWith(fallback)) {
    throw new Error(`'${date}' is outside the range of logs in '${fallback}'`);
  }
  return date;
}
