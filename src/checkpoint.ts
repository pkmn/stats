import * as path from 'path';
import {ID} from 'ps';

import * as fs from './fs';
import {Configuration} from './main';
import {Storage} from './storage';

const CMP = Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare;

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
  readonly begin: Offset;
  readonly end: Offset;
  readonly filename: string;

  constructor(dir: string, format: ID, begin: Offset, end: Offset) {
    this.begin = begin;
    this.end = end;

    const b = Checkpoint.offsetToName(begin);
    const e = Checkpoint.offsetToName(end);
    this.filename = path.resolve(dir, format, `${b}-${e}.json.gz`);
  }

  write() {
    return fs.writeGzipFile(this.filename, this.serialize());
  }

  abstract serialize(): string;

  static offsetToName(offset: Offset) {
    const {log, day, index} = offset;
    const i = log.length - 9;
    return day.replace(/-/g, '') + '_' + log.slice(log.lastIndexOf('-', i) + 1, i) + `_${index}`;
  }

  static parseFilename(filename: string, raw: string): [string, ID, Offset, Offset] {
    let dir = path.dirname(filename);
    dir = path.dirname(dir);
    const format = path.basename(dir) as ID;
    filename = path.basename(filename, '.json.gz');
    const [b, e] = filename.split('-');
    return [dir, format, nameToOffset(b), nameToOffset(e)];
  }
}

export const Checkpoints = new class {
  async ensureDir(dir?: string) {
    if (!dir) return await fs.mkdtemp('checkpoints-');
    await fs.mkdir(dir, {recursive: true});
    return dir;
  }

  async restore(config: Configuration, accept: (raw: string) => ID | undefined) {
    const formats: Map<ID, {size: number, batches: Batch[]}> = new Map();

    let existing: Map<ID, Offset[]> = new Map();
    try {
      existing = await getOffsets(config);
    } catch (err) {
      if (!config.dryRun) throw err;
    }

    const storage = Storage.connect({dir: config.logs});

    const reads: Array<Promise<void>> = [];
    const writes: Array<Promise<void>> = [];
    for (const raw of (await storage.list())) {
      const format = accept(raw);
      if (!format) continue;

      const checkpoints = existing.get(format);
      if (checkpoints) {
        reads.push(restore(storage, config.batchSize, raw, format, checkpoints).then(data => {
          formats.set(format, data);
        });
      } else {
        if (!config.dryRun) writes.push(fs.mkdir(path.resolve(config.checkpoints, format)));
        reads.push(restore(storage, config.batchSize, raw, format)).then(data => {
          formats.set(format, data);
        });
      }
    }

    await Promise.all([...reads, ...writes]);
    return formats;
  }

  formatOffsets(begin: Offset, end: Offset) {
    return `${begin.day}/${begin.log} (${begin.index}) - ${end.day}/${end.log} (${end.index})`;
  }
};

async function getOffsets(config: Configuration) {
  const checkpoints: Map<ID, Offset[]> = new Map();
  for (const format of await fs.readdir(config.checkpoints)) {
    const offsets: Offset[] = [];
    const dir = path.resolve(config.checkpoints, format);
    for (const name of (await fs.readdir(dir)).sort(CMP)) {
      offsets.push(nameToOffset(name));
    }
    checkpoints.set(format as ID, offsets);
  }
  return checkpoints;
}

function nameToOffset(name: string, raw: string) {
  const [day, log, index] = name.split('_');
  return {
    day: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8}`,
    log: `battle-${raw}-${log}.log.json`,
    index: Number(index),
  };
}

async function restore(storage: Storage, n: number, raw: string, format: ID, offsets?: Offset[]) {
  let size = 0;
  const batches: Batch[] = [];
  let o = 0;

  for (const day of (await storage.list(raw))) {
    const logs = await storage.list(raw, day);

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

  return {size, batches};
}

function chunk(
    raw: string, format: ID, logs: string[], n: number, last?: Batch, start = 0, finish?: number) {
  const batches: Batches[] = [];
  if (!finish) finish = logs.length;
  if (!logs.length || start >= finish) return batches;

  // If the last batch wasn't complete, we'll try to add to it provided we can make a
  // contiguous range (not always possible in the face of errors or config changes).
  if (last && last.size < n && start === 0) {
    const i = n - last.size;
    if (i < finish) {
      last.size = n;
      last.end = nameToOffset(logs[i]);
      start = i;
    } else {
      last.size = finish;
      last.end = nameToOffset(logs[finish - 1]);
      return batches;
    }
  }

  let begin = nameToOffset(logs[start]);
  for (let i = start + n; i < finish; i += n) {
    const end = nameToOffset(logs[i]);
    batches.push({raw, format, begin, end, size: n});
    begin = offset;
  }

  if (i < finish) {
    const end = nameToOffset(logs[finish - 1]);
    batches.push({raw, format, begin, end, size: finish - i});
  }

  return batches;
}
