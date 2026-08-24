import { describe, expect, it } from 'vitest';
import { zstdCompressSync, constants as zlibConstants } from 'node:zlib';
import { scanZstdFrames, ZSTD_MAGIC } from '../src/zstd-frames.js';

function frame(input: string | Buffer): Buffer {
  return zstdCompressSync(Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8'), {
    params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 },
  });
}

describe('scanZstdFrames', () => {
  it('locates two concatenated frames', () => {
    const a = frame('line one\n');
    const b = frame('line two\n');
    const joined = Buffer.concat([a, b]);
    const { frames, tornStart } = scanZstdFrames(joined);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({ start: 0, end: a.length });
    expect(frames[1]).toEqual({ start: a.length, end: joined.length });
    expect(tornStart).toBeUndefined();
  });

  it('reports the start of a torn final frame instead of throwing', () => {
    const complete = frame('first\n');
    const torn = frame('second\n').subarray(0, 17); // cut inside blocks
    const joined = Buffer.concat([complete, torn]);
    const { frames, tornStart } = scanZstdFrames(joined);
    expect(frames).toHaveLength(1);
    expect(tornStart).toBe(complete.length);
  });

  it('throws on invalid frame magic', () => {
    expect(() => scanZstdFrames(Buffer.from([1, 2, 3, 4, 5, 6]))).toThrow(/invalid frame magic/);
  });

  it('throws on a reserved frame-header bit', () => {
    const good = frame('x\n');
    good[4] = good[4] | 0b00011000; // descriptor reserved bits (8+16)
    expect(() => scanZstdFrames(good)).toThrow(/reserved frame-header bit/);
  });

  it('honors maxFrames', () => {
    const joined = Buffer.concat([frame('a\n'), frame('b\n')]);
    const { frames } = scanZstdFrames(joined, 1);
    expect(frames).toHaveLength(1);
    expect(frames[0].end).toBeLessThan(joined.length);
  });

  it('exports the zstd magic constant', () => {
    const one = frame('m');
    expect(one.readUInt32LE(0)).toBe(ZSTD_MAGIC);
  });
});
