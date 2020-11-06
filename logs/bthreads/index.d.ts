// https://github.com/chjj/bthreads
declare module 'bthreads' {
  import {EventEmitter} from 'events';
  import {Readable, Writable} from 'stream';

  const threadId: number;
  const workerData: any;

  class Worker extends EventEmitter {
    readonly stdin: Writable | null;
    readonly stdout: Readable;
    readonly stderr: Readable;
    readonly threadId: number;

    constructor(filename: string, options?: {workerData?: any});

    terminate(): Promise<number>;

    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'exit', listener: (exitCode: number) => void): this;
    on(event: 'message', listener: (value: any) => void): this;
    on(event: 'online', listener: () => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;

    once(event: 'error', listener: (err: Error) => void): this;
    once(event: 'exit', listener: (exitCode: number) => void): this;
    once(event: 'message', listener: (value: any) => void): this;
    once(event: 'online', listener: () => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this;

    off(event: 'error', listener: (err: Error) => void): this;
    off(event: 'exit', listener: (exitCode: number) => void): this;
    off(event: 'message', listener: (value: any) => void): this;
    off(event: 'online', listener: () => void): this;
    off(event: string | symbol, listener: (...args: any[]) => void): this;
  }
}
