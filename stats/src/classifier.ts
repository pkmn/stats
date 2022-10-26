import {Generation, ID, toID, PokemonSet, StatID, TypeName} from '@pkmn/data';
import * as util from './util';

// TODO: Where does this constant come from? (ie. rename!)
const LOG3_LOG2 = Math.log(3) / Math.log(2);

export const Classifier = new class {
  classifyTeam(gen: Generation, team: Array<PokemonSet<ID>>, legacy = false) {
    let teamBias = 0;
    const teamStalliness = [];
    for (const pokemon of team) {
      const {bias, stalliness} = this.classifyPokemon(gen, pokemon, legacy);
      teamBias += bias;
      teamStalliness.push(stalliness);
    }

    const stalliness = teamStalliness.reduce((a, b) => a + b) / teamStalliness.length;
    const tags = tag(gen, team, stalliness, legacy);

    return {bias: teamBias, stalliness, tags};
  }

  // For stats and moveset purposes we're now counting Mega Pokemon seperately,
  // but for team analysis we still want to consider the base (which presumably
  // breaks for Hackmons, but we're OK with that).
  classifyPokemon(gen: Generation, pokemon: PokemonSet<ID>, legacy = false) {
    const originalSpecies = pokemon.species;
    const originalAbility = pokemon.ability;

    const species = util.getSpecies(gen, pokemon.species, legacy);
    let mega: { species: ID; ability: ID } | undefined;
    if (util.isMega(species, legacy)) {
      mega = {
        species: toID(species.name),
        ability: toID(species.abilities['0']),
      };
      pokemon.species = toID(species.baseSpecies);
    }

    let {bias, stalliness} = classifyForme(gen, pokemon, legacy);
    if (!legacy) {
      if (pokemon.species === 'meloetta' && pokemon.moves.includes('relicsong' as ID)) {
        pokemon.species = 'meloettapirouette' as ID;
        stalliness = (stalliness + classifyForme(gen, pokemon, legacy).stalliness) / 2;
      } else if (
        pokemon.species === 'darmanitan' && pokemon.ability === 'zenmode') {
        pokemon.species = 'darmanitanzen' as ID;
        stalliness = (stalliness + classifyForme(gen, pokemon, legacy).stalliness) / 2;
      } else if (
        pokemon.species === 'rayquaza' &&
          pokemon.moves.includes('dragonascent' as ID)) {
        pokemon.species = 'rayquazamega' as ID;
        pokemon.ability = 'deltastream' as ID;
        stalliness = (stalliness + classifyForme(gen, pokemon, legacy).stalliness) / 2;
      }
    }
    if (mega) {
      if (!legacy) pokemon.species = mega.species;
      pokemon.ability = mega.ability;
      stalliness = (stalliness + classifyForme(gen, pokemon, legacy).stalliness) / 2;
    }

    // Make sure to revert back to the original values
    pokemon.species = originalSpecies;
    pokemon.ability = originalAbility;

    return {bias, stalliness};
  }
};

const TRAPPING_ABILITIES = new Set(['arenatrap', 'magnetpull', 'shadowtag']);

const TRAPPING_MOVES = new Set(['block', 'meanlook', 'spiderweb', 'pursuit']);

function classifyForme(gen: Generation, pokemon: PokemonSet<ID>, legacy: boolean) {
  let stalliness = baseStalliness(gen, pokemon, legacy);
  stalliness += abilityStallinessModifier(pokemon);
  stalliness += itemStallinessModifier(pokemon);
  stalliness += movesStallinessModifier(pokemon);

  // These depend on a combination of moves/abilities and thus don't belong in either
  // abilityStallinessModifier or moveStallinessModifier, so we calculate them here.
  if (TRAPPING_ABILITIES.has(pokemon.ability)) {
    stalliness -= 1.0;
  } else if (pokemon.moves.some((m: ID) => TRAPPING_MOVES.has(m))) {
    stalliness -= 0.5;
  }
  if (pokemon.ability === 'harvest' || pokemon.moves.includes('recycle' as ID)) {
    stalliness += 1.0;
  }
  if (['sandstream', 'snowwarning'].includes(pokemon.ability) ||
    pokemon.moves.some((m: ID) => ['sandstorm', 'hail'].includes(m))) {
    stalliness += 0.5;
  }

  const bias =
    pokemon.evs.atk + pokemon.evs.spa - pokemon.evs.hp - pokemon.evs.def - pokemon.evs.spd;

  stalliness -= LOG3_LOG2;
  return {bias, stalliness};
}

function baseStalliness(gen: Generation, pokemon: PokemonSet<ID>, legacy: boolean) {
  if (pokemon.species === 'shedinja') return 0;
  // TODO: replace this with mean stalliness for the tier
  if (pokemon.species === 'ditto') return LOG3_LOG2;
  const stats = calcStats(gen, pokemon, legacy);
  return (
    -Math.log(
      (((((Math.floor(2.0 * pokemon.level + 10) / 250) * Math.max(stats.atk, stats.spa)) /
        Math.max(stats.def, stats.spd)) *
        120 +
        2) *
        0.925) /
        stats.hp
    ) / Math.log(2)
  );
}

function calcStats(gen: Generation, pokemon: PokemonSet<ID>, legacy: boolean) {
  const stats = calcFormeStats(gen, pokemon, legacy);
  if (pokemon.species === 'aegislash' && pokemon.ability === 'stancechange') {
    pokemon.species = 'aegislashblade' as ID;
    const blade = calcFormeStats(gen, pokemon, legacy);
    pokemon.species = 'aegislash' as ID;
    blade.def = Math.floor((blade.def + stats.def) / 2);
    blade.spd = Math.floor((blade.spd + stats.spd) / 2);
    return blade;
  }
  return stats;
}

function calcFormeStats(gen: Generation, pokemon: PokemonSet<ID>, legacy: boolean) {
  const species = util.getSpecies(gen, pokemon.species, legacy);
  const nature = util.ignoreGen(gen, legacy).natures.get(pokemon.nature)!;
  const stats = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
  let stat: StatID;
  for (stat in stats) {
    stats[stat] = gen.stats.calc(
      stat,
      species.baseStats[stat],
      pokemon.ivs[stat],
      pokemon.evs[stat],
      pokemon.level,
      nature
    );
  }
  return stats;
}

// FIXME: Update all of these sets to be more comprehensive.
const SETUP_MOVES = new Set([
  'acupressure', 'bellydrum', 'bulkup', 'coil', 'curse', 'dragondance', 'growth', 'honeclaws',
  'howl', 'meditate', 'sharpen', 'shellsmash', 'shiftgear', 'swordsdance', 'workup', 'calmmind',
  'chargebeam', 'fierydance', 'nastyplot', 'tailglow', 'quiverdance', 'agility', 'autotomize',
  'flamecharge', 'rockpolish', 'doubleteam', 'minimize', 'substitute', 'acidarmor', 'barrier',
  'cosmicpower', 'cottonguard', 'defendorder', 'defensecurl', 'harden', 'irondefense', 'stockpile',
  'withdraw', 'amnesia', 'charge', 'ingrain',
]);

const SETUP_ABILITIES = new Set(['angerpoint', 'contrary', 'moody', 'moxie', 'speedboost']);

// FIXME: This is missing the latest a number of dragons (Kommo-o?) and should instead be
// generated by iterating over all Species in Dex and looking for Dragon-typed Pokemon.
const DRAGONS = new Set([
  'dratini', 'dragonair', 'bagon', 'shelgon', 'axew', 'fraxure', 'haxorus', 'druddigon',
  'dragonite', 'altaria', 'salamence', 'latias', 'latios', 'rayquaza', 'gible', 'gabite',
  'garchomp', 'reshiram', 'zekrom', 'kyurem', 'kyuremwhite', 'kyuremblack', 'kingdra', 'vibrava',
  'flygon', 'dialga', 'palkia', 'giratina', 'giratinaorigin', 'deino', 'zweilous', 'hydreigon',
]);

const GRAVITY_MOVES = new Set([
  'guillotine', 'fissure', 'sheercold', 'dynamicpunch', 'inferno', 'zapcannon', 'grasswhistle',
  'sing', 'supersonic', 'hypnosis', 'blizzard', 'focusblast', 'gunkshot', 'hurricane', 'smog',
  'thunder', 'clamp', 'dragonrush', 'eggbomb', 'irontail', 'lovelykiss', 'magmastorm', 'megakick',
  'poisonpowder', 'slam', 'sleeppowder', 'stunspore', 'sweetkiss', 'willowisp', 'crosschop',
  'darkvoid', 'furyswipes', 'headsmash', 'hydropump', 'kinesis', 'psywave', 'rocktomb', 'stoneedge',
  'submission', 'boneclub', 'bonerush', 'bonemerang', 'bulldoze', 'dig', 'drillrun', 'earthpower',
  'earthquake', 'magnitude', 'mudbomb', 'mudshot', 'mudslap', 'sandattack', 'spikes', 'toxicspikes',
]);

function tag(gen: Generation, team: Array<PokemonSet<ID>>, stalliness: number, legacy: boolean) {
  const weather = {rain: 0, sun: 0, sand: 0, hail: 0};
  const style = {
    batonpass: 0, tailwind: 0, trickroom: 0, slow: 0, gravityMoves: 0, gravity: 0, voltturn: 0,
    dragons: 0, trappers: 0, clearance: 0, fear: 0, choice: 0, swagplay: 0, monotype: 0,
  };

  let possibleTypes: TypeName[] | undefined;
  for (const pokemon of team) {
    let species = util.getSpecies(gen, pokemon.species, legacy);
    if (util.isMega(species, legacy)) species = util.getBaseSpecies(gen, species.id, legacy);

    const moves = new Set(pokemon.moves as string[]);
    possibleTypes = possibleTypes
      ? possibleTypes.filter(t => species.types.includes(t))
      : species.types.slice();

    if (['drizzle', 'primordialsea'].includes(pokemon.ability)) {
      weather.rain += 2;
    } else if (['drought', 'desolateland'].includes(pokemon.ability)) {
      weather.sun += 2;
    } else if (pokemon.ability === 'sandstream') {
      weather.sand += 2;
    } else if (pokemon.ability === 'snowarning') {
      weather.hail += 2;
    }

    if (weather.sun < 2 && pokemon.species === 'charizard' && pokemon.item === 'charizarditey') {
      weather.sun += 2;
    }

    if (weather.rain < 2 && moves.has('raindance')) {
      weather.rain += pokemon.item === 'damprock' ? 2 : 1;
    }
    if (weather.sun < 2 && moves.has('sunnyday')) {
      weather.sun += pokemon.item === 'heatrock' ? 2 : 1;
    }
    if (weather.sand < 2 && moves.has('sandstorm')) {
      weather.sand += pokemon.item === 'smoothrock' ? 2 : 1;
    }
    if (weather.hail < 2 && moves.has('hail')) {
      weather.hail += pokemon.item === 'icyrock' ? 2 : 1;
    }

    if (style.batonpass < 2 && moves.has('batonpass') &&
      (SETUP_ABILITIES.has(pokemon.ability) || pokemon.moves.some((m: ID) => SETUP_MOVES.has(m)))) {
      style.batonpass++;
    }
    if (style.tailwind < 2 && moves.has('tailwind')) {
      style.tailwind++;
    }
    if (moves.has('trickroom') && !moves.has('imprison')) {
      style.trickroom++;
    }
    // TODO: use actual stats and speed factor...
    if (style.slow < 2 && pokemon.evs.spe < 5 &&
      (['brave', 'relaxed', 'quiet', 'sassy'].includes(pokemon.nature) ||
        species.baseStats.spe <= 50)) {
      style.slow++;
    }
    if (style.gravity < 2 && moves.has('gravity')) {
      style.gravity++;
    }
    if (pokemon.moves.some((m: ID) => GRAVITY_MOVES.has(m))) {
      style.gravityMoves++;
    }
    if ((style.voltturn < 3 && pokemon.item === 'ejectbutton') ||
      pokemon.moves.some((m: ID) => ['voltswitch', 'uturn', 'batonpass'].includes(m))
    ) {
      style.voltturn++;
    }
    if ((style.trappers < 3 && ['magnetpull', 'arentrap', 'shadowtag'].includes(pokemon.ability)) ||
      pokemon.moves.some((m: ID) => ['block', 'meanlook', 'spiderweb'].includes(m))) {
      style.trappers++;
    }
    if (style.dragons < 2 && DRAGONS.has(pokemon.species)) {
      style.dragons++;
    }
    if ((style.clearance < 2 && pokemon.ability === 'magicbounce') || moves.has('rapidspin')) {
      style.clearance++;
    }
    if (style.fear < 3 &&
      (pokemon.ability === 'sturdy' || pokemon.item === 'focussash') &&
      moves.has('endeavor')) {
      style.fear++;
    }
    if (style.choice < 4 &&
      pokemon.ability !== 'klutz' &&
      ['choiceband', 'choicescarf', 'choicespecs'].includes(pokemon.item)) {
      style.choice++;
    }
    if (style.swagplay < 2 && pokemon.moves.some((m: ID) => m === 'foulplay' || m === 'swagger')) {
      style.swagplay++;
    }
  }

  const tags = new Set();

  if (weather.rain > 1) tags.add('rain');
  if (weather.sun > 1) tags.add('sun');
  if (weather.sand > 1) tags.add('sand');
  if (weather.hail > 1) tags.add('hail');

  if (tags.size === 4) {
    tags.add('allweather');
  } else if (tags.size > 1) {
    tags.add('multiweather');
  } else if (tags.size === 0) {
    tags.add('weatherless');
  }

  if (style.batonpass > 1) tags.add('batonpass');
  if (style.tailwind > 1) tags.add('tailwind');
  const trickroom = style.trickroom > 2 || (style.trickroom > 1 && style.slow > 1);
  if (trickroom) {
    tags.add('trickroom');
    if (weather.rain > 1) tags.add('trickrain');
    if (weather.sun > 1) tags.add('tricksun');
    if (weather.sand > 1) tags.add('tricksand');
    if (weather.hail > 1) tags.add('trickhail');
  }
  if (style.gravity > 2 || (style.gravity > 1 && style.gravityMoves > 1)) {
    tags.add('gravity');
  }
  if (style.voltturn > 2 && style.batonpass < 2) tags.add('voltturn');
  if (style.dragons > 1 && style.trappers > 0) tags.add('dragmag');
  if (style.trappers > 2) tags.add('trapper');
  if (style.fear > 2 && style.clearance > 1) {
    tags.add('fear');
    if (weather.sand > 1) tags.add('sandfear');
    if (weather.hail > 1) tags.add('hailfear');
    if (trickroom) tags.add('trickfear');
  }
  if (style.choice > 3) tags.add('choice');
  if (style.swagplay > 1) tags.add('swagplay');

  if (possibleTypes?.length) {
    tags.add('monotype');
    for (const monotype of possibleTypes) {
      tags.add(`mono${monotype.toLowerCase()}`);
    }
  }

  // These tags depend on stalliness and any weather tags we may have already added.
  if (stalliness <= -1) {
    tags.add('hyperoffense');

    if (!tags.has('multiweather') && !tags.has('allweather') && !tags.has('weatherless')) {
      if (tags.has('rain')) {
        tags.add('rainoffense');
      } else if (tags.has('sun')) {
        tags.add('sunoffense');
      } else if (tags.has('sand')) {
        tags.add('sandoffense');
      } else {
        tags.add('hailoffense');
      }
    }
  } else if (stalliness < 0) {
    tags.add('offense');
  } else if (stalliness < 1.0) {
    tags.add('balance');
  } else if (stalliness < LOG3_LOG2) {
    tags.add('semistall');
  } else {
    tags.add('stall');

    if (!tags.has('multiweather') && !tags.has('allweather') && !tags.has('weatherless')) {
      if (tags.has('rain')) {
        tags.add('rainstall');
      } else if (tags.has('sun')) {
        tags.add('sunstall');
      } else if (tags.has('sand')) {
        tags.add('sandstall');
      } else {
        tags.add('hailstall');
      }
    }
  }

  return tags as Set<ID>;
}

const GREATER_OFFENSIVE_ABILITIES = new Set(['purepower', 'hugepower', 'speedboost', 'moody']);

const LESSER_OFFENSIVE_ABILITIES = new Set([
  'chlorophyll', 'download', 'hustle', 'moxie', 'reckless', 'sandrush', 'solarpower', 'swiftswim',
  'technician', 'tintedlens', 'darkaura', 'fairyaura', 'infiltrator', 'parentalbond', 'protean',
  'strongjaw', 'sweetveil', 'toughclaws', 'aerilate', 'normalize', 'pixilate', 'refrigerate',
]);

const LESSER_DEFENSIVE_ABILITITIES = new Set([
  'dryskin', 'filter', 'hydration', 'icebody', 'intimidate', 'ironbarbs', 'marvelscale',
  'naturalcure', 'magicguard', 'multiscale', 'raindish', 'roughskin', 'solidrock', 'thickfat',
  'unaware', 'aromaveil', 'bulletproof', 'cheekpouch', 'gooey', 'regenerator',
]);

const GREATER_DEFENSIVE_ABILITIES = new Set(['slowstart', 'truant', 'furcoat', 'harvest']);

function abilityStallinessModifier(pokemon: PokemonSet<ID>) {
  const ability = pokemon.ability;
  if (GREATER_OFFENSIVE_ABILITIES.has(ability)) return -1.0;
  if (LESSER_OFFENSIVE_ABILITIES.has(ability)) return -0.5;
  if (LESSER_DEFENSIVE_ABILITITIES.has(ability)) return 0.5;
  if (GREATER_DEFENSIVE_ABILITIES.has(ability)) return 1.0;
  return 0;
}

const LESSER_BOOSTING_ITEM = new Set([
  'expertbelt', 'wiseglasses', 'muscleband', 'dracoplate', 'dreadplate', 'earthplate',
  'fistplate', 'flameplate', 'icicleplate', 'insectplate', 'ironplate', 'meadowplate',
  'mindplate', 'skyplate', 'splashplate', 'spookyplate', 'stoneplate', 'toxicplate',
  'zapplate', 'blackglasses', 'charcoal', 'dragonfang', 'hardstone', 'magnet', 'metalcoat',
  'miracleseed', 'mysticwater', 'nevermeltice', 'poisonbarb', 'sharpbeak', 'silkscarf',
  'silverpowder', 'softsand', 'spelltag', 'twistedspoon', 'pixieplate',
]);

const GREATER_BOOSTING_ITEM = new Set([
  'firegem', 'watergem', 'electricgem', 'grassgem', 'icegem', 'fightinggem', 'posiongem',
  'groundgem', 'flyinggem', 'psychicgem', 'buggem', 'rockgem', 'ghostgem', 'darkgem', 'steelgem',
  'normalgem', 'focussash', 'mentalherb', 'powerherb', 'whiteherb', 'absorbbulb', 'berserkgene',
  'cellbattery', 'focussash', 'airballoon', 'ejectbutton', 'shedshell', 'aguavberry',
  'apicotberry', 'aspearberry', 'babiriberry', 'chartiberry', 'cheriberry', 'chestoberry',
  'chilanberry', 'chopleberry', 'cobaberry', 'custapberry', 'enigmaberry', 'figyberry',
  'ganlonberry', 'habanberry', 'iapapaberry', 'jabocaberry', 'kasibberry', 'kebiaberry',
  'lansatberry', 'leppaberry', 'liechiberry', 'lumberry', 'magoberry', 'micleberry',
  'occaberry', 'oranberry', 'passhoberry', 'payapaberry', 'pechaberry', 'persimberry',
  'petayaberry', 'rawstberry', 'rindoberry', 'rowapberry', 'salacberry', 'shucaberry',
  'sitrusberry', 'starfberry', 'tangaberry', 'wacanberry', 'wikiberry', 'yacheberry',
  'keeberry', 'marangaberry', 'roseliberry', 'snowball', 'choiceband', 'choicescarf',
  'choicespecs', 'lifeorb',
]);

function itemStallinessModifier(pokemon: PokemonSet<ID>) {
  const item = pokemon.item;
  if (['weaknesspolicy', 'lightclay'].includes(item)) return -1.0;
  if (['rockyhelmet', 'eviolite'].includes(item)) return 0.5;
  if (item === 'toxicorb') {
    if (pokemon.ability === 'poisonheal') return 0.5;
    if (['toxicboost', 'guts', 'quickfeet'].includes(pokemon.ability)) {
      return -1.0;
    }
  }
  if (item === 'flameorb' && ['flareboost', 'guts', 'quickfeet'].includes(pokemon.ability)) {
    return -1.0;
  }
  if (item === 'souldew' && ['latios', 'latias'].includes(pokemon.species)) {
    return -0.5;
  }
  if (item === 'thickclub' && ['cubone', 'marowak'].includes(pokemon.species)) {
    return -1.0;
  }
  if (item === 'lightball' && pokemon.species === 'pikachu') return -1.0;
  if (pokemon.species === 'clamperl') {
    if (item === 'deepseatooth') return -1.0;
    if (item === 'deepseascale') return 1.0;
  }
  if (item === 'adamantorb' && pokemon.species === 'diagla') return -0.25;
  if (item === 'lustrousorb' && pokemon.species === 'palkia') return -0.25;
  if (item === 'griseousorb' && pokemon.species === 'giratinaorigin') {
    return -0.25;
  }
  if (LESSER_BOOSTING_ITEM.has(item)) return -0.25;
  if (GREATER_BOOSTING_ITEM.has(item)) return -0.5;
  return 0;
}

const RECOVERY_MOVES = new Set([
  'recover', 'slackoff', 'healorder', 'milkdrink', 'roost', 'moonlight', 'morningsun',
  'synthesis', 'wish', 'aquaring', 'rest', 'softboiled', 'swallow', 'leechseed',
]);

const PROTECT_MOVES = new Set(['protect', 'detect', 'kingsshield', 'matblock', 'spikyshield']);

const PHAZING_MOVES = new Set(['whirlwind', 'roar', 'circlethrow', 'dragontail']);

const PARALYSIS_MOVES = new Set(['thunderwave', 'stunspore', 'glare', 'nuzzle']);

const CONFUSION_MOVES = new Set([
  'supersonic', 'confuseray', 'swagger', 'flatter', 'teeterdance', 'yawn',
]);

const SLEEP_MOVES = new Set([
  'darkvoid', 'grasswhistle', 'hypnosis', 'lovelykiss', 'sing', 'sleeppowder', 'spore',
]);

const LESSER_OFFENSIVE_MOVES = new Set([
  'jumpkick', 'doubleedge', 'submission', 'petaldance', 'hijumpkick', 'outrage',
  'volttackle', 'closecombat', 'flareblitz', 'bravebird', 'woodhammer', 'headsmash',
  'headcharge', 'wildcharge', 'takedown', 'dragonascent',
]);

const GREATER_OFFENSIVE_MOVES = new Set([
  'selfdestruct', 'explosion', 'destinybond', 'perishsong',
  'memento', 'healingwish', 'lunardance', 'finalgambit',
]);

const OHKO_MOVES = new Set(['guillotine', 'fissure', 'sheercold']);

const GREATER_SETUP_MOVES = new Set([
  'curse', 'dragondance', 'growth', 'shiftgear', 'swordsdance',
  'fierydance', 'nastyplot', 'tailglow', 'quiverdance', 'geomancy',
]);

const LESSER_SETUP_MOVES = new Set([
  'acupressure', 'bulkup', 'coil', 'howl', 'workup', 'meditate', 'sharpen', 'calmmind',
  'chargebeam', 'agility', 'autotomize', 'flamecharge', 'rockpolish', 'doubleteam',
  'minimize', 'tailwind', 'poweruppunch', 'rototiller',
]);

function movesStallinessModifier(pokemon: PokemonSet<ID>) {
  const moves = new Set(pokemon.moves as string[]);

  let mod = 0;
  if (moves.has('toxic')) mod += 1.0;
  if (moves.has('spikes')) mod += 0.5;
  if (moves.has('toxicspikes')) mod += 0.5;
  if (moves.has('willowisp')) mod += 0.5;
  if (moves.has('psychoshift')) mod += 0.5;
  if (moves.has('healbell') || moves.has('aromatherapy')) mod += 0.5;
  if (moves.has('haze') || moves.has('clearsmog')) mod += 0.5;
  if (moves.has('substitute')) mod -= 0.5;
  if (moves.has('superfang')) mod -= 0.5;
  if (moves.has('trick')) mod -= 0.5;
  if (moves.has('endeavor')) mod -= 1.0;

  if (pokemon.moves.some((m: ID) => RECOVERY_MOVES.has(m))) mod += 1.0;
  if (pokemon.moves.some((m: ID) => PROTECT_MOVES.has(m))) mod += 1.0;
  if (pokemon.moves.some((m: ID) => PHAZING_MOVES.has(m))) mod += 0.5;
  if (pokemon.moves.some((m: ID) => PARALYSIS_MOVES.has(m))) mod += 0.5;
  if (pokemon.moves.some((m: ID) => CONFUSION_MOVES.has(m))) mod += 0.5;
  if (pokemon.moves.some((m: ID) => SLEEP_MOVES.has(m))) mod -= 0.5;
  if (pokemon.moves.some((m: ID) => LESSER_OFFENSIVE_MOVES.has(m))) mod -= 0.5;
  if (pokemon.moves.some((m: ID) => GREATER_OFFENSIVE_MOVES.has(m))) mod -= 1.0;
  if (pokemon.moves.some((m: ID) => OHKO_MOVES.has(m))) mod -= 1.0;

  if (moves.has('bellydrum')) {
    mod -= 2.0;
  } else if (moves.has('shellsmash')) {
    mod -= 1.5;
  } else if (pokemon.moves.some((m: ID) => GREATER_SETUP_MOVES.has(m))) {
    mod -= 1.0;
  } else if (pokemon.moves.some((m: ID) => LESSER_SETUP_MOVES.has(m))) {
    mod -= 0.5;
  }

  return mod;
}
