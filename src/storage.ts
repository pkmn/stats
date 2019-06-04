import * as path from 'path';

import {Offset} from './checkpoint';
import * as fs from './fs';

export interface Storage {
  listFormats(): Promise<string[]>;
  listLogs(format: string, offset?: Offset): Promise<string[]>;
  readLog(log: string): Promise<string>;
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

  async listFormats() {
    return (await fs.readdir(this.dir)).sort();
  }

  async listLogs(format: string, offset?: Offset, max = Infinity): Promise<string[]> {
    const logs: string[] = [];
    const formatDir = path.resolve(this.dir, format);
    const cmp = Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare;
    for (const day of (await fs.readdir(formatDir)).sort(cmp)) {
      if (offset && day < offset.day) continue;
      const dayDir = path.resolve(formatDir, day);
      for (const log of (await fs.readdir(dayDir)).sort(cmp)) {
        if (offset && log < offset.log) continue;
        logs.push(path.join(format, day, log));
      }
    }
    return logs.sort(cmp);
  }

  readLog(log: string) {
    return fs.readFile(path.resolve(this.dir, log), 'utf8');
  }
}
