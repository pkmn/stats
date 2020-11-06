import * as path from 'path';

import {Dex} from '@pkmn/dex';
import {Generations, Generation} from '@pkmn/data';

import {
  Batch,
  fs,
  handle,
  ID,
  Options,
  toID,
  Worker,
  WorkerConfiguration,
  workerData,
  WorkerData,
} from '../logs';

interface StatsConfiguration extends WorkerConfiguration {
  formats?: Set<ID>;
  legacy?: string;
  all?: boolean;
}

const GENS = new Generations(Dex, e => !!e.exists);
const MONOTYPES = new Set(Array.from(GENS.get(8).types).map(type => `mono${type.id}` as ID));

const StatsWorker = new class implements Worker<StatsConfiguration> {
  options = {
    formats: {
      alias: ['f', 'format'],
      desc: '-f/--formats: only generate reports for the formats specified instead of all formats',
      parse: (s: string) => new Set(s.split(',').map(toID)),
    },
    legacy: {
      alias: ['l'],
      desc: '-l/--legacy=OUTPUT: generate legacy reports and write them to OUTPUT',
    },
    all: {
      alias: ['a'],
      desc: '-a/--all: include all checks and counters in moveset reports (default: false)',
      parse: Options.boolean,
    },
  };

  async init(config: StatsConfiguration) {
    if (config.dryRun) return;

    await fs.mkdir(config.output, {recursive: true});

    if (config.legacy) {
      await fs.mkdir(config.legacy, {recursive: true});
      const monotype = path.resolve(config.legacy, 'monotype');
      await fs.mkdir(monotype);
      await Promise.all([...mkdirs(config.legacy), ...mkdirs(monotype)]);
    }
  }

  accept(config: StatsConfiguration) {
    return (format: ID) => {
      if (
        (config.formats && !config.formats.has(format)) ||
        format.startsWith('seasonal') ||
        format.includes('random') ||
        format.includes('metronome' || format.includes('superstaff'))
      ) {
        return 0;
      } else if (format === 'gen8monotype') {
        // Given that we compute all the monotype team tags for gen8monotype, we need to
        // weight the format to make sure a batch uses up approximately the same amount
        // of memory during computation compared to the other formats.
        return MONOTYPES.size + 1;
      } else {
        return 1;
      }
    };
  }

  async apply(batches: Batch[], config: StatsConfiguration) {

  }

  async combine(formats: ID[], config: StatsConfiguration) {

  }
}

function mkdirs(dir: string) {
  const mkdir = (d: string) => fs.mkdir(path.resolve(dir, d));
  return [mkdir('chaos'), mkdir('leads'), mkdir('moveset'), mkdir('metagame')];
}

export const init = StatsWorker.init;
export const accept = StatsWorker.accept;
export const options = StatsWorker.options;
// FIXME register(StatsWorker);

if (workerData) {
  handle(StatsWorker, workerData as WorkerData<StatsConfiguration>).catch(console.error);
}
