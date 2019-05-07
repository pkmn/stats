declare module 'ps' {
    type ID = '' | string & {__isID: true}
    type StatName = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
    type StatsTable = {[stat in StatName]: number }
    interface Nature {
        name: string
        plus?: keyof StatsTable
        minus?: keyof StatsTable
        [k: string]: any
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
        id: ID
        name: string
        exists: boolean
    }
    interface Ability extends Effect {}
    interface Item extends Effect {
        megaStone?: string
        megaEvolves?: string

        zMove?: string | true
        zMoveFrom?: string
        zMoveType?: string
        zMoveUser?: string[]
    }
    interface Move extends Effect {}
    interface Species extends Effect {
        abilities: {0: string, 1?: string, H?: string, S?: string}
        baseStats: StatsTable
        species: string
        types: string[]
        baseSpecies?: string
        forme?: string
    }
    interface Type {
        damageTaken: {[attackingTypeNameOrEffectid: string]: number}
        HPdvs?: Partial<StatsTable>
        HPivs?: Partial<StatsTable>
    }
    interface DexTable<T> {
        [key: string]: T
    }
    const Data: {
        Abilities: DexTable<Ability>
        Items: DexTable<Item>
        Moves: DexTable<Move>
        Species: DexTable<Species>

        Aliases: {[id: string]: string}
        Natures: DexTable<Nature>
        Types: DexTable<Type>

        forFormat(format: string): typeof Data

        getAbility(name: string): Ability | undefined
        getItem(name: string): Item | undefined
        getMove(name: string): Move | undefined
        getSpecies(name: string): Species | undefined
        
        getNature(name: string): Nature | undefined
        getType(name: string): Type | undefined
    }
    function toID(text: any): ID
    function calcStat(stat: StatName, base: number, iv: number, ev: number, level: number, nature?: Nature): number
    function unpackTeam(buf: string): PokemonSet[] | undefined
}
