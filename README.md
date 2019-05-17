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

    $ ./process smogon-reports path/to/logs path/to/output/reports

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

Numerous other options for processing and reporting exist beyond the default,
run `./process --help` for more details.

License
------------------------------------------------------------------------

Pokémon Showdown's stats processing library is distributed under the terms of the [MIT License][5].

  [5]: https://github.com/pkmn-cc/Pokemon-Showdown-Stats/blob/master/LICENSE

Credits
------------------------------------------------------------------------
This code is based on a rewrite of [Smogon-Usage-Stats][6], written by Antar Iliev.  

  [6]: https://github.com/Antar1011/Smogon-Usage-Stats
