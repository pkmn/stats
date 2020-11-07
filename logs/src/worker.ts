import {LOG, VLOG} from './debug';

import * as threads from 'bthreads';
import {ID,  Configuration} from './config';
import {Batch, Checkpoints, Checkpoint} from './checkpoints';
import {CheckpointStorage, LogStorage, Storage} from './storage';
import {Statistics} from './main';

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
  init?(config: C): Promise<void>;
  accept?(config: C): (format: ID) => number;

  apply(batches: Batch[], stats: Statistics): Promise<void>;
  combine?(formats: ID[]): Promise<void>;
}

export abstract class ApplyWorker<
  C extends WorkerConfiguration,
  A = undefined
> implements Worker<C> {
  readonly config!: C;
  readonly storage!: {logs: LogStorage, checkpoints: CheckpointStorage};

  constructor() {
    if (workerData) {
      this.config = (workerData as WorkerData<C>).config;
      this.storage = Storage.connect(this.config);
    }
  }

  async apply(batches: Batch[], stats: Statistics) {
    for (const [i, batch] of batches.entries()) {
      const {format, begin, end} = batch;
      const state = this.setupApply(format, stats);

      const size = end.index.global - begin.index.global + 1;
      const offset = `${format}: ${Checkpoints.formatOffsets(begin, end)}`;
      LOG(`Processing ${size} log(s) from batch ${i}/${batches.length} - ${offset}`);

      await this.parallel(
        await this.storage.logs.select(format, begin, end),
        log => this.process(log, state),
        n => `Waiting for ${n} log(s) from ${format} to be parsed`,
      );

      const checkpoint = this.writeCheckpoint(batch, state);
      if (checkpoint) {
        LOG(`Writing checkpoint <${checkpoint}>`);
        await this.storage.checkpoints.write(checkpoint);
      }
    }
  }

  async parallel<T>(
    source: Iterable<T>,
    process: (t: T) => Promise<void>,
    wait: (n: number) => string,
  ) {
    let processed: Array<Promise<void>> = [];
    for (const log of source) {
      // FIXME allow for min(batchSize.combine) max
      if (processed.length >= this.config.maxFiles) {
        LOG(wait(processed.length));
        await Promise.all(processed);
        processed = [];
      }

      processed.push(process(log));
    }
    if (processed.length) {
      LOG(wait(processed.length));
      await Promise.all(processed);
    }
  }

  abstract setupApply(format: ID, stats: Statistics): A;
  abstract readLog(log: string, state: A): Promise<void>;
  abstract writeCheckpoint(batch: Batch, state: A): Checkpoint | undefined;

  async process(log: string, state: A) {
    VLOG(`Processing ${log}`);
    if (this.config.dryRun) return;
    try {
      await this.readLog(log, state);
    } catch (err) {
      console.error(`${log}: ${err.message}`);
      // FIXME swallows error...., use a --strict=NUM command?
    }
  }
}

export abstract class CombineWorker<
  C extends WorkerConfiguration,
  A = undefined,
  B = A
> extends ApplyWorker<C, A> {
  async combine(formats: ID[]) {
    for (const format of formats) {
      const state = this.setupCombine(format);
      LOG(`Combining checkpoint(s) for ${format}`);

      const checkpoints = await this.storage.checkpoints.list(format);
      const size = checkpoints.length;
      await this.parallel(
        checkpoints,
        batch => this.readCheckpoint(batch, state),
        n => `Waiting for ${n}/${size} checkpoint(s) for ${format} to be combined`,
      );
      await this.writeCombined(format, state);
    }
  }

  async aggregate(log: string, state: A) {
    VLOG(`Processing ${log}`);
    if (this.config.dryRun) return;
    try {
      await this.readLog(log, state);
    } catch (err) {
      console.error(`${log}: ${err.message}`);
      // FIXME swallows error...., use a --strict=NUM command?
    }
  }

  abstract setupCombine(format: ID): B;
  abstract readCheckpoint(batch: Batch, state: B): Promise<void>;
  abstract writeCombined(format: ID, state: B): Promise<void>;
}


export interface WorkerData<C extends WorkerConfiguration> {
  type: 'apply' | 'combine';
  num: number;
  formats: Batch[] | ID[];
  config: C;
  stats: Statistics;
}

export const workerData = threads.workerData as unknown;

export async function register<C extends WorkerConfiguration>(worker: Worker<C>) {
  if (workerData) {
    const data = workerData as WorkerData<C>;
    if (data.type === 'apply') {
      await worker.apply(data.formats as Batch[], data.stats)
    } else if (worker?.combine) {
      await worker.combine(data.formats as ID[]);
    }
  }
}
