import { ID } from 'ps';

import { Batch, Checkpoint, Checkpoints, Offset } from '../checkpoint';
import { Configuration } from '../config';
import { CheckpointMemoryStorage, CheckpointStorage, LogStorage } from '../storage';

const CMP = Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;

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

function mockLogs(storage: LogMemoryStorage, format: string, logs: { [day: string]: number }) {
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
      index: { local: 2, global: 3 },
    };
    expect(Checkpoint.encodeOffset(offset)).toEqual('20180201_987_2_3');
  });

  test('decodeOffset', () => {
    const offset = {
      day: '2018-02-01',
      log: 'battle-gen7ou-987.log.json',
      index: { local: 2, global: 3 },
    };
    expect(Checkpoint.decodeOffset('gen7ou' as ID, '20180201_987_2_3')).toEqual(offset);
  });
});

describe('Checkpoints', () => {
  describe('restore', () => {
    test('no checkpoints', async () => {
      const checkpointStorage = new CheckpointMemoryStorage();
      const logStorage = new LogMemoryStorage();
      mockLogs(logStorage, 'gen7ou', {
        '2018-02-01': 100,
        '2018-02-02': 50,
        '2018-02-03': 150,
      });
      mockLogs(logStorage, 'gen6ou', { '2018-02-01': 75, '2018-02-02': 25 });
      mockLogs(logStorage, 'gen5ou', { '2018-02-02': 10, '2018-02-03': 90 });
      mockLogs(logStorage, 'gen4ou', { '2018-02-01': 13, '2018-02-03': 87 });
      mockLogs(logStorage, 'gen3ou', {
        '2018-02-01': 1,
        '2018-02-02': 2,
        '2018-02-03': 3,
      });

      const config = ({
        logs: logStorage,
        checkpoints: checkpointStorage,
      } as unknown) as Configuration;
      const accept = (format: ID) => +(format !== 'gen5ou');

      for (const batchSize of [100, 50, 25, 10, 5, 2, 1]) {
        config.batchSize = { apply: batchSize, combine: batchSize };
        const formatBatches = await Checkpoints.restore(config, accept);
        expect(formatBatches.size).toBe(4);
        expect(formatBatches.get('gen7ou' as ID)!).toHaveLength(Math.ceil(300 / batchSize));
        expect(formatBatches.get('gen6ou' as ID)!).toHaveLength(Math.ceil(100 / batchSize));
        expect(formatBatches.get('gen4ou' as ID)!).toHaveLength(Math.ceil(100 / batchSize));
        expect(formatBatches.get('gen3ou' as ID)!).toHaveLength(Math.ceil(6 / batchSize));
      }
    });

    test('with checkpoints', async () => {
      const checkpointStorage = new CheckpointMemoryStorage();
      const logStorage = new LogMemoryStorage();
      mockLogs(logStorage, 'gen7ou', {
        '2018-02-01': 100,
        '2018-02-02': 50,
        '2018-02-03': 150,
      });
      mockLogs(logStorage, 'gen6ou', { '2018-02-01': 75, '2018-02-02': 25 });
      mockLogs(logStorage, 'gen5ou', { '2018-02-02': 10, '2018-02-03': 90 });
      mockLogs(logStorage, 'gen4ou', { '2018-02-01': 13, '2018-02-03': 87 });
      mockLogs(logStorage, 'gen3ou', {
        '2018-02-01': 1,
        '2018-02-02': 2,
        '2018-02-03': 3,
      });

      mockCheckpoint(checkpointStorage, 'gen7ou', '20180201_8_8_8-20180201_27_27_27');
      mockCheckpoint(checkpointStorage, 'gen7ou', '20180201_28_28_28-20180201_34_34_34');
      mockCheckpoint(checkpointStorage, 'gen7ou', '20180201_72_72_72-20180201_84_84_84');
      mockCheckpoint(checkpointStorage, 'gen7ou', '20180201_90_90_90-20180203_249_99_249');
      mockCheckpoint(checkpointStorage, 'gen7ou', '20180203_290_140_290-20180203_299_149_299');
      mockCheckpoint(checkpointStorage, 'gen6ou', '20180201_58_58_58-20180201_58_58_58');
      mockCheckpoint(checkpointStorage, 'gen6ou', '20180201_60_60_60-20180202_89_14_89');
      mockCheckpoint(checkpointStorage, 'gen5ou', '20180202_0_0_0-20180202_9_9_9');
      mockCheckpoint(checkpointStorage, 'gen4ou', '20180201_0_0_0-20180201_6_6_6');
      mockCheckpoint(checkpointStorage, 'gen4ou', '20180201_11_11_11-20180203_19_6_19');
      mockCheckpoint(checkpointStorage, 'gen3ou', '20180202_2_1_2-20180202_2_1_2');

      const config = ({
        logs: logStorage,
        checkpoints: checkpointStorage,
        batchSize: { apply: 10, combine: 10 },
      } as unknown) as Configuration;

      const indices = (bs: Batch[]) => bs.map(b => [b.begin.index.global, b.end.index.global]);
      const formatBatches = await Checkpoints.restore(config, () => 1);
      expect(indices(formatBatches.get('gen7ou' as ID)!.batches)).toEqual([
        [0, 7],
        [35, 44],
        [45, 54],
        [55, 64],
        [65, 71],
        [85, 89],
        [250, 259],
        [260, 269],
        [270, 279],
        [280, 289],
      ]);
      expect(indices(formatBatches.get('gen6ou' as ID)!.batches)).toEqual([
        [0, 9],
        [10, 19],
        [20, 29],
        [30, 39],
        [40, 49],
        [50, 57],
        [59, 59],
        [90, 99],
      ]);
      expect(indices(formatBatches.get('gen5ou' as ID)!.batches)).toEqual([
        [10, 19],
        [20, 29],
        [30, 39],
        [40, 49],
        [50, 59],
        [60, 69],
        [70, 79],
        [80, 89],
        [90, 99],
      ]);
      expect(indices(formatBatches.get('gen4ou' as ID)!.batches)).toEqual([
        [7, 10],
        [20, 29],
        [30, 39],
        [40, 49],
        [50, 59],
        [60, 69],
        [70, 79],
        [80, 89],
        [90, 99],
      ]);
      expect(indices(formatBatches.get('gen3ou' as ID)!.batches)).toEqual([[0, 1], [3, 5]]);
    });
  });

  test('formatOffsets', () => {
    const begin = {
      day: '2018-02-01',
      log: 'battle-gen7ou-987.log.json',
      index: { local: 2, global: 3 },
    };
    const end = {
      day: '2018-02-25',
      log: 'battle-gen7ou-1234.log.json',
      index: { local: 56, global: 404 },
    };
    expect(Checkpoints.formatOffsets(begin, end)).toEqual(
      '2018-02-01/battle-gen7ou-987.log.json (3) - 2018-02-25/battle-gen7ou-1234.log.json (404)'
    );
  });
});
