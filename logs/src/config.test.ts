import {Options} from './config';

describe('Config', () => {
  test('toConfiguration', () => {
    const input = 'input';
    const output = 'output';
    const worker = 'worker';
    const workspace = 'workspace';

    expect(() => Options.toConfiguration({} as Options)).toThrow('Input must be specified');
    expect(() => Options.toConfiguration({input} as Options)).toThrow('Output must be specified');
    expect(() => Options.toConfiguration({input, output} as Options))
      .toThrow('Worker must be specified');
    expect(() =>
      Options.toConfiguration({input, output, worker, threads: 1, processes: 1, workspace}))
      .toThrow('Cannot simultaneously run with both threads and processes');

    expect(() =>
      Options.toConfiguration({input: 'foo/2020-05', begin: '2020-03', output, worker, workspace}))
      .toThrow('\'2020-03\' is outside the range of logs in \'2020-05\'');

    let config = Options.toConfiguration({
      input, output, worker, workspace, processes: 1, maxFiles: 5, dryRun: true,
    });
    expect(config.workspace).toEqual(workspace);
    expect(config.worker.num).toEqual({apply: 1, combine: 1});
    expect(config.maxFiles).toBe(5);
    expect(config.dryRun).toBe(true);

    config = Options.toConfiguration({
      input, output, worker, workspace, threads: '4,8', maxFiles: -1,
    });
    expect(config.worker.num).toEqual({apply: 4, combine: 8});
    expect(config.maxFiles).toEqual(Infinity);
    expect(config.begin).toBeUndefined();
    expect(config.end).toBeUndefined();

    config = Options.toConfiguration({
      input: 'logs/2019-05', output, worker, workspace, begin: '2019-05-03', end: '2019-05-27',
    });
    expect(config.input).toBe('logs');
    expect(config.begin).toBe('2019-05-03');
    expect(config.end).toBe('2019-05-27');
  });
});
