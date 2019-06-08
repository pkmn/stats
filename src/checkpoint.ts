import {ID} from 'ps';

import {Configuration} from './config';
import {CheckpointStorage, LogStorage} from './storage';

export interface Offset {
  day: string;
  log: string;
  index: number;
}

export interface Batch {
  raw: string;
  format: string;
  begin: Offset;
  end: Offset;
  size: number;
}

export abstract class Checkpoint {
  readonly format: ID;
  readonly begin: Offset;
  readonly end: Offset;

  constructor(format: ID, begin: Offset, end: Offset) {
    this.format = format;
    this.begin = begin;
    this.end = end;
  }

  abstract serialize(): string;

  static encodeOffset(offset: Offset) {
    const {log, day, index} = offset;
    const i = log.length - 9;
    return day.replace(/-/g, '') + '_' + log.slice(log.lastIndexOf('-', i) + 1, i) + `_${index}`;
  }

  static decodeOffset(name: string, raw: string) {
    const [day, log, index] = name.split('_');
    return {
      day: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`,
      log: `battle-${raw}-${log}.log.json`,
      index: Number(index),
    };
  }
}

export const Checkpoints = new class {
  async restore(config: Configuration, accept: (raw: string) => ID | undefined) {
    const logStorage = LogStorage.connect(config);
    const checkpointStorage = CheckpointStorage.connect(config);

    const formats: Map<ID, {size: number, batches: Batch[]}> = new Map();

    let existing: Map<ID, Offset[]> = new Map();
    try {
      existing = await checkpointStorage.offsets();
    } catch (err) {
      if (!config.dryRun) throw err;
    }

    const reads: Array<Promise<void>> = [];
    const writes: Array<Promise<void>> = [];
    for (const raw of (await logStorage.list())) {
      const format = accept(raw);
      if (!format) continue;

      const checkpoints = existing.get(format);
      if (checkpoints) {
        reads.push(restore(logStorage, config.batchSize, raw, format, checkpoints).then(data => {
          formats.set(format, data);
        }));
      } else {
        if (!config.dryRun) writes.push(checkpointStorage.prepare(format));
        reads.push(restore(logStorage, config.batchSize, raw, format).then(data => {
          formats.set(format, data);
        }));
      }
    }

    await Promise.all([...reads, ...writes]);
    return formats;
  }

  formatOffsets(begin: Offset, end: Offset) {
    return `${begin.day}/${begin.log} (${begin.index}) - ${end.day}/${end.log} (${end.index})`;
  }
};

async function restore(
    logStorage: LogStorage, n: number, raw: string, format: ID, offsets?: Offset[]) {
  let size = 0;
  const batches: Batch[] = [];
  /*
  let o = 0;

  for (const day of (await logStorage.list(raw))) {
    const logs = await logStorage.list(raw, day);

    let i = 0;
    if (offsets) {
      for (; o < offsets.length && offsets[o].begin.day <= day && day < offsets[o].end.day; o++) {
        // This shouldn't really happen, as it indicates that some logs were deleted...
        if (offsets[i].begin.day < day) continue;

        // TODO what about gaps BEFORE!
        const current = offsets[o];
        if (o + 1 < offsets.length) {
          // TODO maybe don't increment o!
          const next = offsets[o + 1];
        } else {
          // If there's no 'next' offset, this is the last offset so we leave the loop and
          // try to fill in batches starting from this index onward. current.end.index + 1
          // may not exist, but `chunk` should already handle that for us.
          i = current.end.index + 1;
        }
      }
    }
    size += logs.length - i;
    const last = batches.length ? batches[batches.length - 1] : undefined;
    batches.push(...chunk(raw, format, logs, n, last, i));
  }
  */

  return {size, batches};
}

function chunk(
    raw: string, format: ID, logs: string[], n: number, last?: Batch, start = 0, finish?: number) {
  const batches: Batch[] = [];
  if (!finish) finish = logs.length;
  if (!logs.length || start >= finish) return batches;

  // If the last batch wasn't complete, we'll try to add to it provided we can make a
  // contiguous range (not always possible in the face of errors or config changes).
  if (last && last.size < n && start === 0) {
    const i = n - last.size;
    if (i < finish) {
      last.size = n;
      last.end = Checkpoint.decodeOffset(logs[i], raw);
      start = i;
    } else {
      last.size = finish;
      last.end = Checkpoint.decodeOffset(logs[finish - 1], raw);
      return batches;
    }
  }

  let begin = Checkpoint.decodeOffset(logs[start], raw);
  let i = start + n;
  for (; i < finish; i += n) {
    const end = Checkpoint.decodeOffset(logs[i], raw);
    batches.push({raw, format, begin, end, size: n});
    begin = end;
  }

  if (i < finish) {
    const end = Checkpoint.decodeOffset(logs[finish - 1], raw);
    batches.push({raw, format, begin, end, size: finish - i});
  }

  return batches;
}
