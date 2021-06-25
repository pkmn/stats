import {LOG, VLOG} from './debug';

import * as threads from 'bthreads';
import {ID, Configuration} from './config';
import {Batch, Checkpoint} from './checkpoints';
import {CheckpointStorage, LogStorage, Storage} from './storage';
import {limit, Limit} from './limit';

export type WorkerConfiguration = Omit<Configuration, 'worker'>;

export type WorkerOptions<C extends WorkerConfiguration> = {
  [option in keyof C]?: {
    desc: string;
    alias?: string | string[];
    parse?: (s: string) => C[keyof C];
  }
};

export interface Worker<C extends WorkerConfiguration> {
  options?: WorkerOptions<C>;
  init?(config: C): Promise<string>;
  accept?(config: C): (format: ID) => boolean | string[];

  apply(format: ID, batch: Batch, shard?: string): Promise<void>;
  combine?(formats: ID, shard?: string): Promise<void>;
}

export abstract class ApplyWorker<
  C extends WorkerConfiguration,
  A = undefined
> implements Worker<C> {
  readonly config!: C;
  readonly storage!: {logs: LogStorage; checkpoints: CheckpointStorage};
  readonly limit!: {apply: Limit; combine: Limit};

  constructor() {
    if (workerData) {
      this.config = (workerData as WorkerData<C>).config;
      this.storage = Storage.connect(this.config);
      this.limit = {
        apply: limit(this.config.maxFiles),
        combine: limit(Math.min(this.config.batchSize.combine, this.config.maxFiles)),
      };
    }
  }

  async apply(format: ID, batch: Batch, shard?: string) {
    const {begin, end} = batch;
    const state = this.setupApply(format, shard);

    // FIXME
    // const size = end.index.global - begin.index.global + 1;
    // const offset = `${format}: ${Checkpoints.formatOffsets(begin, end)}`;
    // LOG(`Processing ${size} log(s) from batch ${i}/${batches.length} - ${offset}`);

    const processed: Array<Promise<void>> = [];
    for (const log of await this.storage.logs.select(format, begin, end)) { // TODO just begin end
      processed.push(this.limit.apply(() => this.process(log, state)));
    }
    if (processed.length) await Promise.all(processed);

    const checkpoint = this.writeCheckpoint(batch, state);
    LOG(`Writing checkpoint <${checkpoint}>`);
    await this.storage.checkpoints.write(checkpoint);
  }

  abstract setupApply(format: ID, shard?: string): A;
  abstract readLog(log: string, state: A): Promise<void>;
  abstract writeCheckpoint(batch: Batch, state: A): Checkpoint;

  async process(log: string, state: A) {
    VLOG(`Processing ${log}`);
    if (this.config.dryRun) return;
    try {
      await this.readLog(log, state);
    } catch (err) {
      if (this.config.strict) throw err;
      console.error(`${log}: ${err.message}`);
    }
  }
}

export abstract class CombineWorker<
  C extends WorkerConfiguration,
  A = undefined,
  B = A
> extends ApplyWorker<C, A> {
  async combine(format: ID, shard?: string) {
    const state = this.setupCombine(format, shard);
    LOG(`Combining checkpoint(s) for ${format}`);

    const processed: Array<Promise<void>> = [];
    for (const batch of await this.storage.checkpoints.list(format)) { // FIXME shard
      processed.push(this.limit.combine(() => this.readCheckpoint(batch, state)));
    }
    if (processed.length) await Promise.all(processed);
    await this.writeCombined(format, state);
  }

  async aggregate(log: string, state: A) {
    VLOG(`Processing ${log}`);
    if (this.config.dryRun) return;
    try {
      await this.readLog(log, state);
    } catch (err) {
      if (this.config.strict) throw err;
      console.error(`${log}: ${err.message}`);
    }
  }

  abstract setupCombine(format: ID, shard?: string): B;
  abstract readCheckpoint(batch: Batch, state: B): Promise<void>;
  abstract writeCombined(format: ID, state: B): Promise<void>;
}


export interface WorkerData<C extends WorkerConfiguration> {
  num: number;
  config: C;
}

export type WorkerTask = ApplyTask | CombineTask;

interface ApplyTask {
  type: 'apply';
  format: ID;
  shard?: string;
  batch: Batch;
}

interface CombineTask {
  type: 'combine';
  format: ID;
  shard?: string;
}

export const workerData = threads.workerData as unknown;

export async function register<C extends WorkerConfiguration>(worker: Worker<C>) {
  // FIXME
  // if (workerData) {
  //   const data = workerData as WorkerData<C>;
  //   if (data.type === 'apply') {
  //     await worker.apply(data.formats as Batch[], data.stats)
  //   } else if (worker?.combine) {
  //     await worker.combine(data.formats as ID[]);
  //   }
  // }
}
