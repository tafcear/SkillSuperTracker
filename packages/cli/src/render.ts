import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'trace-view.html');

/** Inject `data` into the single-file HTML template's __TRACE_DATA__ placeholder. */
export async function renderTraceHtml(data: unknown, opts: { template?: string; out: string }): Promise<void> {
  const template = await readFile(opts.template ?? DEFAULT_TEMPLATE, 'utf8');
  if (!template.includes('__TRACE_DATA__')) {
    throw new Error('template is missing the __TRACE_DATA__ placeholder');
  }
  const json = JSON.stringify(data).replaceAll('</', '<\\/');
  // function replacer: a string replacement value would interpret $&, $', $` … sequences in the JSON
  await mkdir(dirname(opts.out), { recursive: true });
  await writeFile(opts.out, template.replace('__TRACE_DATA__', () => json), 'utf8');
}
