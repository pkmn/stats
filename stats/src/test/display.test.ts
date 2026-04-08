import {parseLeadsReport, parseUsageReport} from '../display';

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
