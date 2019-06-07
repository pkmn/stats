import * as path from 'path';

import {Checkpoint, Offset} from './checkpoint';
import * as fs from './fs';

const CMP = Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare;

export interface LogStorage {
  list(raw?: string, day?: string): Promise<string[]>;
  select(raw: string, offset?: Offset, end?: Offset): Promise<string[]>;
  read(log: string): Promise<string>;
}

export class LogStorage {
  static connect(configuration: {logs: string}): LogStorage {
    // TODO: support DatabaseStorage as well
    return new LogFileStorage(options.logs);
  }
}

class LogFileStorage implements LogStorage {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  list(raw?: string, day?: string) {
    if (!raw) return fs.readdir(this.dir).sort(CMP);
    const formatDir = path.resolve(this.dir, raw);
    if (!day) return fs.readdir(formatDir).sort(CMP);
    const dayDir = path.resolve(formatDir, day);
    return fs.readdir(dayDir).sort(CMP);
  }

  async select(raw: string, begin?: Offset, end?: Offset): Promise<string[]> {
    const range: string[] = [];

    for (const day of await this.list(raw)) {
      if (begin && day < end.day) continue;
      if (end && day > end.day) break;

      const logs = await this.list(raw, day);
      if (begin && day === begin.day) {
        const n = day === end.day ? end.index : logs.length;
        for (let i = begin.index; i < n; i++) {
          range.push(path.join(raw, day, log));
        }
      } else if (end && day === end.day) {
        // NOTE: If begin is for the same day we would handle it above.
        for (let i = 0; i < end.index; i++) {
          range.push(path.join(raw, day, log));
        }
      } else {
        for (const log of logs) {
          range.push(path.join(raw, day, log));
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
  init(): Promise<void>;
  prepare(format: ID): Promise<void>;
  list(format: ID): Promise<Array<[Offset, Offset]>>;
  offsets(): Promise<Map<ID, Offset[]>>;
  read(format: ID, begin: Offset, end: Offset): Promise<string>;
  write(checkpoint: Checkpoint): Promise<void>;
}

export class CheckpointStorage {
  static connect(config: {checkpoints?: string}): LogStorage {
    return config.checkpoints === 'memory' ? new MemoryCheckpointFileSystem() :
                                             new CheckpointFileStorage(options.checkpoints);
  }
}

export class CheckpointFileStorage implements CheckpointStorage {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir!;
  }

  async init() {
    if (!this.dir) {
      this.dir = await fs.mkdtemp('checkpoints-');
    } else {
      await fs.mkdir(this.dir, {recursive: true});
    }
  }

  async prepare(format: ID) {
    return fs.mkdir(path.resolve(this.dir, format);
  }

  list(format: ID) {
    const filenames = fs.readdir(path.resolve(this.dir, format)).sort(CMP);
    return filenames.map(name => this.fromName(name));
  }

  async offsets() {
    const checkpoints: Map<ID, Offset[]> = new Map();
    for (const format of await fs.readdir(this.dir)) {
      const offsets: Offset[] = [];
      const dir = path.resolve(this.dir, format);
      for (const name of (await fs.readdir(dir)).sort(CMP)) {
        offsets.push(Checkpoint.decodeOffset(name));
      }
      checkpoints.set(format as ID, offsets);
    }
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
    return = path.resolve(this.dir, format, `${b}-${e}.json.gz`);
  }

  private fromName(filename: string): [Offset, Offset] {
    filename = path.basename(filename, '.json.gz');
    const [b, e] = filename.split('-');
    return [Checkpoint.decodeOffset(b), Checkpoint.decodeOffset(e)];
  }
}

export class CheckpointMemoryStorage implements CheckpointStorage {
  readonly checkpoints: Map<ID, Map<string, string>> = new Map();

  async init() {}

  async prepare(format: ID) {
    this.checkpoints.set(format, new Map());
  }

  async list(format: ID) {
    const names = Object.values(this.checkpoints.get(format)!).sort(CMP);
    return names.map(name => this.fromName(name));
  }

  async offsets() {
    const checkpoints: Map<ID, Offset[]> = new Map();
    for (const [format, data] of this.checkpoints.entries()) {
      const offsets = Object.keys(data).sort(CMP).map(name => Checkpoint.decodeOffset(name));
      checkpoints.set(format, offsets);
    }
    return checkpoints;
  }

  async read(format: ID, begin: Offset, end: Offset) {
    this.checkpoints.get(format)!.get(this.toName(begin, end));
  }

  async write(checkpoint: Checkpoint) {
    const checkpoints = this.checkpoints.get(checkpoint.format)!;
    checkpoints.set(this.toName(begin, end), checkpoint.serialize());
  }

  private toName(begin: Offset, end: Offset) {
    const b = Checkpoint.encodeOffset(begin);
    const e = Checkpoint.encodeOffset(end);
    return `${b}-${e}`;
  }

  private fromName(name: string): [Offset, Offset] {
    const [b, e] = name.split('-');
    return [Checkpoint.decodeOffset(b), Checkpoint.decodeOffset(e)];
  }
}
