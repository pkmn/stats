declare module 'ps' {
    type ID = '' | string & {__isID: true}
    interface AnyObject {[k: string]: any}
    type GenderName = 'M' | 'F' | 'N' | '';
    type StatName = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
    type StatsTable = {[stat in StatName]: number };
    type SparseStatsTable = Partial<StatsTable>;
    type Nonstandard = 'Glitch' | 'Past' | 'Future' | 'CAP' | 'LGPE' | 'Pokestar' | 'Custom';
    interface Nature {
        name: string;
        plus?: keyof StatsTable;
        minus?: keyof StatsTable;
        [k: string]: any;
    }
    interface DexTable<T> {
        [key: string]: T;
    }
    type PokemonSet = {
        name: string,
        species: string,
        item: string,
        ability: string,
        moves: string[],
        nature: string,
        gender: string,
        evs: StatsTable,
        ivs: StatsTable,
        level: number,
        shiny?: boolean,
        happiness?: number,
        pokeball?: string,
        hpType?: string,
    }
    interface Effect {
        id: string
        name: string
        num: number
        affectsFainted?: boolean
        counterMax?: number
        desc?: string
        drain?: [number, number]
        duration?: number
        effectType?: string
        infiltrates?: boolean
        isNonstandard?: Nonstandard | null
        isUnreleased?: boolean
        isZ?: boolean | string
        noCopy?: boolean
        recoil?: [number, number]
        shortDesc?: string
        status?: string
        weather?: string
    }
    type EffectType = 'Effect' | 'Pokemon' | 'Move' | 'Item' | 'Ability' | 'Format' | 'Ruleset' | 'Weather' | 'Status' | 'Rule' | 'ValidatorRule'
    interface BasicEffect extends Effect {
        id: ID
        weather?: ID
        status?: ID
        effectType: EffectType
        exists: boolean
        flags: AnyObject
        fullname: string
        gen: number
        sourceEffect: string
    }
    interface Ability extends BasicEffect {
        rating: number
        isUnbreakable?: boolean
        suppressWeather?: boolean
    }
    interface Item extends BasicEffect {
        gen: number
        forcedForme?: string
        ignoreKlutz?: boolean
        isBerry?: boolean
        isChoice?: boolean
        isGem?: boolean
        megaStone?: string
        megaEvolves?: string
        naturalGift?: {basePower: number, type: string}
        onDrive?: string
        onMemory?: string
        onPlate?: string
        spritenum?: number
        zMove?: string | true
        zMoveFrom?: string
        zMoveType?: string
        zMoveUser?: string[]
    }
    interface Move extends BasicEffect {
        accuracy: true | number
        basePower: number
        category: 'Physical' | 'Special' | 'Status'
        flags: AnyObject
        pp: number
        priority: number
        target: string
        type: string
        alwaysHit?: boolean
        baseMoveType?: string
        basePowerModifier?: number
        breaksProtect?: boolean
        contestType?: string
        critModifier?: number
        critRatio?: number
        damage?: number | 'level' | false | null
        defensiveCategory?: 'Physical' | 'Special' | 'Status'
        forceSwitch?: boolean
        hasCustomRecoil?: boolean
        heal?: number[] | null
        ignoreAbility?: boolean
        ignoreAccuracy?: boolean
        ignoreDefensive?: boolean
        ignoreEvasion?: boolean
        ignoreImmunity?: boolean | {[k: string]: boolean}
        ignoreNegativeOffensive?: boolean
        ignoreOffensive?: boolean
        ignorePositiveDefensive?: boolean
        ignorePositiveEvasion?: boolean
        isSelfHit?: boolean
        isFutureMove?: boolean
        isViable?: boolean
        mindBlownRecoil?: boolean
        multiaccuracy?: boolean
        multihit?: number | number[]
        multihitType?: string
        noDamageVariance?: boolean
        noFaint?: boolean
        noMetronome?: string[]
        nonGhostTarget?: string
        noPPBoosts?: boolean
        noSketch?: boolean
        ohko?: boolean | string
        pressureTarget?: string
        pseudoWeather?: string
        selfdestruct?: string | boolean
        selfSwitch?: string | boolean
        sideCondition?: string
        sleepUsable?: boolean
        slotCondition?: string
        spreadModifier?: number
        stallingMove?: boolean
        stealsBoosts?: boolean
        struggleRecoil?: boolean
        terrain?: string
        thawsTarget?: boolean
        useTargetOffensive?: boolean
        useSourceDefensive?: boolean
        volatileStatus?: string
        weather?: ID
        willCrit?: boolean
        forceSTAB?: boolean
        zMovePower?: number
        zMoveEffect?: string
    }
    type SpeciesAbility = {0: string, 1?: string, H?: string, S?: string}
    interface Species extends BasicEffect {
        abilities: SpeciesAbility
        baseStats: StatsTable
        canHatch?: boolean
        color: string
        eggGroups: string[]
        heightm: number
        num: number
        species: string
        types: string[]
        weightkg: number
        baseForme?: string
        baseSpecies?: string
        evoLevel?: number
        evoMove?: string
        evoCondition?: string
        evoItem?: string
        evos?: string[]
        evoType?: 'trade' | 'stone' | 'levelMove' | 'levelExtra' | 'levelFriendship' | 'levelHold'
        forme?: string
        formeLetter?: string
        gender?: GenderName
        genderRatio?: {[k: string]: number}
        maxHP?: number
        otherForms?: string[]
        otherFormes?: string[]
        prevo?: string
    }
    interface Type {
        damageTaken: {[attackingTypeNameOrEffectid: string]: number}
        HPdvs?: SparseStatsTable
        HPivs?: SparseStatsTable
    }
    const Data: {
        Abilities: DexTable<Ability>
        Items: DexTable<Item>
        Moves: DexTable<Move>
        Species: DexTable<Species>

        Aliases: {[id: string]: string}
        Natures: DexTable<Nature>
        Types: DexTable<Type>

        forFormat(format: string): Data;

        getAbility(name: string): Ability | undefined;
        getItem(name: string): Item | undefined;
        getMove(name: string): Move | undefined;
        getSpecies(name: string): Species | undefined;
        
        getNature(name: string): Nature | undefined;
        getType(name: string): Type | undefined;
    }
    function toID(text: any): ID
    function calcStat(stat: StatName, base: number, iv: number, ev: number, level: number, nature?: Nature): number
    function unpackTeam(buf: string): PokemonSet[] | undefined;
}