import {Options} from '../config';

describe('Config', () => {
  test('toConfiguration', () => {
    const input = 'input';
    const output = 'output';
    const worker = 'worker';
    const checkpoints = 'checkpoints';
    expect(() => Options.toConfiguration({} as Options)).toThrow('Input must be specified');
    expect(() => Options.toConfiguration({input} as Options)).toThrow('Output must be specified');
    expect(() => Options.toConfiguration({input, output} as Options))
      .toThrow('Worker must be specified');
    expect(() =>
      Options.toConfiguration({input, output, worker, threads: 1, processes: 1, checkpoints})).toThrow('Cannot simultaneously run with both threads and processes');

    let config = Options.toConfiguration({
      input, output, worker, checkpoints, processes: 1, maxFiles: 5, dryRun: true,
    });
    expect(config.checkpoints).toEqual(checkpoints);
    expect(config.worker.num).toEqual({apply: 1, combine: 1});
    expect(config.batchSize).toEqual({apply: 8192, combine: 8192});
    expect(config.maxFiles).toBe(5);
    expect(config.dryRun).toBe(true);

    config = Options.toConfiguration({
      input, output, worker, checkpoints, threads: '4,8', batchSize: -1, maxFiles: -1,
    });
    expect(config.worker.num).toEqual({apply: 4, combine: 8});
    expect(config.batchSize).toEqual({apply: Infinity, combine: Infinity});
    expect(config.maxFiles).toEqual(Infinity);
    expect(config.begin).toBeUndefined();
    expect(config.end).toBeUndefined();

    config = Options.toConfiguration({
      input, output, worker, checkpoints, begin: 'March 2019', end: 1604533496510,
    });
    expect(config.begin).toEqual(new Date('March 2019'));
    expect(config.end).toEqual(new Date(1604533496510));
  });
});
