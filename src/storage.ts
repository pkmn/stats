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

const CMP = Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}).compare;

class FileStorage implements Storage {
  dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  // async formatSizes() {
  // const sizes: {[format: string]: number} = {};
  // for (const format of await fs.readdir(this.dir)) {
  // const formatDir = path.resolve(this.dir, format);
  // for (const day of await fs.readdir(formatDir)) {
  // const dayDir = path.resolve(formatDir, day);
  // sizes[format] = (sizes[format] || 0) + (await fs.readdir(dayDir)).length;
  //}
  //}
  // return sizes;
  //}

  async listLogs(format: string, begin?: Offset, end?: Offset): Promise<string[]> {
    const logs: string[] = [];

    const formatDir = path.resolve(this.dir, format);
    for (const day of (await fs.readdir(formatDir)).sort(CMP)) {
      if (begin && day < end.day) continue;
      if (end && day > end.day) break;

      const dayDir = path.resolve(formatDir, day);
      const all = (await fs.readdir(dayDir)).sort(CMP));
      if (begin && day === begin.day) {
        const n = day === end.day ? end.index : all.length;
        for (let i = begin.index; i < n; i++) {
          logs.push(path.join(format, day, log));
        }
      } else if (end && day === end.day) {
        // NOTE: If begin is for the same day we would handle it above.
        for (let i = 0; i < end.index; i++) {
          logs.push(path.join(format, day, log));
        }
      } else {
        for (const log of all) {
          logs.push(path.join(format, day, log));
        }
      }
    }

    return logs;
  }

  readLog(log: string) {
    return fs.readFile(path.resolve(this.dir, log), 'utf8');
  }
}
