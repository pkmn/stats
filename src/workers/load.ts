import 'source-map-support/register';
import '../debug';

import * as path from 'path';
import { Data, ID, toID } from 'ps';
import { workerData } from 'worker_threads';

import { Batch, Checkpoints } from '../checkpoint';
import { Configuration } from '../config';
import { LogStorage } from '../storage';

import { Client } from 'pg';
import * as Streams from 'pg-copy-streams';

import * as zlib from 'zlib';

export async function init(config: Configuration) {}

export function accept(config: Configuration) {
  return (format: ID) => format === 'gen7nususpecttest';
  //return (format: ID) => true;
}

async function apply(batches: Batch[], config: Configuration) {
  const logStorage = LogStorage.connect(config);
  const client = new Client();
  return new Promise(async (resolve, reject) => {
    client.on('error', reject);
    await client.connect();

    const stream = client.query(Streams.from('COPY battles FROM STDIN'));
    stream.on('error', async err => {
      await client.end();
      reject(err);
    });
    stream.on('end', () => resolve(client.end()));
    for (const [i, { format, begin, end }] of batches.entries()) {
      const size = end.index.global - begin.index.global + 1;
      const offset = `${format}: ${Checkpoints.formatOffsets(begin, end)}`;
      LOG(`Processing ${size} log(s) from batch ${i + 1}/${batches.length} - ${offset}`);
      let pending = [];
      for (const log of await logStorage.select(format, begin, end)) {
        if (pending.length >= config.maxFiles) {
          LOG(`Waiting for ${pending.length} log(s) from ${format} to be copied`);
          await Promise.all(pending);
          pending = [];
        }
        pending.push(logStorage.read(log).then(d => {
          stream.write(toTSV(d));
          VLOG(`Wrote ${log}`);
        }));
      }
      if (pending.length) {
        LOG(`Waiting for ${pending.length} log(s) from ${format} to be copied`);
        await Promise.all(pending);
      }
    }
    stream.end();
  });
}

function encode(d: any) {
  const compressed = zlib.brotliCompressSync(JSON.stringify(d), {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 0,
  });
  return '\\\\x' + compressed.toString('hex');
}

function toTSV(raw: string) {
  const data: { [key: string]: any } = JSON.parse(raw);
  const esc = (s: string) => s.replace(/\\/g, '\\\\'); // TODO: better escaping?
  return ([
      data.id,
      esc(data.p1),
      toID(data.p1),
      esc(data.p2),
      toID(data.p2),
      data.format, // TODO: this is also formatid :(
      toID(data.format),
      new Date(data.timestamp).toISOString(), // BUG: timezones? seconds vs. milliseconds?
      encode({
        p1rating: data.p1rating,
        p2rating: data.p2rating,
        log: data.log,
        inputLog: data.inputLog,
      }),
    ].join('\t') + '\n');
}

if (workerData) {
  (async () => {
    if (workerData.type === 'apply') {
      await apply(workerData.formats, workerData.config);
    }
  })().catch(err => console.error(err));
}
