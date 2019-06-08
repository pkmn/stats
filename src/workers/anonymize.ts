import 'source-map-support/register';
import '../debug';

import {Data, ID, toID} from 'ps';
import {workerData} from 'worker_threads';

import {Batch, Checkpoint, Checkpoints} from '../checkpoint';
import {Configuration} from '../config';
import * as fs from '../fs';
import {CheckpointStorage, LogStorage} from '../storage';

class AnonymizeCheckpoint extends Checkpoint {
  serialize() { return ''; }
} 

interface AnonymizeOptions {
  // TODO
}

interface WorkerConfiguration extends Configuration {
  formats: ID[];
  options: AnonymizeOptions;
}

export async function init(config: WorkerConfiguration) {
  // if (config.dryRun) return;
  // TODO set up mirror directory structure...
}

export function accept(config: WorkerConfiguration) {
  return (raw: string) => {
    const format = toID(raw);
    return config.formats.includes(format) ? format : undefined;
  };
}

async function apply(batches: Batch[], config: AnonymizationConfiguration) {
  const logStorage = LogStorage.connect(config);
  const checkpointStorage = CheckpointStorage.connect(config);
  for (const {raw, format, begin, end, size} of batches) {
    const data = Data.forFormat(format);

    LOG(`Processing ${size} log(s) from ${format}: ${Checkpoints.formatOffsets(begin, end)}`);
    for (const log of logStorage.select(raw, begin, end)) {
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
    const checkpoint = new StatsCheckpoint(config.checkpoint, format, begin, end, stats);
    LOG(`Writing checkpoint for ${format}: ${checkpoint.filename}`);
    if (!config.dryRun) await checkpointStorage.write(checkpoint);
  }
}

async function processLog(logStorage: LogStorage, data: Data, options: AnonymizeOptions, log: string, dryRun?: boolean) {
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
(async () => {if (workerData.type === 'apply') await apply(workerData.formats, workerData.config)})();
