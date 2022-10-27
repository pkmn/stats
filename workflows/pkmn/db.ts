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
        lookup: Lookup.get(gen),
        canonicalize: Team.canonicalize,
        size,
        buf: Buffer.alloc(num * size),
        offset: 0,
      };
    }

    async processLog(log: string, state: ApplyState) {
      const raw = JSON.parse(await this.storage.logs.read(log));
      Binary.serializeLog(
        state.gen, state.lookup, state.canonicalize, raw, state.buf, state.offset
      );
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
      // TODO: split into individual rows
      const bufs = [];
      // TODO: sort individual bufs, then merge sort bufs into state.bufs
    }

    async writeResults(format: ID, state: CombineState) {
      // TODO: write all bufs from state to output file
    }
  };

void register(BinaryWorker);
export = BinaryWorker;
