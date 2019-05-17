import * as fs from 'fs';

export function exists(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    fs.stat(path, (err, stats) => {
      if (err && err.code === 'ENOENT') return resolve(false);
      err ? reject(err) : resolve(true);
    });
  });
}

export function mkdir(path: string, options: {recursive?: boolean, mode?: number} = {
  mode: 0o755
}): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdir(path, options, err => {
      err ? reject(err) : resolve();
    });
  });
}
export function readdir(path: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    fs.readdir(path, (err, data) => {
      err ? reject(err) : resolve(data);
    });
  });
}

export function readFile(path: string, encoding: 'utf8'): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(path, encoding, (err, data) => {
      err ? reject(err) : resolve(data as string);
    });
  });
}

export function writeFile(path: string, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, data, err => {
      err ? reject(err) : resolve();
    });
  });
}

export function appendFile(path: string, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.appendFile(path, data, err => {
      err ? reject(err) : resolve();
    });
  });
}

export function lstat(path: string): Promise<fs.Stats> {
  return new Promise((resolve, reject) => {
    fs.lstat(path, (err, stats) => {
      err ? reject(err) : resolve(stats);
    });
  });
}

export function unlink(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.unlink(path, err => {
      if (err && err.code === 'ENOENT') return resolve();
      err ? reject(err) : resolve();
    });
  });
}

export function rmdir(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.rmdir(path, err => {
      err ? reject(err) : resolve();
    });
  });
}