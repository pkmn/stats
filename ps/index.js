'use strict';
const ps = require('pokemon-showdown/.sim-dist');

const toID = ps.Dex.Data.Tools.getId;

class Dex {
  static get() {
    return Dex.forFormatInternal();
  }

  static async forFormat(format) {
    return Dex.forFormatInternal(format);
  }

  static forFormatInternal(format) {
    if (Dex.cache === undefined) Dex.cache = new Map();
    format = toID(format);
    let dex = Dex.cache.get(format);
    if (!dex) {
      const f = ps.Dex.getFormat(format);
      dex = new Dex(ps.Dex.forFormat(f), f.id);
      Dex.cache.set(format, dex);
    }
    return dex;
  }

  constructor(dex, format) {
    this.dex = dex;
    this.format = format;
    this.gen = dex.gen;

    this.Abilities = dex.data.Abilities;
    this.Items = dex.data.Items;
    this.Moves = dex.data.Moves;
    this.Species = dex.data.Pokedex;

    this.Aliases = dex.data.Aliases;
    this.Types = dex.data.TypeChart;
    this.Natures = dex.data.Natures;
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
    const s = this.dex.getSpecies(name);
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

  // FIXME: This is stupidly arbitrary and should be a field on Species
  hasFormatsDataTier(name) {
    const d = this.dex.data.FormatsData[toID(name)];
    return !!(d && d.tier);
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

function statToEV(stat, val, base, iv, level, nature) {
  const rud = (a, b) => Math.trunc(a / b) + (a % b === 0 ? 0 : 1);
  let ev;
  if (stat === 'hp') {
    ev = base === 1 ? 0 : Math.max(0, (rud((val - level - 10) * 100, level) - 2 * base - iv) * 4);
  } else {
    const n = !nature ? 1 : nature.plus === stat ? 1.1 : nature.minus === stat ? 0.9 : 1;
    ev = Math.max(0, (rud((rud(val, n) - 5) * 100, level) - 2 * base - iv) * 4);
  }
  // TODO: can we actually compute the EV without needing to search?
  for (; ev > 0; ev -= 4) {
    if (calcStat(stat, base, iv, ev - 4, level, nature) !== val) break;
  }
  return ev;
}

const HIDDEN_POWER_TYPES = [
  'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
  'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark',
];

function hiddenPower(ivs, gen = 8) {
  if (gen < 2) return undefined;

  let type;
  let basePower;
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
    for (let s of ['hp', 'atk', 'def', 'spe', 'spa', 'spd']) {
      hpType += i * (ivs[s] % 2);
      hpPower += i * (Math.floor(ivs[s] / 2) % 2);
      i *= 2;
    }
    type = HIDDEN_POWER_TYPES[Math.floor(hpType * 15 / 63)];
    basePower = (gen < 6) ? Math.floor(hpPower * 40 / 63) + 30 : 60;
  }

  return {type, basePower};
}

module.exports = {
  Dex,
  toID,
  calcStat,
  statToEV,
  hiddenPower,
};
