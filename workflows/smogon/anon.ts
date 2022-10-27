import * as path from 'path';

import {Anonymizer, Log, Verifier} from '@pkmn/anon';
import {Dex} from '@pkmn/dex';
import {Generations, Generation} from '@pkmn/data';
import {
  Batch, Checkpoints, CombineWorker, fs, ID, toID,
  Options, Random, register, WorkerConfiguration,
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

const hash = (s: string) => {
  let h = 0;
  if (s.length === 0) return h;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h = ((h << 5) - h) + c;
    h |= 0;
  }
  return h;
};

const AnonWorker = new class extends CombineWorker<Configuration, State, void> {
  options = {
    formats: {
      alias: ['f', 'format'],
      desc: ['-f, --formats=FORMAT(:RATE),FORMAT2(:RATE2)', 'Anonymize the formats specified.'],
      parse: (s: string) => s.split(',').reduce((m, f) => {
        const [format, rate] = f.split(':');
        m.set(toID(format), Number(rate) || 0);
        return m;
      }, new Map<ID, number>()),
    },
    salt: {
      desc: ['--salt=SALT', 'Anonymize names by hashing them using the provided salt.'],
    },
    teams: {
      alias: ['team', 'teamsOnly'],
      desc: ['--teams', 'Anonymize and output teams only and discard the rest of the log.'],
      parse: Options.boolean,
    },
    public: {
      alias: ['publicOnly'],
      desc: ['--public', 'Only anonymize battles which were played publicly.'],
      parse: Options.boolean,
    },
  };

  async init(config: Configuration) {
    if (!config.dryRun && config.formats) {
      await fs.mkdir(config.output, {recursive: true});
      const mkdirs = [];
      for (const format of config.formats.keys()) {
        mkdirs.push(this.limit(() => fs.mkdir(path.join(this.storage.scratch, format))));
        mkdirs.push(this.limit(() => fs.mkdir(path.join(config.output, format))));
      }
      await Promise.all(mkdirs);
    }
  }

  accept({formats}: Configuration) {
    return (format: ID) => !!formats?.has(format);
  }

  async setupApply({format}: Batch) {
    return {
      gen: forFormat(format),
      format,
      random: new Random(hash(format)),
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
        const name = path.join(this.storage.scratch, state.format, `${raw.id}.${p}.json`);
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
        if (this.config.strict) throw new Error(msg.join('\n'));
        console.error(msg.join('\n') + '\n');
      }
      const name = path.join(this.storage.scratch, state.format, `${raw.id}.log.json`);
      await fs.writeFile(name, JSON.stringify(anon));
    }
  }

  createCheckpoint({format, day}: Batch) {
    return Checkpoints.empty(format, day);
  }

  async setupCombine() {}
  async aggregateCheckpoint() {}

  async writeResults(format: ID) {
    const logs = await fs.readdir(path.join(this.storage.scratch, format));
    const digits = Math.floor(Math.log10(logs.length)) + 1;
    let i = 0;
    const renames: Array<Promise<void>> = [];
    for (const log of logs) {
      const ordinal = `${++i}`.padStart(digits, '0');
      renames.push(this.limit(() => fs.rename(
        path.join(this.storage.scratch, format, log),
        path.join(this.config.output, format, `battle-${format}-${ordinal}.log.json`),
      )));
    }
    if (renames.length) await Promise.all(renames);
  }
};

void register(AnonWorker);
export = AnonWorker;
