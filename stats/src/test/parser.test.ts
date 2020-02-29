import * as fs from 'fs';
import * as path from 'path';

import { Dex } from 'ps';

import { Log, Parser } from '../parser';

const TESTDATA = path.resolve(__dirname.replace('build', 'src'), 'testdata');

async function setup() {
  const DEX = await Dex.forFormat('gen7anythinggoes');
  const LOG = path.resolve(TESTDATA, 'logs', DEX.format, 'log.1.json');

  const read = () => JSON.parse(fs.readFileSync(LOG, 'utf8'));
  const parse = (log: Log) => Parser.parse(log, DEX);
  return { read, parse };
}

describe('Parser', () => {
  test('log = "log"', async () => {
    const { parse } = await setup();
    expect(() => {
      parse(('"log"' as unknown) as Log);
    }).toThrow('Log = "log"');
  });
  test('no turn count', async () => {
    const { read, parse } = await setup();
    expect(() => {
      const raw = read();
      delete raw.turns;
      parse(raw);
    }).toThrow('No turn count');
  });
  test('two winners', async () => {
    const { read, parse } = await setup();
    expect(() => {
      const raw = read();
      raw.log.push('|win|test-player-b');
      parse(raw);
    }).toThrow('Battle had two winners');
  });
  test('self battle', async () => {
    const { read, parse } = await setup();
    expect(() => {
      const raw = read();
      raw.p2 = raw.p1;
      parse(raw);
    }).toThrow('Player battling themself');
  });
  test('bad log', async () => {
    const { read, parse } = await setup();
    const raw = read();
    const log = raw.log.slice();
    for (const line of ['|move|Bad', '|switch|Bad']) {
      expect(() => {
        raw.log = log.slice().concat(line);
        parse(raw);
      }).toThrow(`Could not parse line: '${line}'`);
    }
  });
  test('unknown species', async () => {
    const { read, parse } = await setup();
    expect(() => {
      const raw = read();
      raw.log.push('|switch|p1a: Oops|Oops|100/100');
      parse(raw);
    }).toThrow(`Unknown species 'Oops'`);
  });
});
