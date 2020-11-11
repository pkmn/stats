import {Configuration, ID} from './config';
import {CheckpointStorage} from './storage';

export interface Offset {
  day: string;
  log: string;
  index: { local: number; global: number };
}

export interface Batch {
  format: ID;
  begin: Offset;
  end: Offset;
}

export abstract class Checkpoint implements Batch {
  readonly format: ID;
  readonly begin: Offset;
  readonly end: Offset;
  readonly shard?: string;

  constructor(format: ID, begin: Offset, end: Offset, shard?: string) {
    this.format = format;
    this.begin = begin;
    this.end = end;
    this.shard = shard;
  }

  abstract serialize(): string;

  static encodeOffset(offset: Offset) {
    const {log, day, index} = offset;
    const i = log.length - 9;

    return (
      day.replace(/-/g, '') +
      '_' +
      log.slice(log.lastIndexOf('-', i) + 1, i) +
      `_${index.local}` +
      `_${index.global}`
    );
  }

  static decodeOffset(format: ID, name: string) {
    const [day, log, il, ig] = name.split('_');
    return {
      day: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`,
      log: `battle-${format}-${log}.log.json`,
      index: { local: Number(il), global: Number(ig) },
    };
  }

  toString() {
    const id = this.format + (this.shard ? `[${this.shard}]` : '');
    return `${id}: ${Checkpoints.formatOffsets(this.begin, this.end)}`;
  }
}

export const Checkpoints = new class {
  async restore(config: Configuration, accept: (format: ID) => number) {
    return null! as Map<ID, {batches: Batch[]; size: number}>;
  }

  formatOffsets(begin: Offset, end: Offset) {
    return (
      `${begin.day}/${begin.log} (${begin.index.global}) ` +
      `- ${end.day}/${end.log} (${end.index.global})`
    );
  }

  empty(format: ID, begin: Offset, end: Offset, shard?: string) {
    return new EmptyCheckpoint(format, begin, end, shard);
  }

  json<T>(format: ID, begin: Offset, end: Offset, data: T, shard?: string) {
    return new JSONCheckpoint<T>(format, begin, end, data, shard);
  }
}

export class EmptyCheckpoint extends Checkpoint {
  serialize() {
    return '';
  }
}

export class JSONCheckpoint<T> extends Checkpoint {
  readonly data: T;

  constructor(format: ID, begin: Offset, end: Offset, data: T, shard?: string) {
    super(format, begin, end, shard);
    this.data = data;
  }

  serialize() {
    return JSON.stringify(this.data);
  }

  static async read<T>(
    storage: CheckpointStorage, format: ID, begin: Offset, end: Offset, shard?: string
  ) {
    const serialized = await storage.read(format, begin, end, shard);
    const data = JSON.parse(serialized) as T;
    return new JSONCheckpoint(format, begin, end, data, shard);
  }
}
