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
      if (!accept(format)) continue;

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

  let last: Batch|undefined = undefined;
  const index = {local: 0, global: 0};
  const updateIndex = (b: Batch) => {
    index.local = b.end.index.local + 1;
    index.global = b.end.index.global + 1;
    return true;
  };
  for (const day of await logStorage.list(format)) {
    const logs = await logStorage.list(format, day);
    index.local = 0;

    // If we have existing offsets from checkpoints, iterate through until we find the ones
    // from this day's logs, and then fill in any gaps that may exist.
    for (; o < offsets.length && offsets[o].begin.day >= day && day <= offsets[o].end.day; o++) {
      // Now we're looking at an offset for the current day - we could need to process logs before
      // or after it and before the next offset (gated by previous and next offsets as well as day
      // boundaries)
      const current = offsets[o];
      let updated = false;
      if (o === 0) {
        // Fill in between the start and the current offset.
        const before =
            chunk(format, day, logs, n, index.global, last, 0, current.begin.index.local);
        if (before.length) {
          batches.push(...before);
          last = before[before.length - 1];
          updated = updateIndex(last);
        }
      } else if (o > 0 && offsets[o - 1].end.day === day) {
        // Fill in between the previous and current offset.
        const prev = offsets[o - 1];
        const between = chunk(
            format, day, logs, n, index.global, undefined, prev.end.index.local + 1,
            current.begin.index.local);
        if (between.length) {
          batches.push(...between);
          last = between[between.length - 1];
          updated = updateIndex(last);
        }
      }

      if (!updated) updateIndex(current);
    }

    const latest = chunk(format, day, logs, n, index.global, last, index.local);
    if (latest.length) {
      batches.push(...latest);
      last = latest[latest.length - 1];
      index.global = last.end.index.global + 1;
    }
  }

  return batches;
}

// Group the provided logs for the specified format and day into 'chunks' of at most size n,
// between local indices into the logs array begin (inclusive) and finish (exclusive)
function chunk(
    format: ID, day: string, logs: string[], n: number, index: number, last?: Batch, start = 0,
    finish?: number) {
  const batches: Batch[] = [];
  finish = Math.min(typeof finish === 'number' ? finish : logs.length, logs.length);
  if (start >= finish) return batches;
  const lastSize = last ? last.end.index.global - last.begin.index.global + 1 : 0;

  // If the last batch wasn't complete, we'll try to add to it provided we can make a
  // contiguous range (not always possible in the face of errors or config changes).
  if (lastSize && lastSize < n && start === 0) {
    let i = n - lastSize - 1;
    if (i < finish - 1) {
      last!.end = {day, log: logs[i], index: {local: i, global: index + i}};
      start = i + 1;
      index = index + start;
    } else {
      i = finish - 1;
      last!.end = {day, log: logs[i], index: {local: i, global: index + i}};
      return batches;
    }
  }

  let begin = {day, log: logs[start], index: {local: start, global: index}};
  let i = start + n - 1;
  for (; i < finish - 1; i += n) {
    const end = {day, log: logs[i], index: {local: i, global: index + i}};
    batches.push({format, begin, end});
    begin = {day, log: logs[i + 1], index: {local: i + 1, global: index + i + 1}};
  }
  i = finish - 1;
  const end = {day, log: logs[i], index: {local: i, global: index + i}};
  batches.push({format, begin, end});

  return batches;
}
