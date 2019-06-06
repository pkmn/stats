import * as path from 'path';
import {ID} from 'ps';
import {Stats, TaggedStatistics} from 'stats';

import * as fs from './fs';
import {Configuration} from './main';
import * as state from './state';
import {Storage} from './storage';

export interface Offset {
  day: string;
  log: string;
  index: number;
}

export interface Checkpoint {
  begin: Offset;
  end: Offset;
  stats: TaggedStatistics;
}

const CMP = Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare;

// If we are configured to use checkpoints we will check to see if a checkpoints directory
// already exists - if so we need to resume from the checkpoint, otherwise we need to
// create the checkpoint directory setup and write the checkpoints as we process the logs.
//
// The checkpoints directory is to be structured as follows:
//
//     <checkpoints>
//     └── format
//         └── YYYYMMDD_N-YYYYMMDD-M.json.gz

export const Checkpoints = new class {
  formatOffsets(begin: Offset, end: Offset) {
    return `${begin.day}/${begin.log} (${begin.index}) - ${end.day}/${end.log} (${end.index})`;
  }

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

    for (const raw of (await storage.listFormats())) {
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

  async combine(config: Configuration, format: ID): Promise<TaggedStatistics> {
    const formatDir = path.resolve(config.checkpoints, format);

    let n = 0;
    let checkpoints = [];
    let stats: state.TaggedStatistics|undefined = undefined;
    for (const file of (await fs.readdir(formatDir)).sort(CMP)) {
      if (n >= config.maxFiles) {
        for (const checkpoint of await Promise.all(checkpoints)) {
          stats = state.combineTagged(checkpoint.stats, stats);
        }
        n = 0;
        checkpoints = [];
      }

      checkpoints.push(readRawCheckpoint(path.resolve(formatDir, file)));
      n++;
    }
    for (const checkpoint of await Promise.all(checkpoints)) {
      stats = state.combineTagged(checkpoint.stats, stats);
    }

    return state.deserializeTagged(stats!);
  }

  writeCheckpoint(file: string, checkpoint: Checkpoint) {
    return fs.writeGzipFile(file, JSON.stringify({
      begin: checkpoint.begin,
      end: checkpoint.end,
      stats: state.serializeTagged(checkpoint.stats),
    }));
  }

  async readCheckpoint(file: string): Promise<Checkpoint> {
    const raw = await readRawCheckpoint(file);
    return {
      begin: raw.begin,
      end: raw.end,
      stats: state.deserializeTagged(raw.stats),
    };
  }

  filename(dir: string, format: ID, begin: Offset, end: Offset) {
    let index = begin.log.length - 9;
    const b = begin.day.replace(/-/g, '') + '_' +
        begin.log.slice(begin.log.lastIndexOf('-', index) + 1, index);
    index = end.log.length - 1;
    const e =
        end.day.replace(/-/g, '') + '_' + end.log.slice(end.log.lastIndexOf('-', index) + 1, index);
    return `${path.resolve(dir, format, `${b}-${e}`)}.json.gz`;
  }
};

// TODO: need to read in ALL checkpoints to find gaps :(
async function restoreCheckpoint(formatDir: string): Promise<Offset> {
  const checkpoints = (await fs.readdir(formatDir)).sort(CMP);
  if (!checkpoints.length) return {day: '', log: ''};
  // NOTE: We're just assuming max files is not relevant here (ie. num formats < max files)
  const checkpoint = path.resolve(formatDir, checkpoints[checkpoints.length - 1]);
  return (await Checkpoints.readCheckpoint(checkpoint)).end;
}

async function readRawCheckpoint(file: string) {
  const json = JSON.parse(await fs.readFile(file, 'utf8'));
  return {
    begin: json.begin as Offset,
    end: json.end as Offset,
    stats: json.stats as state.TaggedStatistics,
  };
}
