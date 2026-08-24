import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'web', 'dist', 'index.html');
const dstDir = join(here, '..', 'templates');
await mkdir(dstDir, { recursive: true });
await copyFile(src, join(dstDir, 'trace-view.html'));
