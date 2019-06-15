import * as path from 'path';
import {ID} from 'ps';

import {Batch, Checkpoint, Offset,} from './checkpoint';
import * as fs from './fs';

const CMP = Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare;

export interface LogStorage {
  list(format?: ID, day?: string): Promise<string[]>;
  select(format: ID, offset?: Offset, end?: Offset): Promise<string[]>;
  read(log: string): Promise<string>;
}

export class LogStorage {
  static connect(config: {logs: string|LogStorage}): LogStorage {
    // TODO: support DatabaseStorage as well
    if (typeof config.logs === 'string') {
      return new LogFileStorage(config.logs);
    }
    return config.logs;
  }
}

class LogFileStorage implements LogStorage {
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

  async select(format: ID, begin?: Offset, end?: Offset): Promise<string[]> {
    const range: string[] = [];

    for (const day of await this.list(format)) {
      if (begin && day < begin.day) continue;
      if (end && day > end.day) break;

      const logs = await this.list(format, day);
      if (begin && day === begin.day) {
        const n = (end && day === end.day) ? end.index.local + 1 : logs.length;
        for (let i = begin.index.local; i < n; i++) {
          range.push(path.join(format, day, logs[i]));
        }
      } else if (end && day === end.day) {
        // NOTE: If begin is for the same day we would handle it above.
        for (let i = 0; i <= end.index.local; i++) {
          range.push(path.join(format, day, logs[i]));
        }
      } else {
        for (const log of logs) {
          range.push(path.join(format, day, log));
        }
      }
    }

    return range;
  }

  read(log: string) {
    return fs.readFile(path.resolve(this.dir, log), 'utf8');
  }
}

export interface CheckpointStorage {
  init(): Promise<string>;
  prepare(format: ID): Promise<void>;
  list(format: ID): Promise<Batch[]>;
  offsets(): Promise<Map<ID, Batch[]>>;
  read(format: ID, begin: Offset, end: Offset): Promise<string>;
  write(checkpoint: Checkpoint): Promise<void>;
}

export class CheckpointStorage {
  static connect(config: {checkpoints?: string|CheckpointStorage, dryRun?: boolean}):
      CheckpointStorage {
    if (config.dryRun) return new CheckpointMemoryStorage();
    if (!config.checkpoints || typeof config.checkpoints === 'string') {
      return new CheckpointFileStorage(config.checkpoints);
    }
    return config.checkpoints;
  }
}

class CheckpointFileStorage implements CheckpointStorage {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir!;
  }

  async init() {
    if (!this.dir) {
      this.dir = await fs.mkdtemp('checkpoints-');
    } else {
      try {
        await fs.mkdir(this.dir, {recursive: true});
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
    }
    return this.dir;
  }

  async prepare(format: ID) {
    return fs.mkdir(path.resolve(this.dir, format));
  }

  async list(format: ID) {
    const filenames = (await fs.readdir(path.resolve(this.dir, format))).sort(CMP);
    return filenames.map(name => this.fromName(format, name));
  }

  async offsets() {
    const checkpoints: Map<ID, Batch[]> = new Map();
    const reads = [];
    for (const raw of await fs.readdir(this.dir)) {
      const format = raw as ID;
      reads.push(this.list(format).then(batches => {
        checkpoints.set(format, batches);
      }));
    }
    await Promise.all(reads);
    return checkpoints;
  }

  read(format: ID, begin: Offset, end: Offset) {
    return fs.readFile(this.toName(format, begin, end), 'utf8');
  }

  write(checkpoint: Checkpoint) {
    const filename = this.toName(checkpoint.format, checkpoint.begin, checkpoint.end);
    return fs.writeGzipFile(filename, checkpoint.serialize());
  }

  private toName(format: ID, begin: Offset, end: Offset) {
    const b = Checkpoint.encodeOffset(begin);
    const e = Checkpoint.encodeOffset(end);
    return path.resolve(this.dir, format, `${b}-${e}.json.gz`);
  }

  private fromName(format: ID, filename: string) {
    filename = path.basename(filename, '.json.gz');
    const [b, e] = filename.split('-');
    return {
      format,
      begin: Checkpoint.decodeOffset(format, b),
      end: Checkpoint.decodeOffset(format, e)
    };
  }
}

export class CheckpointMemoryStorage implements CheckpointStorage {
  readonly checkpoints: Map<ID, Map<string, string>> = new Map();

  async init() {
    return '<MEMORY>';
  }

  async prepare(format: ID) {
    this.checkpoints.set(format, new Map());
  }

  async list(format: ID) {
    const names = Array.from(this.checkpoints.get(format)!.values()).sort(CMP);
    return names.map(name => this.fromName(format, name));
  }

  async offsets() {
    const checkpoints: Map<ID, Batch[]> = new Map();
    for (const [format, data] of this.checkpoints.entries()) {
      const offsets = Array.from(data.keys()).sort(CMP).map(name => this.fromName(format, name));
      checkpoints.set(format, offsets);
    }
    return checkpoints;
  }

  async read(format: ID, begin: Offset, end: Offset): Promise<string> {
    return this.checkpoints.get(format)!.get(this.toName(begin, end))!;
  }

  async write(checkpoint: Checkpoint): Promise<void> {
    let checkpoints = this.checkpoints.get(checkpoint.format)!;
    // Workers don't share memory in main, so a `prepare` call from main wouldn't carry over.
    if (!checkpoints) {
      checkpoints = new Map();
      this.checkpoints.set(checkpoint.format, checkpoints);
    }
    checkpoints.set(this.toName(checkpoint.begin, checkpoint.end), checkpoint.serialize());
  }

  private toName(begin: Offset, end: Offset) {
    const b = Checkpoint.encodeOffset(begin);
    const e = Checkpoint.encodeOffset(end);
    return `${b}-${e}`;
  }

  private fromName(format: ID, name: string) {
    const [b, e] = name.split('-');
    return {
      format,
      begin: Checkpoint.decodeOffset(format, b),
      end: Checkpoint.decodeOffset(format, e)
    };
  }
}
