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

    const formats: Map<ID, Batch[]> = new Map();

    let existing: Map<ID, Batch[]> = new Map();
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

      const checkpoints = existing.get(format) || [];
      if (!checkpoints.length && !config.dryRun) writes.push(checkpointStorage.prepare(format));
      reads.push(restore(logStorage, config.batchSize, format, checkpoints).then(data => {
        formats.set(format, data);
      }));
    }

    await Promise.all([...reads, ...writes]);
    return formats;
  }

  formatOffsets(begin: Offset, end: Offset) {
    return `${begin.day}/${begin.log} (${begin.index.global}) ` +
        `- ${end.day}/${end.log} (${end.index.global})`;
  }
};

async function restore(logStorage: LogStorage, n: number, format: ID, offsets: Batch[] = []) {
  const batches: Batch[] = [];
  let o = 0;

  for (const day of await logStorage.list(format)) {
    const logs = await logStorage.list(format, day);

    let i = 0;
    // If we have existing offsets from checkpoints, iterate through until we find the ones
    // from this day's logs, and then fill in any gaps that may exist.
    for (; o < offsets.length && offsets[o].begin.day <= day && day < offsets[o].end.day; o++) {
      // This shouldn't really happen, as it would indicate that some logs were deleted...
      if (offsets[i].begin.day < day) continue;

      // Now we're looking at an offset for the current day - we could need to process logs before
      // or after it and before the next offset (gated by previous and next offsets as well as day
      // boundaries)
      const current = offsets[o];
      if (o > 0 && offsets[o - 1].end.day === day) {
        const prev = offsets[o - 1];
        const last = batches.length ? batches[batches.length - 1] : undefined;
        batches.push(...chunk(
            format, day, logs, n, last, prev.end.index.local + 1, current.begin.index.local));
      }
      i = current.end.index.local + 1;  // TODO make sure dont go too far
      if (o < offsets.length - 1 && offsets[o + 1].begin.day === day) {
        const next = offsets[o + 1];
        const last = batches.length ? batches[batches.length - 1] : undefined;
        batches.push(...chunk(format, day, logs, n, last, i, next.begin.index.local));
        i = next.end.index.local + 1;  // TODO make sure dont go too far
      }
    }
    const last = batches.length ? batches[batches.length - 1] : undefined;
    batches.push(...chunk(format, day, logs, n, last, i));
  }

  return batches;
}

// Group the provided logs for the specified format and day into 'chunks' of at most size n,
// between local indices into the logs array begin (inclusive) and finish (exclusive)
function chunk(
    format: ID, day: string, logs: string[], n: number, last?: Batch, start = 0, finish?: number) {
  const batches: Batch[] = [];
  finish = Math.min(finish || logs.length, logs.length);
  if (start >= finish) return batches;
  const globalIndex = last ? last.end.index.global : 0;
  const lastSize = last ? globalIndex - last.begin.index.global : 0;

  // If the last batch wasn't complete, we'll try to add to it provided we can make a
  // contiguous range (not always possible in the face of errors or config changes).
  if (lastSize && lastSize < n && start === 0) {
    let i = n - lastSize - 1;
    if (i < finish) {
      last!.end = {day, log: logs[i], index: {local: i, global: globalIndex + i}};
      start = i + 1;
    } else {
      i = finish - 1;
      last!.end = {day, log: logs[i], index: {local: i, global: globalIndex + i}};
      return batches;
    }
  }

  let begin = {day, log: logs[start], index: {local: start, global: globalIndex + start}};
  let i = start + n - 1;
  for (; i < finish - 1; i += n) {
    const end = {day, log: logs[i], index: {local: i, global: globalIndex + i}};
    batches.push({format, begin, end});
    begin = {day, log: logs[i + 1], index: {local: i + 1, global: globalIndex + i + 1}};
  }

  if (i < finish) {
    i = finish - 1;
    const end = {day, log: logs[i], index: {local: i, global: globalIndex + i}};
    batches.push({format, begin, end});
  }

  return batches;
}
