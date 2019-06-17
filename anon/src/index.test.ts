import * as fs from 'fs';
import * as path from 'path';

import { Anonymizer } from './index';

const TESTDATA = path.resolve(__dirname.replace('build', 'src'), 'testdata');

describe('Anonymizer', () => {
  test('anonymizeTeam', () => {
    const raw = fs.readFileSync(path.resolve(TESTDATA, 'team.json'), 'utf8');
    expect(Anonymizer.anonymizeTeam(JSON.parse(raw)).map(p => p.name)).toEqual([
      'Rayquaza',
      'Greninja',
      'Meloetta',
      'Zoroark',
      'Ditto',
      'Shedinja',
    ]);
    expect(Anonymizer.anonymizeTeam(JSON.parse(raw), 'gen7ubers', 'salt').map(p => p.name)).toEqual(
      ['64bd07b346', 'd677adb2c9', '962d76aee3', 'a8d7f93b51', 'ce04869101', '46ea409020']
    );
  });
  // TODO: test anonymize
});
