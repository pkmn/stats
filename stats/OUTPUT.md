# Output

## Smogon-Usage-Stats

The usage stats output from Smogon-Usage-Stats is spread out across 5 different reports - overall
**usage**, **leads** usage, **moveset**, **metagame** and **detailed** moveset ('`chaos.json`')
reports. The first four reports are simple text files containing ASCII tables and are intended for
human consumption, whereas the final report is intended for programmatic use. There are several
issues with the text files using ASCII tables (there are bugs in the table generation logic causing
warped tables, HTML or BBCode tables would be easier to generate and easier for a human to read and
machines should be reading the JSON anyway), issues with the detailed moveset JSON are worth
focusing on.

```ts
interface UsageStatistics {
  info: {
    metagame: string;
    cutoff: number;
    'cutoff deviation': 0;
    'team type': ID | null;
    'number of battles': number;
  };
  data: { [name: string]: MovesetStatistics };
}

interface MovesetStatistics {
  'Raw count': number;
  usage: number;
  // num GXE, max GXE, 1% GXE, 20% GXE
  'Viability Ceiling': [number, number, number, number];
  Abilities: { [ability: string]: number };
  Items: { [item: string]: number };
  Spreads: { [spread: string]: number };
  Happiness: { [happiness: string]: number };
  Moves: { [move: string]: number };
  Teammates: { [pokemon: string]: number };
  // n = sum(POKE1_KOED...DOUBLE_SWITCH)
  // p = POKE1_KOED + POKE1_SWITCHED_OUT / n
  // d = sqrt((p * (1 - p)) / n)
  'Checks and Counters': { [pokemon: string]: [number, number, number] };
}
```

### Issues

- The keys of the JSON objects follow inconsistent naming schemes. At the superficial level this
  means that top level keys are sometimes in display case and sometimes not (eg. '`Checks and
  Counters`' vs. '`usage`'), but at a more fundamental level, some of the internal keys are the
  display name of the game object in question and some are IDs - '`Abilities`', '`Items`' and
  '`Moves`' are IDs whereas species (as the key to '`data`' and in '`Teammates`' and '`Checks and
  Counters`' are display names). The use of IDs for some fields forces an application which wishes
  to display anything to contain mappings from ID to display names (ie. it is **forced to include
  data files**).
- No cutoffs are applied to the data outside of a top level cutoff on species usage. While this may
  be seen as a future ("developers get all the data!"), this is mainly superficial because rounding
  is still applied so you end up getting a lot of keys assigned `0` weight (which is perhaps useful
  to know something is 'present', but doesn't really provide quality information). The **lack of
  cutoffs severely impacts bandwidth size** without providing commensurate value (while once again
  requiring any developer who wishes to display the stats to a human user to apply their own
  cutoffs). The '`Spreads`' culprit here is the biggest concern (exacerbated by the fact that
  rounding EVs to buckets of 4 is broken) - each spread is a large string key and the vast majority
  are assigned `0` weight, meaning a large proportion of the bandwidth of the detailed stats is
  spent on zero information.
- **Lack of rounding means bandwidth is wasted** on floating point representations (and requires the
  developer to round for display themselves). '`0.0000189018`' is significantly larger over the wire
  than '`0.123`' (though in this specific case, the weighting should actually be rounded to `0` and
  dropped, as the bullet above details). The values aren't being rounded for precision but instead
  due to oversight/laziness.
- The report values are **weights instead of percentages**. Weights themselves are not particularly
  useful and thus developers are required to perform O(N) work to sum the weights and then convert
  them into percentages.
- Most importantly, the **JSON does not actually include all of the information present in other the
  text files**, meaning programmers are forced to parse the text files as well if they want that
  information (most obviously leads information, but each text file contains information not present
  in the JSON file, even the moveset text file itself!)

## `@pkmn/stats`

The usage stats output should instead be changed to one which maps closer to the internal data
representation but has the explicit goal of being **<ins>accessible</ins>**. The output should be
**immediately useful** out of the box (developers shouldn't be required to
map/sort/format/round/compute the data in any way for it to be sensibly consumable by a human) while
also paying attention to **bandwidth**. The size of the wire representation is important primarily
because it opens up more opportunities for where the statistics data can be used.

```ts
interface Statistics {
  battles: number;
  pokemon: { [name: string]: UsageStatistics };
  metagame: MetagameStatistics;
}

interface UsageStatistics {
  lead: Usage;
  usage: Usage;
  unique: Usage; // NEW
  wins: Usage; // NEW

  count: number;
  weight: number | null;
  viability: [number, number, number, number];

  abilities: { [name: string]: number };
  items: { [name: string]: number };
  stats: { [spread: string]: number }; // NEW
  moves: { [name: string]: number };
  teammates: { [name: string]: number };
  counters: { [name: string]: [number, number, number] };
}

interface MetagameStatistics {
  tags: { [tag: string]: number };
  stalliness: {
    histogram: Array<[number, number]>;
    mean: number;
    total: number;
  };
}

interface Usage {
  raw: number;
  real: number;
  weighted: number;
}
```

### Changes

- Top level keys follow a consistent naming scheme, all internal game object **keys are in the
  display representation** instead of IDs. The move away from IDs has slight implications to
  bandwidth due to the presence of spaces and other characters but is worth not requiring a data
  library to use. Keys in the generated JSON are also guaranteed to be **sorted** (while the JSON
  specification does not strictly allow for this, using `JSON.parse` in ES2015 and many other JSON
  parsing implementations will maintain this order).
- All values are converted to **percentages** and **rounded** to 0.001% and values which are below
  this **cutoff** are elided. This has a tremendous impact on overall bandwidth / size while only
  trivially affecting the quality of data offered. Weights can still be obtained by simply
  multiplying by the usage weight in O(1) time if they were actually desired instead of requiring
  O(N) computation.
- **<ins>All</ins> of the data is present in a single location**, not spread out over 5 and
  requiring ASCII table parsing.

### Data Changes

In addition to the high level changes outlined above, there are several changes to the data output
that are relevant:

- **`happiness` has been dropped**. Happiness is mostly uninteresting as there are clear reasons to
  choose either `0` or `255` which are also inferable from the proportion of `Frustration` move
  usage for the Pokemon in question.
- **`counters` has changed from `[n, p, d]` to `[n, koed/n, switched/n]`**. `p` and `d` are
  derivable from `koed` and `switched` but not the other way around.
- Usage statistics tracking the amount of **`unique `users** that used a specific Pokemon for use in tiering calculations has been added. This has been requested by Smogon's tiering admins.
- Usage statistics tracking the amount of **`wins`** a specific Pokemon was involved in. This is
  particularly interesting for balancing Random Battles, though for non-random formats weighted
  statistics are more important.
- Information about the **exact `stats`** that were used (this includes contributions from IVs, and importantly, level) have been included and information about **`spreads` has been dropped**.
