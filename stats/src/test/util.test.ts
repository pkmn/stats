import {Dex} from '@pkmn/dex';

import aliases from '../aliases.json';

describe('Utils', () => {
  test('ALIASES', () => {
    const gen = Dex.forGen(9);

    // Aliased IDs that don't correspond to an actual Pokemon (none)
    expect(Object.values(aliases).filter(id => !gen.species.get(id).exists))
      .toEqual([]);
  });
});
