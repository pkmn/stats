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

    const reads: Array<Promise<void>> = [];
    const writes: Array<Promise<void>> = [];
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

  async combine(dir: string, format: ID, max: number, stats?: TaggedStatistics): TaggedStatistics {
    stats = stats || Stats.create();
    const formatDir = path.resolve(dir, format);

    let n = 0;
    let checkpoints: Array<Promise<Checkpoint>> = [];
    for (const file of await fs.readdir(formatDir)) {
      if (n >= max) {
        for (const checkpoint of await Promise.all(checkpoints)) {
          stats = combineStats(stats, checkpoint.stats);
        }
        n = 0;
        checkpoints = [];
      }

      checkpoints.push(readCheckpoint(path.resolve(formatDir, file)));
      n++;
    }
    for (const checkpoint of await Promise.all(checkpoints)) {
      stats = combineStats(stats, checkpoint.stats);
    }
    return stats;
  }

  writeCheckpoint(file: string, checkpoint: Checkpoint) {
    // TODO: filename should be based on timestamp in checkpoint.end!
    return fs.writeGzipFile(file, JSON.stringify({
      begin: checkpoint.begin,
      end: checkpoint.end,
      stats: state.serializeTagged(checkpoint.stats),
    }));
  }

  async readCheckpoint(file: string): Promise<Checkpoint> {
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    return {
      begin: json.begin as Offset,
      end: json.end as Offset,
      stats: state.deserializeTagged(json.stats),
    };
  }
};

async function restoreCheckpoint(formatDir: string): Promise<Offset> {
  const checkpoints = (await fs.readdir(formatDir)).sort();
  if (!checkpoints.length) return {day: '', log: ''};
  // NOTE: We're just assuming max files is not relevant here (ie. num formats < max files)
  const checkpoint = path.resolve(formatDir, checkpoints[checkpoints.length - 1]);
  return (await Checkpoints.readCheckpoint(checkpoint)).end;
}
