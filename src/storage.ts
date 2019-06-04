import * as path from 'path';

import * as fs from './fs';
import {Offset} from './checkpoint';

export interface Storage {
  listFormats(): Promise<string[]>;
  listLogs(format: string, offset?: Offset, max?: number): Promise<[Offset|undefined, string[]]>;
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

  async listLogs(format: string, offset?: Offset, max = Infinity): Promise<[Offset|undefined, string[]]> {
    const logs: string[] = [];
    const formatDir = path.resolve(this.dir, format);
    let last: Offset|undefined = undefined;
    for (const day of (await fs.readdir(formatDir)).sort()) {
      if (offset && day < offset.day) continue;
      const dayDir = path.resolve(formatDir, day);
      for (const log of (await fs.readdir(dayDir)).sort()) {
        if (offset && log < offset.log) continue;
        if (logs.length > max) return [last, logs.sort()];
        logs.push(path.join(format, day, log));
        last = {day, log};
      }
    }
    return [undefined, logs.sort()];
  }

  readLog(log: string) {
    return fs.readFile(path.resolve(this.dir, log), 'utf8');
  }
}