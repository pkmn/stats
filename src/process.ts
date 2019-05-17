import * as fs from 'fs';
import * as path from 'path';

import {ID, toID} from 'ps';

import * as stats from '../index';

const CUTOFFS = [0, 1500, 1630, 1760]; // TODO: gen7ou
//const TAGS: Set<ID> = new Set(); // TODO: monotype

export function process(month: string, reports: string) {
  rmrf(reports);
  fs.mkdirSync(reports);

  // YYYY-MM
  // └── format
  //    └── YYYY-MM-DD
  //        └── battle-format-N.log.json

  // TODO: async + multi process
  for (const f of fs.readdirSync(month)) {
    const format = toID(f);
    const s = stats.Stats.create();

    const d = path.resolve(month, f);
    for (const day of fs.readdirSync(d)) {

      const l = path.resolve(d, day);
      for (const log of fs.readdirSync(l)) {
        const file = path.resolve(l, log);
        try {
          // TODO: gzip
          const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
          // TODO: save checkpoints/IR
          const battle = stats.Parser.parse(raw, format);
          stats.Stats.update(format, battle, CUTOFFS, s /*, TODO: TAGS */);
        } catch (err) {
          console.err(`${file}: ${err.message}`);
        }
      }
    }

    // YYYY-MM
    // ├── chaos
    // │   └── format-N.json
    // ├── format-N.txt
    // ├── leads
    // │   └── format-N.txt
    // ├── metagame
    // │   └── format-N.txt
    // ├── monotype
    // │   ├── chaos
    // │   │   └── format-monoT-N.json
    // │   ├── format-monoT-N.txt
    // │   ├── leads
    // │   │   └── format-monoT-N.txt
    // │   ├── metagame
    // │   │   └── format-monoT-N.txt
    // │   └── moveset
    // │       └── format-monoT-N.txt
    // └── moveset
    //     └── format-N.txt

    // TODO: stream directly to file instead of building up string
    const b = s.battles;
    for (const [c, s] of s.total.entries()) {
      const file = `${format}-${c}`;
      const usage = stats.Reports.usageReport(format, s, b);
      fs.writeFileSync(path.resolve(reports, `${file}.txt`), usage);
      const leads = stats.Reports.leadsReport(format, s, b);
      fs.writeFileSync(path.resolve(reports, 'leads', `${file}.txt`), leads);
      const movesets = stats.Reports.movesetReports(format, s, b, c);
      fs.writeFileSync(path.resolve(reports, 'moveset', `${file}.txt`), movesets.basic);
      fs.writeFileSync(path.resolve(reports, 'chaos', `${file}.json`), movesets.detailed);
      const metagame = stats.Reports.metagameReport(s);
      fs.writeFileSync(path.resolve(reports, 'metagame', `${file}.txt`), metagame);
    }

    // TODO tags
    for (const [t, ts] of s.tags.entries()) {
      for (const [c, s] of ts.entries()) {
        // TODO tags
      }
    }
  }
}

function rmrf(dir: string) {
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      const f = path.resolve(dir, file);
      if (fs.lstatSync(f).isDirectory()) {
        rmrf(f);
      } else {
        fs.unlinkSync(f);
      }
    }
    fs.rmdirSync(dir);
  }
}
