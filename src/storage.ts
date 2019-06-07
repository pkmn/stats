import * as path from 'path';

import {Offset} from './checkpoint';
import * as fs from './fs';

const CMP = Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare;

export interface Storage {
  list(raw?: string, day?: string): Promise<string[]>;
  select(raw: string, offset?: Offset, end?: Offset): Promise<string[]>;
  read(log: string): Promise<string>;
}

export class Storage {
  static connect(options: {dir: string}): Storage {
    // TODO: support DatabaseStorage as well
    return new FileStorage(options.dir);
  }
}

class FileStorage implements Storage {
  dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  list(raw?: string, day?: string) {
    if (!raw) return fs.readdir(this.dir).sort(CMP);
    const formatDir = path.resolve(this.dir, raw);
    if (!day) return fs.readdir(formatDir).sort(CMP);
    const dayDir = path.resolve(formatDir, day);
    return fs.readdir(dayDir).sort(CMP);
  }

  async select(raw: string, begin?: Offset, end?: Offset): Promise<string[]> {
    const range: string[] = [];

    for (const day of await this.list(raw)) {
      if (begin && day < end.day) continue;
      if (end && day > end.day) break;

      const logs = await this.list(raw, day);
      if (begin && day === begin.day) {
        const n = day === end.day ? end.index : logs.length;
        for (let i = begin.index; i < n; i++) {
          range.push(path.join(raw, day, log));
        }
      } else if (end && day === end.day) {
        // NOTE: If begin is for the same day we would handle it above.
        for (let i = 0; i < end.index; i++) {
          range.push(path.join(raw, day, log));
        }
      } else {
        for (const log of logs) {
          range.push(path.join(raw, day, log));
        }
      }
    }

    return range;
  }

  read(log: string) {
    return fs.readFile(path.resolve(this.dir, log), 'utf8');
  }
}
