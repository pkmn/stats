import {performance} from 'perf_hooks';
import * as util from 'util';
import {workerData} from 'worker_threads';

declare global {
  function LOG(...args: any[]): boolean;
  function VLOG(...args: any[]): boolean;
}
const GLOBAL = global as any;
GLOBAL.LOG = LOG;
GLOBAL.VLOG = VLOG;

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

export function log(title: string, num: number, ...args: any[]) {
  const color = num ? (num % 5) + 2 : 1;
  const tag =
      util.format(`\x1b[90m[%s] \x1b[3${color}m%s\x1b[0m`, millis(performance.now()), title);
  console.log(tag, ...args);
}

function millis(ms: number) {
  const abs = Math.abs(ms);
  if (abs < 0.001) return `${dec(ms * 1000 * 1000)}ns`;
  if (abs < 1) return `${dec(ms * 1000)}\u03BCs`;
  if (abs < 1000) return `${dec(ms)}ms`;
  return `${dec(ms / 1000)}s`;
}

function dec(n: number) {
  const abs = Math.abs(n);
  if (abs < 1) return n.toFixed(3);
  if (abs < 10) return n.toFixed(2);
  if (abs < 100) return n.toFixed(1);
  return n.toFixed();
}

function memorySize(size: number) {
  const o = Math.floor(Math.log(size) / Math.log(1024));
  return `${(size / Math.pow(1024, o)).toFixed(2)} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][o]}`;
}

if (process.env.MEMORY) {
  setInterval(() => {
    const memory = '\n' +
        Object.entries(process.memoryUsage())
            .map(e => `${e[0]}: ${humanFileSize(e[1])}`)
            .join('\n');
    if (workerData) {
      log(`worker:${workerData.num}`, workerData.num, memory);
    } else {
      log(`main`, 0, memory);
    }
  }, +process.env.MEMORY || 10000);
}
