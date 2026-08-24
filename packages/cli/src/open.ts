import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Open a local file with the platform default app. `stdio: 'ignore'` keeps the spawn sandbox-friendly. */
export async function openPath(target: string): Promise<void> {
  if (process.platform === 'win32') await execFileAsync('cmd', ['/c', 'start', '', target], { stdio: 'ignore' });
  else if (process.platform === 'darwin') await execFileAsync('open', [target], { stdio: 'ignore' });
  else await execFileAsync('xdg-open', [target], { stdio: 'ignore' });
}
