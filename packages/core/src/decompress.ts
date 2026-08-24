import { zstdDecompressSync } from 'node:zlib';
import { scanZstdFrames } from './zstd-frames.js';

/**
 * Decode a concatenated-frame Zstandard session log using ONLY Node's public
 * one-shot API, per spec D4: scanning the frame structure first, then decoding
 * each complete frame individually. Never one-shot decode the whole file —
 * Node silently returns only the first frame of a concatenated stream.
 * A torn (incomplete) final frame is omitted: that is the committed-prefix
 * read semantics used by DSH itself.
 */
export interface DecodedZstdLog {
  /** Plaintext of all complete frames, joined in order. */
  text: string;
  /** Number of complete frames decoded. */
  frameCount: number;
  /** Byte offset of an incomplete final frame, when present. */
  tornStart?: number;
}

export function decodeZstdLog(buffer: Buffer): DecodedZstdLog {
  const { frames, tornStart } = scanZstdFrames(buffer);
  if (frames.length === 0) throw new Error('empty or header-less Zstandard session log');
  const parts: string[] = [];
  for (const frame of frames) {
    parts.push(zstdDecompressSync(buffer.subarray(frame.start, frame.end)).toString('utf8'));
  }
  return { text: parts.join(''), frameCount: frames.length, ...(tornStart === undefined ? {} : { tornStart }) };
}
