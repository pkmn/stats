import * as path from 'path';

import {Anonymizer, Log, Verifier} from '@pkmn/anon';
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
  toID,
  WorkerConfiguration,
  workerData,
  WorkerData,
} from '@pkmn/logs';

interface Configuration extends WorkerConfiguration {
  formats?: Map<ID, number>;
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
  format.startsWith('gen') ? GENS.get(format.charAt(3)) : GENS.get(6);

const AnonWorker = new class extends ApplyWorker<Configuration, State> {
  options = {
    formats: {
      alias: ['f', 'format'],
      desc: '-f/--formats=FORMAT(:RATE),FORMAT2(:RATE2) anonymize the formats specified',
      parse: (s: string) => s.split(',').reduce((m, f) => {
        const [format, rate] = f.split(':');
        m.set(toID(format), Number(rate) || 0);
        return m;
      }, new Map<ID, number>()),
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
      desc: '--public: only anonymize battles which were played publicly',
      parse: Options.boolean,
    },
  };

  async init(config: Configuration) {
    if (!config.dryRun && config.formats) {
      await fs.mkdir(config.output, {recursive: true});
      const mkdirs = [];
      for (const format of config.formats.keys()) {
        mkdirs.push(fs.mkdir(path.join(config.output, format)));
      }
      await Promise.all(mkdirs);
    }
  }

  accept(config: Configuration) {
    return (format: ID) => !!config.formats?.has(format);
  }

  setupApply(format: ID): State {
    return {
      gen: forFormat(format),
      format,
      // FIXME base seed on format - need to ensure stable random despite Pool
      random: new Random((workerData as WorkerData<Configuration>).num),
      rate: this.config.formats?.get(format) || 1,
    };
  }

  async processLog(log: string, state: State) {
    if (state.random.next() > state.rate) return;

    const raw = JSON.parse(await this.storage.logs.read(log)) as Log;
    if (raw.roomid.endsWith('pw') && this.config.public) return;

    if (this.config.teams) {
      const writes = [];
      for (const p of ['p1', 'p2']) {
        const anon = Anonymizer.anonymizeTeam(
          state.gen, raw[`${p}team` as 'p1team' | 'p2team'], {salt: this.config.salt}
        );
        const s = JSON.stringify(anon);
        const name = path.join(this.config.output, state.format, `${raw.id}.${p}.json`);
        writes.push(fs.writeFile(name, s));
      }
      await Promise.all(writes);
    } else {
      const verifier = new Verifier();
      const anon = Anonymizer.anonymize(state.gen, raw, {salt: this.config.salt, verifier});
      if (!verifier.ok()) {
        const msg = [log, Array.from(verifier.names)];
        for (const {input, output} of verifier.leaks) {
          msg.push(`'${input}' -> '${output}'`);
        }
        console.error(msg.join('\n') + '\n');
      }
      const name = path.join(this.config.output, state.format, `${raw.id}.log.json`);
      await fs.writeFile(name, JSON.stringify(anon));
    }
  }

  writeCheckpoint(batch: Batch) {
    return Checkpoints.empty(batch.format, batch.day);
  }
} as ApplyWorker<Configuration, State>;

void register(AnonWorker);
export = AnonWorker;