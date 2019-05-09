import {Glicko} from './glicko';

function readLog(name: string, raw: string, tier, movesets, ratings) {
	const mrayAllowed = !['ubers','battlefactory','megamons', 'gen6ubers', 'gen7ubers', 'gen7pokebankubers'].includes(tier);

  // https://github.com/Zarel/Pokemon-Showdown/commit/92a4f85e0abe9d3a9febb0e6417a7710cabdc303
  if (raw === '"log"') return;

  const log = JSON.parse(raw);
  const spacelog = !(log.log && log.log[0].startsWith('| '));
  if (log.turns === undefined) throw new Error('No turn count');

  const ts = [];
  const rating = {};

  // 0 for tie/unknown, 1 for p1 and 2 for p2 
  let winner: 0|1|2 = 0;
  if (log.log) {
    // TODO: scan log just once?
    const winners = log.log.filter(line => line.startsWith('|win|'));
    if (winners.includes(`|win|${log.p1}`)) winner = 1;
    if (winners.includes(`|win|${log.p2}`)) {
      if (winner === 1) throw new Error('Battle had two winners');
      winner = 2;
    }
  }

  if (!ratings) {
    for (const sideid of [1, 2]) {
      const logRating = log[`p${sideid}rating`];
      if (!logRating) continue;
      const r = rating[`p${sideid}team`] = {};
      // TODO: logRating is dict?
      for (const k of ['r', 'rd', 'rpr', 'rprd']) {
        const n = Number(logRating[k]);
        if (!isNaN(n)) r[k] = n; 
      }
    }
  } else {
    for (const player of [log.p1, log.p2]) {
      ratings[player] = ratings[player] || Glicko.newPlayer();
    }
    Glicko.update(ratings[log.p1], ratings[log.p2], winner);
    for (const player of [[log.p1, 'p1team'], [log.p2, 'p2team']]) {
      const provisional = Glicko.provisional(ratings[player[0]]);
      const r = ratings[player[0]].R
      const rd = ratings[player[0]].RD
      const rpr = provisional.R
      const rprd = provisional.RD
      rating[player[1]] = {r, rd, rpr, rprd};
    }
  }

  const teams = getTeamsFromLog(log, mrayAllowed)
  if (!teams) throw new Error('Unable to get teams from log');

  for (const team of ['p1team', 'p2team']) {
		const trainer = log[team.slice(0, 2)];
		for (const pokemon in teams[team]) {
      ts.push([trainer, pokemon.species]);
    }

    while (log[team].length < 6) {
      ts.push([trainer, 'empty']);
    }


    teams[team].push(analyzeTeam(teams[team]));
    

  }

  





}

function getTeamsFromLog(log: any, mrayAllowed?: boolean) {
  const teams = {p1team: [], p2team: []};
  for (const t of ['p1team', 'p2team']) {
    const team = teams[t];
    for (const line of log[t]) {
      // Apparently randbats usually don't contain the species field?
      let species = toId(line.species ? line.species : line.name);
      if (species.length) throw new Error('No species');
      // if species[0] not in string.lowercase + string.uppercase:
      //   species=species[1:]
      // while species[len(species)-1] in ')". ':
      //   species=species[:len(species)-1]
      // species = keyify(species)
      const item = toId(line.item) || 'nothing';
      const happiness = line.happiness !== undefined ? line.happiness : 255;
      const nature = toId(line.nature) || 'hardy';
      // if nature not in nmod.keys(): #zarel said this is what PS does
      //	nature = 'hardy'
      const evs = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
      if (line.evs) {
        for (const [stat, ev] of Object.entries(line.evs)) {
          evs[stat] = Number(ev);
        }
      }
      const ivs = {hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31};
      if (line.ivs) {
        for (const [stat, iv] of Object.entries(line.ivs)) {
          evs[stat] = Number(iv);
        }
      }
      let moves = line.moves || [];
      while (moves.length < 4) {
        moves.push('');
      }
      moves = moves.map(toId);
      // if 'hiddenpower' in moves:
			// 	hptype=15*(ivs['hp']%2+2*(ivs['atk']%2)+4*(ivs['def']%2)+8*(ivs['spe']%2)+16*(ivs['spa']%2)+32*(ivs['spd']%2))/63
			// 	moves.remove('hiddenpower')
      // 	moves.insert(0,'hiddenpower'+['fighting','flying','poison','ground','rock','bug','ghost','steel','fire','water','grass','electric','psychic','ice','dragon','dark'][hptype])
      let ability = toId(line.ability) || 'unknown';
      const level = line.forcedLevel ? Number(line.forcedLevel) : line.level ? Number(line.level) : 100;

      if (mrayAllowed && species === 'rayquaza' && moves.include('dragonascent')) {
        species = 'rayquazamega';
        ability = 'deltastream';
      } else if (species === 'greninja' && ability === 'battlebond') {
        species = 'greninjaash'
      } else {
        // for mega in megas:
				// 	if [species,item] == mega[:2]:
				// 		species = species+'mega'
				// 		if item.endswith('x'):
				// 			species +='x'
				// 		elif item.endswith('y'):
				// 			species += 'y'
				// 		if species in ['kyogremega','groudonmega']:
				// 			species=species[:-4]+'primal'
				// 		ability=mega[2]
				// 		break
      }
      // if species[0] in string.lowercase or species[1] in string.uppercase:
      //   species = species.title()

      // for s in aliases: #combine appearance-only variations and weird PS quirks
			// 	if species in aliases[s]:
			// 		species = s
			// 		break
			// try:	
			// 	species=keyLookup[keyify(species)]
			// except:
			// 	sys.stderr.write(species+' not in keyLookup.\n')
			// 	return False

			// for s in aliases: #this 2nd one is needed to deal with Nidoran
			// 	if species in aliases[s]:
			// 		species = s
			// 		break
      team.push({
				species, nature, item, evs, ivs,
				happiness, moves, ability, level});
    }
  }
  return teams;
}


function cleanTier(tier: string) {
	if (tier.endsWith('current')) tier = tier.slice(0, -7);
	if (tier.startsWith('pokebank')) tier = tier.slice(8, -4);
	if (tier.startsWith('oras')) tier.slice(4);
	if (tier === 'capbeta') return 'cap';
	if (tier === 'vgc2014beta') return 'vgc2014';
  if (tier.startsWith('xybattlespot') && tier.endsWith('beta')) tier = tier.slice(0, -4);
	if (['battlespotdoubles', 'battlespotdoublesvgc2015'].includes(tier)) return 'vgc2015';
	if (tier === 'smogondoubles') return 'doublesou';
	if (tier === 'smogondoublesubers') return 'doublesubers';
	if (tier === 'smogondoublesuu') return 'doublesuu';
  return tier;
}
