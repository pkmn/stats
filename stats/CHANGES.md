# Changes

[Smogon-Usage-Stats](https://github.com/Antar1011/Smogon-Usage-Stats) covers both the reading and
processing logs aspect of logs analysis as well as the the logic for computing stats and reports
from the logs themselves. In this project these two aspects are instead separated into `@okmn/logs`
and `@pkmn/stats` respectively, with `@pkmn/logs` being substantially more sophisticated than the
data pipeline provided by Smogon-Usage-Stats for increased flexibilty and performance.

Smogon-Usage-Stats serially processes logs files for each format using `batchLogReader.py` (and
`TA.py`) which is run incrementally, writing the compressed intermediate results of the processing
to a `'Raw/'` directory.  At the end of the month when analysis is performed, several different
types of reports are created based on various rating 'cutoffs' which impact the weighting of the
statistics in the reports. Producing reports involves running `StatCounter.py` followed by the
`batchMovesetReader.py` (which depends on the output from `StatCounter.py`). Producing these reports
is performed using the GNU `parallel` command, effectively allowing the reports for each cutoff to
be performed simultaneously. Finally, the same reports generation process is repeated again in
`MonotypeAnalysis.sh`. `TierUpdate.py` / `TierUpdateOM.py` can be run separately against past
reports to generate tier updates (Pokémon rises and drops per tier).

`@pkmn/stats` has been written to allow for increased flexibility and parallelism in the data
processing pipeline by providing support for combining and reordering stages (eg. computing all of
the statistics `StatCounter.py` and `batchMovesetCounter.py` do at the same time instead of
serially, computing cutoffs or tags in parallel, etc) and avoiding duplicate work wherever possible.
All complicated file processing logic has been split off to the `@pkmn/logs` package, leaving
`@pkmn/stats` as a pure package responsible solely for the manipulation of the data in the logs as
opposed to the logs themselves.

In addition to the high-level architectural changes, Smogon-Usage-Stats has a number of bugs and
quirks that have been corrected by `@pkmn/stats` unless "legacy" mode is opted into:

- The ordering of output from Smogon-Usage-Stats often depends on Python 2's internal **sort
  ordering** for dictionaries, `@pkmn/stats` does not base its sort orders on a particular
  programming language's implementation details.
- `@pkmn/stats` offers a [**unified display option**](OUTPUT.md) that consolidates and extends the
  information from all of Smogon-Usage-Stats reports.
- The reports from processing logs with `@pkmn/stats` via `@pkmn/logs` are going to be subtly
  different than those from Smogon-Usage-Stats due to different architectures and the fact that
  [**floating-point arithmetic**](https://en.wikipedia.org/wiki/Floating-point_arithmetic) is not
  commutative. This is not an inherent difference between `@pkmn/stats` and Smogon-Usage-Stats (logs
  can be processed with `@pkmn/stats` in a similar way to Smogon-Usage-Stats to ensure that the
  reports match), but is a difference that results in practice given that `@pkmn/logs` is the
  replacement for Smogon-Usage-Stats' processing infrastructure.
- Smogon-Usage-Stats 'extracts' type and base stat data from Pokémon Showdown's data files but
  **only handles the most recent generation**, meaning when it processes logs from older
  generations. the modern data is erroneously used. `@pkmn/stats` uses the accurate data for the
  generation being processed.
- Smogon-Usage-Stats considers 'Primal' Pokémon as mega-evolutions along with 'Mega' Pokémon but
  forgets about **'Ultra Burst'**. `@pkmn/stats` handles 'Ultra Burst' Pokémon the same as the other
  mega-evolution types.
- Smogon-Usage-Stats depends on numerous **hardcoded lists** - of non-singles or non-6v6 formats,
  'setup' moves, 'dragon' Pokémon, battle formes etc which include several notable absences
  (Darmanitan-Zen and Meloetta-Piroutte are not considered formes, Kommo-o is not considered a
  'dragon') and have not been updated for Generation 8. `@pkmn/stats` instead computes these lists
  programmatically from the data files to ensure they are comphrensive and up to date.
- `Nidoran-M` is displayed in reports as `NidoranM`, `Nidroran-F` as `NidoranF` and `Flabébé` as
  `Flabebe` in Smogon-Usage-Stats whereas these **names display** correctly in `@pkmn/stats`.
- The **'`empty'`** internal placeholder value is filtered out of reports and stats update logic by
  `@pkmn/stats` but influences results and is displayed by Smogon-Usage-Stats.
- The code used by Smogon-Usage-Stats to display the **'stalliness' histogram** report contains a
  bug in the [logic used to determine the start as it attempts to compare an array and a
  number](https://github.com/Antar1011/Smogon-Usage-Stats/blob/59a9c1cf/StatCounter.py#L354-L356) -
  this no-op is simply removed in `@pkmn/stats`.
- In the case of a **'double down'** where both sides' Pokémon faint, Smogon-Usage-Stats only
  increments the KO count for a single side in the case of `|switch|` or `|drag|` protocol messages
  (it handles double downs properly in the case of `|win|` or `|tie|`). `@pkmn/stats` treats all
  double downs correctly.
- Smogon-Usage-Stats' team canconicalization does not respect the **`hpType`** field when
  determining Hidden Power type, `@pkmn/stats` does.
- Smogon-Usage-Stats ignores and does not track a mega-evolved Pokémon's **Ability pre-mega
  evolution**, `@pkmn/stats` does.
- Smogon-Usage-Stats team analyzer intends to handle the **classification** of Meloetta-Pirouette,
  Darmanitan-Zen, Mega-Rayquaze and regular megas separately but fails to do so, `@pkmn/stats`
  instead applies the intended handling approriately.
- The 'Checks and Counters' section of Smogon-Usage-Stats' moveset report has **botched padding**
  around the 'KOed/switched out' cell, `@pkmn/stats` fixes this.
- The Smogon-Usage-Stat moveset report is **sorted incorrectly** because it sorts *after* rounding
  the usage values - `@pkmn/stats` sorts before rounding.
- Smogon-Usage-Stats intends to coalesce all neutral Natures into 'Hardy' but fails to do so,
  `@pkmn/stats` corrects this.
- Smogon-Usage-Stats only **removes extraneous EVs** from a Pokémon's Defense EV total instead of
  applying the rounding logic to all EVs like `@pkmn/stats` does.
- Smogon-Usage-Stats internally treats an **`rprd` of `0`** differently in various reports,
  `@pkmn/stats` handles a `rprd` of `0` consistently across its output.

Smogon-Usage-Stats has a bug in its log parsing logic where it chokes on an interaction between
Illusion and Transform/Imposter that `@pkmn/stats` does **not** fix because it is exclusively a
concern for Hackmons formats and would require an overhaul of the parsing architecture to handle
(there is not enough information in a s single log line to disambiguate the scenario). If
`@pkmn/stats`'s parsing logic were to be rewritten using `@pkmn/client` or similar this would be
fixable, but this would potentially have undersirable performance implications.
