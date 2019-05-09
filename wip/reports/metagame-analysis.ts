const metagame = {tags: {}, stalliness: []};

for (const player in ['p1', 'p2') {
  const p = battle[player];
  const w = weight[player];
  for (const tag in p.tags) {
    metagame.tags[tag] = (metagame.tags[tag] || 0) + w;
    metagame.stalliness.push([p.stalliness, w]);
  }
}