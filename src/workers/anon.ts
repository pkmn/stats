import 'source-map-support/register';
import '../debug';

import {Data, ID, toID} from 'ps';
import {workerData} from 'worker_threads';

import {Batch, Checkpoint, Checkpoints} from '../checkpoint';
import {Configuration} from '../config';
import * as fs from '../fs';
import {CheckpointStorage, LogStorage} from '../storage';

class AnonCheckpoint extends Checkpoint {
  serialize() {
    return '';
  }
}

interface AnonOptions {
  // TODO
}

interface WorkerConfiguration extends Configuration {
  formats: ID[];
  options: AnonOptions;
}

export async function init(config: WorkerConfiguration) {
  // if (config.dryRun) return;
  // TODO set up mirror directory structure...
}

export function accept(config: WorkerConfiguration) {
  return (format: ID) => config.formats.includes(format);
}

async function apply(batches: Batch[], config: WorkerConfiguration) {
  const logStorage = LogStorage.connect(config);
  const checkpointStorage = CheckpointStorage.connect(config);
  for (const {format, begin, end, size} of batches) {
    const data = Data.forFormat(format);

    LOG(`Processing ${size} log(s) from ${format}: ${Checkpoints.formatOffsets(begin, end)}`);
    let processed: Array<Promise<void>> = [];

    for (const log of await logStorage.select(format, begin, end)) {
      if (processed.length >= config.maxFiles) {
        LOG(`Waiting for ${processed.length} log(s) from ${format} to be parsed`);
        await Promise.all(processed);
        processed = [];
      }

      processed.push(processLog(logStorage, data, log, config.options, config.dryRun));
    }
    if (processed.length) {
      LOG(`Waiting for ${processed.length} log(s) from ${format} to be parsed`);
      await Promise.all(processed);
    }
    const checkpoint = new AnonCheckpoint(format, begin, end);
    LOG(`Writing checkpoint '${checkpoint}'`);
    if (!config.dryRun) await checkpointStorage.write(checkpoint);
  }
}

async function processLog(
    logStorage: LogStorage, data: Data, log: string, options: AnonOptions, dryRun?: boolean) {
  VLOG(`Processing ${log}`);
  if (dryRun) return;
  try {
    const raw = JSON.parse(await logStorage.read(log));
    // TODO: anonymize! and write result to fs
  } catch (err) {
    console.error(`${log}: ${err.message}`);
  }
}

// tslint:disable-next-line: no-floating-promises
(async () => {
  if (workerData.type === 'apply') await apply(workerData.formats, workerData.config);
})();
