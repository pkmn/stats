import {Generation, toID, ID, PokemonSet, TypeName, Dex, StatsTable} from '@pkmn/data';

import * as parser from './parser';
import {weighting} from './util';

const enum EndType {
  NORMAL = 0,
  TIE = 1,
  FORFEIT = 2,
  FORCED_WIN = 3,
  FORCED_TIE = 4,
}

const LE = (() => {
  const u8 = new Uint8Array(4);
  const u16 = new Uint16Array(u8.buffer);
  return !!((u16[0] = 1) & u16[0]);
})();

const Read = new class {
  u8(buf: Buffer, offset: number) {
    return buf.readUInt8(offset);
  }

  u16(buf: Buffer, offset: number) {
    return LE ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
  }

  u32(buf: Buffer, offset: number) {
    return LE ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
  }

  u64(buf: Buffer, offset: number) {
    return LE ? buf.readBigInt64LE(offset) : buf.readBigInt64BE(offset);
  }
};

const Write = new class {
  u8(buf: Buffer, value: number, offset: number) {
    return buf.writeUInt8(offset);
  }

  u16(buf: Buffer, value: number, offset: number) {
    return LE ? buf.writeUInt16LE(value, offset) : buf.writeUInt16BE(value, offset);
  }

  u32(buf: Buffer, value: number, offset: number) {
    return LE ? buf.writeUInt32LE(value, offset) : buf.writeUInt32BE(value, offset);
  }

  u64(buf: Buffer, value: number, offset: number) {
    return LE ? buf.writeBigInt64LE(BigInt(value), offset)
      : buf.writeBigInt64BE(BigInt(value), offset);
  }
};

const Sizes = {1: 5, 2: 7, 3: 24, 4: 24, 5: 24, 6: 25, 7: 26, 8: 25} as const;

const Team = new class {
  encode(
    gen: Generation,
    lookup: Binary.Lookup,
    team: Partial<PokemonSet>[],
    buf: Buffer,
    offset = 0
  ) {
    switch (gen.num) {
    case 1: {
      for (const set of team) {
        Write.u8(buf, lookup.speciesByID(set.species as ID), offset++);
        for (let i = 0; i < 4; i++) {
          Write.u8(buf, i < set.moves!.length ? lookup.moveByID(set.moves![i] as ID) : 0, offset++);
        }
      }
      return offset;
    }
    case 2: {
      for (const set of team) {
        Write.u8(buf, lookup.speciesByID(set.species as ID), offset++);
        Write.u8(buf, set.item ? lookup.itemByID(set.item as ID) : 0, offset++);
        let type: TypeName = 'Normal';
        for (let i = 0; i < 4; i++) {
          let move = set.moves![i];
          if (set.moves![i].startsWith('hiddenpower')) {
            move = 'hiddenpower';
            type = (move.charAt(11).toUpperCase() + move.slice(12)) as TypeName;
          }
          Write.u8(buf, i < set.moves!.length ? lookup.moveByID(move as ID) : 0, offset++);
        }
        Write.u8(buf, lookup.typeByName(type), offset++);
      }
      return offset;
    }
    default: throw new Error(`Unsupported gen ${gen.num}}`);
    }
  }

  decode(gen: Generation, lookup: Binary.Lookup, buf: Buffer, offset = 0) {
    const team: Partial<PokemonSet>[] = [];
    const N = Sizes[gen.num as keyof typeof Sizes];

    let byte = 0;
    switch (gen.num) {
    case 1: {
      for (let i = offset; i < offset + 6 * N; i += N) {
        byte = Read.u8(buf, i);
        if (!byte) return team;
        const set: Partial<PokemonSet> = {};
        set.species = lookup.speciesByNum(byte);
        set.moves = [];
        for (let j = 0; j < 4; j++) {
          byte = Read.u8(buf, i + 1 + j);
          if (!byte) break;
          set.moves.push(lookup.moveByNum(byte));
        }
        team.push(set);
      }
      return team;
    }
    case 2: {
      for (let i = offset; i < offset + 6 * N; i += N) {
        byte = Read.u8(buf, i);
        if (!byte) return team;
        const set: Partial<PokemonSet> = {};
        set.species = lookup.speciesByNum(byte);
        byte = Read.u8(buf, i + 1);
        set.item = byte ? lookup.itemByNum(byte) : undefined;
        set.moves = [];
        for (let j = 0; j < 4; j++) {
          byte = Read.u8(buf, i + 2 + j);
          if (!byte) break;
          const move = lookup.moveByNum(byte);
          set.moves.push(move === 'hiddenpower'
            ? `${move}${toID(lookup.typeByNum(Read.u8(buf, i + 6)))}`
            : move);
        }
        team.push(set);
      }
      return team;
    }
    default: throw new Error(`Unsupported gen ${gen.num}`);
    }
  }
};


const Log = new class {
  encode(
    gen: Generation,
    lookup: Binary.Lookup,
    canonicalize: (team: Partial<PokemonSet>[], dex: Dex) => Partial<PokemonSet>[],
    log: parser.Log,
    buf: Buffer,
    offset = 0
  ) {
    if (gen.num >= 3) throw new Error(`Unsupported gen ${gen.num}`); // TODO

    Write.u64(buf, new Date(log.timestamp).getTime(), offset);
    Write.u16(buf, log.turns, offset + 8);

    const winner: 'p1' | 'p2' = log.winner === log.p2 ? 'p2' : 'p1';
    const loser: 'p1' | 'p2' = winner === 'p1' ? 'p2' : 'p1';
    let endType: typeof EndType[keyof typeof EndType] = EndType.NORMAL;
    if (!log.winner || log.winner === 'tie') {
      endType = EndType.TIE;
    }
    if (log.endType === 'forced') {
      endType = endType === EndType.NORMAL ? EndType.FORCED_WIN : EndType.FORCED_TIE;
    } else if (log.endType === 'forfeit') {
      endType = EndType.FORFEIT;
    }
    Write.u8(buf, endType, offset + 10);

    if (log[`${winner}rating`]) {
      Write.u16(buf, Math.round(log[`${winner}rating`]!.rpr), offset + 11);
      Write.u8(buf, Math.round(log[`${winner}rating`]!.rprd), offset + 13);
    }
    if (log[`${loser}rating`]) {
      Write.u16(buf, Math.round(log[`${loser}rating`]!.rpr), offset + 14);
      Write.u8(buf, Math.round(log[`${loser}rating`]!.rprd), offset + 16);
    }

    const N = 6 * Sizes[gen.num as keyof typeof Sizes];
    Team.encode(gen, lookup, canonicalize(log[`${winner}team`], gen.dex), buf, offset + 17);
    Team.encode(gen, lookup, canonicalize(log[`${loser}team`], gen.dex), buf, offset + 17 + N);

    return buf;
  }

  decode(gen: Generation, lookup: Binary.Lookup, buf: Buffer, offset = 0) {
    if (gen.num >= 3) throw new Error(`Unsupported gen ${gen.num}`); // TODO

    const N = 6 * Sizes[gen.num as keyof typeof Sizes];

    const data: Binary.Data = {
      timestamp: BigInt(0),
      turns: 0,
      endType: EndType.NORMAL,
      winner: {
        team: undefined!,
        rating: undefined,
      },
      loser: {
        team: undefined!,
        rating: undefined,
      },
    };

    data.timestamp = Read.u64(buf, offset);
    data.turns = Read.u16(buf, offset + 8);
    data.endType = Read.u8(buf, offset + 10);
    let byte = Read.u16(buf, offset + 11);
    if (byte) data.winner.rating = {rpr: byte, rprd: Read.u8(buf, offset + 13)};
    byte = Read.u16(buf, offset + 14);
    if (byte) data.loser.rating = {rpr: byte, rprd: Read.u8(buf, offset + 16)};

    data.winner.team = Team.decode(gen, lookup, buf, offset + 17);
    data.loser.team = Team.decode(gen, lookup, buf, offset + 17 + N);

    return data;
  }
};

const HP_TYPE_TO_NUM = {
  fighting: 0, flying: 1, poison: 2, ground: 3, rock: 4, bug: 5, ghost: 6, steel: 7,
  fire: 8, water: 9, grass: 10, electric: 11, psychic: 12, ice: 13, dragon: 14, dark: 15,
} as const;
const NUM_TO_HP_TYPE = Object.values(HP_TYPE_TO_NUM);

const Stats = new class {
  sizes(gen: Generation, lookup: Binary.Lookup) {
    return {
      species: lookup.sizes.species,
      moves: lookup.sizes.moves + (gen.num < 2 ? 0 : 16),
      items: gen.num < 2 ? 0 : lookup.sizes.items + 1,
    };
  }

  compute(gen: Generation, lookup: Binary.Lookup, db: Buffer, options: {cutoff: number}) {
    const sizes = this.sizes(gen, lookup);
    const stats: Binary.Statistics = {
      total: {lead: 0, usage: 0},
      species: new Array(sizes.species),
      species_lead: new Array(sizes.species),
      move_species: new Array(sizes.species),
      item_species: new Array(sizes.species),
      species_species: new Array(sizes.species),
      move_move: new Array(sizes.moves),
    };

    for (let i = 0; i < sizes.species; i++) {
      stats.species[i] = 0;
      stats.species_lead[i] = 0;
      stats.move_species[i] = {};
      stats.item_species[i] = {};
      stats.species_species[i] = new Array(sizes.species);
      for (let j = 0; j < sizes.species; j++) {
        stats.species_species[i][j] = 0;
      }
    }

    for (let i = 0; i < sizes.moves; i++) {
      stats.move_move[i] = new Array(sizes.moves);
      for (let j = 0; j < sizes.moves; j++) {
        stats.move_move[i][j] = 0;
      }
    }

    const N = 6 * Sizes[gen.num as keyof typeof Sizes];
    const row = 17 + 2 * N;
    if (db.length % row !== 0) {
      throw new Error(`Corrupted logs database of size ${db.length} (${row})`);
    }

    for (let offset = 0; offset < db.length; offset += row) {
      const data = Log.decode(gen, lookup, db, offset);
      for (const player of [data.winner, data.loser] as const) {
        if (!player.rating) continue;
        const weight = weighting(player.rating.rpr, player.rating.rprd, options.cutoff);
        if (!weight) continue;

        for (const [index, set] of player.team.entries()) {
          const s = lookup.speciesByID(set.species as ID) - 1;

          stats.species[s] += weight;
          stats.total.usage += weight;

          // FIXME track average team size so dont just naively multiply by 6

          if (index === 0) {
            stats.species_lead[s] += weight;
            stats.total.lead += weight;
          }
          // FIXME non lead

          for (let j = 0; j < index; j++) {
            const t = lookup.speciesByID(player.team[j].species as ID) - 1;
            stats.species_species[s][t] = (stats.species_species[t][s] += weight);
          }

          for (const move of set.moves!) {
            const m = this.moveByID(lookup, move as ID);
            stats.move_species[s][m] = (stats.move_species[s][m] || 0) + weight;
          }

          if (gen.num >= 2) {
            const i = set.item ? lookup.itemByID(set.item as ID) : 0;
            stats.item_species[s][i] = (stats.item_species[s][i] || 0) + weight;
          }
        }
      }
    }
  }

  moveByID(lookup: Binary.Lookup, move: ID) {
    return (move.startsWith('hiddenpower')
      ? lookup.sizes.moves + HP_TYPE_TO_NUM[move.slice(11) as keyof typeof HP_TYPE_TO_NUM]
      : lookup.moveByID(move));
  }

  moveByNum(lookup: Binary.Lookup, num: number) {
    return (num >= lookup.sizes.moves
      ? `hiddenpower${NUM_TO_HP_TYPE[num]}` as ID
      : lookup.moveByNum(num));
  }
};

function round(v: number, p = 1e4) {
  return Math.round(v * p);
}

function bias(stats: StatsTable) {
  const [first, second] = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  // TODO: convert this pair (eg. 'atkhp') to a number
  return first[0] > second[0] ? [first[0], second[0]] : [second[0], first[0]];
}

export const Binary = {Read, Write, Sizes, Log, Team, Stats};

export namespace Binary {
  export interface Lookup {
    sizes: {
      types: number;
      species: number;
      moves: number;
      items: number;
    };
    typeByNum(num: number): TypeName;
    typeByName(name: TypeName): number;
    speciesByNum(num: number): ID;
    speciesByID(id: ID | undefined): number;
    moveByNum(num: number): ID;
    moveByID(id: ID | undefined): number;
    itemByNum(num: number): ID;
    itemByID(id: ID | undefined): number;
  }

  export interface Data {
    timestamp: bigint;
    turns: number;
    endType: EndType;
    winner: {
      team: Array<Partial<PokemonSet>>;
      rating?: {rpr: number; rprd: number};
    };
    loser: {
      team: Array<Partial<PokemonSet>>;
      rating?: {rpr: number; rprd: number};
    };
  }

  export interface Statistics {
    total: {lead: number; usage: number};
    species: number[];
    species_lead: number[];
    move_species: {[num: number]: number}[];
    item_species: {[num: number]: number}[];
    species_species: number[][];
    move_move: number[][];
  }
}
