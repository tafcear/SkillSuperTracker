import { spawn } from 'node:child_process';

/** Open a local file with the platform default app. `stdio: 'ignore'` keeps the spawn sandbox-friendly. */
export async function openPath(target: string): Promise<void> {
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', target] : [target];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', () => resolve());
  });
}
