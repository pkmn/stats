import * as path from 'path';

import {Offset} from './checkpoint';
import * as fs from './fs';

export interface Storage {
  formatSizes(): Promise<{[format: string]: number}>;
  listLogs(format: string, offset?: Offset, max?: number): Promise<[Offset | undefined, string[]]>;
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

  async formatSizes() {
    const sizes: {[format: string]: number} = {};
    for (const format of await fs.readdir(this.dir)) {
      const formatDir = path.resolve(this.dir, format);
      for (const day of await fs.readdir(formatDir)) {
        const dayDir = path.resolve(formatDir, day);
        sizes[format] = (sizes[format] || 0) + (await fs.readdir(dayDir)).length;
      }
    }
    return sizes;
  }

  async listLogs(format: string, offset?: Offset, max = Infinity):
      Promise<[Offset | undefined, string[]]> {
    const logs: string[] = [];
    const formatDir = path.resolve(this.dir, format);
    let last: Offset|undefined = undefined;
    const cmp = Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare;
    for (const day of (await fs.readdir(formatDir)).sort(cmp)) {
      if (offset && day < offset.day) continue;
      const dayDir = path.resolve(formatDir, day);
      for (const log of (await fs.readdir(dayDir)).sort(cmp)) {
        if (offset && log < offset.log) continue;
        if (logs.length > max) return [last, logs.sort(cmp)];
        logs.push(path.join(format, day, log));
        last = {day, log};
      }
    }
    return [undefined, logs.sort(cmp)];
  }

  readLog(log: string) {
    return fs.readFile(path.resolve(this.dir, log), 'utf8');
  }
}
