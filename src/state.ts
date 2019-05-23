import {ID, PokemonSet} from 'ps';
import * as stats from 'stats';

// TODO: can avoid copying by just mutating directly

interface TaggedStatistics {
  battles: number;
  total: WeightedStatistics;
  tags: {[id: string]: WeightedStatistics};
}

type WeightedStatistics = {
  [cutoff: string]: Statistics
};

interface Statistics {
  pokemon: {[id: string]: UsageStatistics};
  leads: Usage;
  usage: Usage;
  metagame: MetagameStatistics;
}

interface UsageStatistics {
  lead: Usage;
  usage: Usage;

  abilities: {[id: string]: number};
  items: {[id: string]: number};
  happinesses: {[happiness: number]: number};
  spreads: {[spread: string]: number};
  moves: {[id: string]: number};

  raw: {weight: number, count: number};
  saved: {weight: number, count: number};

  encounters: {[id: string]: number[/* Outcome */]};
  teammates: {[id: string]: number};
  gxes: {[id: string]: number};
}

interface Usage {
  raw: number;
  real: number;
  weighted: number;
}

interface MetagameStatistics {
  tags: {[id: string]: number};
  stalliness: Array<[number, number]>;
}

export function serializeTagged(tagged: stats.TaggedStatistics) {
  const obj: Partial<TaggedStatistics> = {};
  obj.battles = tagged.battles;
  obj.total = serializeWeighted(tagged.total);
  obj.tags = {};
  for (const [tag, weighted] of tagged.tags.entries()) {
    obj.tags[tag] = serializeWeighted(weighted);
  }
  return obj as TaggedStatistics;
}

export function deserializeTagged(tagged: TaggedStatistics) {
  const obj: Partial<stats.TaggedStatistics> = {};
  obj.battles = tagged.battles;
  obj.total = deserializeWeighted(tagged.total);
  obj.tags = new Map;
  for (const [tag, weighted] of Object.entries(tagged.tags)) {
    obj.tags.set(tag as ID, deserializeWeighted(weighted));
  }
  return obj as stats.TaggedStatistics;
}

export function combineTagged(a: TaggedStatistics, b: TaggedStatistics|undefined) {
  if (!b) return a;
  a.battles += b.battles;
  a.total = combineWeighted(a.total, b.total);
  for (const [tag, weighted] of Object.entries(a.tags)) {
    a.tags[tag] = combineWeighted(weighted, b.tags[tag]);
  }
  return a;
}

function serializeWeighted(weighted: stats.WeightedStatistics) {
  const obj: Partial<WeightedStatistics> = {};
  for (const [cutoff, stats] of weighted.entries()) {
    obj[cutoff] = serializeStats(stats);
  }
  return obj as WeightedStatistics;
}

function deserializeWeighted(weighted: WeightedStatistics) {
  const obj: stats.WeightedStatistics = new Map();
  for (const [cutoff, stats] of Object.entries(weighted)) {
    obj.set(Number(cutoff), deserializeStats(stats));
  }
  return obj;
}

function combineWeighted(a: WeightedStatistics, b: WeightedStatistics|undefined) {
  if (!b) return a;
  for (const [cutoff, stats] of Object.entries(a)) {
    a[cutoff] = combineStats(stats, b[cutoff]);
  }
  return a;
}

function serializeStats(stats: stats.Statistics) {
  const obj: Partial<Statistics> = {};
  obj.pokemon = {};
  for (const [pokemon, usage] of stats.pokemon.entries()) {
    obj.pokemon[pokemon] = serializeUsage(usage);
  }
  obj.leads = Object.assign({}, stats.leads);
  obj.usage = Object.assign({}, stats.usage);
  obj.metagame = serializeMetagame(stats.metagame);
  return obj as Statistics;
}

function deserializeStats(stats: Statistics) {
  const obj: Partial<stats.Statistics> = {};
  obj.pokemon = new Map();
  for (const [pokemon, usage] of Object.entries(stats.pokemon)) {
    obj.pokemon.set(pokemon as ID, deserializeUsage(usage));
  }
  obj.leads = Object.assign({}, stats.leads);
  obj.usage = Object.assign({}, stats.usage);
  obj.metagame = deserializeMetagame(stats.metagame);
  return obj as stats.Statistics;
}

function combineStats(a: Statistics, b: Statistics|undefined) {
  if (!b) return a;
  for (const [pokemon, usage] of Object.entries(a.pokemon)) {
    a.pokemon[pokemon] = combineUsage(usage, b.pokemon[pokemon]);
  }
  a.leads = combineCounts(a.leads, b.leads);
  a.usage = combineCounts(a.usage, b.usage);
  a.metagame = combineMetagame(a.metagame, b.metagame);
  return a;
}

function serializeUsage(usage: stats.UsageStatistics) {
  const obj: Partial<UsageStatistics> = {};
  obj.lead = Object.assign({}, usage.lead);
  obj.usage = Object.assign({}, usage.usage);
  obj.abilities = mapToObject(usage.abilities);
  obj.items = mapToObject(usage.items);
  obj.happinesses = {};
  for (const [k, v] of usage.happinesses.entries()) {
    obj.happinesses[k] = v;
  }
  obj.spreads = mapToObject(usage.spreads);
  obj.moves = mapToObject(usage.moves);
  obj.raw = Object.assign({}, usage.raw);
  obj.saved = Object.assign({}, usage.saved);
  obj.encounters = {};
  for (const [k, v] of usage.encounters.entries()) {
    obj.encounters[k] = v.slice();
  }
  obj.teammates = mapToObject(usage.teammates);
  obj.gxes = mapToObject(usage.gxes);
  return obj as UsageStatistics;
}

function deserializeUsage(usage: UsageStatistics) {
  const obj: Partial<stats.UsageStatistics> = {};
  obj.lead = Object.assign({}, usage.lead);
  obj.usage = Object.assign({}, usage.usage);
  obj.abilities = objectToMap(usage.abilities) as Map<ID, number>;
  obj.items = objectToMap(usage.items) as Map<ID, number>;
  obj.happinesses = new Map();
  for (const [k, v] of Object.entries(usage.happinesses)) {
    obj.happinesses.set(Number(k), v);
  }
  obj.spreads = objectToMap(usage.spreads) as Map<ID, number>;
  obj.moves = objectToMap(usage.moves) as Map<ID, number>;
  obj.raw = Object.assign({}, usage.raw);
  obj.saved = Object.assign({}, usage.saved);
  obj.encounters = new Map();
  for (const [k, v] of Object.entries(usage.encounters)) {
    obj.encounters.set(k as ID, v.slice());
  }
  obj.teammates = objectToMap(usage.teammates) as Map<ID, number>;
  obj.gxes = objectToMap(usage.gxes) as Map<ID, number>;
  return obj as stats.UsageStatistics;
}

function combineUsage(a: UsageStatistics, b: UsageStatistics|undefined) {
  if (!b) return a;
  a.lead = combineCounts(a.lead, b.lead);
  a.usage = combineCounts(a.usage, b.usage);
  a.abilities = combineMap(a.abilities, b.abilities);
  a.items = combineMap(a.items, b.items);
  for (const [k, v] of Object.entries(b.happinesses)) {
    const n = Number(k);
    a.happinesses[n] = (a.happinesses[n] || 0) + v;
  }
  a.spreads = combineMap(a.spreads, b.spreads);
  a.moves = combineMap(a.moves, b.moves);
  a.raw.weight += b.raw.weight;
  a.raw.count += b.raw.count;
  a.saved.weight += b.saved.weight;
  a.saved.count += b.saved.count;
  for (const [k, v] of Object.entries(b.encounters)) {
    const ae = a.encounters[k];
    for (let i = 0; i < ae.length; i++) {
      ae[i] += v[i];
    }
  }
  a.teammates = combineMap(a.teammates, b.teammates);
  a.gxes = combineMap(a.gxes, b.gxes);
  return a;
}

function serializeMetagame(meta: stats.MetagameStatistics) {
  const obj: Partial<MetagameStatistics> = {};
  obj.tags = mapToObject(meta.tags);
  obj.stalliness = meta.stalliness.map(a => a.slice() as [number, number]);
  return obj as MetagameStatistics;
}

function deserializeMetagame(meta: MetagameStatistics) {
  const obj: Partial<stats.MetagameStatistics> = {};
  obj.tags = objectToMap(meta.tags) as Map<ID, number>;
  obj.stalliness = meta.stalliness.map(a => a.slice() as [number, number]);
  return obj as stats.MetagameStatistics;
}

function combineMetagame(a: MetagameStatistics, b: MetagameStatistics|undefined) {
  if (!b) return a;
  a.tags = combineMap(a.tags, b.tags);
  a.stalliness.push(...b.stalliness);
  return a;
}

function mapToObject(map: Map<string, number>) {
  const obj: {[key: string]: number} = {};
  for (const [k, v] of map.entries()) {
    obj[k] = v;
  }
  return obj;
}

function objectToMap(obj: {[key: string]: number}) {
  const map: Map<string, number> = new Map();
  for (const [k, v] of Object.entries(obj)) {
    map.set(k, v);
  }
  return map;
}

function combineMap(a: {[key: string]: number}, b: {[key: string]: number}|undefined) {
  if (!b) return a;
  for (const [k, v] of Object.entries(b)) {
    a[k] = (a[k] || 0) + v;
  }
  return a;
}

function combineCounts(a: Usage, b: Usage|undefined) {
  if (!b) return a;
  a.raw += b.raw;
  a.real += b.real;
  a.weighted += b.weighted;
  return a;
}

interface Battle {
  p1: Player;
  p2: Player;
  matchups: Array<[string, string, number]>;
  turns: number;
  endType?: 'normal'|'forced'|'forfeit';
}

interface Player {
  name: string;
  rating?: stats.Rating;
  outcome?: 'win'|'loss';
  team: Team;
}

interface Team {
  pokemon: stats.Pokemon[];
  classification: {bias: number; stalliness: number; tags: string[];};
}

// NOTE: Serialized Battle is NOT a copy and shares memory.
export function serializeBattle(battle: stats.Battle) {
  const obj: Partial<Battle> = {};
  obj.p1 = serializePlayer(battle.p1);
  obj.p2 = serializePlayer(battle.p2);
  obj.matchups = battle.matchups;
  obj.turns = battle.turns;
  obj.endType = battle.endType;
  return obj as Battle;
}

function serializePlayer(player: stats.Player) {
  const obj: Partial<Player> = {};
  obj.name = player.name;
  obj.rating = player.rating;
  obj.outcome = player.outcome;
  obj.team = serializeTeam(player.team);
  return obj as Player;
}

function serializeTeam(team: stats.Team) {
  const obj: Partial<Team> = {};
  obj.pokemon = team.pokemon;
  obj.classification = {
    bias: team.classification.bias,
    stalliness: team.classification.stalliness,
    tags: Array.from(team.classification.tags),
  };
  return obj as Team;
}
