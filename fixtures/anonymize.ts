/**
 * Golden-sample generator (spec §十.3): strictly anonymize a real DSH session
 * log into a checked-in fixture, parse the result with the real adapter, and
 * record the expected facts next to it. Run with Node >=23.6 native type
 * stripping (dev machine is Node 24):
 *
 *   npm run build -w @skillsupertracker/core && npm run build -w @skillsupertracker/adapters
 *   node fixtures/anonymize.ts <src-session.jsonl.zstd> <dst-session-dir>
 *
 * Keeps event envelopes, turn/step/callId structure, skill and tool names,
 * usage numbers and reason kinds; redacts every other string, deletes the
 * header cwd, rebases timestamps to a fixed epoch preserving offsets. Exits
 * non-zero when the anonymized text still contains machine-identifying tokens.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { zstdCompressSync, constants as zlibConstants } from 'node:zlib';
import { decodeZstdLog } from '../packages/core/dist/index.js';
import { dshAdapter } from '../packages/adapters/dist/index.js';

const FIXTURE_ID = 'session-fixture-0001';
const FIXTURE_CREATED_AT = 1700000000000;
const LEAK_TOKENS = ['BaiduSyncdisk', 'baidusyncdisk', 'tafce', 'C:\\Users', 'C:/Users'];
// NOTE: 'sourceRoot' is deliberately NOT whitelisted — it never appears in real
// DSH stored events, and if it did, it would be an absolute path that must be redacted.
const KEEP_STRING_KEYS = new Set([
  'type', 'kind', 'role', 'status', 'name', 'provider', 'model', 'origin',
  'form', 'outcome', 'code', 'callId', 'toolCallId',
]);

/**
 * Recursive redactor: keep numbers/booleans and whitelisted structural keys
 * (type/kind/role/status/name/provider/model/...), replace every other
 * string with `<redacted>`. Skill names survive because the skill tool-call
 * arguments use the whitelisted `name` key; message bodies, file paths, repo
 * paths, titles, message ids and cwd all sit on non-whitelisted keys.
 *
 * NOTE: `reason` is intentionally NOT whitelisted. `turn/end`'s `reason.kind`
 * still survives because `kind` is whitelisted, while `approval/asked`'s
 * free-text `reason` string (which embeds message bodies and absolute paths)
 * is redacted to `<redacted>`.
 */
function redact(value: unknown): unknown {
  if (typeof value === 'string') return '<redacted>';
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (KEEP_STRING_KEYS.has(key) && typeof v === 'string') out[key] = v;
      else out[key] = redact(v);
    }
    return out;
  }
  return undefined;
}

function anonymizeLine(rawLine: string, timeBase: number): string | undefined {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawLine) as Record<string, unknown>;
  } catch {
    return undefined; // torn/unparsable tail line — caller counts and skips
  }
  const isHeader = parsed.type === 'session';
  const time = typeof parsed.time === 'number' ? parsed.time : null;
  const out = redact(parsed) as Record<string, unknown>;
  if (isHeader) {
    out.id = FIXTURE_ID;
    out.createdAt = FIXTURE_CREATED_AT;
    delete out.cwd;
  }
  if (time !== null) {
    out.time = FIXTURE_CREATED_AT + (time - timeBase);
  }
  // packed chunk rows carry their timestamps in time0 — rebase those too
  if (typeof (parsed as { time0?: unknown }).time0 === 'number') {
    out.time0 = FIXTURE_CREATED_AT + (((parsed as { time0: number }).time0) - timeBase);
  }
  // guard: the skill loader's arguments must keep the skill name
  const data = parsed.data as Record<string, unknown> | undefined;
  if (parsed.type === 'tool/call' && data?.name === 'skill') {
    let args: unknown;
    try {
      args = JSON.parse(data.arguments as string);
    } catch {
      args = undefined;
    }
    if (typeof args === 'object' && args !== null && typeof (args as { name?: unknown }).name === 'string') {
      (out.data as Record<string, unknown>).arguments = JSON.stringify({ name: (args as { name: string }).name });
    }
  }
  return JSON.stringify(out);
}

async function main(): Promise<void> {
  const src = process.argv[2];
  const dstDir = process.argv[3];
  if (src === undefined || dstDir === undefined) {
    console.error('usage: node fixtures/anonymize.ts <src-session.jsonl.zstd> <dst-session-dir>');
    process.exit(2);
  }
  const decoded = decodeZstdLog(readFileSync(src));
  const rows = decoded.text.split('\n').filter((row) => row.length > 0);
  const header = JSON.parse(rows[0]) as Record<string, unknown>;
  const timeBase = typeof header.createdAt === 'number' ? header.createdAt : 0;
  let skippedRawLines = 0;
  const outLines: string[] = [];
  for (const row of rows) {
    const anonymized = anonymizeLine(row, timeBase);
    if (anonymized === undefined) {
      skippedRawLines += 1;
      continue;
    }
    outLines.push(anonymized);
  }
  if (skippedRawLines > 0) console.warn(`skipped ${skippedRawLines} unparsable raw line(s)`);
  const outText = outLines.join('\n') + '\n';
  for (const token of LEAK_TOKENS) {
    if (outText.includes(token)) {
      console.error(`anonymization failed: leaked token "${token}"`);
      process.exit(1);
    }
  }
  mkdirSync(dstDir, { recursive: true });
  const fixturePath = join(dstDir, 'session.jsonl.zstd');
  writeFileSync(fixturePath, zstdCompressSync(Buffer.from(outText, 'utf8'), { params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 } }));

  // Lock in the expected facts with the real adapter — the regression test compares against this file.
  const trace = await dshAdapter.parse(fixturePath);
  const events = trace.turns.flatMap((turn) => turn.events);
  const expected = {
    agent: trace.agent,
    schemaVersion: trace.schemaVersion,
    turnCount: trace.turns.length,
    skillLoads: events.filter((e) => e.type === 'skill-load').map((e) => ({ name: e.skill.name })),
    toolCallCount: events.filter((e) => e.type === 'tool-call').length,
    artifactCount: events.filter((e) => e.type === 'artifact').length,
    stats: trace.stats,
  };
  writeFileSync(join(dstDir, 'expected.json'), JSON.stringify(expected, null, 2) + '\n');
  console.log(`wrote ${fixturePath} + expected.json (${trace.turns.length} turns, ${expected.toolCallCount} tool calls)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
