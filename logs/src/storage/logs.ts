import * as path from 'path';
import {Offset} from '../checkpoints';
import * as fs from '../fs';
import {ID} from '../config';
import {LogStorage, CMP} from '.';

export class LogFileStorage implements LogStorage {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async list(format?: ID, day?: string) {
    if (!format) return (await fs.readdir(this.dir)).sort(CMP);
    const formatDir = path.resolve(this.dir, format);
    if (!day) return (await fs.readdir(formatDir)).sort(CMP);
    const dayDir = path.resolve(formatDir, day);
    return (await fs.readdir(dayDir)).sort(CMP);
  }

  async select(format: ID, begin?: Offset, end?: Offset): Promise<string[]> {
    const range: string[] = [];

    for (const day of await this.list(format)) {
      if (begin && day < begin.day) continue;
      if (end && day > end.day) break;

      const logs = await this.list(format, day);
      if (begin && day === begin.day) {
        const n = end && day === end.day ? end.index.local + 1 : logs.length;
        for (let i = begin.index.local; i < n; i++) {
          range.push(path.join(format, day, logs[i]));
        }
      } else if (end && day === end.day) {
        // NOTE: If begin is for the same day we would handle it above.
        for (let i = 0; i <= end.index.local; i++) {
          range.push(path.join(format, day, logs[i]));
        }
      } else {
        for (const log of logs) {
          range.push(path.join(format, day, log));
        }
      }
    }

    return range;
  }

  read(log: string) {
    return fs.readFile(path.resolve(this.dir, log));
  }
}