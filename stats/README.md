# `@pkmn/stats`

![Test Status](https://github.com/pkmn/stats/workflows/Tests/badge.svg)
![License](https://img.shields.io/badge/License-MIT-blue.svg)
[![npm version](https://img.shields.io/npm/v/@pkmn/stats.svg)](https://www.npmjs.com/package/@pkmn/stats)

This package provides the core logic required for parsing and analyzing Pokémon Showdown battle
logs, classifying specific types of teams or Pokémon, and producing various reports about their
usage. This project began as a translation of Gilad "Antar" Barlev's
[Smogon-Usage-Stats](https://github.com/Antar1011/Smogon-Usage-Stats) (including updates from
Mathieu "Marty" Dias-Martins) from Python to TypeScript, though has since been [extended,
optimized, and corrected](CHANGES.md).

This package can be used together with [`@pkmn/logs`](../logs) to efficiently process gigabytes of
battle logs within minutes to produce the reports hosted at https://www.smogon.com/stats/.

## Installation

```sh
$ npm install @pkmn/stats
```

## Usage

The most naive way of using `@pkmn/stats` is to iterate over a collection of logs, run them through
the [`Parser`](#Parser) and use [`Stats`](#Stats) to compute various statistics that can then be
displayed by [`Display`](#Display):

```ts
import {Dex} from '@pkmn/dex';
import {Generations, GenerationNum} from '@pkmn/data';
import {Parser, Stats, Display} from '@pkmn/stats';

const GENS = new Generations(Dex);

const gen = GENS.get(8);
const format = 'gen8ou';
const cutoffs = 1500;

const stats = Stats.create();
for (const log of logs) {
  const battle = Parser.parse(gen, format, log);
  Stats.update(gen, format, battle, cutoffs, stats);
}

console.log(Display.fromStatistics(gen, format, stats));
```

In practice, `@pkmn/stats` should be used in tandem with [`@pkmn/logs`](../logs) to produce the
 statistics and reports that are desired by your application.

#### `Parser`

The `Parser` class takes in Pokémon Showdown stored battle logs 'parses' it into a `Battle` object
that can be processed by `Stats`. The parsing done by `@pkmn/stats` is highly specific to the type
of analysis that it performs and is not likely to be useful for other applications - robust parsers
should be built on top of [`pkmn/protocol`](https://github.com/pkmn/ps/tree/master/protocol).
[`pkmn/client`](https://github.com/pkmn/ps/tree/master/client) serves as a far better example of a
general purpose parser (though note, `@pkmn/client` just deals with the output `log` field of a
stored log - the storage logs processed by the `@pkmn/stats` `Parser` contain metadata in addition
to the output logs).

#### `Stats`

A log which has be parsed into a `Battle` by the `Parser` can be fed into the `Stats` class to
compute `Statistics`. However, there are numerous options for updating a `Statistics` object -
statistics for various weight cutoffs and/or tags can be computed simultaneously, and the various
`update` methods can be used to optimize the computation as desired.

Statistics objects can be `combine`d together (and like with `update`, this can also be used to
combine statistics for multiple weight cutoffs or tags simultanenously). Note that due to the fact
that [floating-point arthimetic](https://en.wikipedia.org/wiki/Floating-point_arithmetic) is not
commutative, the order in which `Statistics` are combined may influence the results.

#### `Display`

The `Display` class can be used to produce `@pkmn/stats`'s [unified output format](OUTPUT.md). Two
methods are provided - `fromStatistics` for converting the `Statistics` returned by the `Stats`
class into the unified report, and a `fromReports` method which can be used to convert legacy
reports to a unified report which is similar ([but not identical](OUTPUT.md#Legacy)) to
`@pkmn/stats`'s new format. A [CLI](#CLI) exists for converting legacy reports to the new format,
see below.

#### `Reports`

`@pkmn/stats` can still generate all of the legacy reports from Smogon-Usage-Stats, the `Reports`
class provides methods for each of the 5 main report types (usage, leads, moveset, detailed moveset,
metagame), as well as a methods for compute 'update' reports based on previous data. There is also a
`movesetReports` method which computes the `movesetReport` and `detailedMovesetReport` both at the
same time (mostly useful for performance reasons).

#### `Classifer`

The `Classifier` can be used to compute a Pokémon (or an entire teams') *bias* and *stalliness*.
Bias is a metric computed from a Pokémon's base stats which compares offensive versus defensive
prowess whereas stalliness is meant to measure how much a Pokémon contributes to a 'stalling'
playstyle.

The `classifyTeam` method also returns *tags* - various labels for the particular categories the
team falls into based on attributes of its members.

**NOTE:** The `Classifier` expects `PokemonSet<ID>` arguments, not `PokemonSet` -
`Parser#canonicalizeTeam` can be used to convert a `PokemonSet` into a `PokemonSet<ID>` if
necessary.

### CLI

A [`convert`](convert) tool is packaged with `@pkmn/stats` that takes in a reports directory as
input and a location to write the transformed reports and converts the legacy reports to the [new
output format](OUTPUT.md#Legacy).

```sh
$ convert path/to/reports path/to/output
```

There is no CLI tool for actually generating reports - [`@pkmn/logs`](../logs) should be used to
process logs *en masse*.

### Browser

The recommended way of using `@pkmn/stats` in a web browser is to **configure your bundler**
([Webpack](https://webpack.js.org/), [Rollup](https://rollupjs.org/),
[Parcel](https://parceljs.org/), etc) to minimize it and package it with the rest of your
application.

## Tests

The 'update' report test depends on the current tiering information of every Pokéemon to determine
what the correct updates are. Because tiers changes over time, when the `@pkmn/dex` dependency gets
updated the 'golden' expected output will need to be updated as well. To update the golden files,
run the update script and check in its output after inspection:

```sh
$ ./src/test/update
```

## License

This package is distributed under the terms of the [MIT License](LICENSE). The
[Smogon-Usage-Stats](https://github.com/Antar1011/Smogon-Usage-Stats) project that this package was
based on is also licensed under the [MIT
License](https://github.com/Antar1011/Smogon-Usage-Stats/blob/master/license.txt).
