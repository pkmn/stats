Pokémon Showdown Stats
========================================================================

Navigation: [Website][1] | [Server repository][2] | [Client repository][3] | [Dex repository][4] | **Stats repository**

  [1]: http://pokemonshowdown.com/
  [2]: https://github.com/Zarel/Pokemon-Showdown
  [3]: https://github.com/Zarel/Pokemon-Showdown-Client
  [4]: https://github.com/Zarel/Pokemon-Showdown-Dex

Introduction
------------------------------------------------------------------------

This is a repository for the code which processes input logs into usage statistics for Pokémon Showdown.

Usage
------------------------------------------------------------------------

To generate usage statistics reports from a Pokémon Showdown server's battle
logs in batch, run:

    $ ./process path/to/logs path/to/output/reports

If you are using a Node version <= 11.7.0, you will need to update (eg. `npm install -g n
&& n stable` or `nvm install stable`), or run with the `--experimental-worker` flag:

    $ node --experimental-worker process path/to/logs path/to/output/reports

`process` expects the `logs` directory to be structured as follows (ie. the default
for Pokémon Showdown servers):

    YYYY-MM
    └── format
        └── YYYY-MM-DD
            └── battle-format-N.log.json

The resulting reports will be written out in the following directory structure:

    YYYY-MM
    ├── chaos
    │   └── format-N.json
    ├── format-N.txt
    ├── leads
    │   └── format-N.txt
    ├── metagame
    │   └── format-N.txt
    ├── monotype
    │   ├── chaos
    │   │   └── format-monoT-N.json
    │   ├── format-monoT-N.txt
    │   ├── leads
    │   │   └── format-monoT-N.txt
    │   ├── metagame
    │   │   └── format-monoT-N.txt
    │   └── moveset
    │       └── format-monoT-N.txt
    └── moveset
        └── format-N.txt

`process --help` can be used to provide insight into which flags are offered for
tweaking the runtime overhead and behavior. To handle large amount of data, you
will probably need to increase Node's heap size using `--max-old-space-size` and/or
tweak the applications `--batchSize` and `--workingSetSize`.

A Tier Update report based on past usage reports can also be produced:

    $ ./updates path/to/month1 <path/to/month2> <path/to/month3>

Where `updates` may be passed the paths to 1 - 3 past usage report directories,
ordered from most recent to least recent.

If you wish to construct different reports or tweak which reports are produced,
refer to the subpackage housed under [stats/][5].

  [5]: https://github.com/pkmn-cc/Pokemon-Showdown-Stats/tree/master/stats

License
------------------------------------------------------------------------

Pokémon Showdown's stats processing library is distributed under the terms of the [MIT License][6].

  [6]: https://github.com/pkmn-cc/Pokemon-Showdown-Stats/blob/master/LICENSE

Credits
------------------------------------------------------------------------
This code is based on a rewrite of [Smogon-Usage-Stats][7], written by Antar Iliev.

  [7]: https://github.com/Antar1011/Smogon-Usage-Stats
