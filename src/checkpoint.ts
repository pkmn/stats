import * as path from 'path';
import {ID} from 'ps';
import {Stats, TaggedStatistics} from 'stats';

import * as fs from './fs';
import * as state from './state';

export interface Offset {
  day: string;
  log: string;
}

export interface Checkpoint {
  begin: Offset;
  end: Offset;
  stats: TaggedStatistics;
}

// If we are configured to use checkpoints we will check to see if a checkpoints directory
// already exists - if so we need to resume from the checkpoint, otherwise we need to
// create the checkpoint directory setup and write the checkpoints as we process the logs.
//
// The checkpoints directory is to be structured as follows:
//
//     <checkpoints>
//     └── format
//         └── timestamp.json(.gz)

// TODO: consider adding verification option to ensure correctness/no missing data
export const Checkpoints = new class {
  async restore(dir: string, formats: Map<ID, {raw: string, offset: Offset}>) {
    if (!(await fs.exists(dir))) await fs.mkdir(dir);
    const existing = new Set(await fs.readdir(dir));

    const reads = [];
    const writes = [];
    for (const [format, data] of formats.entries()) {
      const formatDir = path.resolve(dir, format);
      if (existing.has(format)) {
        reads.push(restoreCheckpoint(formatDir).then(offset => {
          data.offset = offset;
        }));
      } else {
        writes.push(fs.mkdir(formatDir));
      }
    }

    await Promise.all([...reads, ...writes]);
  }

  async combine(dir: string, format: ID, max: number): Promise<TaggedStatistics> {
    const formatDir = path.resolve(dir, format);

    let stats: state.TaggedStatistics|undefined = undefined;
    let n = 0;
    let checkpoints = [];
    for (const file of await fs.readdir(formatDir)) {
      if (n >= max) {
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

  filename(dir: string, format: ID, timestamp: number) {
    return `${path.resolve(dir, format, `${timestamp}`)}.json.gz`;
  }
};

async function restoreCheckpoint(formatDir: string): Promise<Offset> {
  const checkpoints = (await fs.readdir(formatDir)).sort();
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
