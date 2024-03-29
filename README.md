<p align="center">
  <img alt="pkmn/stats" width="215" height="292" src="https://pkmn.cc/red-computer.png" />
  <br />
  <br />
  <a href="https://github.com/pkmn/stats/actions/workflows/test.yml">
    <img alt="Test Status" src="https://github.com/pkmn/stats/workflows/Tests/badge.svg" />
  </a>
  <a><img alt="WIP" src="https://img.shields.io/badge/status-WIP-red.svg" /></a>
  <a href="https://github.com/pkmn/stats/blob/master/LICENSE">
    <img alt="License" src="https://img.shields.io/badge/License-MIT-blue.svg" />
  </a>
</p>
<hr />

This is the top level of [`@pkmn`](https://pkmn.cc/@pkmn/)'s Pokémon Showdown battle logs
processing and analysis components.

- [`@pkmn/stats`](stats): core logic required for parsing and analyzing Pokémon Showdown battle
logs, classifying specific types of teams or Pokémon, and producing various reports about their
usage
- [`@pkmn/anon`](anon): code to anonymize Pokémon Showdown teams and battle logs
- [`@pkmn/logs`](logs): framework for processing hundreds of gigabytes/terabytes of Pokémon Showdown
  battle simulator logs/archives efficiently

Everything in this repository is distributed under the terms of the [MIT License](LICENSE).
