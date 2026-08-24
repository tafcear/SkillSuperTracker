import { describe, expect, it } from 'vitest';
import { fingerprintDshLog, SessionFormatUnsupportedError } from '../src/dsh/fingerprint.js';

const HEADER = JSON.stringify({ type: 'session', version: 0, id: 'session-1', createdAt: 1700000000000, cwd: 'C:\\x', delegationDepth: 0, agentPreset: 'cordis' });

describe('fingerprintDshLog', () => {
  it('accepts a version-0 session header', () => {
    expect(fingerprintDshLog(HEADER + '\n{"type":"turn/start","seq":0,"time":1,"data":{"turn":0}}\n', 'zstd'))
      .toEqual({ format: 'dsh-session-jsonl', version: 0, compression: 'zstd' });
  });

  it('rejects a header-less line', () => {
    expect(() => fingerprintDshLog('{"type":"turn/start"}\n', 'zstd')).toThrow(SessionFormatUnsupportedError);
    expect(() => fingerprintDshLog('{"type":"turn/start"}\n', 'zstd')).toThrow(/type: "session"/);
  });

  it('rejects a non-JSON first line', () => {
    expect(() => fingerprintDshLog('not json at all\n', 'zstd')).toThrow(SessionFormatUnsupportedError);
  });

  it('rejects a future format version with an explicit upgrade message', () => {
    const future = JSON.stringify({ type: 'session', version: 7, id: 's', createdAt: 0, delegationDepth: 0 });
    expect(() => fingerprintDshLog(future + '\n', 'zstd')).toThrow(/version 7/);
    expect(() => fingerprintDshLog(future + '\n', 'zstd')).toThrow(/reads version 0/);
  });
});
