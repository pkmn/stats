import {ID} from 'ps';

import {Configuration} from './config';
import {CheckpointStorage, LogStorage} from './storage';

export interface Offset {
  day: string;
  log: string;
  index: {local: number; global: number};
}

export interface Batch {
  format: ID;
  begin: Offset;
  end: Offset;
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
    return day.replace(/-/g, '') + '_' + log.slice(log.lastIndexOf('-', i) + 1, i) +
        `_${index.local}` +
        `_${index.global}`;
  }

  static decodeOffset(format: ID, name: string) {
    const [day, log, il, ig] = name.split('_');
    return {
      day: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`,
      log: `battle-${format}-${log}.log.json`,
      index: {local: Number(il), global: Number(ig)},
    };
  }

  toString() {
    return `${this.format}: ${Checkpoints.formatOffsets(this.begin, this.end)}`;
  }
}

export const Checkpoints = new class {
  async restore(config: Configuration, accept: (format: ID) => boolean) {
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
      const format = raw as ID;
      if (accept(format)) continue;

      const checkpoints = existing.get(format);
      if (checkpoints) {
        reads.push(restore(logStorage, config.batchSize, format, checkpoints).then(data => {
          formats.set(format, data);
        }));
      } else {
        if (!config.dryRun) writes.push(checkpointStorage.prepare(format));
        reads.push(restore(logStorage, config.batchSize, format).then(data => {
          formats.set(format, data);
        }));
      }
    }

    await Promise.all([...reads, ...writes]);
    return formats;
  }

  formatOffsets(begin: Offset, end: Offset) {
    return `${begin.day}/${begin.log} (${begin.index.global}) ` +
        `- ${end.day}/${end.log} (${end.index.global})`;
  }
};

async function restore(logStorage: LogStorage, n: number, format: ID, offsets?: Offset[]) {
  const size = 0;
  const batches: Batch[] = [];
  /*
  let o = 0;

  for (const day of (await logStorage.list(format))) {
    const logs = await logStorage.list(format, day);

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
    batches.push(...chunk(format, logs, n, last, i));
  }
  */

  return {size, batches};
}

function chunk(
    format: ID, day: string, logs: string[], n: number, last?: Batch, start = 0, finish?: number) {
  const batches: Batch[] = [];
  if (!finish) finish = logs.length;
  if (!logs.length || start >= finish) return batches;
  const globalIndex = last ? last.end.index.global : 0;

  // If the last batch wasn't complete, we'll try to add to it provided we can make a
  // contiguous range (not always possible in the face of errors or config changes).
  if (last && batchSize(last) < n && start === 0) {
    let i = n - batchSize(last);
    if (i < finish) {
      last.end = {day, log: logs[i], index: {local: i, global: globalIndex + i}};
      start = i;
    } else {
      i = finish - 1;
      last.end = {day, log: logs[i], index: {local: i, global: globalIndex + i}};
      return batches;
    }
  }

  let begin = {day, log: logs[start], index: {local: start, global: globalIndex + start}};
  let i = start + n;
  for (; i < finish; i += n) {
    const end = {day, log: logs[i], index: {local: i, global: globalIndex + i}};
    batches.push({format, begin, end});
    begin = end;
  }

  if (i < finish) {
    i = finish - 1;
    const end = {day, log: logs[i], index: {local: i, global: globalIndex + i}};
    batches.push({format, begin, end});
  }

  return batches;
}

function batchSize(b: Batch) {
  return b.end.index.global - b.begin.index.global;
}
