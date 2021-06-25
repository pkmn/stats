import {CheckpointStorage, CMP} from '.';
import {ID} from '../config';
import * as fs from '../fs';
import * as path from 'path';
import {Checkpoint, Batch, Offset} from '../checkpoints';

export class CheckpointFileStorage implements CheckpointStorage {
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
      reads.push(
        this.list(format).then(batches => {
          checkpoints.set(format, batches);
        })
      );
    }
    await Promise.all(reads);
    return checkpoints;
  }

  read(format: ID, begin: Offset, end: Offset) {
    return fs.readFile(this.toName(format, begin, end));
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
      end: Checkpoint.decodeOffset(format, e),
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
      const offsets = Array.from(data.keys())
        .sort(CMP)
        .map(name => this.fromName(format, name));
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
      end: Checkpoint.decodeOffset(format, e),
    };
  }
}
