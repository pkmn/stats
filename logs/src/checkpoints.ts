/* eslint-disable */
import {Configuration, ID} from './config';
import {CheckpointStorage} from './storage';

export interface Batch {
  format: ID;
  day: string;
}

export abstract class Checkpoint implements Batch {
  readonly format: ID;
  readonly day: string;
  readonly shard?: string;

  readonly suffix: string;

  constructor(format: ID, day: string, shard?: string, suffix?: string) {
    this.format = format;
    this.day = day;
    this.shard = shard;
    this.suffix = suffix || '';
  }

  abstract serialize(): Buffer;

  toString() {
    return `${this.format}${this.shard ? `-${this.shard}` : ''}/${this.day}`;
  }
}

export const Checkpoints = new class {
  restore(config: Configuration, accept: (format: ID) => number) {
    return null! as Promise<Map<ID, {batches: Batch[]; size: number}>>; // FIXME
  }

  empty(format: ID, day: string, shard?: string) {
    return new EmptyCheckpoint(format, day, shard);
  }

  json<T>(format: ID, day: string, data: T, shard?: string) {
    return new JSONCheckpoint<T>(format, day, data, shard);
  }

  binary(format: ID, day: string, data: Buffer, shard?: string, suffix?: string) {
    return new BinaryCheckpoint(format, day, data, shard);
  }
};

export class EmptyCheckpoint extends Checkpoint {
  serialize() {
    return Buffer.from('');
  }
}

export class JSONCheckpoint<T> extends Checkpoint {
  readonly data: T;

  constructor(format: ID, day: string, data: T, shard?: string) {
    super(format, day, shard, '.json.gz');
    this.data = data;
  }

  serialize() {
    return Buffer.from(JSON.stringify(this.data));
  }

  static async read<T>(storage: CheckpointStorage, format: ID, day: string, shard?: string) {
    const serialized = (await storage.read(format, day, '.json.gz')).toString('utf8');
    const data = JSON.parse(serialized) as T;
    return new JSONCheckpoint(format, day, data, shard);
  }
}

export class BinaryCheckpoint extends Checkpoint {
  readonly buf: Buffer;

  constructor(format: ID, day: string, buf: Buffer, shard?: string, suffix?: string) {
    super(format, day, shard, suffix);
    this.buf = buf;
  }

  serialize() {
    return this.buf;
  }
}
