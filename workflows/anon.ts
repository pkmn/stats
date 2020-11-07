import * as path from 'path';

import {Anonymizer, Verifier} from '@pkmn/anon';
import {Dex} from '@pkmn/dex';
import {Generations, Generation} from '@pkmn/data';

import {
  ApplyWorker,
  Batch,
  Checkpoints,
  fs,
  ID,
  Options,
  Random,
  register,
  Statistics,
  toID,
  WorkerConfiguration,
  workerData,
  WorkerData,
} from '@pkmn/logs';

interface Configuration extends WorkerConfiguration {
  formats?: Set<ID>;
  sample?: number | {
    total: number;
    max: number;
  };
  salt?: string;
  teams?: boolean;
  public?: boolean;
}

interface State {
  gen: Generation;
  format: ID;
  random: Random;
  rate: number;
}

const GENS = new Generations(Dex, e => !!e.exists);
const forFormat = (format: ID) =>
  format.startsWith('gen') ? GENS.get(Number(format.charAt(3)) as Generation['num']) : GENS.get(6);

const AnonWorker = new class extends ApplyWorker<Configuration, State> {
  options = {
    formats: {
      alias: ['f', 'format'],
      desc: '-f/--formats: anonymize the formats specified',
      parse: (s: string) => new Set(s.split(',').map(toID)),
    },
    sample: {
      alias: ['sample'],
      desc: '--sample=SAMPLE: sample at either a fixed \'RATE\' or \'TOTAL,MAX\'',
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
      desc: '--teams: anonymize and output teams only and discard the rest of the log',
      parse: Options.boolean,
    },
    public: {
      alias: ['publicOnly'],
      desc: '--public: only anonymize battles which were played publically',
      parse: Options.boolean,
    },
  };

  readonly tmp: string;

  constructor() {
    super();
    // FIXME in checkpoints = Checkpoints.tmp()
    this.tmp = path.resolve(this.config.output, '_');
  }

  async init(config: Configuration) {
    if (config.dryRun || !config.formats) return;

    await fs.mkdir(config.output, {recursive: true});
    await fs.mkdir(this.tmp, {recursive: true});
    const mkdirs = [];
    for (const format of config.formats) {
      mkdirs.push(fs.mkdir(path.join(this.tmp, format)));
    }
    await Promise.all(mkdirs);
  }

  accept(config: Configuration) {
    return (format: ID) => config.formats?.has(format) ? 1 : 0;
  }

  setupApply(format: ID, stats: Statistics): State {
    return {
      gen: forFormat(format),
      format,
      // FIXME base seed on format - need to ensure stable random despite Pool
      random: new Random((workerData as WorkerData<Configuration>).num),
      rate: rate(this.config.sample, stats.sizes[format], stats.total),
    };
  }

  async readLog(log: string, state: State) {
    if (state.random.next() > state.rate) return;

    const raw = JSON.parse(await this.storage.logs.read(log));
    if (raw.private && this.config.public) return;

    if (this.config.teams) {
      const writes = [];
      for (const p of ['p1', 'p2']) {
        const anon = Anonymizer.anonymizeTeam(state.gen, raw[`${p}team`], {salt: this.config.salt});
        const s = JSON.stringify(anon);
        const name = path.join(this.tmp, state.format, `${raw.id}.${p}.json`);
        writes.push(fs.writeFile(name, s));
      }
      await Promise.all(writes);
    } else {
      const verifier = new Verifier();
      const anon = Anonymizer.anonymize(state.gen, raw,  {salt: this.config.salt, verifier});
      if (!verifier.ok()) {
        const msg = [log, Array.from(verifier.names)];
        for (const { input, output } of verifier.leaks) {
          msg.push(`'${input}' -> '${output}'`);
        }
        console.error(msg.join('\n') + '\n');
      }
      const name = path.join(this.tmp, state.format, `${raw.id}.log.json`);
      await fs.writeFile(name, JSON.stringify(anon));
    }
  }

  writeCheckpoint(batch: Batch) {
    return Checkpoints.empty(batch.format, batch.begin, batch.end);
  }

  async combine(formats: ID[]) {
    for (const format of formats) {
      const dir = path.resolve(this.config.output, format);
      await fs.mkdir(dir);
      await this.parallel(
        (await fs.readdir(path.join(this.tmp, format))).entries(),
        ([i, file]) => {
          const name = `${i}${file.slice(file.endsWith('.log.json') ? - 9 : -8)}`;
          return fs.copyFile(path.join(this.tmp, file), path.join(dir, name));
        },
        n => `Waiting for ${n} log(s) from ${format} to be copied`,
      );
      await fs.rmdir(path.join(this.tmp, format), {recursive: true});
    }
  }
}

// NOTE: Sampling rates are going to be wonky if --public is used
function rate(sample: Configuration['sample'], size: number, total: number) {
  if (!sample) return 1;
  if (typeof sample === 'number') return sample;
  return Math.min((size * sample.total) / (total * total), sample.max);
}

register(AnonWorker);
export = AnonWorker;
