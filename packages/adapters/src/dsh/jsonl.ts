export interface RowCounts {
  skippedLines: number;
  skippedChunkRows: number;
  unknownEventTypes: string[];
}

export type RowKind = 'event' | 'chunk-row';

const CHUNK_ROW_TYPES = new Set(['text-chunks', 'reasoning-chunks', 'tool-call-chunks']);

/**
 * DSH packs runs of assistant delta chunks into storage rows tagged with
 * bare (slash-less) type names. They carry no trajectory meaning for this
 * tool; the lenient read skips and counts them (spec D8.2).
 */
export function classifyRow(value: unknown): RowKind {
  if (typeof value !== 'object' || value === null) return 'event';
  const type = (value as { type?: unknown }).type;
  if (typeof type === 'string' && CHUNK_ROW_TYPES.has(type)) return 'chunk-row';
  return 'event';
}

/**
 * Split decoded plaintext into rows. A trailing fragment without a newline is
 * a torn tail (DSH is appending) — drop it and count it (spec D8.4).
 */
export function splitRows(text: string, counts: RowCounts): string[] {
  const rows = text.split('\n');
  if (rows.at(-1) === '') {
    rows.pop(); // file ends with a newline: the last split element is empty
  } else {
    rows.pop(); // torn trailing fragment without newline
    counts.skippedLines += 1;
  }
  return rows;
}
