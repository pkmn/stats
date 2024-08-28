import {Dex} from '@pkmn/dex';

import * as classifier from '../classifier';
import {newGenerations} from '../util';

const GEN = newGenerations(Dex).get(7);

describe('Classifier', () => {
  test('GREATER_SETUP_MOVES', () => {
    expect(classifier.computeGreaterSetupMoves(GEN)).toEqual(classifier.GREATER_SETUP_MOVES);
  });
  test('LESSER_SETUP_MOVES', () => {
    expect(classifier.computeLesserSetupMoves(GEN)).toEqual(classifier.LESSER_SETUP_MOVES);
  });
  test('SETUP_MOVES', () => {
    expect(classifier.computeBatonPassMoves(GEN)).toEqual(classifier.SETUP_MOVES);
  });
  test('GRAVITY_MOVES', () => {
    expect(classifier.computeGravityMoves(GEN)).toEqual(classifier.GRAVITY_MOVES);
  });
});
