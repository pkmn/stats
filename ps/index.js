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

function unpackTeam(buf) {
    return Dex.fastUnpackTeam(buf) || undefined;
}

module.exports = {
    Data,
    toID: Dex.Data.Tools.getId,
    calcStat,
    unpackTeam,
};
