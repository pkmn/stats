import * as path from 'path';
import {ID} from 'ps';

import * as fs from './fs';
import {Configuration} from './main';
import {Storage} from './storage';

// The checkpoints directory is to be structured as follows:
//
//     <checkpoints>
//     └── format
//         └── YYYYMMDD_N_i-YYYYMMDD-M_j.json.gz

export interface Offset {
  day: string;
  log: string;
  index: number;
}

export interface Batch {
  format: string;  // FIXME: raw
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
}

const CMP = Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare;

export const Checkpoints = new class {
  async ensureDir(dir?: string) {
    if (!dir) return await fs.mkdtemp('checkpoints-');
    await fs.mkdir(dir, {recursive: true});
    return dir;
  }

  // PRECONDITION: More logs may have been added to the end, but no additions/deletions
  // have occurred in the middle since the last run. Note: batchSize could have changed.
  async restore(config: Configuration, accept: (raw: string) => ID | undefined) {
    const formats: Map<ID, {size: number, batches: Batch[]}> = new Map();
    const storage = Storage.connect({dir: config.logs});

    let existing: Set<string> = new Set();
    try {
      existing = new Set(await fs.readdir(dir));
    } catch (err) {
      if (!config.dryRun) throw err;
    }

    for (const raw of (await storage.list())) {
      const format = accept(raw);
      if (!format) continue;

      const formatDir = path.resolve(dir, format);

      if (existing.has(format)) {
        // We need to see if any checkpoints exist and
        // TODO could be run with different batch size!!!!
      } else {
        if (!config.dryRun) await fs.mkdir(formatDir);
        formats.set(format, null);  // TODO size and batches without offsets!
      }
    }

    // TODO: await Promise.all([...reads, ...writes]);

    return formats;
  }

  parseFilename(filename: string, raw: string): [string, ID, Offset, Offset] {
    let dir = path.dirname(filename);
    dir = path.dirname(dir);
    const format = path.basename(dir) as ID;
    filename = path.basename(filename, '.json.gz');
    const [b, e] = filename.split('-');
    return [dir, format, nameToOffset(b), nameToOffset(e)];
  }

  formatOffsets(begin: Offset, end: Offset) {
    return `${begin.day}/${begin.log} (${begin.index}) - ${end.day}/${end.log} (${end.index})`;
  }
};

function nameToOffset(name: string, raw: string) {
  const [day, log, index] = name.split('_');
  return {
    day: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8}`,
    log: `battle-${raw}-${log}.log.json`,
    index: Number(index),
  };
}
