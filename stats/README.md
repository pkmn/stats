# `@pkmn/stats`

![Test Status](https://github.com/pkmn/stats/workflows/Tests/badge.svg)
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

FIXME

#### `Parser`

FIXME

```ts
import {Parser} from '@pkmn/stats';
```

#### `Stats`

FIXME

```ts
import {Stats} from '@pkmn/stats';
```

#### `Reports`

FIXME

```ts
import {Reports} from '@pkmn/stats';
```

#### `Display`

FIXME

```ts
import {Display} from '@pkmn/stats';
```

#### `Classifer`

FIXME

```ts
import {Classifier} from '@pkmn/stats';
```

### CLI

A [`convert`](convert) tool is packaged with `@pkmn/stats` that takes in a reports directory and
cutoff as input and converts the reports to the [new output format](OUTPUT.md#Legacy).

```sh
$ convert src/test/testdata/reports/gen7ubers 1630
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
