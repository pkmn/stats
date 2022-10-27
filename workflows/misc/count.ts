import * as path from 'path';

import {
  Batch, Checkpoints, CombineWorker, fs, ID, toID,
  JSONCheckpoint, register, WorkerConfiguration,
} from '@pkmn/logs';

interface Configuration extends WorkerConfiguration {
  formats?: Set<ID>;
}

interface State {
  [player: string]: [number, number, number]; // win, lose, draw
}

const CountWorker = new class extends CombineWorker<Configuration, State> {
  options = {
    formats: {
      alias: ['f', 'format'],
      desc: ['-f, --formats', 'Tally counts for players in just the formats specified.'],
      parse: (s: string) => new Set(s.split(',').map(toID)),
    },
  };

  async init(config: Configuration) {
    if (!config.dryRun) await fs.mkdir(config.output, {recursive: true});
  }

  accept(config: Configuration) {
    return (format: ID) => !config.formats ? true : config.formats.has(format);
  }

  async setupApply() {
    return {};
  }

  async processLog(log: string, state: State) {
    const raw = JSON.parse(await this.storage.logs.read(log));
    const ids = {p1: toID(raw.p1), p2: toID(raw.p2), winner: toID(raw.winner)};
    const p1 = state[ids.p1] || (state[ids.p1] = [0, 0, 0]);
    const p2 = state[ids.p2] || (state[ids.p2] = [0, 0, 0]);
    if (ids.winner === ids.p1) {
      p1[0]++;
      p2[1]++;
    } else if (ids.winner === ids.p2) {
      p1[1]++;
      p2[0]++;
    } else {
      p1[2]++;
      p2[2]++;
    }
  }

  createCheckpoint({format, day}: Batch, state: State): JSONCheckpoint<State> {
    return Checkpoints.json(format, day, state);
  }

  async setupCombine() {
    return {};
  }

  async aggregateCheckpoint({format, day}: Batch, state: State) {
    const checkpoint =
      await JSONCheckpoint.read<State>(this.storage.checkpoints, format, day);

    for (const p in checkpoint.data) {
      const a = state[p] || (state[p] = [0, 0, 0]);
      const b = checkpoint.data[p];
      a[0] += b[0];
      a[1] += b[1];
      a[2] += b[2];
    }
  }

  writeResults(format: ID, state: State) {
    // Sort by total number of games, falling back on alphabetical order of name
    const sorted = Object.entries(state).sort((a, b) =>
      (b[1][0] + b[1][1] + b[1][2]) - (a[1][0] + a[1][1] + a[1][2]) ||
      a[0].localeCompare(b[0]));
    const name = path.resolve(this.config.output, `${format}.json`);
    return fs.writeFile(name, JSON.stringify(sorted));
  }
};

void register(CountWorker);
export = CountWorker;
