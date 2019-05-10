-- PRAGMA foreign_keys = ON;
-- PRAGMA journal_mode = WAL;
-- PRAGMA auto_vacuum = INCREMENTAL;
-- TODO: index!

CREATE TABLE battles (
    id INTEGER PRIMARY KEY,

    timestamp TEXT NOT NULL,
    turns INTEGER NOT NULL,
    end_type INTEGER NOT NULL,
);

CREATE TABLE teams (
    id INTEGER PRIMARY KEY,
    battle INTEGER NOT NULL,

    player INTEGER NOT NULL,
    outcome INTEGER NOT NULL,
    rating_r REAL NOT NULL,
    rating_rd REAL NOT NULL,
    rating_rpr REAL NOT NULL,
    rating_rprd REAL NOT NULL,
    bias REAL NOT NULL,
    stalliness REAL NOT NULL,

    FOREIGN KEY battle REFERENCES battles(id),
);

CREATE TABLE pokemon (
    id INTEGER PRIMARY KEY,
    team INTEGER NOT NULL,

    name TEXT NOT NULL,
    species TEXT NOT NULL,
    item TEXT NOT NULL,
    ability TEXT NOT NULL,
    nature TEXT NOT NULL,
    evs_hp INTEGER NOT NULL,
    evs_atk INTEGER NOT NULL,
    evs_def INTEGER NOT NULL,
    evs_spa INTEGER NOT NULL,
    evs_spd INTEGER NOT NULL,
    evs_spe INTEGER NOT NULL,
    ivs_hp INTEGER NOT NULL,
    ivs_atk INTEGER NOT NULL,
    ivs_def INTEGER NOT NULL,
    ivs_spa INTEGER NOT NULL,
    ivs_spd INTEGER NOT NULL,
    ivs_spe INTEGER NOT NULL,
    level INTEGER NOT NULL,
    gender INTEGER NOT NULL,
    shiny BOOLEAN NOT NULL,
    happiness INTEGER NOT NULL,
    pokeball TEXT NOT NULL,

    turns_out INTEGER NOT NULL,
    kos INTEGER NOT NULL,
    
    FOREIGN KEY team REFERENCES teams(id),
);

CREATE TABLE moves (
    pokemon INTEGER NOT NULL,
    id TEXT NOT NULL,
    PRIMARY KEY(pokemon, id),

    FOREIGN KEY pokemon REFERENCES pokemon(id),
)

CREATE TABLE tags (
    team INTEGER NOT NULL,
    id TEXT NOT NULL,
    PRIMARY KEY(team, id),

    FOREIGN KEY team REFERENCES teams(id),
);

CREATE TABLE matchups (
    id INTEGER PRIMARY KEY,
    battle INTEGER NOT NULL,

    poke1 TEXT NOT NULL,
    poke2 TEXT NOT NULL,
    outcome INTEGER NOT NULL,

    FOREIGN KEY battle REFERENCES battles(id),
);