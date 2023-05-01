
import * as threads from 'bthreads';

import {Batch, Checkpoint} from './checkpoints';
import {Configuration, ID} from './config';
import {LOG, VLOG} from './debug';
import {Limit, limit} from './limit';
import {CheckpointStorage, LogStorage, Storage} from './storage';

export type {Limit} from './limit';

export type WorkerConfiguration = Omit<Configuration, 'worker'>;

export type WorkerOptions<C extends WorkerConfiguration> = {
  [option in keyof C]?: {
    desc: string | string[];
    alias?: string | string[];
    parse?: (s: string) => C[keyof C];
  }
};

export interface Worker<C extends WorkerConfiguration> {
  options?: WorkerOptions<C>;
  init?(config: C): Promise<void>;
  accept?(config: C): (format: ID) => boolean | string[];

  apply(batch: Batch, shard?: string): Promise<void>;
  combine?(format: ID, shard?: string): Promise<void>;
}

export abstract class ApplyWorker<
  C extends WorkerConfiguration,
  A = undefined
> implements Worker<C> {
  readonly config!: C;
  readonly storage!: {logs: LogStorage; checkpoints: CheckpointStorage; scratch: string};
  readonly limit!: Limit;

  constructor() {
    if (workerData) {
      this.config = (workerData as WorkerData<C>).config;
      this.storage = {...Storage.connect(this.config), scratch: 'TODO'};
      this.limit = limit(this.config.maxFiles);
    }
  }

  async apply(batch: Batch, shard?: string) {
    const state = await this.setupApply(batch, shard);

    const applied: Array<Promise<void>> = [];
    for (const log of await this.storage.logs.select(batch.format, batch.day)) { // FIXME
      applied.push(this.limit(() => this.process(log, state, shard)));
    }
    if (applied.length) await Promise.all(applied);

    const checkpoint = this.createCheckpoint(batch, state, shard);
    LOG(`Writing checkpoint <${checkpoint.toString()}>`);
    await this.storage.checkpoints.write(checkpoint);
  }

  abstract setupApply(batch: Batch, shard?: string): Promise<A>;
  abstract processLog(log: string, state: A, shard?: string): Promise<void>;
  abstract createCheckpoint(batch: Batch, state: A, shard?: string): Checkpoint;

  async process(log: string, state: A, shard?: string) {
    VLOG(`Processing ${log}${shard ? ` (${shard})` : ''}`);
    if (this.config.dryRun) return;
    try {
      await this.processLog(log, state, shard);
    } catch (err: any) {
      if (this.config.strict) throw err;
      console.error(`${log}: ${err.message as string}`);
    }
  }
}

export abstract class CombineWorker<
  C extends WorkerConfiguration,
  A = undefined,
  B = A
> extends ApplyWorker<C, A> {
  async combine(format: ID, shard?: string) {
    const state = await this.setupCombine(format, shard);
    LOG(`Combining checkpoint(s) for ${format}${shard ? ` (${shard})` : ''}`);

    const combined: Array<Promise<void>> = [];
    for (const batch of await this.storage.checkpoints.list(format)) {
      combined.push(this.limit(() => this.aggregate(batch, state, shard)));
    }
    if (combined.length) await Promise.all(combined);

    LOG(`Writing results for ${format}${shard ? ` (${shard})` : ''}`);
    if (!this.config.dryRun) await this.writeResults(format, state, shard);
  }

  async aggregate(batch: Batch, state: B, shard?: string) {
    VLOG(`Aggregating ${batch.toString()}${shard ? ` (${shard})` : ''}`);
    if (this.config.dryRun) return;
    try {
      await this.aggregateCheckpoint(batch, state, shard);
    } catch (err: any) {
      if (this.config.strict) throw err;
      console.error(`${batch.toString()}: ${err.message as string}`);
    }
  }

  abstract setupCombine(format: ID, shard?: string): Promise<B>;
  abstract aggregateCheckpoint(batch: Batch, state: B, shard?: string): Promise<void>;
  abstract writeResults(format: ID, state: B, shard?: string): Promise<void>;

  merge<T>(left: T[], right: T[], cmp: (a: T, b: T) => number) {
    const merged = [];
    while (left.length && right.length) {
      merged.push((cmp(left[0], right[0]) < 0 ? left : right).shift());
    }
    return [...merged, ...left, ...right];
  }
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
  // if (workerData) {
  //   const data = workerData as WorkerData<C>;
  //   if (data.type === 'apply') {
  //     await worker.apply(data.formats as Batch[], data.stats)
  //   } else if (worker?.combine) {
  //     await worker.combine(data.formats as ID[]);
  //   }
  // }
}
