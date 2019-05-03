import * as fs from 'fs';
import * as path from 'path';

import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/dex';

import {Anonymizer, Verifier} from './index';

const TESTDATA = path.resolve(__dirname.replace('build', 'src'), 'testdata');
const GENS = new Generations(Dex);

describe('Anonymizer', () => {
  test('anonymize', () => {
    const file = fs.readFileSync(path.resolve(TESTDATA, 'raw.json'), 'utf8');
    const raw = JSON.parse(file);
    const anon = JSON.parse(fs.readFileSync(path.resolve(TESTDATA, 'anon.json'), 'utf8'));
    const salt = JSON.parse(fs.readFileSync(path.resolve(TESTDATA, 'salt.json'), 'utf8'));

    let verifier = new Verifier();
    expect(Anonymizer.anonymize(GENS.get(7), raw, {verifier, copy: true})).toEqual(anon);
    expect(verifier.ok()).toBe(true);

    verifier = new Verifier();
    expect(Anonymizer.anonymize(GENS.get(7), raw, {salt: 'salt', verifier})).toEqual(salt);
    expect(verifier.ok()).toBe(true);

    verifier = new Verifier();
    const mod = JSON.parse(file.replace(/aaaaaaaaaa/g, 'Air Lock'));
    expect(Anonymizer.anonymize(GENS.get(7), mod, {verifier})).toEqual(anon);
    expect(verifier.ok()).toBe(false);
    expect(verifier.leaks).toEqual([{
      input: '|-ability|p2a: Air Lock|Air Lock',
      output: '|-ability|p2a: Rayquaza|Air Lock',
    }]);
  });

  test('anonymizeTeam', () => {
    const raw = JSON.parse(fs.readFileSync(path.resolve(TESTDATA, 'team.json'), 'utf8'));
    expect(Anonymizer.anonymizeTeam(GENS.get(7), raw).map(p => p.name)).toEqual(
      ['Rayquaza', 'Greninja', 'Meloetta', 'Zoroark', 'Ditto', 'Shedinja']
    );
    expect(Anonymizer.anonymizeTeam(GENS.get(7), raw, {salt: 'salt'}).map(p => p.name)).toEqual(
      ['64bd07b346', 'd677adb2c9', '962d76aee3', 'a8d7f93b51', 'ce04869101', '46ea409020']
    );
  });
});
