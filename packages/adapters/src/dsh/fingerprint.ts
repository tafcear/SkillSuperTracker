export class SessionFormatUnsupportedError extends Error {
  readonly code = 'SESSION_FORMAT_UNSUPPORTED';
  constructor(message: string) {
    super(message);
    this.name = 'SessionFormatUnsupportedError';
  }
}

export interface DshFingerprint {
  format: 'dsh-session-jsonl';
  version: number;
  compression: 'zstd' | 'none';
}

const SUPPORTED_VERSION = 0;

/**
 * Format fingerprint probe (spec D8.3): sniff the header line before decoding
 * anything else. An unknown version must surface as an explicit "upgrade"
 * error, never as silent wrong output.
 */
export function fingerprintDshLog(text: string, compression: 'zstd' | 'none'): DshFingerprint {
  const firstLine = text.split('\n', 1)[0] ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(firstLine);
  } catch {
    throw new SessionFormatUnsupportedError('not a DSH session log: the first line is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || (parsed as Record<string, unknown>).type !== 'session') {
    throw new SessionFormatUnsupportedError('not a DSH session log: the header line is missing `type: "session"`');
  }
  const version = (parsed as Record<string, unknown>).version;
  if (version !== SUPPORTED_VERSION) {
    throw new SessionFormatUnsupportedError(
      `unsupported DSH session log format version ${String(version)} (this build reads version ${SUPPORTED_VERSION}); ` +
      `either upgrade skillsupertracker or this log was written by a newer DSH harness`,
    );
  }
  return { format: 'dsh-session-jsonl', version: SUPPORTED_VERSION, compression };
}
