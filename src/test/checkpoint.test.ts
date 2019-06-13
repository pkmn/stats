import {ID} from 'ps';

import {Batch, Checkpoint, Checkpoints, Offset} from '../checkpoint';
import {Configuration} from '../config';
import {CheckpointStorage, LogStorage} from '../storage';

const CMP = Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare;

class CheckpointMemoryStorage implements CheckpointStorage {
  readonly checkpoints: Map<ID, Map<string, string>> = new Map();

  async init() {}

  async prepare(format: ID) {
    this.checkpoints.set(format, new Map());
  }

  async list(format: ID) {
    const names = Array.from(this.checkpoints.get(format)!.values()).sort(CMP);
    return names.map(name => this.fromName(format, name));
  }

  async offsets() {
    const checkpoints: Map<ID, Batch[]> = new Map();
    for (const [format, data] of this.checkpoints.entries()) {
      const offsets = Array.from(data.keys()).sort(CMP).map(name => this.fromName(format, name));
      checkpoints.set(format, offsets);
    }
    return checkpoints;
  }

  async read(format: ID, begin: Offset, end: Offset): Promise<string> {
    throw new Error('Not supported');
  }

  async write(checkpoint: Checkpoint): Promise<void> {
    throw new Error('Not supported');
  }

  private toName(begin: Offset, end: Offset) {
    const b = Checkpoint.encodeOffset(begin);
    const e = Checkpoint.encodeOffset(end);
    return `${b}-${e}`;
  }

  private fromName(format: ID, name: string) {
    const [b, e] = name.split('-');
    return {
      format,
      begin: Checkpoint.decodeOffset(format, b),
      end: Checkpoint.decodeOffset(format, e)
    };
  }
}

class LogMemoryStorage implements LogStorage {
  readonly logs: Map<ID, Map<string, string[]>> = new Map();

  async list(format?: ID, day?: string) {
    if (!format) return Array.from(this.logs.keys()).sort(CMP);
    const days = this.logs.get(format)!;
    if (!day) return Array.from(days.keys()).sort(CMP);
    const names = days.get(day)!;
    return names.sort(CMP);
  }

  async select(format: ID, offset?: Offset, end?: Offset): Promise<string[]> {
    throw new Error('Not supported');
  }

  async read(log: string): Promise<string> {
    throw new Error('Not supported');
  }
}

function mockCheckpoint(storage: CheckpointMemoryStorage, format: string, name: string) {
  let checkpoints = storage.checkpoints.get(format as ID);
  if (!checkpoints) {
    checkpoints = new Map();
    storage.checkpoints.set(format as ID, checkpoints);
  }
  checkpoints.set(name, '');
}

function mockLogs(storage: LogMemoryStorage, format: string, logs: {[day: string]: number}) {
  let days = storage.logs.get(format as ID);
  if (!days) {
    days = new Map();
    storage.logs.set(format as ID, days);
  }
  let n = 0;
  for (const [day, num] of Object.entries(logs)) {
    const names = [];
    for (let i = 0; i < num; i++) {
      names.push(`battle-${format}-${n++}.log.json`);
    }
    days.set(day, names);
  }
}

describe('Checkpoint', () => {
  test('encodeOffset', () => {
    const offset = {
      day: '2018-02-01',
      log: 'battle-gen7ou-987.log.json',
      index: {local: 2, global: 3}
    };
    expect(Checkpoint.encodeOffset(offset)).toEqual('20180201_987_2_3');
  });

  test('decodeOffset', () => {
    const offset = {
      day: '2018-02-01',
      log: 'battle-gen7ou-987.log.json',
      index: {local: 2, global: 3}
    };
    expect(Checkpoint.decodeOffset('gen7ou' as ID, '20180201_987_2_3')).toEqual(offset);
  });
});

describe('Checkpoints', () => {
  describe('restore', () => {
    test('no checkpoints', async () => {
      const checkpointStorage = new CheckpointMemoryStorage();
      const logStorage = new LogMemoryStorage();
      //mockLogs(logStorage, 'gen7ou', {'2018-02-01': 100, '2018-02-02': 50, '2018-02-03': 150});
      //mockLogs(logStorage, 'gen6ou', {'2018-02-01': 75, '2018-02-02': 25});
      //mockLogs(logStorage, 'gen5ou', {'2018-02-02': 10, '2018-02-03': 90});
      //mockLogs(logStorage, 'gen4ou', {'2018-02-01': 13, '2018-02-03': 87});
      mockLogs(logStorage, 'gen3ou', {'2018-02-01': 1, '2018-02-02': 2, '2018-02-03': 3});

      const config = {
        logs: logStorage,
        checkpoints: checkpointStorage,
      } as unknown as Configuration;
      const accept = (format: ID) => format !== 'gen5ou';

      //for (const batchSize of [100, 50, 25, 10, 5, 2, 1]) {
      for (const batchSize of [2]) {
        config.batchSize = batchSize;
        const formatBatches = await Checkpoints.restore(config, accept);
        //expect(formatBatches.size).toBe(4);
        //expect(formatBatches.get('gen7ou' as ID)!).toHaveLength(Math.ceil(300 / batchSize));
        //expect(formatBatches.get('gen6ou' as ID)!).toHaveLength(Math.ceil(100 / batchSize));
        //expect(formatBatches.get('gen4ou' as ID)!).toHaveLength(Math.ceil(100 / batchSize));
        console.log(formatBatches.get('gen3ou' as ID)!.map(b => Checkpoints.formatOffsets(b.begin, b.end)).join('\n'));
        expect(formatBatches.get('gen3ou' as ID)!).toHaveLength(Math.ceil(6 / batchSize));
      }
    });

    test('with checkpoints', async () => {
      const checkpointStorage = new CheckpointMemoryStorage();
      const logStorage = new LogMemoryStorage();
      // mockLogs(logStorage, 'gen7ou', {'2018-02-01': 100, '2018-02-02': 50, '2018-02-03': 150});
      // mockLogs(logStorage, 'gen6ou', {'2018-02-01': 75, '2018-02-02': 25});
      // mockLogs(logStorage, 'gen5ou', {'2018-02-02': 10, '2018-02-03': 90});
      mockLogs(logStorage, 'gen4ou', {'2018-02-01': 13, '2018-02-03': 87});
      // mockLogs(logStorage, 'gen3ou', {'2018-02-01': 1, '2018-02-02': 2, '2018-02-03': 3});

      mockCheckpoint(checkpointStorage, 'gen4ou', '20180201_0_0_0-20180201_6_6_6');
      mockCheckpoint(checkpointStorage, 'gen4ou', '20180201_11_11_11-20180203_20_6_19');
      mockCheckpoint(checkpointStorage, 'gen3ou', '20180202_2_1_2-20180202_2_1_2');

      const config = {
        logs: logStorage,
        checkpoints: checkpointStorage,
        batchSize: 10,
      } as unknown as Configuration;

      const formatBatches = await Checkpoints.restore(config, () => true);
      // expect(formatBatches.size).toBe(5);
      // expect(formatBatches.get('gen7ou' as ID)!).toHaveLength(Math.ceil(30)); // TODO
      // expect(formatBatches.get('gen6ou' as ID)!).toHaveLength(Math.ceil(10)); // TODO
      // expect(formatBatches.get('gen5ou' as ID)!).toHaveLength(Math.ceil(10)); // TODO

      const gen4ou = formatBatches.get('gen4ou' as ID)!;
      console.log(gen4ou.map(b => Checkpoints.formatOffsets(b.begin, b.end)).join('\n'));
      expect(gen4ou).toHaveLength(9);
      expect(gen4ou[0].begin.index.global).toBe(7);
      expect(gen4ou[0].end.index.global).toBe(10);
      expect(gen4ou[1].begin.index.global).toBe(20);
      expect(gen4ou[1].end.index.global).toBe(29);

      // expect(formatBatches.get('gen3ou' as ID)!).toHaveLength(2);
    });
  });

  test('formatOffsets', () => {
    const begin = {
      day: '2018-02-01',
      log: 'battle-gen7ou-987.log.json',
      index: {local: 2, global: 3}
    };
    const end = {
      day: '2018-02-25',
      log: 'battle-gen7ou-1234.log.json',
      index: {local: 56, global: 404}
    };
    expect(Checkpoints.formatOffsets(begin, end))
        .toEqual(
            '2018-02-01/battle-gen7ou-987.log.json (3) - 2018-02-25/battle-gen7ou-1234.log.json (404)');
  });
});
