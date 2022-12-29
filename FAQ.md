# FAQ

## What is the status of this project?

- [`@pkmn/anon`](anon/) is stable, completed, and has been used in production though has not been
  published because the [practical application](workflows/smogon/anon.ts) of it depends on the
  unfinished [`@pkmn/logs`](logs/) package
- [`@pkmn/logs`](logs/) has gone through several iterations and while the problem space is well
  understood and what should be the ultimate solution has been decided upon there are still several
  weeks of coding/testing/documentation work required to see it through.  On the larger
  [@pkmn](https://pkmn.cc/) project roadmap, finishing the `@pkmn/logs` package is logically part
  of the next swathe of work to be completed, but there is plenty of competing work and there is no
  firm timeline here (likely late Q1/ early Q2 of 2023?)
- [`@pkmn/stats`](stats/) is published, actively maintained, and updated to the latest generation.
  Previous versions of the package have been tested to produce byte-for-byte identical output as the
  official [Smogon Usage Stats](https://github.com/Antar1011/Smogon-Usage-Stats)[^1] scripts written
  in Python[^2], though Smogon actually uses a slightly modified copy of the public scripts which
  have not been shared, so whether or not it is still in sync is unknowable (though likely would be
  fairly trivial to bring up to date with the actual private code). Currently, pkmn projects are
  more interested in iterating on [binary processing and output](stats/BINARY.md), though PRs to its
  [JSON output](stats/OUTPUT.md) or legacy reports (eg. to support tracking Generation IX's
  terastallation mechanics) would be welcome
  
[^1]: Smogon Usage Stats needs a small number of changes to first produce stable and deterministic
  output before comparisons are possible.
[^2]: While all primary reports and most secondary reports are supported, there is a small gap in
  support for all of the same secondary reports as Smogon Usage Stats (eg. not all double/OM
  tier update reports exist). These reports are already fairly well served by the existing Python
  scripts given that they themselves process existing reports and are not a bottleneck in the
  pipeline, so while `@pkmn/stats` aims to eventually support all of these reports natively, missing
  reports should be possible to obtain with the legacy Python scripts in the meantime.

## How should projects use `@pkmn/stats`?

While the blessed `@pkmn/logs` [workflow for using `@pkmn/stats`](workflows/smogon/stats.ts) is
currently not functional, `@pkmn/stats` is still recommended for use over the legacy Python scripts
due to `@pkmn/stats` being maintained, documented, tested, written in a language easier to
intergrate into existing projects within the ecosystem, and due to being more efficient than the
legacy Python scripts. **For 99% of Pokémon Showdown side servers, simply calling `@pkmn/stats` in a
loop is going to be efficient enough for `@pkmn/logs` to not matter in the slightest**, `@pkmn/logs`
is really meant for servers which deal with hundreds of gigabytes of logs stored across hundreds of
millions of files every month and the unique issues that causes.

Even in the latter case, `@pkmn/stats` can be called the exact same way as the existing Smogon Usage
Stats scripts where processing is driven by shell scripts which read logs in a `for` loop and
make use of `parallel` to acheive some concurrency. Ultimately, there is expected to be at best
minor speed improvements here from using `@pkmn/stats` by itself in this manner (which could
possibly be improved by using a runtime optimized for start up like [Bun](https://bun.sh/) as
opposed to Node), as most of the performance wins are expected to come from the unfinished
`@pkmn/logs` package, but one could still argue there is an advantage to using `@pkmn/stats` even
without major speed wins simply due to its codebase being more approachable and having active
maintainer support.

Anyone interested in processing Pokémon Showdown logs into usage stats reports is strongly
encouraged to migrate to `@pkmn/stats` today, though maybe should not invest too heavily in trying
to deeply optimize their logs processing pipeline as `@pkmn/logs` is intended to be the ultimate
solution there.

## What is difficult about processing logs?

It is not actually *that* difficult to write a logs processing solution for gigabytes of logs in
~100-200 lines of code that utilizes `@pkmn/logs` + some `Workers`/ processes to acheive more than a
10x speed up over the legacy Smogon Usage Stats scripts with similar overhead - the main challenges
for `@pkmn/logs` are around being able to create a solution which can work just as well on a beefy
dedicated stats processing server with plenty of resources to gain a 100x speedup or to be able to
process the logs at all in a constrained environment (whether said environment is a laptop with
limited resources and disk space, or an overloaded Pokémon Showdown server which is incredibly
sensitive to heavy processing as it may result in lag spikes or other issues). The main challenges
with processing logs come from balancing numerous competing resources (file descriptors, memory,
CPU, disk) *and* many different environments.

## What could be changed to make `@pkmn/stats` more efficient for large customers?

Producing reports for every type of a monotype format is incredibly expensive as you effectively
process a large format's logs ~20x (or require large amounts of memory to be able to do it all at
once). Unquestionably this is the most problematic part of the existing Smogon stats workflow.

At a more micro level, some data is relatively low value compared to its cost to compute - the most
egregious is the GXE tracking which is only required for computing Pokémon "viability" yet requires
an unbounded amount of memory[^3] to track the user IDs and GXEs involved. The viability metric is
already fairly arbitrary and doesn't seem to have attracted a ton of mindshare and could fairly
easily be removed with minimal outrage and would result in a large performance win.

Finally, general "metagame statistics" which assign tags to teams and compute an arbitrary
"stalliness" metric seem to not be incredibly valuable (in no small part due to a lack of updates
given to these classifiers over the years).

[^3]: `@pkmn/stats` also leverages the fact that computing viability requires deduping unique users
    for its `unique` statistics, though given that these have not actually been used in tiering as
    of yet it would be simple enough to drop support for this.

## What about streaming/"on the fly" processing?

Smogon's stat processing and the proposed processing model for `@pkmn/logs` both are batch based, as
ultimately most reports are necessarily going to involve being processed in batch over a fixed
period of aggregated data. However, the individual logs logs can be parsed and/or statistics can be
aggregated on demand to speed up the eventual reporting process.

pkmn's recommendation where possible would be to process the discrete battle logs into a
[binary](stats/BINARY.md) format that gets appended to a single file that can be processed later on
\- this dramatically compresses the amount of information required to be parsed and also handles the
biggest issue with Pokémon Showdown logs processing at scale which is all of the system calls
involved with opening and reading millions of files. However, binary formats are signficantly less
flexible, especially for servers supporting many diverse metagames which are hard to figure out
encodings for, and as such this sort of preprocessing logs is not necessarily going to work for all
use cases. Simply concatenating the battle log JSON (possibly with some fields pruned) into a single
file with a battle-per-line would also result in large processing improvements when the time came,
though would require locking to avoid corrupting the file at which point simply using a database
would probably be advised (though a databse comes with its own issues, and supporting loading and
processing data from a database is no longer one of `@pkmn/logs` initial goals).

Battle logs can be directly parsed after they are completed on a server running the Pokémon Showdown
simulator and used to update some `Stats` stored in memory before being persisted to disk
periodically - this effectively is the same idea behind `@pkmn/logs` "checkpointing" system, but in
theory would be more efficient than `@pkmn/logs` because the logs can be processed while still in
memory and before being written to disk, meaning it would require zero filesystem overhead/copying
to process the data. In practice, the main concerns here would be around not introducing lag after
the battle has been completed given you would now need to process stats in
[real-time](https://en.wikipedia.org/wiki/Real-time_computing) which limits the kind of statistics
you can gather. If you move the processing of the battle log to a separate worker thread in the
simulator you avoid blocking and introducing lag, but it necessitates you copy the log in memory to
be able to pass it off to the separate process which would be handling it, at which point you are
giving away a lot of your performance gains. Furthermore, doing stats processing on the fly makes
surfacing and recovering errors more difficult - when processng in batch its usually simpler to
notice and recover from issues that might occur. Much of the gains in terms of reporting latency
from on the fly processing can be had from simply running the processing scripts at some frequent
interval either manually or via a cron job with substantially less complexity.
