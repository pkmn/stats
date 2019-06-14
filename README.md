Pokémon Showdown Stats
========================================================================

Navigation: [Website][1] | [Server repository][2] | [Client repository][3] | [Dex repository][4] | **Stats repository**

  [1]: http://pokemonshowdown.com/
  [2]: https://github.com/Zarel/Pokemon-Showdown
  [3]: https://github.com/Zarel/Pokemon-Showdown-Client
  [4]: https://github.com/Zarel/Pokemon-Showdown-Dex

Introduction
------------------------------------------------------------------------

This is a repository for the code which processes battle logs for Pokémon
Showdown, primarily into [usage statistics reports][5]. A detailed design
overview can be found at [pkmn.cc/stats-processing][6].

  [5]: https://www.smogon.com/stats/
  [6]: https://pkmn.cc/stats-processing

Usage
------------------------------------------------------------------------

### Stats

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

As outlined in the [design document][6], 'checkpoints' are periodically written
during processing, allowing for incremental processing and for resilience in the
face of crashes or restarts. `--checkpoints=path/to/checkpoints` can be used to
specify where the checkpoints files should be written (or where the checkpoints
from a previous run were written to, in the case of when you want a restart to
restore from past progress).

#### Tier Updates

A Tier Update report based on past usage reports can also be produced:

    $ ./updates path/to/month1 <path/to/month2> <path/to/month3>

Where `updates` may be passed the paths to 1 - 3 past usage report directories,
ordered from most recent to least recent.

If you wish to construct different reports or tweak which reports are produced,
refer to the subpackage housed under [stats/][7].

  [7]: https://github.com/pkmn-cc/Pokemon-Showdown-Stats/tree/master/stats

### Anonymization

`process` can also be used to anonymize battle logs if run with the
`--anonymize` flag. This flag expects a comma separated list of formats to
anonymize, potentially with additional configuration options per format
separated with `:`:

    <format>:<sample>:<salt>:<publicOnly>:<teamsOnly>

Everything other than `<format>` can be left blank, and `:` is only required
as needed to indicate which option is being changed. For example, the following
will anoymize the `gen7ou` and `gen4uu` logs found at `path/to/logs`, only
including 70% of the _public_ battles from `gen7ou` and writing the anonymized
logs to `path/to/output/anonlogs`:

    $ ./process path/to/logs path/to/output/anonlogs --anonymize=gen7ou:0.7::true,gen4uu

The anonymization subpackage can be used separately in other programs and is
housed under [anon/][8].

  [8]: https://github.com/pkmn-cc/Pokemon-Showdown-Stats/tree/master/anon


License
------------------------------------------------------------------------

Pokémon Showdown's stats processing library is distributed under the terms of the [MIT License][9].

  [9]: https://github.com/pkmn-cc/Pokemon-Showdown-Stats/blob/master/LICENSE
