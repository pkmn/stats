import * as path from 'path';

import {
  Batch,
  fs,
  handle,
  ID,
  Options,
  Storage,
  toID,
  Worker,
  WorkerConfiguration,
  workerData,
  WorkerData,
} from '../logs';

interface AnonConfiguration extends WorkerConfiguration {
  formats?: Set<ID>;
  sample?: number | {
    total: number;
    max: number;
  };
  salt?: string;
  teams?: boolean;
  public?: boolean;
}

// TODO first needs to do a count - split stage does a count, can stuff into workerData?
// TODO can we use `accept` to push sampling up a level? would need accept to work at file level instead of format level...
/// TODO sum up logs over duration, figure out uniform randomness, max for a given format
// formats + max number of files + max % of format + relative weighting of files?

const AnonWorker = new class implements Worker<AnonConfiguration> {
  options = {
    formats: {
      alias: ['f', 'format'],
      desc: '-f/--formats: anonymize the formats specified',
      parse: (s: string) => new Set(s.split(',').map(toID)),
    },
    sample: {
      alias: ['sample'],
      desc: '--sample: TODO',
      parse: (s: string) => {
        const [total, max] = s.split(',');
        if (max) return {total: Number(total), max: Number(max)};
        return Number(total);
      },
    },
    salt: {
      desc: '--salt=SALT: anonymize names by hashing them using the provided salt',
    },
    teams: {
      alias: ['team', 'teamsOnly'],
      desc: '--teamsOnly: anonymize and output teams only and discard the rest of the log',
      parse: Options.boolean,
    },
    public: {
      alias: ['publicOnly'],
      desc: '--public: only anonymize battles which were played publically',
      parse: Options.boolean,
    },
  };

  async init(config: AnonConfiguration) {
    if (config.dryRun || !config.formats) return;

    await fs.mkdir(config.output, {recursive: true});
    const mkdirs = [];
    for (const format of config.formats) {
      mkdirs.push(fs.mkdir(path.resolve(config.output, format)));
    }
    await Promise.all(mkdirs);
  }

  accept(config: AnonConfiguration) {
    return (format: ID) => config.formats?.has(format) ? 1 : 0;
  }

  async apply(batches: Batch[], config: AnonConfiguration) {
    const storage = Storage.connect(config);

  }

  async combine(formats: ID[], config: AnonConfiguration) {

  }
}

export const init = AnonWorker.init;
export const accept = AnonWorker.accept;
export const options = AnonWorker.options;

if (workerData) {
  handle(AnonWorker, workerData as WorkerData<AnonConfiguration>).catch(console.error);
}
