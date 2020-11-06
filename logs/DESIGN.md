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



----

- worker only ever works at format granularity! need secondary script to work at higher level