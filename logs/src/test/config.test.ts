import {Options} from '../config';

describe('Config', () => {
  test('toConfiguration', () => {
    const input = 'input';
    const output = 'output';
    const worker = 'worker';
    expect(() => Options.toConfiguration({} as Options)).toThrow('Input must be specified');
    expect(() => Options.toConfiguration({input} as Options)).toThrow('Output must be specified');
    expect(() => Options.toConfiguration({input, output} as Options))
      .toThrow('Worker must be specified');
    expect(() => Options.toConfiguration({input, output, worker, threads: 1, processes: 1}))
      .toThrow('Cannot simultaneously run with both threads and processes');

    let config = Options.toConfiguration({input, output, worker});
    expect(config.input).toEqual(input);
    expect(config.output).toEqual(output);
    expect(config.worker).toEqual(worker);
    expect(config.checkpoints).toBeUndefined();

    const checkpoints = 'checkpoints';
    config = Options.toConfiguration({
      input, output, worker, checkpoints, processes: 1, maxFiles: 5, dryRun: true, uneven: 4,
    });
    expect(config.checkpoints).toEqual(checkpoints);
    expect(config.numWorkers).toEqual({apply: 1, combine: 1});
    expect(config.batchSize).toEqual({apply: 8192, combine: 8192});
    expect(config.maxFiles).toEqual(5);
    expect(config.dryRun).toBe(true);
    expect(config.uneven).toEqual(4);

    config = Options.toConfiguration({
      input, output, worker, checkpoints, threads: '4,8', batchSize: -1, maxFiles: -1,
    });
    expect(config.numWorkers).toEqual({apply: 4, combine: 8});
    expect(config.batchSize).toEqual({apply: Infinity, combine: Infinity});
    expect(config.maxFiles).toEqual(Infinity);
    expect(config.uneven).toEqual(1 / 8);
  });
});
