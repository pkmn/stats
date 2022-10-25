# Design

Processing Pokémon Showdown logs can be viewed as an [embarassingly
parallel](https://en.wikipedia.org/wiki/Embarrassingly_parallel) problem, with the main limiter
being the amount of memory and CPU cores available. However, it also involves a non-trivial amount
of data - each month of battle logs from the main Pokémon Showdown server takes up more than 200GB
on disk, with 10M+ files/month that require processing. Furthermore, while the processing is fairly
straightforward to parallelize, there are a number of additional concerns:

- logs must be processed by 'format', and some format sizes are incredibly heterogenous
  (`gen8randombattle` and `gen8ou` are many orders of magnitude larger than the smallest format)
- if we are not careful when dealing with the large number of files we need to process we can run
  into operating system or Node VM limits
- we must be able to configure the processing so as to acheive the best possible throughput while
  not monopolizing all of the system's resources and to run and make progress on underpowered
  servers
- we need to be able to recover from failures without needing to rerun over the entire corpus

[GNU `parallel`](https://www.gnu.org/software/parallel/)

---

`@pkmn/logs` is designed around a ["split-apply-combine" strategy](https://vita.had.co.nz/papers/plyr.html):

- **split**: data is split into groups based on some criteria
- **apply**: a function is applied to each group independently
- **combine**: the results of the apply step are combined into a single result

This approach is not too disimilar to Google's [MapReduce](https://en.wikipedia.org/wiki/MapReduce)
programming model. In `@pkmn/logs`, the main process initializes itself from
[configuration](config.ts) options, sets up a [checkpoint](checkpoints.ts) system and initializes
its "worker". The worker has an `accept` function which determines which formats it is interested in
processing, and this in combination with configuration and checkpointing (in the event a prior run
already handled the same data) allows the main process to accomplish the 'split' step. After

---

### Workspace

`@pkmn/logs` relies on 'checkpoints' to track which work has already been done and to seamlessly
leverage the results of previous runs (often relevant in the case of an abnormal early exit). All
intermediate results are stored in a directory configured via the `--checkpoints` configuration
options - if the top level directory is not passed in via the `--checkpoints` flag a temporary directory will be created and will be cleaned up upon termination. Checkpoints are structured such
that the filesystem can be used as a database:

    /tmp/checkpoints-2pA7Hjx
    ├── WORKER
    │   ├── checkpoints
    │   │   └── ... TODO
    │   └── scratch
    │       └── ...
    └── decompressed
        └── YYYY-MM
            └── format
                └── YYYY-MM-DD
                    └── battle-format-N.log.json

This top level directory actuall contains several files and directories:

- `WORKER/`: Checkpoints are specific to a particular worker, and as such `Worker#init` returns a
  string which is used to create a directory for data from that particular worker to be stored. This
  identifier does not necessarily need to be unique to a specific worker, it simply is meant to
  indicate the checkpoints and intermediate data from a specific worker are compatible with other
  workers which return the same identifer. Commonly the identifier is a hash of the worker name and
  relevant configuration values.
  - `checkpoints/`: The checkpoints folder contains all the checkpoints written by specific worker
    TODO checkpoints/format/shard/foo.gz, checkpoints/format or checkpoints/format/shard might be
    turned into
  - `scratch/`: This directory exists for the worker to store any intermediate results - outside of
    its initial creation it is never touched by the the framework. It will only be deleted by the
    framework if the parent directory is deleted, it is up to the worker to manage it as necessary.
- `decompressed/`: If the input data was compressed it gets decompressed to this directory under
  the checkpoints directory hierarchy so that it can potentially be reused for future runs. This
  directory is to be organized exactly like Pokémon Showdown's standard flat file battle log
  storage hierrachy.

If storage space is a concern the framework can be configured to clean up the `checkpoints/` and
`decompressed/` directories as it goes (eg. `--cleanup=checkpoints,decompressed`):

- Once a specific shard has completed its combine stage the files for that shard under
  `checkpoint/` may be deleted and replaced with a 'tombstone' file placeholder (and similarly,
  once and entire format has completed the the format can be replace with a 'tombstone')
- After workers have processed all shards for a batch of files the decompressed data can be removed
  from the `decompressed/` directory.
