import * as path from 'path';
import * as fs from '../fs';
import {ID} from '../config';
import {CMP} from '.';
import {Limit} from '../limit';

export interface Offset {
  day: string;
  format: string;
  id: number;
}

export interface Batch {
  begin: Offset;
  end: Offset;
}

export interface Workspace {
  decompressed: string;
  checkpoints: string;
  scratch: string;
}

export type Task = {
  format: ID;
  shard?: string;
} & ({
  batch: Batch;
} | {
  done(): Promise<void>
});

const YYYYMM = /^(\d{4}-\d{2})/;
const YYYYMMDD = /^(\d{4}-\d{2}-\d{2})/;

// BUG:
// - Date ranges only work with UTC, PS main doesnt use UTC so date ranges going to be off
// - Issue if multiple directory with the same date exist (eg. 2020-08.tar & 2020-08)
export class LogFileStorage /*implements LogStorage*/ {
  readonly dir: string;
  readonly workspace: Workspace;
  readonly constrained: boolean;
  readonly limit: Limit;

  constructor(dir: string, workspace: Workspace, constrained: boolean, limit: Limit) {
    this.dir = dir;
    this.workspace = workspace;
    this.constrained = constrained;
    this.limit = limit;
  }

  async process(
    accept: (format: ID) => boolean | string[],
    fn: (task: Task) => void,
    begin?: Date,
    end?: Date
  ) {
    let root;
    const months: Array<{path: string, date: Date}> = [];
    let match = YYYYMM.exec(path.basename(this.dir));
    if (match) {
      root = path.dirname(this.dir);
      months.push({path: this.dir, date: new Date(match[0])});
    } else {
      root = this.dir;
      for (const dir of (await fs.readdir(this.dir)).sort(CMP)) {
        match = YYYYMM.exec(path.basename(dir));
        if (!match) continue;
        months.push({
          path: path.join(this.dir, dir),
          date: new Date(match[0]),
        });
      }
    }

    const opens = [];
    const formats = new Map<ID, {shards: string[] | [undefined], months: string[]}>();
    for (const month of months) {
      if (begin && begin > month.date) continue;
      if (end && end <= month.date) break;
      opens.push(this.open(month.path, root, this.workspace.decompressed).then(async opened => {
        for (const f of opened.files) {
          const index = f.indexOf('.');
          const format = (index > 0 ? f.slice(0, index) : f) as ID;

          const data = formats.get(format);
          if (data) {
            data.months.push(path.join(opened.path, f));
            continue;
          }

          // TODO if checkpoints have been tombstoned we can delete format as well...
          let shards = accept(format);
          if (!shards) {
            if (this.constrained && opened.tmp) await fs.rmrf(opened.path);
            continue;
          }

          formats.set(format, {
            shards: shards === true ? [undefined] : shards,
            months: [path.join(opened.path, f)]
          });
        }
      }));
    }
    await Promise.all(opens);

    const all = [];
    for (const [format, data] of formats) {
      const f = this.processFormat(root, format, data, fn, begin, end);
      all.push(f);
      if (this.constrained) await f;
    }
    await Promise.all(all);
  }

  async processFormat(
    root: string,
    format: ID,
    data: {shards: string[] | [undefined], months: string[]},
    fn: (task: Task) => void,
    begin?: Date,
    end?: Date
  ) {

    for (const month of data.months) {
      // FIXME expand format dir,
      // TODO handle days in parallel as well
    }

    const remaining = new Set(data.shards);
    const promise = new Promise((resolve, reject) => {
      for (const shard of data.shards) {
        fn({format, shard, done: async () => {
          try {
            remaining.delete(shard);
            if (remaining.size) return;
            if (this.constrained) {
              // TODO turn checkpoints into tombstone
              const rms = [];
              for (const month of data.months) {
                rms.push(fs.rmrf(month));
              }
              await Promise.all(rms);
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        }});
      }
    });

    await promise;
  }

  private async open(dir: string, root: string, to: string, tmp = false) {
    let stats = await fs.lstat(dir);
    if (stats.isDirectory()) {
      return {path: dir, files: await fs.readdir(dir), tmp};
    } else {
      const unpacked = path.join(to, dir.slice(root.length));
      let stats = await fs.lstat(unpacked)
      if (!stats.isDirectory()) await fs.unpack(dir, unpacked);
      return {path: unpacked, files: await fs.readdir(unpacked), tmp: true};
    }
  }
}

// PRECONDITION: logs.sort(CMP)
function bsearch(logs: string[], begin?: Date, end?: Date) {
  const cache: {[log: string]: Date} = {};
  const date = async (log: string) => {
    const cached = cache[log];
    if (cached) return cached;
    return (cache[log] = new Date(JSON.parse(await fs.readFile(log)).timestamp));
  };

  let l = 0;
  let m = 0;
  let h = logs.length - 1;

  if (begin) {
    while (l < h) {
      m = Math.floor((l + h) / 2);
      if (+date(logs[m]) < +begin) {
        l = m + 1;
      } else {
        h = m;
      }
    }
  }

  h = logs.length - 1;
  if (!end) return [l, h];
  const low = l;

  while (l < h) {
    m = Math.floor((l + h) / 2);
    if (+date(logs[m]) > +end) {
      h = m;
    } else {
      l = m + 1;
    }
  }

  return [low, h - 1];
}


// 2020-08/gen1ou/2020-08-14/battle-gen1ou-24687621.log.json -> 2020-08-14_gen1ou_24687621
const encode = (log: string) => {
  const day = path.basename(path.dirname(log));
  const [, format, num] = path.basename(log).split('-');
  return `${day}_${format}_${parseInt(num)}`;
}
// 2020-08-14_gen1ou_24687621 -> 2020-08/gen1ou/2020-08-14/battle-gen1ou-24687621.log.json
const decode = (offset: string) => {
  const [day, format, num] = path.basename(offset).split('_');
  return path.join(
    day.slice(0, day.lastIndexOf('-')),
    format,
    day,
    `battle-${format}-${num}.log.json`
  );
}