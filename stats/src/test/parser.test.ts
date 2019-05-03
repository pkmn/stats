import * as fs from 'fs';
import * as path from 'path';

import {Dex, ID} from '@pkmn/dex';

import {Log, Parser} from '../parser';
import {newGenerations} from '../util';

const TESTDATA = path.resolve(__dirname.replace('build', 'src'), 'testdata');

function setup() {
  const GEN = newGenerations(Dex).get(7);
  const FORMAT = 'gen7anythinggoes' as ID;
  const LOG = path.resolve(TESTDATA, 'logs', FORMAT, 'log.1.json');

  const read = () => JSON.parse(fs.readFileSync(LOG, 'utf8'));
  const parse = (log: Log) => Parser.parse(GEN, FORMAT, log);
  return {read, parse};
}

describe('Parser', () => {
  test('log = "log"', () => {
    const {parse} = setup();
    expect(() => {
      parse(('"log"' as unknown) as Log);
    }).toThrow('Log = "log"');
  });
  test('no turn count', () => {
    const {read, parse} = setup();
    expect(() => {
      const raw = read();
      delete raw.turns;
      parse(raw);
    }).toThrow('No turn count');
  });
  test('two winners', () => {
    const {read, parse} = setup();
    expect(() => {
      const raw = read();
      raw.log.push('|win|test-player-b');
      parse(raw);
    }).toThrow('Battle had two winners');
  });
  test('self battle', () => {
    const {read, parse} = setup();
    expect(() => {
      const raw = read();
      raw.p2 = raw.p1;
      parse(raw);
    }).toThrow('Player battling themself');
  });
  test('bad log', () => {
    const {read, parse} = setup();
    const raw = read();
    const log = raw.log.slice();
    for (const line of ['|move|Bad', '|switch|Bad']) {
      expect(() => {
        raw.log = log.slice().concat(line);
        parse(raw);
      }).toThrow(`Could not parse line: '${line}'`);
    }
  });
  test('unknown species', () => {
    const {read, parse} = setup();
    expect(() => {
      const raw = read();
      raw.log.push('|switch|p1a: Oops|Oops|100/100');
      parse(raw);
    }).toThrow('Unknown species \'Oops\'');
  });
});
