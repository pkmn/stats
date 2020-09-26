# `@pkmn/stats`

![Test Status](https://github.com/pkmn/stats/workflows/Tests/badge.svg)
[![npm version](https://img.shields.io/npm/v/@pkmn/stats.svg)](https://www.npmjs.com/package/@pkmn/stats)

This package provides the core logic required for parsing and analyzing Pokémon Showdown battle
logs, classifying specific types of teams or Pokémon, and producing various reports about their
usage. This project began as a translation of Gilad "Antar" Barlev's
[Smogon-Usage-Stats](https://github.com/Antar1011/Smogon-Usage-Stats) (including updates from
Mathieu "Marty" Dias-Martins) from Python to TypeScript, though has since been extended,
optimized, and corrected.

This package can be used together with [`@pkmn/logs`](../logs) to efficiently process gigabytes of battle logs within minutes to produce the reports hosted at https://www.smogon.com/stats/.

## Installation

```sh
$ npm install @pkmn/stats
```

## Usage

FIXME

```ts
```

### CLI

The [`parse`](parse) tool takes in a log as input and FIXME

```sh
$ anonymize 2020-09/gen8ou/2020-09-25/gen8ou-2875469343.log
```

FIXME `@pkmn/logs`

### Browser

The recommended way of using `@pkmn/anon` in a web browser is to **configure your bundler**
([Webpack](https://webpack.js.org/), [Rollup](https://rollupjs.org/),
[Parcel](https://parceljs.org/), etc) to minimize it and package it with the rest of your
application.

## Tests

FIXME

```sh
$ ./src/test/update
```

## License

This package is distributed under the terms of the [MIT License](LICENSE). The
[Smogon-Usage-Stats](https://github.com/Antar1011/Smogon-Usage-Stats) project that this package was
based on is also licensed under the [MIT
License](https://github.com/Antar1011/Smogon-Usage-Stats/blob/master/license.txt).
