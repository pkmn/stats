import {ID} from '../config';
import {Batch, Checkpoint, Offset} from '../checkpoints';
import {LogFileStorage} from './logs';
import {CheckpointFileStorage, CheckpointMemoryStorage} from './checkpoints';

export const CMP = Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare;

export interface LogStorage {
  // FIXME problem need begin=DATE end=DATE instead of day
  list(format?: ID, day?: string): Promise<string[]>;
  select(format: ID, offset?: Offset, end?: Offset): Promise<string[]>;
  read(log: string): Promise<string>;
}

export const LogStorage = new class {
  connect(config: {input: string | LogStorage}): LogStorage {
    // TODO: support DatabaseStorage as well - allow for query from ENV (like connection settings)
    if (typeof config.input === 'string') {
      return new LogFileStorage(config.input);
    }
    return config.input;
  }
};

export interface CheckpointStorage {
  // creates directory
  init(): Promise<string>;
  // creates directory for format (BUG need to support shard)
  prepare(format: ID): Promise<void>;
  // returns all the batches that have been processed (BUG needs to support shard)
  list(format: ID): Promise<Batch[]>;
  // Just batches by format, (BUG key needs to be tuple (format, shard) or nested map)
  offsets(): Promise<Map<ID, Batch[]>>;
  // reads a specific checkpoint
  read(format: ID, begin: Offset, end: Offset): Promise<string>;
  // Writes a gzip checkpoint (calls serialzie)
  write(checkpoint: Checkpoint): Promise<void>;
}

export const CheckpointStorage = new class {
  connect(config: {
    checkpoints?: string | CheckpointStorage;
    dryRun?: boolean;
  }): CheckpointStorage {
    if (config.dryRun) return new CheckpointMemoryStorage();
    if (!config.checkpoints || typeof config.checkpoints === 'string') {
      return new CheckpointFileStorage(config.checkpoints);
    }
    return config.checkpoints;
  }
};

export const Storage = new class {
  connect(config: {
    input: string | LogStorage;
    checkpoints?: string | CheckpointStorage;
    dryRun?: boolean;
  }) {
    return {logs: LogStorage.connect(config), checkpoints: CheckpointStorage.connect(config)};
  }
};
