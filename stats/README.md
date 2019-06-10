# stats

This package provides the core logic required for parsing and analyzing Pokémon
Showdown battle logs. While the top level package houses the logic responsible
for the processing and output of the specific reports Smogon requires at scale,
this sub package contains the building blocks for creating new reports and
analyses (or simply for classifying specific types of teams or Pokemon).

This code is based on a rewrite of [Smogon-Usage-Stats][1], written by Antar
Iliev, and is distributed under the under the terms of the [MIT License][2].

  [1]: https://github.com/Antar1011/Smogon-Usage-Stats
  [2]: https://github.com/pkmn-cc/Pokemon-Showdown-Stats/blob/master/stats/LICENSE
