import * as integration from './integration';

describe('Integration', () => {
  test.skip('process', () => {
    const actual: {[file: string]: string} = {};
    const expected: {[file: string]: string} = {};
    integration.compare(integration.process(), (file: string, a: string, e: string) => {
      actual[file] = a;
      expected[file] = e;
    });
    expect(actual).toEqual(expected);
  });
});
