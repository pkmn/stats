

class Stats implements Processor {
  async init() {
    if (!dryRun) await createReportsDirectoryStructure(output);
  }

  accept(format: ID) {
    return !(format.startsWith('seasonal') || format.includes('random') ||
        format.includes('metronome' || format.includes('superstaff')));
  }


}

async function createReportsDirectoryStructure(output: string) {
  await rmrf(output);
  await fs.mkdir(output, {recursive: true});
  const monotype = path.resolve(output, 'monotype');
  await fs.mkdir(monotype);
  await Promise.all([...mkdirs(output), ...mkdirs(monotype)]);
}

function mkdirs(dir: string) {
  const mkdir = (d: string) => fs.mkdir(path.resolve(dir, d));
  return [mkdir('chaos'), mkdir('leads'), mkdir('moveset'), mkdir('metagame')];
}

async function rmrf(dir: string) {
  if (await fs.exists(dir)) {
    const rms: Array<Promise<void>> = [];
    for (const file of await fs.readdir(dir)) {
      const f = path.resolve(dir, file);
      if ((await fs.lstat(f)).isDirectory()) {
        rms.push(rmrf(f));
      } else {
        rms.push(fs.unlink(f));
      }
    }
    await Promise.all(rms);
    await fs.rmdir(dir);
  }
}


