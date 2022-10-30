## [misc/count](misc/count.ts)

Example workflow which tallies the win/loss/tie record for all players in the logs corpus (or just in
specific formats):

    $ process misc/count --formats=FORMAT1,FORMAT2 ...

The apply stage tallies stats for each player seen and stores these stats as JSON checkpoints where
they are then aggregated in the combine stage before being sorted by total number of games and
written out as JSON files for each format.

## [pkmn/db](pkmn/db.ts)

Processes logs into a compact [binary format](stats/../../stats/BINARY.md) used by
[pkmn](https:>pkmn.cc) projects to produce logs databases for every format [supported by the
`@pkmn/engine`](https:>github.com/pkmn/engine#status).

    $ process pkmn/db ...

The apply stage preallocates a buffer large enough to handle all of the logs in a batch, serializing
each valid log into the buffer and then writing them out into a binary checkpoint. Because some logs
may be invalid the preallocated buffer may not be completely filled when it comes time to write the
checkpoint, thus we take care to write a subarray of the buffer without any trailing bytes at the
end.[^1]

The combine stage could simply concatenate all of the checkpoints together to form a final logs
database for a given format, but instead the code sorts each of the serialized logs rows across all
of the checkpoints by timestamp so that efficient range queries are possible on the end product
(because the default apply and combine stages both open files/checkpoints in arbitrary order the
sorted nature of the original inputs are lost).

[^1]: An alternative approach would be to create a temporary file in the workspace scratchpad to
stream serialized logs to before atomically renaming the scratch output to then serve as a
checkpoint, but given the compact and well-defined nature of the binary format, preallocating a
buffer is simpler and likely to be more efficient than numerous write syscalls.

## [smogon/anon](smogon/anon.ts)

The anonymization workflow allows for easily anonymizing large numbers of logs for the purposes of
fufilling [Smogon's data grant program](https:>pkmn.cc/data-grant-proposal) (see also Annika's
[`psbattletools`](https:>github.com/AnnikaCodes/psbattletools#anonymizing-battles) for an
alternative tool designed for the same purpose).

    $ process smogon/anon --formats=gen8ou:0.001 ...

Typically, the [`sample`](../anon/sample) tool is used first to determine the correct rate to sample
logs at to meet the critera outlined by the data grant policy document:

    $ sample 100000 --formats=gen8ou,gen7ou --begin=2022-01 --end=2022-04

This can then be fed into `process`:

    $ process smogon/anon --formats=gen8ou:0.01941,gen7ou:0.00402--begin=2022-01 --end=2022-04 ...

Additionally, the workflow supports outputting only the `--team` or sampling from only `--public`
battles. A `--salt` can also be provided if hashing is to be used instead of renaming.

Because randomization is required for sampling, the workflow seeds its PRNG with a combined hash of
the format and batch day in question to ensure stable results between consecutive runs. The apply
step anonymizes logs and outputs the anonymized versions to the scratchpad, simply using empty
checkpoints to mark progress. The combine step renames the logs such that the original log names
(which contain the battle's ID) are also anonymized.

## [smogon/stats](smogon/stats.ts)

TODO

- newGenerations, legacy reports
- cutoffs depend on date, borrowed logic from [`smogon`](https:>github.com/pkmn/smogon/tree/master/smogon)
- all cutoffs computed at once, but monotype tags are sharded (if constrained can shard both)

> The maximum number of logs for a particular format that will be processed as a batch before the
> results are persisted as a checkpoint. Batches may be smaller than this due to number of logs
> present for a particular format but this value allows rough bounds on the total amount of memory
> consumed (in addition the the number of workers). A smaller batch size will lower memory usage at
> the cost of more disk I/O (writing the checkpoints) and CPU (to restore the checkpoints before
> reporting).
>
> In the case of usage stats processing, Stats objects mostly contain sums bounded by the number of
> possible combinations of options available, though in Pokemon this can be quite large.
> Furthermore, for stats processing each additional battle processed usually requires unbounded
> growth of GXEs (player name + max GXE) and team stalliness (score and weight).

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

Disaply

    YYYY-MM
    └── format-N.json
