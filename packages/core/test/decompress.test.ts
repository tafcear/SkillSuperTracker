import { describe, expect, it } from 'vitest';
import { zstdCompressSync, constants as zlibConstants } from 'node:zlib';
import { decodeZstdLog } from '../src/decompress.js';

function frame(input: string): Buffer {
  return zstdCompressSync(Buffer.from(input, 'utf8'), {
    params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 },
  });
}

describe('decodeZstdLog', () => {
  it('joins frames so a JSONL line may span frame boundaries', () => {
    const buf = Buffer.concat([
      frame('{"type":"session","version":0,"id":"s","createdAt":0,"delegationDepth":0}\n{"type":"turn/'),
      frame('start","seq":1,"time":1,"data":{"turn":0}}\n'),
    ]);
    const { text, frameCount, tornStart } = decodeZstdLog(buf);
    expect(frameCount).toBe(2);
    expect(tornStart).toBeUndefined();
    const lines = text.split('\n');
    expect(lines[0]).toContain('"type":"session"');
    expect(lines[1]).toContain('"type":"turn/start"');
  });

  it('omits a torn final frame (committed-prefix semantics)', () => {
    const complete = frame('{"a":1}\n');
    const torn = frame('{"b":2}\n').subarray(0, 12);
    const { text, tornStart } = decodeZstdLog(Buffer.concat([complete, torn]));
    expect(text).toBe('{"a":1}\n');
    expect(tornStart).toBe(complete.length);
  });

  it('throws on an empty input', () => {
    expect(() => decodeZstdLog(Buffer.alloc(0))).toThrow(/empty or header-less/);
  });
});
