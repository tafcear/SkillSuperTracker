import { readFile } from 'node:fs/promises';
import { decodeZstdLog } from '@skillsupertracker/core';
import type { TraceAdapter } from '../types.js';
import { findSessionLogs } from './discover.js';
import { fingerprintDshLog } from './fingerprint.js';
import { parseDshText } from './map.js';

/**
 * The DSH adapter — MVP's only implementation (spec D2). Discovery walks the
 * configured sessions root; parse turns one artifact file into a trajectory.
 */
export const dshAdapter: TraceAdapter = {
  id: 'dsh',
  locate(rootDir, opts) {
    opts?.signal?.throwIfAborted();
    return findSessionLogs(rootDir);
  },
  async parse(source, opts) {
    opts?.signal?.throwIfAborted();
    const file = typeof source === 'string' ? source : source.path;
    const buffer = await readFile(file);
    const compression = file.endsWith('.jsonl.zstd') ? 'zstd' : 'none';
    const text = compression === 'zstd' ? decodeZstdLog(buffer).text : buffer.toString('utf8');
    const fingerprint = fingerprintDshLog(text, compression);
    return parseDshText(text, fingerprint);
  },
};
