import {TaggedStatistics} from 'stats';

import * as fs from './fs';
import * as state from './state';

// TODO: Make sure checkpoints respects MAX_FILES (not WORKING_SET_SIZE)
export interface Checkpoint {
  begin: string;
  end: string;
  stats: TaggedStatistics;
}

// If we are configured to use checkpoints we will check to see if a checkpoints directory
// already exists - if so we need to resume from the checkpoint, otherwise we need to
// create the checkpoint directory setup and write the checkpoints as we process the logs.

// The checkpoints directory is to be structured as follows:
//
//     <checkpoints>
//     └── format
//         └── timestamp.json(.gz)

export const Checkpoints = new class {
  writeCheckpoint(file: string, checkpoint: Checkpoint) {
    // TODO: filename should be based on timestamp in checkpoint.end!
    return fs.writeGzipFile(file, JSON.stringify({
      begin: checkpoint.begin,
      end: checkpoint.end,
      stats: state.serializeTagged(checkpoint.stats),
    }));
  }

  async readCheckpoint(file: string) {
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    return {begin: json.begin, end: json.end, checkpoint: state.deserializeTagged(json.stats)};
  }

  async restore(dir: string) {
      
  }
};
