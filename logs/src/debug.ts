import { performance } from 'perf_hooks';
import * as util from 'util';
import { workerData } from 'worker_threads';

declare global {
  function LOG(...args: any[]): boolean;
  function VLOG(...args: any[]): boolean;
  function MLOG(...args: any[]): boolean;
}
const GLOBAL = global as any;
GLOBAL.LOG = LOG;
GLOBAL.VLOG = VLOG;
GLOBAL.MLOG = MLOG;

function LOG(...args: any[]) {
  const debug = !!process.env.DEBUG;
  if (!args.length || !debug) return debug;
  if (workerData) {
    log(`worker:${workerData.num}`, workerData.num, ...args);
  } else {
    log(`main`, 0, ...args);
  }
  return true;
}

function VLOG(...args: any[]) {
  const debug = +(process.env.DEBUG || 0);
  if (!args.length) return debug < 2;
  if (debug < 2) return false;
  LOG(...args);
  return true;
}

function MLOG(...args: any[]) {
  const log = process.env.MEMORY && process.env.DEBUG;
  if (!args.length || !log) return log;

  const msg = [];
  if (args.length > 1 || args[0] !== true) {
    for (const arg of args) {
      msg.push(typeof arg === 'string' ? arg : humanBytes(sizeof(arg)));
    }
  }
  const mem = process.memoryUsage();
  const heap = `${humanBytes(mem.heapUsed)}/${humanBytes(mem.heapTotal)}`;
  const memmsg = `${heap} (${humanBytes(mem.rss)}, ${humanBytes(mem.external)})`;
  msg.push(msg.length ? `[${memmsg}]` : memmsg);
  return LOG(`\x1b[90m${msg.join(' ')}\x1b[0m`);
}

export function log(title: string, num: number, ...args: any[]) {
  const color = num ? (num % 5) + 2 : 1;
  const tag = util.format(
    `\x1b[90m[%s] \x1b[3${color}m%s\x1b[0m`,
    millis(performance.now()),
    title
  );
  console.log(tag, ...args);
}

function millis(ms: number) {
  const abs = Math.abs(ms);
  if (abs < 0.001) return `${dec(ms * 1000 * 1000)}ns`;
  if (abs < 1) return `${dec(ms * 1000)}\u03BCs`;
  if (abs < 1000) return `${dec(ms)}ms`;
  return `${dec(ms / 1000, 60)}s`;
}

function dec(n: number, c = 100) {
  const abs = Math.abs(n);
  if (abs < 1) return n.toFixed(3);
  if (abs < 10) return n.toFixed(2);
  if (abs < c) return n.toFixed(1);
  return n.toFixed();
}

export function humanBytes(size: number) {
  const o = Math.floor(Math.log(size) / Math.log(1024));
  return `${(size / Math.pow(1024, o)).toFixed(2)} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][o]}`;
}

const TYPE_SIZES: { [type: string]: (o: any) => number } = {
  undefined: () => 0,
  boolean: () => 4,
  number: () => 8,
  string: (x: string) => 2 * x.length,
  object: (x: object | null | undefined) =>
    !x ? 0 : Object.keys(x).reduce((acc, k) => sizeof(k) + sizeof((x as any)[k]) + acc, 0),
};

export function sizeof(value: any) {
  return TYPE_SIZES[typeof value](value);
}
