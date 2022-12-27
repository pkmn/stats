import * as fs from 'fs';
import * as path from 'path';

import {Dex} from '@pkmn/dex';
import {Generation, Generations, PokemonSet} from '@pkmn/data';
import {Lookup} from '@pkmn/engine';
import {Team} from '@pkmn/sets';
import {Batch, Checkpoints, CombineWorker, ID, register, WorkerConfiguration} from '@pkmn/logs';
import {Binary} from '@pkmn/stats';

interface ApplyState {
  gen: Generation;
  lookup: Lookup;
  canonicalize: (team: Partial<PokemonSet>[], dex: Generation['dex']) => Partial<PokemonSet>[];
  size: number;
  buf: Buffer;
  offset: number;
}

interface CombineState {
  gen: Generation;
  size: number;
  bufs: Buffer[];
}

const GENS = new Generations(Dex);
const forFormat = (format: ID) =>
  format.startsWith('gen') ? GENS.get(format.charAt(3)) : GENS.get(6);
const rowsize = (gen: Generation) => 17 + 2 * (6 * Binary.Sizes[gen.num]);

const CMP = (a: Buffer, b: Buffer) => Number(Binary.Read.u64(a, 0) - Binary.Read.u64(b, 0));

const BinaryWorker =
  new class extends CombineWorker<WorkerConfiguration, ApplyState, CombineState> {
    accept() {
      return (format: ID) => forFormat(format).num <= 2;
    }

    async setupApply({format, day}: Batch) {
      const gen = forFormat(format);
      const num = (await this.storage.logs.list(format, day)).length;
      const size = rowsize(gen);
      return {
        gen,
        // Unsafe hack to deal with @pkmn/engine possibly having a different @pkmn/data version
        lookup: Lookup.get(gen as any),
        canonicalize: Team.canonicalize,
        size,
        buf: Buffer.alloc(num * size),
        offset: 0,
      };
    }

    async processLog(log: string, state: ApplyState) {
      const raw = JSON.parse(await this.storage.logs.read(log));
      Binary.Log.encode(state.gen, state.lookup, state.canonicalize, raw, state.buf, state.offset);
      state.offset += state.size;
    }

    createCheckpoint({format, day}: Batch, state: ApplyState) {
      return Checkpoints.binary(format, day, state.buf.subarray(0, state.offset), '.db');
    }

    async setupCombine(format: ID) {
      const gen = forFormat(format);
      return {gen, size: rowsize(gen), bufs: []};
    }

    async aggregateCheckpoint({format, day}: Batch, state: CombineState) {
      const buf = await this.storage.checkpoints.read(format, day, '.db');
      const bufs = new Array(buf.length / state.size);
      for (let i = 0; i * state.size < buf.length; i++) {
        bufs[i] = buf.subarray(i * state.size, (i + 1) * state.size);
      }
      this.merge(state.bufs, bufs.sort(CMP), CMP);
    }

    async writeResults(format: ID, state: CombineState) {
      const db = fs.createWriteStream(path.join(this.config.output, `${format}.db`));
      for (const buf of state.bufs) {
        db.write(buf);
      }
    }
  };

void register(BinaryWorker);
export = BinaryWorker;
