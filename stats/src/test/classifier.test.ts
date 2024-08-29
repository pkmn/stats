import {Generations, ID} from '@pkmn/data';
import {Dex} from '@pkmn/dex';

import * as classifier from '../classifier';

const GEN = new Generations(Dex).get(6);

function getDifference(a: Set<ID>, b: Set<ID>) {
  return new Set(
    [...a].filter((value) => !b.has(value))
  );
}

describe('Classifier', () => {
  test('GREATER_SETUP_MOVES', () => {
    const COMPUTED_GREATER_MOVES = classifier.computeGreaterSetupMoves(GEN);

    // Moves that Antar incorrectly included (nothing)
    expect(getDifference(classifier.GREATER_SETUP_MOVES, COMPUTED_GREATER_MOVES))
      .toEqual(new Set([]));

    // Moves that Antar forgot to include
    expect(getDifference(COMPUTED_GREATER_MOVES, classifier.GREATER_SETUP_MOVES))
      .toEqual(new Set(['shellsmash', 'diamondstorm']));
  });
  test('LESSER_SETUP_MOVES', () => {
    const COMPUTED_LESSER_SETUP_MOVES = classifier.computeLesserSetupMoves(GEN);

    // Moves that Antar incorrectly included (nothing)
    expect(getDifference(classifier.LESSER_SETUP_MOVES, COMPUTED_LESSER_SETUP_MOVES))
      .toEqual(new Set([]));

    // Moves that Antar forgot to include
    expect(getDifference(COMPUTED_LESSER_SETUP_MOVES, classifier.LESSER_SETUP_MOVES))
      .toEqual(new Set(['honeclaws']));
  });
  test('SETUP_MOVES', () => {
    const COMPUTED_SETUP_MOVES = classifier.computeBatonPassMoves(GEN);

    // Moves that Antar incorrectly included (nothing)
    expect(getDifference(classifier.SETUP_MOVES, COMPUTED_SETUP_MOVES))
      .toEqual(new Set([]));

    // Moves that Antar forgot to include
    expect(getDifference(COMPUTED_SETUP_MOVES, classifier.SETUP_MOVES))
      .toEqual(new Set(['geomancy', 'diamondstorm', 'poweruppunch']));
  });
  test('GRAVITY_MOVES', () => {
    const COMPUTED_GRAVITY_MOVES = classifier.computeGravityMoves(GEN);

    // Moves that Antar incorrectly included despite having high accuracy
    expect(getDifference(classifier.GRAVITY_MOVES, COMPUTED_GRAVITY_MOVES))
      .toEqual(new Set(['clamp', 'willowisp', 'psywave', 'rocktomb']));

    // Moves that Antar forgot to include
    expect(getDifference(COMPUTED_GRAVITY_MOVES, classifier.GRAVITY_MOVES))
      .toEqual(new Set(['horndrill', 'precipiceblades', 'sandtomb', 'stickyweb', 'landswrath']));
  });
  test('RECOVERY_MOVES', () => {
    const COMPUTED_RECOVERY_MOVES = classifier.computeRecoveryMoves(GEN);

    expect(COMPUTED_RECOVERY_MOVES).toEqual(classifier.RECOVERY_MOVES);
  });
  test('PROTECT_MOVES', () => {
    const COMPUTED_PROTECT_MOVES = classifier.computeProtectionMoves(GEN);

    expect(COMPUTED_PROTECT_MOVES).toEqual(classifier.PROTECT_MOVES);
  });
});
