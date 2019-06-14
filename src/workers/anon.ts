import 'source-map-support/register';
import '../debug';

import {Anonymizer} from 'anon';
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

// '--formats=gen7ou|0.7||true,gen6ou||stableSalt,gen7randombattle|||0|1,gen4uu'
interface AnonConfiguration extends Configuration {
  formats: string;
}

interface AnonOptions {
  sample?: number;
  salt?: string;
  publicOnly?: boolean;
  teamsOnly?: boolean;
}

function parse(args: string) {
  const options: Map<ID, AnonOptions> = new Map();
  const TRUE = ['true', 'True', 'T', 't', '1'];
  for (const arg in args.split(',')) {
    const [format, sample, salt, publicOnly, teamsOnly] = arg.split('|');
    options.set(toID(format), {
      sample: Number(sample) || undefined,
      salt,
      publicOnly: TRUE.includes(publicOnly),
      teamsOnly: TRUE.includes(teamsOnly),
    });
  }
  return options;
}

export async function init(config: AnonConfiguration) {
  // if (config.dryRun) return;
  // TODO set up mirror directory structure...
}

export function accept(config: AnonConfiguration) {
  const options = parse(config.formats);
  return (format: ID) => options.has(format);
}

async function apply(batches: Batch[], config: AnonConfiguration) {
  const formats = parse(config.formats);
  const logStorage = LogStorage.connect(config);
  const checkpointStorage = CheckpointStorage.connect(config);
  const random = new Random(workerData.num);
  for (const {format, begin, end} of batches) {
    const options = formats.get(format)!;
    const data = Data.forFormat(format);

    const size = end.index.global - begin.index.global;
    LOG(`Processing ${size} log(s) from ${format}: ${Checkpoints.formatOffsets(begin, end)}`);
    let processed: Array<Promise<void>> = [];

    let index = begin.index.global;
    for (const log of await logStorage.select(format, begin, end)) {
      if (processed.length >= config.maxFiles) {
        LOG(`Waiting for ${processed.length} log(s) from ${format} to be parsed`);
        await Promise.all(processed);
        processed = [];
      }

      processed.push(processLog(logStorage, data, random, index, log, options, config.dryRun));
      index++;
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
    logStorage: LogStorage, data: Data, random: Random, index: number, log: string,
    options: AnonOptions, dryRun?: boolean) {
  VLOG(`Processing ${log}`);
  if (dryRun) return;
  if (options.sample && random.next() > options.sample) return;
  try {
    const raw = JSON.parse(await logStorage.read(log));
    // TODO: options.publicOnly?
    if (options.teamsOnly) {
      for (const side of ['p1', 'p2']) {
        const team =
            JSON.stringify(Anonymizer.anonymizeTeam(raw[`${side}team`], data, options.salt));
        const name = `team-${data.format}-${index}.${side}.json`;
        // TODO: write
      }
    } else {
      const anonymized = JSON.stringify(Anonymizer.anonymize(raw, data, options.salt, index));
      const name = `battle-${data.format}-${index}.log.json`;
      // TODO: write
    }
  } catch (err) {
    console.error(`${log}: ${err.message}`);
  }
}

class Random {
  private seed: number;

  constructor(n: number) {
    // Hash: https://burtleburtle.net/bob/hash/integer.html
    n = (n ^ 61) ^ (n >>> 16);
    n = n + (n << 3);
    n = n ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d);
    n = n ^ (n >>> 15);
    this.seed = n >>> 0;
  }

  // Mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
  next() {
    let z = (this.seed += 0x6D2B79F5 | 0);
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z = z ^ (z + Math.imul(z ^ (z >>> 7), z | 61));
    z = (z ^ (z >>> 14)) >>> 0;
    return z / 2 ** 32;
  }
}

// tslint:disable-next-line: no-floating-promises
(async () => {
  if (workerData.type === 'apply') await apply(workerData.formats, workerData.config);
})();
