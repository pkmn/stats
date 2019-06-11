import {ID} from 'ps';

import {Checkpoint, Checkpoints} from '../checkpoint';
import {CheckpointMemoryStorage} from '../storage';

// TODO use different

/// setup
// 2018-01
// 01 - 100,75,0,13
// 02 - 50,25,10,0
// 03 - 150,,90,87

// mockCheckpoint('gen7ou', '20180201_0_0_0-20180201_5_5_5');
function mockCheckpoint(storage: CheckpointMemoryStorage, format: string, name: string) {
  let checkpoints = storage.checkpoints.get(format as ID);
  if (!checkpoints) {
    checkpoints = new Map();
    storage.checkpoints.set(format as ID, checkpoints);
  }
  checkpoints.set(name, '');
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
  describe('restore', () => {});

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
