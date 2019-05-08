'use strict';
const Dex = require('pokemon-showdown/.sim-dist').Dex;

const Data = new class {
  constructor(dex) {
    this.dex = dex;
    this.Abilities = dex.data.Abilities;
    this.Items = dex.data.Items;
    this.Moves = dex.data.Moves;
    this.Species = dex.data.Templates;

    this.Aliases = dex.data.Aliases;
    this.Types = dex.data.TypeChart;
    this.Natures = dex.data.Natures;
  }

  forFormat(format) {
    this.dex = dex.forFormat(format);
    return this;
  }

  getAbility(name) {
    const a = this.dex.getAbility(name);
    return a.exists ? a : undefined;
  }

  getItem(name) {
    const i = this.dex.getItem(name);
    return i.exists ? i : undefined;
  }

  getMove(name) {
    const m = this.dex.getMove(name);
    return m.exists ? m : undefined;
  }

  getSpecies(name) {
    const s = this.dex.getTemplate(name);
    return s.exists ? s : undefined;
  }

  getType(name) {
    const t = this.dex.getType(name);
    return t.exists ? t : undefined;
  }

  getNature(name) {
    const n = this.dex.getNature(name);
    return n.exists ? n : undefined;
  }
};

function calcStat(stat, base, iv, ev, level, nature) {
  if (stat === 'hp') {
    return base === 1 ? base : Math.floor((base * 2 + iv + Math.floor(ev / 4)) * level / 100) + level + 10;
  } else {
    const n = !nature ? 1 : nature.plus === stat ? 1.1 : nature.minus === stat ? 0.9 : 1;
    return Math.floor((Math.floor((base * 2 + iv + Math.floor(ev / 4)) * level / 100) + 5) * n);
  }
}

const HIDDEN_POWER_TYPES = [
  'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
  'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark',
];

function hiddenPower(ivs: StatsTable, gen = 7) {
  if (gen < 2) return undefined;

  let type: string;
  let basePower: number;
  if (gen === 2) {
    const atkDV = Math.floor(ivs.atk / 2);
    const defDV = Math.floor(ivs.def / 2);
    const speDV = Math.floor(ivs.spe / 2);
    const spcDV = Math.floor(ivs.spa / 2);
    type = HIDDEN_POWER_TYPES[4 * (atkDV % 4) + (defDV % 4)];
    basePower = Math.floor(
      (5 *
        ((spcDV >> 3) + (2 * (speDV >> 3)) + (4 * (defDV >> 3)) +
          (8 * (atkDV >> 3))) +
        (spcDV % 4)) /
      2 +
      31);
  } else {
    let hpType = 0, hpPower = 0;
    let i = 1;

    let s: Stat;
    for (s in ivs) {
      hpType += i * (ivs[s] % 2);
      hpPower += i * (Math.floor(ivs[s] / 2) % 2);
      i *= 2;
    }
    type = HIDDEN_POWER_TYPES[Math.floor(hpType * 15 / 63)];
    basePower = (gen < 6) ? Math.floor(hpPower * 40 / 63) + 30 : 60;
  }

  return {type, basePower};
}

function unpackTeam(buf) {
  // TODO toID everything, handle array.
  return Dex.fastUnpackTeam(buf) || undefined;
}

module.exports = {
  Data,
  toID: Dex.Data.Tools.getId,
  calcStat,
  unpackTeam,
  hiddenPower,
};
