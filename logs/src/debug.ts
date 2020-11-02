import {performance} from 'perf_hooks';
import {format} from 'util';
import {workerData} from 'worker_threads'; // FIXME: bthreads
import * as tty from 'tty';

const TTY = tty.isatty(process.stdout.fd)
const DEBUG = process.env.DEBUG;

export function LOG(...args: any[]) {
  if (!args.length || !DEBUG) return DEBUG;
  if (workerData) {
    log(`worker:${workerData.num}`, workerData.num, ...args);
  } else {
    log(`main`, 0, ...args);
  }
  return true;
}

export function VLOG(...args: any[]) {
  const debug = +(DEBUG || 0);
  if (!args.length) return debug < 2;
  if (debug < 2) return false;
  LOG(...args);
  return true;
}

export function log(title: string, num: number, ...args: any[]) {
  const now = millis(performance.now());
  const tag = TTY
    ? format(`\x1b[90m[%s] \x1b[3${num ? (num % 5) + 2 : 1}m%s\x1b[0m`, now, title)
    : format('[%s] %s', now, title);
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
