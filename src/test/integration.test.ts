import * as integration from './integration';

describe('Integration', () => {
  test('process', () => {
    integration.compare(integration.process(), (a: string, b: string) => expect(a).toEqual(b));
  });

  test.skip('error', () => {});
});
