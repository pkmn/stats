/* eslint-disable */
import * as path from 'path';

import {Batch, Checkpoint} from './checkpoints';
import {ID} from './config';
import * as fs from './fs';

const collator = Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
export const CMP = (a: string, b: string) => collator.compare(a, b);

export interface LogStorage {
  list(format?: ID, day?: string): Promise<string[]>;
  select(format: ID, begin?: string, end?: string): Promise<string[]>;
  read(log: string): Promise<string>;
}

export const LogStorage = new class {
  connect(config: {input: string | LogStorage}): LogStorage {
    if (typeof config.input === 'string') {
      return new LogFileStorage(config.input);
    }
    return config.input;
  }
};

export class LogFileStorage implements LogStorage {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async list(format?: ID, day?: string) {
    if (!format) return (await fs.readdir(this.dir)).sort(CMP);
    const formatDir = path.resolve(this.dir, format);
    if (!day) return (await fs.readdir(formatDir)).sort(CMP);
    const dayDir = path.resolve(formatDir, day);
    return (await fs.readdir(dayDir)).sort(CMP);
  }

  async select(format: ID, begin?: string, end?: string): Promise<string[]> {
    const range: string[] = [];

    for (const day of await this.list(format)) {
      if (begin && CMP(day, begin) < 0) continue;
      if (end && CMP(day, end) > 0) break;

      const logs = await this.list(format, day);
      for (const log of logs) {
        range.push(path.join(format, day, log));
      }
    }

    return range;
  }

  async read(log: string) {
    return (await fs.readFile(path.resolve(this.dir, log))).toString('utf8');
  }
}

export interface CheckpointStorage {
  // creates directory
  init(): Promise<string>;
  // creates directory for format (and shard)
  prepare(format: ID, shard?: string): Promise<void>;
  // returns all the batches that have been processed (and shard)
  list(format: ID, shard?: string): Promise<Batch[]>;
  // FIXME
  offsets(): Promise<Map<ID, Batch[]>>;
  // reads a specific checkpoint
  read(format: ID, day: string, shard?: string, suffix?: string): Promise<Buffer>;
  // Writes a checkpoint (calls serialize)
  write(checkpoint: Checkpoint): Promise<void>;
}

export const CheckpointStorage = new class {
  connect(config: {checkpoints?: string | CheckpointStorage; dryRun?: boolean}): CheckpointStorage {
    if (config.dryRun) return new CheckpointMemoryStorage();
    if (!config.checkpoints || typeof config.checkpoints === 'string') {
      return new CheckpointFileStorage(config.checkpoints);
    }
    return config.checkpoints;
  }
};

export const Storage = new class {
  connect(config: {
    input: string | LogStorage;
    checkpoints?: string | CheckpointStorage;
    dryRun?: boolean;
  }) {
    return {logs: LogStorage.connect(config), checkpoints: CheckpointStorage.connect(config)};
  }
};

export class CheckpointFileStorage implements CheckpointStorage {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir!; // set below in init()
  }

  async init() {
    if (!this.dir) {
      this.dir = await fs.mkdtemp('checkpoints-');
    } else {
      try {
        await fs.mkdir(this.dir, {recursive: true});
      } catch (err: any) {
        if (err.code !== 'EEXIST') throw err;
      }
    }
    return this.dir;
  }

  async prepare(format: ID, shard?: string) {
    return fs.mkdir(path.resolve(this.dir, `${format}${shard ? `-${shard}` : ''}`));
  }

  async list(format: ID, shard?: string) {
    const filenames = (await fs.readdir(path.resolve(this.dir, format))).sort(CMP);
    return filenames.map(name => this.fromName(format, name));
  }

  async offsets() {
    const checkpoints: Map<ID, Batch[]> = new Map();
    const reads = [];
    for (const raw of await fs.readdir(this.dir)) {
      const format = raw as ID;
      reads.push(
        this.list(format).then(batches => {
          checkpoints.set(format, batches);
        })
      );
    }
    await Promise.all(reads);
    return checkpoints;
  }

  read(format: ID, day: string, suffix?: string) {
    return fs.readFile(this.toName(format, day, suffix));
  }

  write(checkpoint: Checkpoint) {
    const filename = this.toName(checkpoint.format, checkpoint.day, checkpoint.suffix);
    const compress = checkpoint.suffix.endsWith('.gz') || checkpoint.suffix.endsWith('.gzip');
    return (compress ? fs.writeGzipFile : fs.writeFile)(filename, checkpoint.serialize());
  }

  private toName(format: ID, day: string, suffix?: string) {
    return path.resolve(this.dir, format, `${day}${suffix || ''}`);
  }

  private fromName(format: ID, filename: string) {
    const base = path.basename(filename);
    const ext = base.indexOf('.');
    return {format, day: ext > 0 ? base.slice(0, ext) : base};
  }
}

export class CheckpointMemoryStorage implements CheckpointStorage {
  readonly checkpoints: Map<ID, Map<string, Buffer>> = new Map();

  async init() {
    return '<MEMORY>';
  }

  async prepare(format: ID) {
    this.checkpoints.set(format, new Map());
  }

  async list(format: ID) {
    const days = Array.from(this.checkpoints.get(format)!.keys()).sort(CMP);
    return days.map(day => ({format, day}));
  }

  async offsets() {
    const checkpoints: Map<ID, Batch[]> = new Map();
    for (const [format, data] of this.checkpoints.entries()) {
      const days = Array.from(data.keys()).sort(CMP).map(day => ({format, day}));
      checkpoints.set(format, days);
    }
    return checkpoints;
  }

  async read(format: ID, day: string): Promise<Buffer> {
    return this.checkpoints.get(format)!.get(day)!;
  }

  async write(checkpoint: Checkpoint): Promise<void> {
    let checkpoints = this.checkpoints.get(checkpoint.format)!;
    // Workers don't share memory in main, so a `prepare` call from main wouldn't carry over.
    if (!checkpoints) {
      checkpoints = new Map();
      this.checkpoints.set(checkpoint.format, checkpoints);
    }
    checkpoints.set(checkpoint.day, checkpoint.serialize());
  }
}
