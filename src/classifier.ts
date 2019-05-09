import {calcStat, ID, Data, PokemonSet, Species, Stat, toID} from 'ps';

import {getBaseSpecies, getSpecies, getMegaEvolution} from './util';

// TODO: Where does this constant come from? (ie. rename!)
const LN3LN2 = Math.log(3) / Math.log(2);

export const Classifier = new class {
  classifyTeam(team: Array<PokemonSet<ID>>, format?: string|Data) {
    let teamBias = 0;
    const teamStalliness = [];
    for (const pokemon of team) {
      const {bias, stalliness} = this.classifyPokemon(pokemon, format);
      teamBias += bias;
      teamStalliness.push(stalliness / LN3LN2);
    }

    const stalliness = teamStalliness.reduce((a, b) => a + b) / teamStalliness.length;
    const tags = tag(team);

    if (stalliness <= -1) {
      tags.add('hyperoffense' as ID);

      if (!tags.has('multiweather' as ID) && !tags.has('allweather' as ID) && !tags.has('weatherless' as ID)) {
        if (tags.has('rain' as ID)) {
          tags.add('rainoffense' as ID);
        } else if (tags.has('sun' as ID)) {
          tags.add('sunoffense' as ID);
        } else if (tags.has('sand' as ID)) {
          tags.add('sandoffense' as ID);
        } else {
          tags.add('hailoffense' as ID);
        }
      }
    } else if (stalliness < 0) {
      tags.add('offense' as ID);
    } else if (stalliness < 1.0) {
      tags.add('balance' as ID);
    } else if (stalliness < LN3LN2) {
      tags.add('semistall' as ID);
    } else {
      tags.add('stall' as ID);

      if (!tags.has('multiweather' as ID) && !tags.has('allweather' as ID) && !tags.has('weatherless' as ID)) {
        if (tags.has('rain' as ID)) {
          tags.add('rainstall' as ID);
        } else if (tags.has('sun' as ID)) {
          tags.add('sunstall' as ID);
        } else if (tags.has('sand' as ID)) {
          tags.add('sandstall' as ID);
        } else {
          tags.add('hailstall' as ID);
        }
      }
    }

    return {bias: teamBias, stalliness, tags};
  }

  // For stats and moveset purposes we're now counting Mega Pokemon seperately,
  // but for team analysis we still want to consider the base (which presumably
  // breaks for Hackmons, but we're OK with that).
  classifyPokemon(pokemon: PokemonSet<ID>, format?: string|Data) {
    const originalSpecies = pokemon.species;
    const originalAbility = pokemon.ability;

    const species = getSpecies(pokemon.species);
    if (isMega(species)) pokemon.species = toID(species.baseSpecies);

    let {bias, stalliness} = classifyForme(pokemon, format);
    // FIXME: Intended behavior, but not used for compatibility:
    // if (pokemon.species === 'meloetta' && pokemon.moves.includes('relicsong' as ID)) {
    //   pokemon.species = 'meloettapirouette' as ID;
    //   stalliness = (stalliness + classifyForme(pokemon, format).stalliness) / 2;
    // } else if (
    //     pokemon.species === 'darmanitan' && pokemon.ability === 'zenmode') {
    //   pokemon.species = 'darmanitanzen'  as ID;
    //   stalliness = (stalliness + classifyForme(pokemon, format).stalliness) / 2;
    // } else if (
    //     pokemon.species === 'rayquaza' &&
    //     pokemon.moves.includes('dragonascent' as ID)) {
    //   pokemon.species = 'rayquazamega' as ID;
    //   pokemon.ability = 'deltastream' as ID;
    //   stalliness = (stalliness + classifyForme(pokemon, format).stalliness) / 2;
    // } else {
    const mega = getMegaEvolution(pokemon, format);
    if (mega) {
      pokemon.species = mega.species;
      pokemon.ability = mega.ability;
      stalliness = (stalliness + classifyForme(pokemon, format).stalliness) / 2;
    }

    // Make sure to revert back to the original values
    pokemon.species = originalSpecies;
    pokemon.ability = originalAbility;

    return {bias, stalliness};
  }
};

function isMega(species: Species) {
  // FIXME: Ultra Burst?
  return species.forme && (species.forme.startsWith('Mega') || species.forme.startsWith('Primal'));
}

const TRAPPING_ABILITIES = new Set(['arenatrap', 'magnetpull', 'shadowtag']);

const TRAPPING_MOVES = new Set(['block', 'meanlook', 'spiderweb', 'pursuit']);

function classifyForme(pokemon: PokemonSet<ID>, format?: string|Data) {
  let stalliness = baseStalliness(pokemon, format);
  stalliness += abilityStallinessModifier(pokemon);
  stalliness += itemStallinessModifier(pokemon);
  stalliness += movesStallinessModifier(pokemon);

  if (TRAPPING_ABILITIES.has(pokemon.ability)) {
    stalliness -= 1.0;
  } else if (pokemon.moves.some(m => TRAPPING_MOVES.has(m))) {
    stalliness -= 0.5;
  }
  if (pokemon.ability === 'harvest' || pokemon.moves.includes('recycle' as ID)) {
    stalliness += 1.0;
  }
  if (['sandstream', 'snowwarning'].includes(pokemon.ability) ||
      pokemon.moves.some(m => ['sandstorm', 'hail'].includes(m))) {
    stalliness += 0.5;
  }

  const bias =
      pokemon.evs.atk + pokemon.evs.spa - pokemon.evs.hp - pokemon.evs.def - pokemon.evs.spd;

  return {bias, stalliness};
}

function baseStalliness(pokemon: PokemonSet<ID>, format?: string|Data) {
  if (pokemon.species === 'shedinja') return 0;
  // TODO: replace this with mean stalliness for the tier
  if (pokemon.species === 'ditto') return LN3LN2;
  const stats = calcStats(pokemon, format);
  return -Math.log(
             (2.0 * pokemon.level + 10) / 250 *
             Math.max(stats.atk, stats.spa / Math.max(stats.def, stats.spd) * 120 + 2) * 0.925 /
             stats.hp) /
      Math.log(2);
}

function calcStats(pokemon: PokemonSet<ID>, format?: string|Data) {
  const stats = calcFormeStats(pokemon, format);
  if (pokemon.species === 'aegislash' && pokemon.ability === 'stancechange') {
    pokemon.species = 'aegislashblade' as ID;
    const blade = calcFormeStats(pokemon, format);
    pokemon.species = 'aegislash' as ID;
    blade.def = Math.floor((blade.def + stats.def) / 2);
    blade.spd = Math.floor((blade.spd + stats.spd) / 2);
    return blade;
  }
  return stats;
}

function calcFormeStats(pokemon: PokemonSet<ID>, format?: string|Data) {
  const species = getSpecies(pokemon.species);
  const nature = Data.forFormat(format).getNature(pokemon.nature);
  const stats = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
  let stat: Stat;
  for (stat in stats) {
    stats[stat] =
        calcStat(stat, species.baseStats[stat], pokemon.ivs[stat], pokemon.evs[stat], 100, nature);
  }
  return stats;
}

const SETUP_MOVES = new Set([
  'acupressure', 'bellydrum',   'bulkup',      'coil',        'curse',      'dragondance',
  'growth',      'honeclaws',   'howl',        'meditate',    'sharpen',    'shellsmash',
  'shiftgear',   'swordsdance', 'workup',      'calmmind',    'chargebeam', 'fierydance',
  'nastyplot',   'tailglow',    'quiverdance', 'agility',     'autotomize', 'flamecharge',
  'rockpolish',  'doubleteam',  'minimize',    'substitute',  'acidarmor',  'barrier',
  'cosmicpower', 'cottonguard', 'defendorder', 'defensecurl', 'harden',     'irondefense',
  'stockpile',   'withdraw',    'amnesia',     'charge',      'ingrain'
] as ID[]);

const SETUP_ABILITIES = new Set(['angerpoint', 'contrary', 'moody', 'moxie', 'speedboost'] as ID[]);

const DRAGONS = new Set([
  'dratini',        'dragonair', 'bagon',    'shelgon',   'axew',   'fraxure', 'haxorus',
  'druddigon',      'dragonite', 'altaria',  'salamence', 'latias', 'latios',  'rayquaza',
  'gible',          'gabite',    'garchomp', 'reshiram',  'zekrom', 'kyurem',  'kyuremwhite',
  'kyuremblack',    'kingdra',   'vibrava',  'flygon',    'dialga', 'palkia',  'giratina',
  'giratinaorigin', 'deino',     'zweilous', 'hydreigon'
] as ID[]);

const LOW_ACCURACY_MOVES = new Set([
  'guillotine',   'fissure',     'sheercold',  'dynamicpunch', 'inferno',    'zapcannon',
  'grasswhistle', 'sing',        'supersonic', 'hypnosis',     'blizzard',   'focusblast',
  'gunkshot',     'hurricane',   'smog',       'thunder',      'clamp',      'dragonrush',
  'eggbomb',      'irontail',    'lovelykiss', 'magmastorm',   'megakick',   'poisonpowder',
  'slam',         'sleeppowder', 'stunspore',  'sweetkiss',    'willowisp',  'crosschop',
  'darkvoid',     'furyswipes',  'headsmash',  'hydropump',    'kinesis',    'psywave',
  'rocktomb',     'stoneedge',   'submission', 'boneclub',     'bonerush',   'bonemerang',
  'bulldoze',     'dig',         'drillrun',   'earthpower',   'earthquake', 'magnitude',
  'mudbomb',      'mudshot',     'mudslap',    'sandattack',   'spikes',     'toxicspikes'
] as ID[]);

function tag(team: Array<PokemonSet<ID>>) {
  const weather = {rain: 0, sun: 0, sand: 0, hail: 0};
  const style = {
    batonpass: 0,
    tailwind: 0,
    trickroom: 0,
    slow: 0,
    lowacc: 0,
    gravity: 0,
    voltturn: 0,
    dragons: 0,
    trappers: 0,
    clearance: 0,
    fear: 0,
    choice: 0,
    swagplay: 0,
    monotype: 0,
  };

  let possibleTypes: string[]|undefined;
  for (const pokemon of team) {
    const species = getBaseSpecies(pokemon.species);
    const moves = new Set(pokemon.moves);
    possibleTypes = possibleTypes ? possibleTypes.filter(t => species.types.includes(t)) :
                                    species.types.slice();

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

    if (weather.rain < 2 && moves.has('raindance' as ID)) {
      weather.rain += pokemon.item === 'damprock' ? 2 : 1;
    }
    if (weather.sun < 2 && moves.has('sunnyday' as ID)) {
      weather.sun += pokemon.item === 'heatrock' ? 2 : 1;
    }
    if (weather.sand < 2 && moves.has('sandstorm' as ID)) {
      weather.sand += pokemon.item === 'smoothrock' ? 2 : 1;
    }
    if (weather.hail < 2 && moves.has('hail' as ID)) {
      weather.hail += pokemon.item === 'icyrock' ? 2 : 1;
    }

    if (style.batonpass < 2 && moves.has('batonpass' as ID) &&
        (SETUP_ABILITIES.has(pokemon.ability) || pokemon.moves.some(m => SETUP_MOVES.has(m)))) {
      style.batonpass++;
    }
    if (style.tailwind < 2 && moves.has('tailwind' as ID)) {
      style.tailwind++;
    }
    if (moves.has('trickroom' as ID) && !moves.has('imprison' as ID)) {
      style.trickroom++;
    }
    // TODO: use actual stats and speed factor...
    if (style.slow < 2 && pokemon.evs.spe < 5 &&
        (['brave', 'relaxed', 'quiet', 'sassy'].includes(pokemon.nature) ||
         species.baseStats.spe <= 50)) {
      style.slow++;
    }
    if (style.gravity < 2 && moves.has('gravity' as ID)) {
      style.gravity++;
    }
    if (pokemon.moves.some(m => LOW_ACCURACY_MOVES.has(m))) {
      style.lowacc++;
    }
    if (style.voltturn < 3 && pokemon.item === 'ejectbutton' ||
        pokemon.moves.some(m => ['voltswitch', 'uturn', 'batonpass'].includes(m))) {
      style.voltturn++;
    }
    if (style.trappers < 3 && ['magnetpull', 'arentrap', 'shadowtag'].includes(pokemon.ability) ||
        pokemon.moves.some(m => ['block', 'meanlook', 'spiderweb'].includes(m))) {
      style.trappers++;
    }
    if (style.dragons < 2 && DRAGONS.has(pokemon.species)) {
      style.dragons++;
    }
    if (style.clearance < 2 && pokemon.ability === 'magicbounce' ||
    moves.has('rapidspin' as ID)) {
      style.clearance++;
    }
    if (style.fear < 3 && (pokemon.ability === 'sturdy' || pokemon.item === 'focussash') &&
    moves.has('endeavor' as ID)) {
      style.fear++;
    }
    if (style.choice < 4 && pokemon.ability !== 'klutz' &&
        ['choiceband', 'choicescarf', 'choicespecs'].includes(pokemon.item)) {
      style.choice++;
    }
    if (style.swagplay < 2 &&
        pokemon.moves.filter(m => m === 'foulplay' || m === 'swagger').length > 1) {
      style.swagplay++;
    }
  }

  const tags = [];

  if (weather.rain > 1) tags.push('rain');
  if (weather.sun > 1) tags.push('sun');
  if (weather.sand > 1) tags.push('sand');
  if (weather.hail > 1) tags.push('hail');

  if (tags.length === 4) {
    tags.push('allweather');
  } else if (tags.length > 1) {
    tags.push('multiweather');
  } else if (tags.length === 0) {
    tags.push('weatherless');
  }

  if (style.batonpass > 1) tags.push('batonpass');
  if (style.tailwind > 1) tags.push('tailwind');
  const trickroom = style.trickroom > 2 || (style.trickroom > 1 && style.slow > 1);
  if (trickroom) {
    tags.push('trickroom');
    if (weather.rain > 1) tags.push('trickrain');
    if (weather.sun > 1) tags.push('tricksun');
    if (weather.sand > 1) tags.push('tricksand');
    if (weather.hail > 1) tags.push('trickhail');
  }
  if (style.gravity > 2 || (style.gravity > 1 && style.lowacc > 1)) {
    tags.push('gravity');
  }
  if (style.voltturn > 2 && style.batonpass < 2) tags.push('voltturn');
  if (style.dragons > 1 && style.trappers > 0) tags.push('dragmag');
  if (style.trappers > 2) tags.push('trapper');
  if (style.fear > 2 && style.clearance > 1) {
    tags.push('fear');
    if (weather.sand > 1) tags.push('sandfear');
    if (weather.hail > 1) tags.push('hailfear');
    if (trickroom) tags.push('trickfear');
  }
  if (style.choice > 3) tags.push('choice');
  if (style.choice > 1) tags.push('swagplay');

  if (possibleTypes && possibleTypes.length) {
    tags.push('monotype');
    for (const monotype in possibleTypes) {
      tags.push(`mono${monotype.toLowerCase()}`);
    }
  }

  return new Set(tags as ID[]);
}

const GREATER_OFFENSIVE_ABILITIES = new Set([
  'purepower',
  'hugepower',
  'speedboost',
  'moody',
] as ID[]);

const LESSER_OFFENSIVE_ABILITIES = new Set([
  'chlorophyll', 'download',     'hustle',     'moxie',       'reckless',  'sandrush',
  'solarpower',  'swiftswim',    'technician', 'tintedlens',  'darkaura',  'fairyaura',
  'infiltrator', 'parentalbond', 'protean',    'strongjaw',   'sweetveil', 'toughclaws',
  'aerilate',    'normalize',    'pixilate',   'refrigerate',
] as ID[]);

const LESSER_DEFENSIVE_ABILITITIES = new Set([
  'dryskin',   'filter',      'hydration',   'icebody',    'intimidate',
  'ironbarbs', 'marvelscale', 'naturalcure', 'magicguard', 'multiscale',
  'raindish',  'roughskin',   'solidrock',   'thickfat',   'unaware',
  'aromaveil', 'bulletproof', 'cheekpouch',  'gooey',      'regenerator',
] as ID[]);

const GREATER_DEFENSIVE_ABILITIES = new Set([
  'slowstart',
  'truant',
  'furcoat',
  'harvest',
] as ID[]);

function abilityStallinessModifier(pokemon: PokemonSet<ID>) {
  const ability = pokemon.ability;
  if (GREATER_OFFENSIVE_ABILITIES.has(ability)) return -1.0;
  if (LESSER_OFFENSIVE_ABILITIES.has(ability)) return -0.5;
  if (LESSER_DEFENSIVE_ABILITITIES.has(ability)) return 0.5;
  if (GREATER_DEFENSIVE_ABILITIES.has(ability)) return 1.0;
  return 0;
}

const LESSER_BOOSTING_ITEM = new Set([
  'expertbelt', 'wiseglasses',  'muscleband',  'dracoplate',   'dreadplate',   'earthplate',
  'fistplate',  'flameplate',   'icicleplate', 'insectplate',  'ironplate',    'meadowplate',
  'mindplate',  'skyplate',     'splashplate', 'spookyplate',  'stoneplate',   'toxicplate',
  'zapplate',   'blackglasses', 'charcoal',    'dragonfang',   'hardstone',    'magnet',
  'metalcoat',  'miracleseed',  'mysticwater', 'nevermeltice', 'poisonbarb',   'sharpbeak',
  'silkscarf',  'silverpowder', 'softsand',    'spelltag',     'twistedspoon', 'pixieplate',
] as ID[]);

const GREATER_BOOSTING_ITEM = new Set([
  'firegem',     'watergem',     'electricgem', 'grassgem',    'icegem',      'fightinggem',
  'posiongem',   'groundgem',    'groundgem',   'flyinggem',   'psychicgem',  'buggem',
  'rockgem',     'ghostgem',     'darkgem',     'steelgem',    'normalgem',   'focussash',
  'mentalherb',  'powerherb',    'whiteherb',   'absorbbulb',  'berserkgene', 'cellbattery',
  'redcard',     'focussash',    'airballoon',  'ejectbutton', 'shedshell',   'aguavberry',
  'apicotberry', 'aspearberry',  'babiriberry', 'chartiberry', 'cheriberry',  'chestoberry',
  'chilanberry', 'chopleberry',  'cobaberry',   'custapberry', 'enigmaberry', 'figyberry',
  'ganlonberry', 'habanberry',   'iapapaberry', 'jabocaberry', 'kasibberry',  'kebiaberry',
  'lansatberry', 'leppaberry',   'liechiberry', 'lumberry',    'magoberry',   'micleberry',
  'occaberry',   'oranberry',    'passhoberry', 'payapaberry', 'pechaberry',  'persimberry',
  'petayaberry', 'rawstberry',   'rindoberry',  'rowapberry',  'salacberry',  'shucaberry',
  'sitrusberry', 'starfberry',   'tangaberry',  'wacanberry',  'wikiberry',   'yacheberry',
  'keeberry',    'marangaberry', 'roseliberry', 'snowball',    'choiceband',  'choicescarf',
  'choicespecs', 'lifeorb',
] as ID[]);

function itemStallinessModifier(pokemon: PokemonSet<ID>) {
  const item = pokemon.item;
  if (['weaknesspolicy', 'lightclay'].includes(item)) return -1.0;
  if (['redcard', 'rockyhelmet', 'eviolite'].includes(item)) return 0.5;
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
  'recover',
  'slackoff',
  'healorder',
  'milkdrink',
  'roost',
  'moonlight',
  'morningsun',
  'synthesis',
  'wish',
  'aquaring',
  'rest',
  'softboiled',
  'swallow',
  'leechseed',
] as ID[]);

const PROTECT_MOVES = new Set(['protect', 'detect', 'kingsshield', 'matblock', 'spikyshield'] as ID[]);

const PHAZING_MOVES = new Set(['whirlwind', 'roar', 'circlethrow', 'dragontail'] as ID[]);

const PARALYSIS_MOVES = new Set(['thunderwave', 'stunspore', 'glare', 'nuzzle'] as ID[]);

const CONFUSION_MOVES =
    new Set(['supersonic', 'confuseray', 'swagger', 'flatter', 'teeterdance', 'yawn'] as ID[]);

const SLEEP_MOVES =
    new Set(['darkvoid', 'grasswhistle', 'hypnosis', 'lovelykiss', 'sing', 'sleeppowder', 'spore'] as ID[]);

const LESSER_OFFENSIVE_MOVES = new Set([
  'jumpkick', 'doubleedge', 'submission', 'petaldance', 'hijumpkick', 'outrage', 'volttackle',
  'closecombat', 'flareblitz', 'bravebird', 'woodhammer', 'headsmash', 'headcharge', 'wildcharge',
  'takedown', 'dragonascent'
] as ID[]);

const GREATER_OFFENSIVE_MOVES = new Set([
  'selfdestruct', 'explosion', 'destinybond', 'perishsong', 'memento', 'healingwish', 'lunardance',
  'finalgambit'
] as ID[]);

const OHKO_MOVES = new Set(['guillotine', 'fissure', 'sheercold']  as ID[]);

const GREATER_SETUP_MOVES = new Set([
  'curse', 'dragondance', 'growth', 'shiftgear', 'swordsdance', 'fierydance', 'nastyplot',
  'tailglow', 'quiverdance', 'geomancy'
] as ID[]);

const LESSER_SETUP_MOVES = new Set([
  'acupressure', 'bulkup', 'coil', 'howl', 'workup', 'meditate', 'sharpen', 'calmmind',
  'chargebeam', 'agility', 'autotomize', 'flamecharge', 'rockpolish', 'doubleteam', 'minimize',
  'tailwind', 'poweruppunch', 'rototiller'
] as ID[]);

function movesStallinessModifier(pokemon: PokemonSet<ID>) {
  const moves = new Set(pokemon.moves);

  let mod = 0;
  if (moves.has('toxic' as ID)) mod += 1.0;
  if (moves.has('spikes' as ID)) mod += 0.5;
  if (moves.has('toxicspikes' as ID)) mod += 0.5;
  if (moves.has('willowisp' as ID)) mod += 0.5;
  if (moves.has('psychoshift' as ID)) mod += 0.5;
  if (moves.has('healbell' as ID) || moves.has('aromatherapy' as ID)) mod += 0.5;
  if (moves.has('haze' as ID) || moves.has('clearsmog' as ID)) mod += 0.5;
  if (moves.has('substitute' as ID)) mod -= 0.5;
  if (moves.has('superfang' as ID)) mod -= 0.5;
  if (moves.has('trick' as ID)) mod -= 0.5;
  if (moves.has('endeavor' as ID)) mod -= 1.0;

  if (pokemon.moves.some(m => RECOVERY_MOVES.has(m))) mod += 1.0;
  if (pokemon.moves.some(m => PROTECT_MOVES.has(m))) mod += 1.0;
  if (pokemon.moves.some(m => PHAZING_MOVES.has(m))) mod += 0.5;
  if (pokemon.moves.some(m => PARALYSIS_MOVES.has(m))) mod += 0.5;
  if (pokemon.moves.some(m => CONFUSION_MOVES.has(m))) mod += 0.5;
  if (pokemon.moves.some(m => SLEEP_MOVES.has(m))) mod -= 0.5;
  if (pokemon.moves.some(m => LESSER_OFFENSIVE_MOVES.has(m))) mod -= 0.5;
  if (pokemon.moves.some(m => GREATER_OFFENSIVE_MOVES.has(m))) mod -= 1.0;
  if (pokemon.moves.some(m => OHKO_MOVES.has(m))) mod -= 1.0;

  if (moves.has('bellydrum' as ID)) {
    mod -= 2.0;
  } else if (moves.has('shellsmash' as ID)) {
    mod -= 1.5;
  } else if (pokemon.moves.some(m => GREATER_SETUP_MOVES.has(m))) {
    mod -= 1.0;
  } else if (pokemon.moves.some(m => LESSER_SETUP_MOVES.has(m))) {
    mod -= 0.5;
  }

  return mod;
}
