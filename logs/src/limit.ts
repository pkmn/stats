
// https://github.com/sindresorhus/p-limit v3.0.2
// MIT License Copyright Sindre Sorhus

export interface Limit {
  <Arguments extends unknown[], ReturnType>(
    fn: (...args: Arguments) => PromiseLike<ReturnType> | ReturnType,
    ...args: Arguments
  ): Promise<ReturnType>;
  readonly activeCount: number;
  readonly pendingCount: number;
  clearQueue: () => void;
}

export function limit(concurrency: number) {
  if (!((Number.isInteger(concurrency) || concurrency === Infinity) && concurrency > 0)) {
    throw new TypeError('Expected `concurrency` to be a number from 1 and up');
  }
  const queue: any[] = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      queue.shift()();
    }
  };

  const run = async (fn: any, resolve: any, ...args: unknown[]) => {
    activeCount++;
    const result = new Promise(resolve => {
      resolve(fn(...args));
    });
    resolve(result);
    try {
      await result;
    } catch {}
    next();
  };

  const enqueue = (fn: any, resolve: any, ...args: unknown[]) => {
    queue.push(run.bind(null, fn, resolve, ...args));
    (async () => {
      await Promise.resolve();
      if (activeCount < concurrency && queue.length > 0) {
        queue.shift()();
      }
    })();
  };

  const generator = (fn: any, ...args: unknown[]) =>
    new Promise(resolve => enqueue(fn, resolve, ...args));
  Object.defineProperties(generator, {
    activeCount: {
      get: () => activeCount,
    },
    pendingCount: {
      get: () => queue.length,
    },
    clearQueue: {
      value: () => {
        queue.length = 0;
      },
    },
  });

  return generator as Limit;
}
