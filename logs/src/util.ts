import {execSync} from 'child_process';
import * as os from 'os';

const exec = (cmd: string) => execSync(cmd, {encoding: 'utf8'});
const parse = (out: string) => parseInt(out.trim());

export function cpus(logical = true) {
  if (logical) return os.cpus().length;
  switch (os.platform()) {
  case 'linux': return parse(exec('lscpu -p | egrep -v "^#" | sort -u -t, -k 2,4 | wc -l'));
  case 'darwin': return parse(exec('sysctl -n hw.physicalcpu_max'));
  case 'win32': return (exec('WMIC CPU Get NumberOfCores')
    .split(os.EOL)
    .map(parseInt)
    .filter(v => !isNaN(v))
    .reduce((acc, n) => acc + n, 0));
  default: return os.cpus().filter((cpu, i) =>
    !cpu.model.includes('Intel') || (i % 2 === 1)).length;
  }
}
