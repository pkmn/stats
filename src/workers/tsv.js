'use strict';

const toID = require('ps').toID;
const fs = require('fs');
const zlib = require('zlib');

function encode(d) {
  const s = JSON.stringify(d);
  const compressed = zlib.brotliCompressSync(JSON.stringify(d), {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 0,
  });
  console.error(compressed);
  console.error(Array.from(compressed).slice(0, 10));
  const z = '\\\\x' + compressed.toString('hex');
  console.error(z);
  console.error(s.length, compressed.length, z.length, compressed.length/s.length * 100);
  return z;

}

function toTSV(raw) {
  const data = JSON.parse(raw);
  const esc = s => s.replace(/\\/g, '\\\\');
  return ([
    data.id,
    esc(data.p1),
    toID(data.p1),
    esc(data.p2),
    toID(data.p2),
    data.format,
    toID(data.format),
    new Date(data.timestamp).toISOString(),
    encode({
      p1rating: data.p1rating,
      p2rating: data.p2rating,
      log: data.log,
      inputLog: data.inputLog,
    }),
  ].join('\t'));
}


console.log(toTSV(fs.readFileSync(process.argv[2])));
