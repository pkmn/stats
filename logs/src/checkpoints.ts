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

  constructor(format: ID, day: string, shard?: string) {
    this.format = format;
    this.day = day;
    this.shard = shard;
  }

  abstract serialize(): string;

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
};

export class EmptyCheckpoint extends Checkpoint {
  serialize() {
    return '';
  }
}

export class JSONCheckpoint<T> extends Checkpoint {
  readonly data: T;

  constructor(format: ID, day: string, data: T, shard?: string) {
    super(format, day, shard);
    this.data = data;
  }

  serialize() {
    return JSON.stringify(this.data);
  }

  static async read<T>(storage: CheckpointStorage, format: ID, day: string, shard?: string) {
    const serialized = await storage.read(format, day);
    const data = JSON.parse(serialized) as T;
    return new JSONCheckpoint(format, day, data, shard);
  }
}
