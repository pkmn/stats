import {
  Display, parseLeadsReport, parseMetagameReport, parseUsageReport, partialParseMovesetReport,
} from '../display';

// Old format: leading space on header lines, Real column has actual values.
// New format (introduced 2026-03): no leading space, Real column is always 0.

const OLD_USAGE = [
  ' Total battles: 218',
  ' Avg. weight/team: 1.0',
  ' + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + ',
  ' | Rank | Pokemon            | Usage %   | Raw    | %       | Real   | %       | ',
  ' + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + ',
  ' | 1    | Greninja           | 16.51376% | 72     | 16.514% | 49     | 18.980% | ',
  ' | 2    | Incineroar         | 14.22018% | 62     | 14.220% | 38     | 14.719% | ',
].join('\n');

const NEW_USAGE = [
  'Total battles: 423',
  'Avg. weight/team: 1.000',
  '+ ---- + ------------------ + --------- + ------ + ------- + ------ + ------- +',
  '| Rank | Pokemon            | Usage %   | Raw    | %       | Real   | %       |',
  '+ ---- + ------------------ + --------- + ------ + ------- + ------ + ------- +',
  '| 1    | Rillaboom          | 16.78487% | 142    | 16.785% | 0      |  0.000% |',
  '| 2    | Incineroar         | 16.19385% | 137    | 16.194% | 0      |  0.000% |',
].join('\n');

const OLD_LEADS = [
  ' Total leads: 6',
  ' + ---- + ------------------ + --------- + ------ + ------- + ',
  ' | Rank | Pokemon            | Usage %   | Raw    | %       | ',
  ' + ---- + ------------------ + --------- + ------ + ------- + ',
  ' | 1    | Ogerpon            | 16.66667% | 1      | 16.667% | ',
].join('\n');

const NEW_LEADS = [
  'Total leads: 6',
  '+ ---- + ------------------ + --------- + ------ + ------- +',
  '| Rank | Pokemon            | Usage %   | Raw    | %       |',
  '+ ---- + ------------------ + --------- + ------ + ------- +',
  '| 1    | Ogerpon            | 16.66667% | 1      | 16.667% |',
].join('\n');

describe('parseUsageReport', () => {
  test('old format (leading space header)', () => {
    const r = parseUsageReport(OLD_USAGE);
    expect(r.battles).toBe(218);
    expect(r.avg).toBe(1.0);
    expect(r.usage['greninja']).toMatchObject({
      weightedp: expect.closeTo(0.1651376),
      raw: 72,
      rawp: expect.closeTo(0.16514),
      real: 49,
      realp: expect.closeTo(0.1898),
    });
  });

  test('new format (no leading space, real=0)', () => {
    const r = parseUsageReport(NEW_USAGE);
    expect(r.battles).toBe(423);
    expect(r.avg).toBe(1.0);
    expect(r.usage['rillaboom']).toMatchObject({
      weightedp: expect.closeTo(0.1678487),
      raw: 142,
      rawp: expect.closeTo(0.16785),
      real: 0,
      realp: 0,
    });
  });
});

describe('parseLeadsReport', () => {
  test('old format (leading space header)', () => {
    const r = parseLeadsReport(OLD_LEADS);
    expect(r.total).toBe(6);
    expect(r.usage['ogerpon']).toMatchObject({
      weightedp: expect.closeTo(0.1666667),
      raw: 1,
      rawp: expect.closeTo(0.16667),
    });
  });

  test('new format (no leading space)', () => {
    const r = parseLeadsReport(NEW_LEADS);
    expect(r.total).toBe(6);
    expect(r.usage['ogerpon']).toMatchObject({
      weightedp: expect.closeTo(0.1666667),
      raw: 1,
      rawp: expect.closeTo(0.16667),
    });
  });
});

const MOVESETS = [
  ' +---+',
  ' | Snorlax  |',
  ' +---+',
  ' | Raw count: 2  |',
  ' | Avg. weight: 1.0  |',
  ' +---+',
  ' +---+',
  ' +---+',
  ' +---+',
  ' +---+',
  ' +---+',
  ' +---+',
  ' | Checks and Counters |',
  ' | Tauros 1.0 (1.00±0.00) |',
  ' |  (100.0% KOed / 0.0% switched out) |',
].join('\n');

const USAGE_REPORT = [
  ' Total battles: 1',
  ' Avg. weight/team: 1.0',
  ' + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + ',
  ' | Rank | Pokemon            | Usage %   | Raw    | %       | Real   | %       | ',
  ' + ---- + ------------------ + --------- + ------ + ------- + ------ + ------- + ',
  ' | 1    | Snorlax            | 100.0000% | 2      | 100.000%| 2      | 100.000%| ',
].join('\n');

const BASE_POKEMON = {
  'Raw count': 2,
  usage: 1.0,
  'Viability Ceiling': [2, 89, 89, 89] as [number, number, number, number],
  Abilities: {illuminate: 2},
  Items: {nothing: 2},
  'Tera Types': {nothing: 2},
  Spreads: {'Serious:252/252/252/252/252/252': 2},
  Moves: {bodyslam: 2},
  Teammates: {},
};

const BASE_DETAILED = {
  info: {
    metagame: 'gen1ou', cutoff: 0, 'cutoff deviation': 0 as const,
    'team type': null, 'number of battles': 1,
  },
  data: {Snorlax: {...BASE_POKEMON, 'Checks and Counters': {} as any}},
};

// gen mock: all lookups return undefined so names fall back to their raw values
const mockGen = {
  species: {get: () => undefined},
  abilities: {get: () => undefined},
  items: {get: () => undefined},
  moves: {get: () => undefined},
} as any;

// Moveset report format changed in 2026-03: section separators and data lines lost their
// leading space. This broke section counting, species name extraction, and weight parsing.
// https://www.smogon.com/stats/2026-02/moveset/gen9ou-1825.txt (old)
// https://www.smogon.com/stats/2026-03/moveset/gen9ou-1825.txt (new)

// 9 content separators + 1 end separator = 10 per block (old format always had Tera Types)
const OLD_MOVESET = [
  ' +---+',
  ' | Snorlax  |',
  ' +---+',
  ' | Raw count: 2  |',
  ' | Avg. weight: 0.75  |',
  ' +---+',
  ' +---+',
  ' +---+',
  ' +---+',
  ' +---+',
  ' +---+',
  ' +---+',
  ' | Checks and Counters |',
  ' | Tauros 1.0 (1.00±0.00) |',
  ' |  (50.0% KOed / 25.0% switched out) |',
].join('\n');

const NEW_MOVESET = [
  '+---+',
  '| Snorlax  |',
  '+---+',
  '| Raw count: 2  |',
  '| Avg. weight: 0.75  |',
  '+---+',
  '+---+',
  '+---+',
  '+---+',
  '+---+',
  '+---+',
  '+---+',
  '| Checks and Counters |',
  '| Tauros 1.0 (1.00±0.00) |',
  '|\t(50.0% KOed / 25.0% switched out)',
].join('\n');

describe('partialParseMovesetReport', () => {
  test('old format (leading space) — species, weight, and outcomes parsed correctly', () => {
    const r = partialParseMovesetReport(OLD_MOVESET);
    expect(Object.keys(r)).toEqual(['Snorlax']);
    expect(r['Snorlax'].weight).toBeCloseTo(0.75);
    expect(r['Snorlax'].outcomes['Tauros']).toMatchObject({
      koedn: expect.closeTo(0.5),
      switchedn: expect.closeTo(0.25),
    });
  });

  test('new format (2026-03+) — species, weight, and outcomes parsed correctly', () => {
    const r = partialParseMovesetReport(NEW_MOVESET);
    expect(Object.keys(r)).toEqual(['Snorlax']);
    expect(r['Snorlax'].weight).toBeCloseTo(0.75);
    expect(r['Snorlax'].outcomes['Tauros']).toMatchObject({
      koedn: expect.closeTo(0.5),
      switchedn: expect.closeTo(0.25),
    });
  });

  test('old and new format produce identical results for equivalent data', () => {
    const old = partialParseMovesetReport(OLD_MOVESET);
    const neo = partialParseMovesetReport(NEW_MOVESET);
    expect(neo).toEqual(old);
  });

  test('weight >= 1 is parsed correctly (old slice(17) would give wrong result)', () => {
    const report = OLD_MOVESET.replace('Avg. weight: 0.75', 'Avg. weight: 1.5');
    const r = partialParseMovesetReport(report);
    expect(r['Snorlax'].weight).toBeCloseTo(1.5);
  });
});

// Metagame report format changed in 2026-03: old format has a leading space on tag lines,
// new format does not. Both must produce identical keys (no truncated first character).
// https://www.smogon.com/stats/2026-02/metagame/gen9ou-1825.txt (old)
// https://www.smogon.com/stats/2026-03/metagame/gen9ou-1825.txt (new)

const OLD_METAGAME = [
  ' weatherless...................84.96715%',
  ' offense.......................38.05594%',
  ' balance.......................30.04767%',
  ' hyperoffense..................13.71165%',
  ' trickroom..................... 0.49318%',
  '',
  ' Stalliness (mean:  0.108)',
  ' -1.0|##',
  '     |###',
  ' -0.5|####',
  '     |#####',
  '  0.0|######',
  ' more negative = more offensive, more positive = more stall',
  ' one # =  0.35%',
].join('\n');

const NEW_METAGAME = [
  'weatherless.......88.37742%',
  'offense...........36.34664%',
  'balance...........36.40463%',
  'hyperoffense......10.25606%',
  'trickroom.........0.54911%',
  '',
  'Stalliness (mean: 0.189)',
  '    |',
  '-1.0|##',
  '    |###',
  '-0.5|####',
  '    |#####',
  ' 0.0|######',
  'more negative = more offensive, more positive = more stall',
  'one # = 0.42%',
].join('\n');

describe('parseMetagameReport', () => {
  test('old format (leading space on tag lines) — keys are not truncated', () => {
    const r = parseMetagameReport(OLD_METAGAME);
    expect(Object.keys(r.tags))
      .toEqual(['weatherless', 'offense', 'balance', 'hyperoffense', 'trickroom']);
    expect(r.tags['weatherless']).toBeCloseTo(0.8496715);
    expect(r.tags['offense']).toBeCloseTo(0.3805594);
    expect(r.mean).toBeCloseTo(0.108);
  });

  test('new format (no leading space, 2026-03+) — keys are not truncated', () => {
    const r = parseMetagameReport(NEW_METAGAME);
    expect(Object.keys(r.tags))
      .toEqual(['weatherless', 'offense', 'balance', 'hyperoffense', 'trickroom']);
    expect(r.tags['weatherless']).toBeCloseTo(0.8837742);
    expect(r.tags['balance']).toBeCloseTo(0.3640463);
    expect(r.mean).toBeCloseTo(0.189);
  });

  test('old and new format produce the same tag keys for equivalent data', () => {
    const oldResult = parseMetagameReport(OLD_METAGAME);
    const newResult = parseMetagameReport(NEW_METAGAME);
    expect(Object.keys(oldResult.tags)).toEqual(Object.keys(newResult.tags));
  });
});

// Checks and Counters format changed in 2026-03 from [n, p, d] arrays to {n, p, d} objects.
// https://www.smogon.com/stats/2026-02/chaos/gen9ou-1825.json (old)
// https://www.smogon.com/stats/2026-03/chaos/gen9ou-1825.json (new)
describe('Display.fromReports — Checks and Counters format', () => {
  test.each([
    ['old: [n, p, d] array', {Tauros: [1, 1.0, 0.0]}],
    ['new (2026-03): {n, p, d} object', {Tauros: {n: 1, p: 1.0, d: 0.0}}],
  ] as const)('%s', (_, cnc) => {
    const detailed = JSON.stringify({
      ...BASE_DETAILED,
      data: {Snorlax: {...BASE_POKEMON, 'Checks and Counters': cnc}},
    });
    const result = Display.fromReports(mockGen, USAGE_REPORT, MOVESETS, detailed);
    expect(result.pokemon['Snorlax'].counters).toEqual({Tauros: [1, 1, 0]});
  });
});
