This folder contains miscellaneous scripts and tools related to managing/processing battle logs:

## [compress](compress)

Archives a month of logs organized in the default Pokémon Showdown hierarchy:

    $ tools/compress path/to/logs/YYYY-MM

The standard directory hierarchy:

    YYYY-MM
    └── format
        └── YYYY-MM-DD
            └── battle-format-N.log.json

gets organized such that each day is compressed in [7z format](https://7-zip.org/7z.html) and the
all formats get combined into a single [tar archive
file](https://en.wikipedia.org/wiki/Tar_(computing)):

    YYYY-MM.tar
    └── format
        └── YYYY-MM-DD.7z
            └── battle-format-N.log.json

This archive format results in an **identical/better compression ratio** than just using 7z at the
top level (typically 20-25:1 in terms of disk usage) but importantly allows for
compressing/**decompressing files in parallel** and **filtering files from specific formats**.
`@pkmn/logs` has been designed to transparently handle this compressed archive format.

## [stats](stats)

 Produces a `stats.db` file based on weighted usage statistics from `GEN` computed with rating
`CUTOFF` from the `LOGS` database (where the logs database is the output of
[`workflow/pkmn/db`](../workflows/pkmn/db.ts)):

    $ tools/stats compute --gen=GEN --logs=LOGS --cutoff=CUTOFF > stats.db

The `cutoff` subcommand takes a `PERCENTILE` and returns the weighting to use as a `CUTOFF`
based on the distribution of ratings for the given `GEN` and `LOGS`.

    $ npm run compile && tools/stats cutoff --gen=GEN --logs=LOGS --percentile=PERCENTILE

The binary `STATS` database produced by `compute` can be inspected with the `display` subcommand,
where `REPORT` can be either `pokemon` or `teammates`:

    $ npm run compile && tools/stats display --gen=GEN --stats=STATS --report=REPORT

The `compute` and `display` commands require additional flags depending on the generation to
determine how many moves/items/abilities etc to include in the $P(X | Species)$ tables, though
sensible defaults have been chosen already. To customize these, the  `sizes` subcommand can be
used to gain insight into the data for a given `GEN` and `LOGS` so that these flags can then be
passed to `compute` or `display`:

    $ tools/stats sizes --gen=GEN --logs=LOGS --cutoff=CUTOFF

This binary stats format is used by pkmn's [EPOké](https://github.com/pkmn/EPOke) project.

## [teams](teams)

Produces a `teams.db` file of the `NUM` (default 10,000) top teams from `GEN` as found in the `LOGS`
database (where the logs database is the output of [`workflow/pkmn/db`](../workflows/pkmn/db.ts)):

    $ tools/teams compute --gen=GEN --logs=LOGS --num=NUM? > teams.db

The resulting binary `TEAMS` database can then be inspected with the same tool:

    $ tools/teams display --gen=GEN --teams=TEAMS

This binary teams format is used by pkmn's [0 ERROR](https://github.com/pkmn/0-ERROR) project.
