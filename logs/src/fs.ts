import * as os from 'os';
import {promises as fs} from 'fs';
import {join} from 'path';
import {promisify} from 'util';
import * as zlib from 'zlib';
import * as zip from '7zip-min';

const gzip = promisify<zlib.InputType, Buffer>(zlib.gzip);
const gunzip = promisify<zlib.InputType, Buffer>(zlib.gunzip);

export async function exists(path: string) {
  try {
    await fs.stat(path);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return true;
}

export function mkdtemp(prefix: string) {
  return fs.mkdtemp(join(os.tmpdir(), prefix));
}

export function mkdir(path: string, options?: {recursive?: boolean; mode?: number}) {
  return fs.mkdir(path, {mode: 0o755, ...options}) as Promise<void>;
}

export const readdir = fs.readdir;

export async function opendir(path: string) {
  const stats = await lstat(path);
  if (stats.isDirectory()) {
    return {files: await readdir(path), close: () => {}};
  } else {
    const tmp = await mkdtemp('opendir-');
    await unpack(path, tmp);
    return {files: await readdir(tmp), close: () => rmdir(tmp, {recursive: true})};
  }
}

export async function readFile(path: string) {
  const data = await fs.readFile(path);
  if (!isGzipped(data)) return data.toString('utf8');
  // NOTE: nodejs/node#8871
  // const buf = zlib.gunzipSync(data);
  const buf = await gunzip(data);
  return buf.toString('utf8');
}

export const writeFile = fs.writeFile;

export async function writeGzipFile(path: string, data: string): Promise<void> {
  // NOTE: nodejs/node#8871
  // const buf = zlib.gzipSync(data);
  const buf = await gzip(data);
  return writeFile(path, buf);
}

export const appendFile = fs.appendFile;
export const lstat = fs.lstat;

export async function unlink(path: string) {
  try {
    await fs.unlink(path);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export function rmdir(path: string, options?: {recursive?: boolean}) {
  return fs.rmdir(path, {maxRetries: 5, ...options});
}

function isGzipped(buf: Buffer) {
  return buf.length >= 3 && buf[0] === 0x1f && buf[1] === 0x8b && buf[2] === 0x08;
}

function unpack(input: string, output: string) {
  return new Promise((resolve, reject) => {
    zip.unpack(input, output, err => {
      err ? reject(err) : resolve();
    });
  });
}
