# `@pkmn/anon`

![Test Status](https://github.com/pkmn/stats/workflows/Tests/badge.svg)
![License](https://img.shields.io/badge/License-MIT-blue.svg)
[![npm version](https://img.shields.io/npm/v/@pkmn/anon.svg)](https://www.npmjs.com/package/@pkmn/anon)

Logic for anonymizing Pokémon Showdown teams and battle logs.

## Installation

```sh
$ npm install @pkmn/anon
```

## Usage

`@pkmn/anon` provides an `Anonymizer` class which can be used to anonymize teams or battle logs:

```ts
import {Anonymizer, Verifier} from '@pkmn/anon';
import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/dex';

const gens = new Generations(Dex);
const gen = gens.get(raw.format.startsWith('gen') ? +raw.format.charAt(3) : 6);

const verifier = new Verifier();
const anon = Anonymizer.anonymize(gen, raw, {verifier});
if (verifier.ok()) console.log(JSON.stringify(anon, null, 2));
```

By default, anonymization will replace player's usernames with `'Player 1'` and `'Player 2'` and
Pokémon's nicknames with their species name (in addition to removing chat logs, timestamps, rating
info, etc). Both `anonymize` and `anonymizeTeam` take a 'salt' option which will cause the
`Anonymizer` to hash the usernames and nicknames with the salt instead - this mode allows for
tracking the presence of a player or Pokémon accross multiple battle logs without revealing the
true identities.

`Anonymizer`'s methods also take an option 'verifier' parameter - a `Verifier` can be used to sanity
check the log output and ensure no names have leaked out. This is almost always due to a false
positive (often a Pokémon being nicknamed something which appears in the output logs in another
location), but can be helpful in ensuring no PII gets leaked due to bugs or oversight.

### CLI

The [`anonymize`](anonymize) tool takes in a log as input and anonymizes it:

```sh
$ anonymize 2020-09/gen8ou/2020-09-25/gen8ou-2875469343.log
```

If there are potential leaks the warnings from the `Verifier` will be output instead. For
anonymizing logs efficiently *en masse*, see [`@pkmn/logs`](../logs).

### Browser

The recommended way of using `@pkmn/anon` in a web browser is to **configure your bundler**
([Webpack](https://webpack.js.org/), [Rollup](https://rollupjs.org/),
[Parcel](https://parceljs.org/), etc) to minimize it and package it with the rest of your
application.

## License

This package is distributed under the terms of the [MIT License](LICENSE).
