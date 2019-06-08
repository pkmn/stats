import {performance} from 'perf_hooks';
import {workerData} from 'worker_threads';
import * as util from 'util';

// TODO GLOBAL
declare global {
  function LOG(...args: any[]): boolean;
  function VLOG(...args: any[]): boolean;
}

function LOG(...args: any[]) {
  if (!args.length) return process.env.DEBUG;
  if (!process.env.DEBUG) return false;
  if (workerData) {
    log(`worker:${workerData.num}`, workerData.num, ...args);
  } else {
    log(`main`, 0, ...args);
  }
  return true;
}

function VLOG(...args: any[]) {
  if (!args.length) return +process.env.DEBUG < 2;
  if (+process.env.DEBUG < 2) return false;
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

global.LOG = LOG;
global.VLOG = VLOG;
