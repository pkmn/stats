import {Generations, ID} from '@pkmn/data';
import {Dex} from '@pkmn/dex';

import * as classifier from '../classifier';

const GEN = new Generations(Dex).get(6);

/**
  * Returns set of items in set `a` that are not in set `b`.
  */
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
      .toEqual(new Set(['diamondstorm']));
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
  test('PHAZING_MOVES', () => {
    const COMPUTED_PHAZING_MOVES = classifier.computePhazingMoves(GEN);

    expect(COMPUTED_PHAZING_MOVES).toEqual(classifier.PHAZING_MOVES);
  });

  test('PARALYSIS_MOVES', () => {
    const COMPUTED_PARALYSIS_MOVES = classifier.computeParalysisMoves(GEN);

    expect(COMPUTED_PARALYSIS_MOVES).toEqual(classifier.PARALYSIS_MOVES);
  });
  test('CONFUSION_MOVES', () => {
    const COMPUTED_CONFUSION_MOVES = classifier.computeConfusionMoves(GEN);

    // Moves that Antar incorrectly included (nothing)
    expect(getDifference(classifier.CONFUSION_MOVES, COMPUTED_CONFUSION_MOVES))
      .toEqual(new Set([]));

    // Confusion moves that Antar forgot to include
    expect(getDifference(COMPUTED_CONFUSION_MOVES, classifier.CONFUSION_MOVES))
      .toEqual(new Set(['chatter', 'sweetkiss']));
  });
  test('SLEEP_MOVES', () => {
    const COMPUTED_SLEEP_MOVES = classifier.computeSleepMoves(GEN);

    expect(COMPUTED_SLEEP_MOVES).toEqual(classifier.SLEEP_MOVES);
  });
  test('OHKO_MOVES', () => {
    const COMPUTED_OHKO_MOVES = classifier.computeOHKOMoves(GEN);

    // OHKO moves that Antar incorrectly included (nothing)
    expect(getDifference(classifier.OHKO_MOVES, COMPUTED_OHKO_MOVES)).toEqual(new Set([]));

    // OHKO moves that Antar forgot to include
    expect(getDifference(COMPUTED_OHKO_MOVES, classifier.OHKO_MOVES))
      .toEqual(new Set(['horndrill']));
  });
  test('GREATER_OFFENSIVE_MOVES', () => {
    const COMPUTED_GREATER_OFFENSIVE_MOVES = classifier.computeGreaterOffensiveMoves(GEN);

    expect(COMPUTED_GREATER_OFFENSIVE_MOVES).toEqual(classifier.GREATER_OFFENSIVE_MOVES);
  });
  test('LESSER_OFFENSIVE_MOVES', () => {
    const COMPUTED_LESSER_OFFENSIVE_MOVES = classifier.computeLesserOffensiveMoves(GEN);

    // Lesser offensive that Antar incorrectly included (nothing)
    // "High" Jump Kick used to be spelled as "Hi" and that spelling was used
    expect(getDifference(classifier.LESSER_OFFENSIVE_MOVES, COMPUTED_LESSER_OFFENSIVE_MOVES))
      .toEqual(new Set(['hijumpkick']));

    // Lesser offensive moves that Antar forgot to include
    expect(getDifference(COMPUTED_LESSER_OFFENSIVE_MOVES, classifier.LESSER_OFFENSIVE_MOVES))
      .toEqual(new Set(['hyperspacefury', 'highjumpkick', 'thrash']));
  });
});
