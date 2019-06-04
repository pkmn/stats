import * as path from 'path';

import * as fs from './fs';

export interface Storage {
  listFormats(): Promise<string[]>;
  listLogs(format: string, start?: string, max?: number): Promise<[string, string[]]>;
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

  async listLogs(format: string, start = '', max = Infinity): Promise<[string, string[]]> {
    const logs: string[] = [];
    const formatDir = path.resolve(this.dir, format);
    let last = '';
    for (const day of (await fs.readdir(formatDir)).sort()) {
      if (start && day < start) continue;
      const dayDir = path.resolve(formatDir, day);
      for (const file of (await fs.readdir(dayDir)).sort()) {
        if (logs.length > max) return [last, logs.sort()];
        logs.push(path.join(format, day, file));
        last = day;
      }
    }
    return ['', logs.sort()];
  }

  readLog(log: string) {
    return fs.readFile(path.resolve(this.dir, log), 'utf8');
  }
}