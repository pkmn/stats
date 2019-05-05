'use strict';
const Dex = require('pokemon-showdown/.sim-dist').Dex;

const Data = new class {
    constructor() {
        this.Abilities = Dex.data.Abilities;
        this.Items = Dex.data.Items;
        this.Moves = Dex.data.Moves;
        this.Species = Dex.data.Templates;

        this.Aliases = Dex.data.Aliases;
        this.Types = Dex.data.TypeChart;
        this.Natures = Dex.data.Natures;
    }

	getAbility(name) {
        const a = Dex.getAbility(name);
        return a.exists ? a : undefined;
    }
    
    getItem(name) {
        const i = Dex.getItem(name);
        return i.exists ? i : undefined;
    }
    
    getMove(name) {
        const m = Dex.getMove(name);
        return m.exists ? m : undefined;
    }
    
    getSpecies(name) {
        const s = Dex.getTemplate(name);
        return s.exists ? s : undefined;
    }
    
    getType(name) {
        const t = Dex.getType(name);
        return t.exists ? t : undefined;
    }

    getNature(name) {
        const n = Dex.getNature(name);
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

module.exports = {
    Data,
    toID: Dex.Data.Tools.getId,
    calcStat,
};
