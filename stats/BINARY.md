# Binary

While `@pkmn/stats`'s [new output format](OUTPUT.md) is considerably more efficient to use than the
legacy reports, JSON and strings have significantly more overhead compared when to a binary format.
In order to deliver efficient, [real-time](https://en.wikipedia.org/wiki/Real-time_computing)
solutions, the [pkmn](https://pkmn.cc/) projects utilize native-endian binary formats wherever
possible to minimize memory-usage and eke out as much performance as they can. `@pkmn/stats` exposes
a [`Binary`](src/binary.ts) class which can be used to work with the formats described below. In all
cases, only generations supported by [`@pkmn/engine`](https://github.com/pkmn/engine) may make use
of the binary encoding, as the encoding depends on the engine's specific internal indexes to serve
as binary identifiers.

## Logs

The default `Log` structure produced by Pokémon Showdown can be encoded into a native-endian binary
format in supported generations with `Binary.Log#encode`:

| Start | End    | Data                                                    |
| ----- | ------ | ------------------------------------------------------- |
| 0     | 8      | Number of milliseconds elapsed since the Unix epoch     |
| 8     | 10     | Turns                                                   |
| 10    | 11     | End Type (normal, tie, forfeit, forced win, forced tie) |
| 11    | 13     | Winner's provisional Glicko-1 rating (`rpr`)            |
| 13    | 14     | Winner's provisional Glicko-1 rating deviation (`rprd`) |
| 14    | 16     | Loser's provisional Glicko-1 rating (`rpr`)             |
| 16    | 17     | Losers's provisional Glicko-1 rating deviation (`rprd`) |
| 17    | 17+N   | Winner's team (*encoding depends on generation*)        |
| 17+N  | 17+2×N | Losers's team (*encoding depends on generation*)        |

Where [teams](#teams) are encoded in the manner described below. These binary logs can then be
decoded with `Binary.Log#decode`. The [pkmn/db](../workflows/pkmn/db) workflow exists to
convert a logs corpus to this binary format.

**TODO:** Add 2 bytes for real usage bitsets?

## Teams

Teams can be encoded and decoded with `Binary.Team#encode`/`Binary.Team#decode` respectively. These
teams are expected to first be **canonicalized** by something such as `Team#canonicalize` in
`@pkmn/sets`, though the `Parser#canonicalizeTeam` method in `@pkmn/stats` can be used to
approximate this.

<details><summary><b>Generation I</b></summary>

| Start | End | Data                      |
| ----- | --- | ------------------------- |
| 0     | 1   | The Pokémon's species     |
| 1     | 2   | The Pokémon's first move  |
| 2     | 3   | The Pokémon's second move |
| 3     | 4   | The Pokémon's third move  |
| 4     | 5   | The Pokémon's fourth move |

This representation is lossy as stat information is not preserved, though in practice this only
affects the 341 Spc "SafeTwo" (13 Spc DV & 8 Spc IV) Mewtwo spread.

</details>

<details><summary><b>Generation II</b></summary>

| Start | End | Data                            |
| ----- | --- | ------------------------------- |
| 0     | 1   | The Pokémon's species           |
| 1     | 2   | The Pokémon's item              |
| 2     | 3   | The Pokémon's first move        |
| 3     | 4   | The Pokémon's second move       |
| 4     | 5   | The Pokémon's third move        |
| 5     | 6   | The Pokémon's fourth move       |
| 6     | 7   | The Pokémon's Hidden Power type |

This representation is lossy as stat information is not preserved, though in practice this only
affects 216 Spe EV Roar Raikou as Thick Club + Swords Dance Marowak always wants specific corrected
DVs.

</details>

*Note that the following generations are not currently supported by the `@pkmn/engine`, but when
they are the following layouts are expected to be used:*

<details><summary><b>Generation III - V</b></summary>

| Start | End | Data                          |
| ----- | --- | ----------------------------- |
| 0     | 2   | The Pokémon's species & forme |
| 2     | 3   | The Pokémon's item            |
| 3     | 4   | The Pokémon's ability         |
| 4     | 6   | The Pokémon's first move      |
| 6     | 8   | The Pokémon's second move     |
| 8     | 10  | The Pokémon's third move      |
| 10    | 12  | The Pokémon's fourth move     |
| 12    | 13  | The Pokémon's nature          |
| 13    | 19  | The Pokémon's EVs             |
| 19    | 23  | The Pokémon's IVs             |
| 23    | 24  | The Pokémon's level           |

</details>

<details><summary><b>Generation VI & VIII</b></summary>

| Start | End | Data                          |
| ----- | --- | ----------------------------- |
| 0     | 2   | The Pokémon's species & forme |
| 2     | 4   | The Pokémon's item            |
| 4     | 5   | The Pokémon's ability         |
| 5     | 7   | The Pokémon's first move      |
| 7     | 9   | The Pokémon's second move     |
| 9     | 11  | The Pokémon's third move      |
| 11    | 13  | The Pokémon's fourth move     |
| 13    | 14  | The Pokémon's nature          |
| 14    | 20  | The Pokémon's EVs             |
| 20    | 24  | The Pokémon's IVs             |
| 24    | 25  | The Pokémon's level           |

Since [Dynamax is banned in
OU](https://www.smogon.com/forums/threads/dynamax-is-banned-from-ou-explanation-information.3657917/#post-8316142)
in Generation VIII, the encoding doesn't need an extra byte for `dynamaxLevel` and `gigantamax`.

</details>

<details><summary><b>Generation VII & IX</b></summary>

| Start | End | Data                                      |
| ----- | --- | ----------------------------------------- |
| 0     | 2   | The Pokémon's species & forme             |
| 2     | 3   | The Pokémon's item                        |
| 3     | 5   | The Pokémon's ability                     |
| 5     | 7   | The Pokémon's first move                  |
| 7     | 9   | The Pokémon's second move                 |
| 9     | 11  | The Pokémon's third move                  |
| 11    | 13  | The Pokémon's fourth move                 |
| 13    | 14  | The Pokémon's nature                      |
| 14    | 20  | The Pokémon's EVs                         |
| 20    | 24  | The Pokémon's IVs                         |
| 24    | 25  | The Pokémon's level                       |
| 25    | 26  | The Pokémon's Hidden Power/Tera Type type |

In Generation VII the final byte is the Hidden Power type and in Generation IX it is the Tera Type.

</details>

The [`teams`](../tools/teams) can be used to produce a teams database based on the top teams from a
[logs database](#logs).

## Statistics

The encoding of usage statistics data depends on the generation in question - check the
`Statistics` data type definition in the respective `stats.zig` source file. At a high level, the
following probabilities are computed:

- `species_lead`: $P(Species | Lead)$, the probability that a given species was used in a leading
- position
- `species_nonlead`: $P(Species | \lnot Lead)$, the probability that a given species was used in
  a **non-leading** position. This is importantly different than Smogon's usage statistics where a
  Pokémon's usage statistics are agnostic to whether or not they were used as a lead (though the
  overall probability can still be calculated by combining the lead statistics and the non-lead
  statistics)
- `move_species`:  $P(Move | Species)$, the probability for the top $M$ moves used by a species
  that the move is included in a Pokémon's set
- `item_species`:  $P(Item | Species)$, in Generation II and onward, the probability for the top
  $I$ items used by a species that the item is included in a Pokémon's set
- `ability_species`:  $P(Item | Ability)$, in Generation III and onward, the probability for the
  top $A$ abilities available to a species that the ability is included in a Pokémon's set

Additionally, various "correlation deltas" are computed which are intended to be used to modify
the base probabilities outlined above based on additional information revealed over the course of
a battle:

- `species_species`: $\Delta P(Species_B | Species_A)$, **TODO**
- `move_move`: $\Delta P(Move_B | Move_A)$, **TODO**
- `move_item`: $\Delta P(Move | Item)$, in Generation III[^1] and onwward, **TODO**
- `move_ability`: $\Delta P(Move | Ability)$, in Generation III and onward, **TODO**
- `item_ability`: $\Delta P(Item | Ability)$, in Generation III and onward, **TODO**
- `ability_bias`: $\Delta P(Ability | Bias)$, in Generation III and onward, **TODO**
- `item_bias`: $\Delta P(Item | Bias)$, in Generation III and onward, **TODO**
- `move_bias`: $\Delta P(Move | Bias)$, in Generation III and onward, **TODO**

Note that `stats.ts` is expected to deviate from the usage statistics computed from Smogon's
official scripts even in places where they purport to measure the same thing:

- Smogon chooses to elide some data from battles which it deems to have been too **'short'** (less
  than 3 turns in length)
- Smogon uses a slightly more precise (but complex) approximation of the error function **`erf`**
- subtly different floating point results due to the non commutative nature [**floating-point
  arithmetic**](https://en.wikipedia.org/wiki/Floating-point_arithmetic) and rounding schemes used
- Smogon's "Teammate" statistics do not properly account for **`"empty"`** slots, skewing the
  denominator

[^1]: While items exist in Generation II, the `move_item` correlation is only considered in
Generation III and onward as there isn't enough variety in viable items in Generation II to justify
the overhead.

TODO: Bias = highest two stats or highest two stats EVs spent on?
