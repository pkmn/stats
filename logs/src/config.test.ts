import {Options} from './config';

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
      Options.toConfiguration({input, output, worker, threads: 1, processes: 1, checkpoints}))
      .toThrow('Cannot simultaneously run with both threads and processes');

    let config = Options.toConfiguration({
      input, output, worker, checkpoints, processes: 1, maxFiles: 5, dryRun: true,
    });
    expect(config.checkpoints).toEqual(checkpoints);
    expect(config.worker.num).toBe(1);
    expect(config.maxFiles).toBe(5);
    expect(config.dryRun).toBe(true);

    config = Options.toConfiguration({
      input, output, worker, checkpoints, threads: '8', maxFiles: -1,
    });
    expect(config.worker.num).toBe(8);
    expect(config.maxFiles).toEqual(Infinity);
    expect(config.begin).toBeUndefined();
    expect(config.end).toBeUndefined();

    config = Options.toConfiguration({
      input, output, worker, checkpoints, begin: '2019-03', end: '2020-04',
    });
    expect(config.begin).toBe('2019-03');
    expect(config.end).toBe('2020-04');
  });
});
