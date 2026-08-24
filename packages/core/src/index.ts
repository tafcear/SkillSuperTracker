export const coreVersion = '0.1.0';
export { scanZstdFrames, ZSTD_MAGIC } from './zstd-frames.js';
export type { ZstdFrame, ZstdScanResult } from './zstd-frames.js';
export { decodeZstdLog } from './decompress.js';
export type { DecodedZstdLog } from './decompress.js';
