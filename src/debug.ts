import {performance} from 'perf_hooks';
import * as util from 'util';

export function log(title: string, num: number, ...args: any[]) {
  const color = num ? (num % 5) + 2 : 1;
  const tag = util.format(`[%s] \x1b[3${color}m%s\x1b[0m`, millis(performance.now()), title);
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
