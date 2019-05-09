#determine initial pokemon
active = [-1,-1]
for line in log['log']:
        if len(line) < 2 or not line.startswith('|'):
                continue
        parsed_line = [segment.strip() for segment in line.split('|')]
        if len(parsed_line) < 2:
                sys.stderr.write('Problem with '+filename+'\n')
                sys.stderr.write('Could not parse line:\n')
                sys.stderr.write(line + '\n')
                return False

        if parsed_line[1] == 'switch' and parsed_line[2].startswith('p1'):
                if len(parsed_line) < 4:
                        sys.stderr.write('Problem with '+filename+'\n')
                        sys.stderr.write('Could not parse line:\n')
                        sys.stderr.write(line + '\n')
                        return False

                species = parsed_line[3]
                # remove gender
                species = species.split(',')[0]

                for s in aliases: #combine appearance-only variations and weird PS quirks
                        if species in aliases[s]:
                                species = s
                                break

                try:
                        active[0]=ts.index([ts[0][0],species])
                except ValueError:
                        #try undoing a mega evolution
                        if species == 'Greninja-Ash':
                                speciesBase = 'Greninja'
                        elif species == 'Zygarde-Complete':
                                speciesBase = 'Zygarde'
                        elif species.startswith('Mimikyu'):
                                speciesBase = 'Mimikyu'
                        elif species == 'Necrozma-Ultra':
                                speciesBase = 'Necrozma'
                        elif species.endswith('-Mega') or species.endswith('-Mega-X') or species.endswith('-Mega-Y') or species.endswith('-Primal'):
                                if species.endswith('-Mega'):
                                        speciesBase = species[:-5]
                                else:
                                        speciesBase = species[:-7]
                        else:
                                speciesBase = species

                        for i in xrange(6):
                                if ts[i][1].startswith(speciesBase):
                                        species = ts[i][1]
                                        active[0] = i
                        if active[0]==-1:
                                sys.stderr.write('Problem with '+filename+'\n')
                                sys.stderr.write('(Pokemon not in ts) (1)\n')
                                sys.stderr.write(str([ts[0][0],species])+'\n')
                                return False

        if parsed_line[1] == 'switch' and parsed_line[2].startswith('p2'):
                if len(parsed_line) < 4:
                        sys.stderr.write('Problem with '+filename+'\n')
                        sys.stderr.write('Could not parse line:\n')
                        sys.stderr.write(line + '\n')
                        return False

                species = parsed_line[3]
                # remove gender
                species = species.split(',')[0]

                for s in aliases: #combine appearance-only variations and weird PS quirks
                        if species in aliases[s]:
                                species = s
                                break

                try:
                        active[1]=ts.index([ts[11][0],species])
                except ValueError:
                        #try undoing a mega evolution
                        if species == 'Greninja-Ash':
                                speciesBase = 'Greninja'
                        elif species == 'Zygarde-Complete':
                                speciesBase = 'Zygarde'
                        elif species.startswith('Mimikyu'):
                                speciesBase = 'Mimikyu'
                        elif species == 'Necrozma-Ultra':
                                speciesBase = 'Necrozma'
                        elif species.endswith('-Mega') or species.endswith('-Mega-X') or species.endswith('-Mega-Y') or species.endswith('-Primal'):
                                if species.endswith('-Mega'):
                                        speciesBase = species[:-5]
                                else:
                                        speciesBase = species[:-7]
                        else:
                                speciesBase = species

                        for i in xrange(6,12):
                                if ts[i][1].startswith(speciesBase):
                                        species = ts[i][1]
                                        active[1] = i
                        if active[1]==-1:
                                sys.stderr.write('Problem with '+filename+'\n')
                                sys.stderr.write('(Pokemon not in ts) (2)\n')
                                sys.stderr.write(str([ts[11][0],species])+'\n')
                                return False
                break
start=log['log'].index(line)+1

for i in range(0,12):
        turnsOut.append(0)
        KOs.append(0)

#parse the damn log

#flags
roar = False
uturn = False
fodder = False
hazard = False
ko = [False,False]
switch = [False,False]
uturnko = False
mtemp = []

for line in log['log'][start:]:
        if len(line) < 2 or not line.startswith('|'):
                continue
        parsed_line = [segment.strip() for segment in line.split('|')]
        #print line
        #identify what kind of message is on this line
        if len(parsed_line) < 2:
                sys.stderr.write('Problem with '+filename+'\n')
                sys.stderr.write('Could not parse line:\n')
                sys.stderr.write(line)
                return False
        linetype = parsed_line[1]

        if linetype == "turn":
                matchups = matchups + mtemp
                mtemp = []

                #reset for start of turn
                roar = uturn = uturnko = fodder = hazard = False
                ko = [False,False]
                switch = [False,False]

                #Mark each poke as having been out for an additional turn
                turnsOut[active[0]]=turnsOut[active[0]]+1
                turnsOut[active[1]]=turnsOut[active[1]]+1

        elif linetype in ["win","tie"]:
                #close out last matchup
                if ko[0] or ko[1]: #if neither poke was KOed, match ended in forfeit, and we don't care
                        matchup = [ts[active[0]][1],ts[active[1]][1],12]
                        if ko[0] and ko[1]:
                                KOs[active[0]] = KOs[active[0]]+1
                                KOs[active[1]] = KOs[active[1]]+1
                                matchup[2]=2#double down
                        else:
                                KOs[active[ko[0]]] = KOs[active[ko[0]]]+1
                                matchup[2] = ko[1]	#0: poke1 was KOed
                                                        #1: poke2 was KOed
                                if uturnko: #would rather not use this flag...
                                        mtemp=mtemp[:len(mtemp)-1]
                                        matchup[2] = matchup[2] + 8	#8: poke1 was u-turn KOed
                                                                        #9: poke2 was u-turn KOed

                        mtemp.append(matchup)
                matchups=matchups+mtemp


        elif linetype == "move": #check for Roar, etc.; U-Turn, etc.
                hazard = False
                #identify attacker and skip its name
                found = False
                if doublelog:
                        line=line[:8+3*spacelog]+line[9+3*spacelog:]
                for nick in nicks:
                        if line[6+3*spacelog:].startswith(nick):
                                if found: #the trainer was a d-bag
                                        if len(nick) < len(found):
                                                continue
                                found = nick
                tempnicks = copy.copy(nicks)
                while not found: #PS fucked up the names. We fix by shaving a character at a time off the nicknames
                        foundidx=-1
                        for i in range(len(tempnicks)):
                                if len(tempnicks[i])>1:
                                        tempnicks[i]=tempnicks[i][:len(tempnicks[i])-1]
                                if line[6+3*spacelog:].startswith(tempnicks[i]):
                                        if found:
                                                if len(tempnicks[i]) < len(found):
                                                        continue
                                        found = tempnicks[i]
                                        foundidx = i
                        if found:
                                nicks[i]=found
                        else:
                                tryAgain = False
                                for i in range(len(tempnicks)):
                                        if len(tempnicks[i])>1:
                                                tryAgain = True
                                                break
                                if not tryAgain:
                                        sys.stderr.write("Nick not found.\n")
                                        sys.stderr.write("In file: "+argv[1]+"\n")
                                        sys.stderr.write(line[6+3*spacelog:]+"\n")
                                        sys.stderr.write(str(nicks)+"\n")
                                        return False

                move = line[7+5*spacelog+len(found):string.find(line,"|",7+5*spacelog+len(found))-1*spacelog]
                if move in ["Roar","Whirlwind","Circle Throw","Dragon Tail"]:
                        roar = True
                elif move in ["U-Turn","U-turn","Volt Switch","Baton Pass"]:
                        uturn = True

        elif linetype == "-enditem": #check for Red Card, Eject Button
                #search for relevant items
                if string.rfind(line,"Red Card") > -1:
                        roar = True
                elif string.rfind(line,"Eject Button") > -1:
                        uturn = True

        elif linetype == "faint": #KO
                #who fainted?
                p=int(line[8+3*spacelog])-1
                ko[p]=1
                if switch[p]==1: #fainted on the same turn that it was switched in
                        fodder=True

                if uturn:
                        uturn=False
                        uturnko=True

        elif linetype == "replace": #it was Zorua/Zoroark all along!
                p=10+3*spacelog

                if len(parsed_line) < 4:
                        sys.stderr.write('Problem with '+filename+'\n')
                        sys.stderr.write('Could not parse line:\n')
                        sys.stderr.write(line)
                        return False

                species = parsed_line[3]
                # remove gender
                species = species.split(',')[0]

                for s in aliases: #combine appearance-only variations and weird PS quirks
                        if species in aliases[s]:
                                species = s
                                break

                if [ts[11*(int(line[p])-1)][0],species] not in ts:
                        if species == 'Shaymin' and [ts[11*(int(line[p])-1)][0],'Shaymin-Sky'] in ts:
                                #if Shaymin-Sky gets frozen, it reverts to land forme
                                species = 'Shaymin-Sky'
                        else:
                                found = False
                                #try undoing a mega evolution
                                if species == 'Greninja-Ash':
                                        speciesBase = 'Greninja'
                                elif species == 'Zygarde-Complete':
                                        speciesBase = 'Zygarde'
                                elif species.startswith('Mimikyu'):
                                        speciesBase = 'Mimikyu'
                                elif species == 'Necrozma-Ultra':
                                        speciesBase = 'Necrozma'
                                elif species.endswith('-Mega') or species.endswith('-Mega-X') or species.endswith('-Mega-Y') or species.endswith('-Primal'):
                                        if species.endswith('-Mega'):
                                                speciesBase = species[:-5]
                                        else:
                                                speciesBase = species[:-7]
                                else:
                                        speciesBase = species

                                for i in xrange(6*(int(line[p])-1),6*int(line[p])):
                                        if ts[i][1].startswith(speciesBase):
                                                species = ts[i][1]
                                                found = True
                                                break
                                if not found:
                                        #maybe it's a nickname thing
                                        nick = species[species.find(' ')+1:]
                                        player_no = int(species[1])
                                        for i in range(6):
                                                if nicks[2*i+player_no-1].endswith(nick):
                                                        found = True
                                                        species = ts[6*(player_no-1)+i][1]
                                                        break
                                if not found:
                                        sys.stderr.write('Problem with '+filename+'\n')
                                        sys.stderr.write('(Pokemon not in ts) (3)\n')
                                        sys.stderr.write(str([ts[11*(int(line[p])-1)][0],species])+'\n')
                                        return False
                active[int(line[p])-1]=ts.index([ts[11*(int(line[p])-1)][0],species])
                #really, it would be better to go back and revise previous affected matchups, but that be a lot more work

        elif linetype in ["switch","drag"]: #switch out: new matchup!
                if linetype == "switch":
                        p=9+3*spacelog
                else:
                        p=7+3*spacelog
                switch[int(line[p])-1]=True

                if switch[0] and switch[1] and not fodder: #need to revise previous matchup
                        matchup=mtemp[len(mtemp)-1]
                        matchup[2]=12
                        if (not ko[0]) and (not ko[1]): #double switch
                                matchup[2]=5
                        elif ko[0] and ko[1]: #double down
                                KOs[active[ko[0]]] = KOs[active[ko[0]]]+1
                                matchup[2]=2
                        else: #u-turn KO (note that this includes hit-by-red-card-and-dies and roar-then-die-by-residual-dmg)
                                KOs[active[ko[0]]] = KOs[active[ko[0]]]+1
                                matchup[2]=ko[1]+8
                        mtemp[len(mtemp)-1]=matchup
                else:
                        #close out old matchup
                        #it is utterly imperative that the p1 poke goes first and the p2 poke second
                        matchup = [ts[active[0]][1],ts[active[1]][1],12]
                        #if ko[0] and ko[1]: #double down
                        if ko[0] or ko[1]:
                                if fodder and hazard: #if dies on switch-in due to an attack, it's still "KOed"
                                        matchup[2] = ko[1]+10 #foddered
                                else:
                                        KOs[active[ko[0]]] = KOs[active[ko[0]]]+1
                                        matchup[2] = ko[1]
                        else:
                                matchup[2]=3+switch[1]  #3: poke1 switched out
                                                        #4: poke2 switched out
                                if roar:
                                        matchup[2]=matchup[2]+3	#6: poke1 was forced out
                                                                #7: poke2 was forced out
                        mtemp.append(matchup)

                #new matchup!
                uturn = roar = fodder = False
                hazard = True

                if len(parsed_line) < 4:
                        sys.stderr.write('Problem with '+filename+'\n')
                        sys.stderr.write('Could not parse line:\n')
                        sys.stderr.write(line)
                        return False

                species = parsed_line[3]
                # remove gender
                species = species.split(',')[0]
                while ',' in species:
                        species = species[0:string.rfind(species,',')]
                for s in aliases: #combine appearance-only variations and weird PS quirks
                        if species in aliases[s]:
                                species = s
                                break

                if [ts[11*(int(line[p])-1)][0],species] not in ts:
                        if species == 'Shaymin' and [ts[11*(int(line[p])-1)][0],'Shaymin-Sky'] in ts:
                        #if Shaymin-Sky gets frozen, it reverts to land forme
                                species = 'Shaymin-Sky'
                        else:
                                found = False
                                #try undoing a mega evolution
                                if species == 'Greninja-Ash':
                                        speciesBase = 'Greninja'
                                elif species == 'Zygarde-Complete':
                                        speciesBase = 'Zygarde'
                                elif species.startswith('Mimikyu'):
                                        speciesBase = 'Mimikyu'
                                elif species == 'Necrozma-Ultra':
                                        speciesBase = 'Necrozma'
                                elif species.endswith('-Mega') or species.endswith('-Mega-X') or species.endswith('-Mega-Y') or species.endswith('-Primal'):
                                        if species.endswith('-Mega'):
                                                speciesBase = species[:-5]
                                        else:
                                                speciesBase = species[:-7]
                                else:
                                        speciesBase = species

                                for i in xrange(6*(int(line[p])-1),6*int(line[p])):
                                        if ts[i][1].startswith(speciesBase):
                                                species = ts[i][1]
                                                found = True
                                                break
                                if not found:
                                        print ts
                                        sys.stderr.write('Problem with '+filename+'\n')
                                        sys.stderr.write('(Pokemon not in ts) (4)\n')
                                        sys.stderr.write(str([ts[11*(int(line[p])-1)][0],species])+'\n')
                                        return False
                active[int(line[p])-1]=ts.index([ts[11*(int(line[p])-1)][0],species])

for i in range(len(matchups)):
        if matchups[i][2] == False:
                matchups[i][2] = 0 #serves me right for playing it fast & loose with T/F vs. 1/0

