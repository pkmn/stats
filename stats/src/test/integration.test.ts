import * as integration from './integration';

describe('Integration', () => {
  test('process', async () => {
    const actual: { [file: string]: string } = {};
    const expected: { [file: string]: string } = {};
    integration.compare(await integration.process(), (file: string, a: string, e: string) => {
      actual[file] = a;
      expected[file] = e;
    });
    expect(actual).toEqual(expected);
  });
});
