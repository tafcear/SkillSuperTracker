# skillsupertracker MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is TDD-shaped (RED → GREEN → commit) per the superpowers:test-driven-development discipline: write the failing test first, watch it fail, implement the minimum, watch it pass, commit.

**Goal:** Build the skillsupertracker MVP: a local TypeScript/Node tool that parses DSH session logs (`~/.dsh/sessions/**/session.jsonl.zstd`) into an agent-neutral trajectory JSON and renders a single-session skill-trigger tree (read-only, with artifact nodes) plus cross-session heat statistics in a self-contained HTML view, driven by an `analyze`/`stat` CLI and a `.bat` launcher.

**Architecture:** npm-workspaces monorepo with four packages: `@skillsupertracker/core` (agent-neutral zod trajectory schema + vendored zstd frame scanner + display-tree/stat aggregation), `@skillsupertracker/adapters` (adapter contract + the DSH adapter — the only implementation in MVP), `skillsupertracker` (the CLI package, bin `skillsupertracker`, `analyze`/`stat`), and `@skillsupertracker/web` (Vite + vite-plugin-singlefile app that embeds the trajectory JSON at build time via a `__TRACE_DATA__` placeholder, renders Cytoscape+elk tree and heat table, right-click menu with L0/L1 layering). Golden fixtures (anonymized real logs) live in `fixtures/`.

**Tech Stack:** TypeScript 5 (strict, NodeNext ESM), Node ≥22.15 (`node:zlib` zstd APIs, no native deps), zod ^4 (schema single source of truth + `z.toJSONSchema`), vitest, Vite + vite-plugin-singlefile, Cytoscape ^3.34 + cytoscape-elk 2.3, jsdom (web tests).

**Spec:** `docs/superpowers/specs/2026-08-23-skill-trace-design.md` — the plan argues from the spec, so the spec travels with it; executors read both. The spec is the final word on scope (MVP = DSH adapter + read-only tree + heat; every write operation / recommendation / selection / other agents / serve are explicitly out of MVP).

## Global Constraints

- Node engines: `"node": ">=22.15"` (spec D3: zstd backport floor). Dev machine is Node v24.19.0 — verify with `node -v` before starting.
- zstd APIs come from **`node:zlib`** (`zstdCompressSync`, `zstdDecompressSync`), NOT `node:zstd` (that module does not exist on Node 24.19; verified).
- Runtime dependencies: **zod `^4` only** for core. Cytoscape/web deps live in the web package only. No other runtime deps; CLI arg parsing is hand-rolled.
- Never decode a whole `.zstd` file one-shot: vendor and use `scanZstdFrames` (spec D4). Torn final frame = normal path: decode complete frames only, drop torn tail, report `tornStart`.
- Trajectory schema is **agent-neutral**; DSH-specific info goes through the DSH adapter mapping only. `TraceSession.agent` is a plain string; the front-end/stat layer must not branch on it.
- MVP is **strictly read-only**: no skill delete/freeze/replace/select. The right-click menu renders L1 (write) items disabled with reason (spec §五/§六 layering).
- File naming: unified name **skillsupertracker** everywhere (spec §十). No LICENSE file (License 待定) — never create one.
- Workspace root is the repo root `E:\BaiduSyncdisk\Data\vibe-coding\skillsupertracker`; Git remote is `origin` → `https://github.com/tafcear/skillsupertracker`. Git MCP tools are NOT available for this repo (they are scoped to another repo) — use `git` CLI via pwsh for all git operations.
- npm cache must point inside the workspace in the sandbox: set `$env:npm_config_cache = "<repo>\.npm-cache-tmp"` before any `npm install`/`npm view`.
- **npm does NOT support the `workspace:` protocol** (`EUNSUPPORTEDPROTOCOL`, verified empirically with npm 11.17). Workspace dependencies use plain version ranges (`"0.1.0"`); npm links the local workspace package when the version range matches.
- **vitest 4 ignores `vitest.workspace.ts`** (verified empirically: per-package configs, including `resolve.alias`, are NOT loaded, so workspace-dependency aliases silently fail). Use a root `vitest.config.ts` with `test: { projects: ['packages/*'] }` (verified: per-package configs and aliases load). In projects mode the project name is the package.json `name` (e.g. `@skillsupertracker/core`); run one package's tests with `npm test -w @skillsupertracker/core` (each package has a `"test": "vitest run"` script).
- **Node native type stripping does NOT remap `.js` → `.ts` import specifiers** (verified on Node 24.19): scripts executed directly with `node file.ts` must import the BUILT `dist/*.js` output, never TS sources whose internal imports use `.js` extensions.
- Real session logs for golden fixtures: user-authorized (spec §十.3), **strict anonymization** — no message bodies, no keys, no absolute paths, no session ids; only event structure and call sequences. Use `fixtures/anonymize.ts` (Task 8); never commit raw logs.

---

### Task 1: Monorepo scaffold (workspaces, tsconfig, vitest wiring, engines)

**Files:**
- Create: `package.json` (root), `tsconfig.base.json`, `.gitignore`, `vitest.config.ts`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`, `packages/core/test/smoke.test.ts`
- Create: `packages/adapters/package.json`, `packages/adapters/tsconfig.json`, `packages/adapters/vitest.config.ts`
- Create: `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/vitest.config.ts`

**Interfaces:**
- Produces: workspace package names `@skillsupertracker/core`, `@skillsupertracker/adapters`, `skillsupertracker`; root scripts `build`, `test`, `typecheck`; shared `tsconfig.base.json` (strict, NodeNext, ES2023); per-package vitest configs with test name + include glob. Later tasks extend these packages' `src/`.

- [ ] **Step 1: Write the failing test**

`packages/core/test/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { coreVersion } from '../src/index.js';

describe('core smoke', () => {
  it('exports a version constant', () => {
    expect(coreVersion).toBe('0.1.0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root; set npm cache first):
```powershell
$env:npm_config_cache = "E:\BaiduSyncdisk\Data\vibe-coding\skillsupertracker\.npm-cache-tmp"
npm install
npm test -w @skillsupertracker/core
```
Expected: FAIL — `Cannot find module '../src/index.js'` (the module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Root `package.json`:

```json
{
  "name": "skillsupertracker-monorepo",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=22.15" },
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build -w @skillsupertracker/core && npm run build -w @skillsupertracker/adapters && npm run build -w @skillsupertracker/web && npm run build -w @skillsupertracker/cli",
    "test": "vitest run",
    "typecheck": "npm run typecheck --workspaces --if-present"
  },
  "devDependencies": {
    "@types/node": "^24",
    "typescript": "^5",
    "vitest": "*"
  }
}
```

(`"type": "module"` keeps the root `vitest.config.ts` on the ESM config path — vitest 4 warns when an ESM-syntax config is loaded as CommonJS.)

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  }
}
```

`vitest.config.ts` (root — vitest 4 ignores the legacy `vitest.workspace.ts` file, so projects are declared here):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { projects: ['packages/*'] },
});
```

`.gitignore`:

```
node_modules/
dist/
packages/cli/templates/
.npm-cache-tmp/
```

`packages/core/package.json`:

```json
{
  "name": "@skillsupertracker/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "dependencies": { "zod": "^4" },
  "scripts": {
    "build": "tsc -p .",
    "test": "vitest run",
    "typecheck": "tsc -p . --noEmit"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/core/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
```

`packages/core/src/index.ts`:

```ts
export const coreVersion = '0.1.0';
```

`packages/adapters/package.json`:

```json
{
  "name": "@skillsupertracker/adapters",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "dependencies": { "@skillsupertracker/core": "0.1.0" },
  "scripts": {
    "build": "tsc -p .",
    "test": "vitest run",
    "typecheck": "tsc -p . --noEmit"
  }
}
```

`packages/adapters/tsconfig.json` (same shape as core's, `rootDir: "src"`):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/adapters/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
  resolve: {
    alias: {
      '@skillsupertracker/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
});
```

`packages/cli/package.json`:

```json
{
  "name": "skillsupertracker",
  "version": "0.1.0",
  "type": "module",
  "bin": { "skillsupertracker": "dist/cli.js" },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist", "templates"],
  "dependencies": {
    "@skillsupertracker/adapters": "0.1.0",
    "@skillsupertracker/core": "0.1.0"
  },
  "scripts": {
    "build": "tsc -p . && node scripts/copy-template.mjs",
    "test": "vitest run",
    "typecheck": "tsc -p . --noEmit",
    "prepublishOnly": "npm run build"
  }
}
```

(`files` + `prepublishOnly` keep the spec D6 `npx skillsupertracker` path publishable: the template is generated at publish time and packed even though `templates/` is gitignored. Actual npm publishing is deferred until the user opts in — see Task 12 note; the workspace packages are `private` for now.)

`packages/cli/tsconfig.json` (same shape as core's):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/cli/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
  resolve: {
    alias: {
      '@skillsupertracker/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@skillsupertracker/adapters': fileURLToPath(new URL('../adapters/src/index.ts', import.meta.url)),
    },
  },
});
```

Note: `packages/cli/scripts/copy-template.mjs` is created in Task 11; until then the cli `build` script would fail — do not run `npm run build` at the root until Task 11. Use `npx vitest run` and per-package `typecheck` only.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @skillsupertracker/core`
Expected: PASS, 1 test.

- [ ] **Step 5: Verify install + typecheck**

Run: `npm run typecheck -w @skillsupertracker/core`
Expected: exit 0, no output errors.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.base.json .gitignore vitest.config.ts packages/core packages/adapters/package.json packages/adapters/tsconfig.json packages/adapters/vitest.config.ts packages/cli/package.json packages/cli/tsconfig.json packages/cli/vitest.config.ts
git commit -m "chore: scaffold npm-workspaces monorepo (core/adapters/cli)"
```

---

### Task 2: core — vendored zstd frame scanner + per-frame decoder

**Files:**
- Create: `packages/core/src/zstd-frames.ts` (vendored `scanZstdFrames`, exact port with MIT attribution)
- Create: `packages/core/src/decompress.ts` (`decodeZstdLog`)
- Modify: `packages/core/src/index.ts` (re-export)
- Test: `packages/core/test/zstd-frames.test.ts`, `packages/core/test/decompress.test.ts`

**Interfaces:**
- Consumes: nothing beyond Node builtins.
- Produces:
  - `scanZstdFrames(buffer: Buffer, maxFrames?: number): { frames: { start: number; end: number }[]; tornStart?: number }` — throws `Error` on invalid magic / reserved bits / reserved block type; returns `tornStart` (byte offset of an incomplete final frame) instead of throwing at EOF.
  - `decodeZstdLog(buffer: Buffer): { text: string; frameCount: number; tornStart?: number }` — decodes complete frames individually with `zstdDecompressSync`, joins plaintexts in order (JSONL lines may span frame boundaries), throws `'empty or header-less Zstandard session log'` when zero frames.
  - `ZSTD_MAGIC = 4247762216` exported for tests.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/zstd-frames.test.ts`:

```ts
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
```

`packages/core/test/decompress.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @skillsupertracker/core`
Expected: FAIL — modules `../src/zstd-frames.js` and `../src/decompress.js` do not exist.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/zstd-frames.ts`:

```ts
/**
 * Vendored from @deepseek-ai/dsh-session-persistence-jsonl v0.1.1-rc.2 (MIT
 * License, Copyright (c) 2026 DeepSeek), file lib/index.js: the ZSTD_MAGIC
 * constant (line 491) and the `scanZstdFrames` function (lines 503-566).
 * Ported to TypeScript without behavioral changes; error message text kept
 * identical so upstream fixes stay diffable. Do not "improve" this file
 * without re-syncing against upstream.
 *
 * Locates complete Zstandard frames without decompressing their blocks.
 * Invalid complete structure rejects; EOF inside the final frame returns its
 * start (tornStart) for repair.
 */

export const ZSTD_MAGIC = 4247762216;

export interface ZstdFrame {
  start: number;
  end: number;
}

export interface ZstdScanResult {
  frames: ZstdFrame[];
  tornStart?: number;
}

export function scanZstdFrames(buffer: Buffer, maxFrames = Number.POSITIVE_INFINITY): ZstdScanResult {
  const frames: ZstdFrame[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    if (buffer.length - offset < 4) return { frames, tornStart: start };
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${offset}`);
    offset += 4;
    if (offset === buffer.length) return { frames, tornStart: start };
    const descriptor = buffer.readUInt8(offset);
    offset += 1;
    if ((descriptor & 24) !== 0) throw new Error(`corrupt Zstandard session log: reserved frame-header bit at byte ${offset - 1}`);
    const contentSizeFlag = descriptor >>> 6;
    const singleSegment = (descriptor & 32) !== 0;
    const checksum = (descriptor & 4) !== 0;
    const dictionaryFlag = descriptor & 3;
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
    const contentSizeBytes = contentSizeFlag === 0 ? singleSegment ? 1 : 0 : 1 << contentSizeFlag;
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
    if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start };
    offset += remainingHeaderBytes;
    for (;;) {
      if (buffer.length - offset < 3) return { frames, tornStart: start };
      const blockHeader = buffer.readUIntLE(offset, 3);
      offset += 3;
      const lastBlock = (blockHeader & 1) !== 0;
      const blockType = blockHeader >>> 1 & 3;
      const blockSize = blockHeader >>> 3;
      if (blockType === 3) throw new Error(`corrupt Zstandard session log: reserved block type at byte ${offset - 3}`);
      const payloadBytes = blockType === 1 ? 1 : blockSize;
      if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
      offset += payloadBytes;
      if (lastBlock) break;
    }
    if (checksum) {
      if (buffer.length - offset < 4) return { frames, tornStart: start };
      offset += 4;
    }
    frames.push({ start, end: offset });
    if (frames.length === maxFrames) return { frames };
  }
  return { frames };
}
```

`packages/core/src/decompress.ts`:

```ts
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
```

`packages/core/src/index.ts` (replace the placeholder):

```ts
export const coreVersion = '0.1.0';
export { scanZstdFrames, ZSTD_MAGIC } from './zstd-frames.js';
export type { ZstdFrame, ZstdScanResult } from './zstd-frames.js';
export { decodeZstdLog } from './decompress.js';
export type { DecodedZstdLog } from './decompress.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @skillsupertracker/core`
Expected: PASS, 8 tests (1 smoke + 6 frames + … — count is 1+6+3=10).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/zstd-frames.ts packages/core/src/decompress.ts packages/core/src/index.ts packages/core/test/zstd-frames.test.ts packages/core/test/decompress.test.ts
git commit -m "feat(core): vendored scanZstdFrames + per-frame zstd decoder"
```

---

### Task 3: core — agent-neutral trajectory schema (zod v4) + JSON Schema export

**Files:**
- Create: `packages/core/src/trace-schema.ts`
- Create: `docs/schema/trace-v1.schema.json` (generated by the one-off command in Step 3 — the committed drift contract of spec D8.5)
- Modify: `packages/core/src/index.ts` (re-export)
- Test: `packages/core/test/trace-schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact zod v4 shapes; `z.infer` types exported):
  - `traceEventSchema` — discriminated union on `type`: `skill-load` (`{type, time, skill: {name, sourceRoot?}}`), `tool-call` (`{type, time, tool: {name, target?}, outcome?: 'ok'|'error', attributedSkill?}`), `artifact` (`{type, time, artifact: {kind:'file', path} | {kind:'commit', message?, repoPath?}, attributedSkill?}`).
  - `traceTurnSchema` — `{index, startedAt?, endedAt?, endReason?, events: TraceEvent[]}`.
  - `traceSessionSchema` — `{schemaVersion: literal(1), agent: string, session: {id?, title?, startedAt, endedAt?, cwd?, provider?, model?, tokenUsage?: {input?, output?}}, turns: TraceTurn[], stats: {skippedLines, skippedChunkRows, unknownEventTypes: string[]}}`.
  - `statReportSchema` — `{agent, sessions, range: {firstAt?, lastAt?}, skills: [{name, calls, sessions, firstAt, lastAt, perDay: [{day, calls}]}]}`.
  - `traceJsonSchema(): JSONSchema` — via `z.toJSONSchema(traceSessionSchema)`.
  - Types: `TraceSession`, `TraceEvent`, `TraceTurn`, `StatReport`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/trace-schema.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { traceJsonSchema, traceSessionSchema, statReportSchema } from '../src/trace-schema.js';

const validSession = {
  schemaVersion: 1,
  agent: 'dsh',
  session: {
    id: 'session-abc',
    title: '开工',
    startedAt: 1700000000000,
    endedAt: 1700000001000,
    cwd: 'C:\\redacted',
    provider: 'kimi-coding',
    model: 'k3',
    tokenUsage: { input: 100, output: 50 },
  },
  turns: [
    {
      index: 0,
      startedAt: 1700000000000,
      endedAt: 1700000001000,
      endReason: 'completed',
      events: [
        { type: 'skill-load', time: 1700000000100, skill: { name: 'writing-plans', sourceRoot: 'C:\\redacted\\skills\\writing-plans' } },
        { type: 'tool-call', time: 1700000000200, tool: { name: 'write', target: 'docs\\plan.md' }, outcome: 'ok', attributedSkill: 'writing-plans' },
        { type: 'artifact', time: 1700000000300, artifact: { kind: 'file', path: 'docs\\plan.md' }, attributedSkill: 'writing-plans' },
        { type: 'artifact', time: 1700000000400, artifact: { kind: 'commit', message: 'feat: plan', repoPath: 'C:\\redacted' } },
      ],
    },
  ],
  stats: { skippedLines: 0, skippedChunkRows: 1, unknownEventTypes: ['kimi-tide/panel'] },
};

describe('traceSessionSchema', () => {
  it('accepts a valid trajectory', () => {
    const result = traceSessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
  });

  it('rejects a missing event type member', () => {
    const bad = structuredClone(validSession);
    bad.turns[0].events[0] = { type: 'skill-load', time: 1, skill: { name: 'x' }, attributedSkill: 'y' }; // forbidden key on skill-load
    expect(traceSessionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown event types', () => {
    const bad = structuredClone(validSession);
    bad.turns[0].events.push({ type: 'nope', time: 1 });
    expect(traceSessionSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts missing optional fields (anonymized fixtures)', () => {
    const minimal = {
      schemaVersion: 1,
      agent: 'dsh',
      session: { startedAt: 0 },
      turns: [],
      stats: { skippedLines: 0, skippedChunkRows: 0, unknownEventTypes: [] },
    };
    expect(traceSessionSchema.safeParse(minimal).success).toBe(true);
  });

  it('exports a JSON Schema with the schemaVersion const', () => {
    const jsonSchema = traceJsonSchema();
    expect(jsonSchema).toHaveProperty('$schema');
    expect(JSON.stringify(jsonSchema)).toContain('skill-load');
  });

  it('matches the committed JSON Schema artifact (drift contract D8.5)', () => {
    const committedPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'schema', 'trace-v1.schema.json');
    const committed = JSON.parse(readFileSync(committedPath, 'utf8'));
    expect(traceJsonSchema()).toEqual(committed);
  });

  it('accepts a valid stat report', () => {
    const stat = {
      agent: 'dsh',
      sessions: 2,
      range: { firstAt: 1, lastAt: 9 },
      skills: [{ name: 'writing-plans', calls: 3, sessions: 2, firstAt: 1, lastAt: 9, perDay: [{ day: '2026-08-23', calls: 3 }] }],
    };
    expect(statReportSchema.safeParse(stat).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @skillsupertracker/core`
Expected: FAIL — `../src/trace-schema.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/trace-schema.ts`:

```ts
import { z } from 'zod';

export const traceEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('skill-load'),
    time: z.number().int(),
    skill: z.object({
      name: z.string().min(1),
      sourceRoot: z.string().optional(),
    }),
  }),
  z.strictObject({
    type: z.literal('tool-call'),
    time: z.number().int(),
    tool: z.object({
      name: z.string().min(1),
      target: z.string().optional(),
    }),
    outcome: z.enum(['ok', 'error']).optional(),
    attributedSkill: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('artifact'),
    time: z.number().int(),
    artifact: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('file'), path: z.string() }),
      z.object({ kind: z.literal('commit'), message: z.string().optional(), repoPath: z.string().optional() }),
    ]),
    attributedSkill: z.string().optional(),
  }),
]);

export const traceTurnSchema = z.object({
  index: z.number().int().nonnegative(),
  startedAt: z.number().int().optional(),
  endedAt: z.number().int().optional(),
  endReason: z.string().optional(),
  events: z.array(traceEventSchema),
});

export const traceSessionSchema = z.object({
  schemaVersion: z.literal(1),
  agent: z.string().min(1),
  session: z.object({
    id: z.string().optional(),
    title: z.string().optional(),
    startedAt: z.number().int(),
    endedAt: z.number().int().optional(),
    cwd: z.string().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    tokenUsage: z.object({
      input: z.number().int().optional(),
      output: z.number().int().optional(),
    }).optional(),
  }),
  turns: z.array(traceTurnSchema),
  stats: z.object({
    skippedLines: z.number().int().nonnegative(),
    skippedChunkRows: z.number().int().nonnegative(),
    unknownEventTypes: z.array(z.string()),
  }),
});

export const statReportSchema = z.object({
  agent: z.string().min(1),
  sessions: z.number().int().nonnegative(),
  range: z.object({
    firstAt: z.number().int().optional(),
    lastAt: z.number().int().optional(),
  }),
  skills: z.array(z.object({
    name: z.string(),
    calls: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
    firstAt: z.number().int(),
    lastAt: z.number().int(),
    perDay: z.array(z.object({ day: z.string(), calls: z.number().int().nonnegative() })),
  })),
});

export type TraceEvent = z.infer<typeof traceEventSchema>;
export type TraceTurn = z.infer<typeof traceTurnSchema>;
export type TraceSession = z.infer<typeof traceSessionSchema>;
export type StatReport = z.infer<typeof statReportSchema>;

/** JSON Schema of the trajectory format — the drift contract of spec D8.5. */
export function traceJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(traceSessionSchema) as Record<string, unknown>;
}
```

`packages/core/src/index.ts` — append re-exports:

```ts
export { traceEventSchema, traceTurnSchema, traceSessionSchema, statReportSchema, traceJsonSchema } from './trace-schema.js';
export type { TraceEvent, TraceTurn, TraceSession, StatReport } from './trace-schema.js';
```

Then generate the committed JSON Schema artifact (spec D8.5 — the schema travels with the repo as the drift contract; the test above pins the generator to the committed copy):

```powershell
npm run build -w @skillsupertracker/core
node --input-type=module -e "import { traceJsonSchema } from './packages/core/dist/index.js'; import { writeFileSync, mkdirSync } from 'node:fs'; mkdirSync('docs/schema', { recursive: true }); writeFileSync('docs/schema/trace-v1.schema.json', JSON.stringify(traceJsonSchema(), null, 2) + '\n');"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @skillsupertracker/core`
Expected: PASS (all core tests green). Note: the three event variants are `z.strictObject` — unknown keys are rejected, so the "forbidden key on skill-load" test fails before the schema exists and passes deterministically after. This strictness is the trajectory-side drift guard (spec D8.5); the LENIENT read of DSH input logs is a separate concern handled in the adapters package.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/trace-schema.ts packages/core/src/index.ts packages/core/test/trace-schema.test.ts docs/schema/trace-v1.schema.json
git commit -m "feat(core): agent-neutral trajectory schema (zod v4) + JSON Schema contract"
```

---

### Task 4: core — display tree builder + cross-session stat aggregation

**Files:**
- Create: `packages/core/src/tree.ts`
- Create: `packages/core/src/stat.ts`
- Modify: `packages/core/src/index.ts` (re-export)
- Test: `packages/core/test/tree.test.ts`, `packages/core/test/stat.test.ts`

**Interfaces:**
- Consumes: `TraceSession`, `TraceEvent`, `StatReport` types from Task 3.
- Produces:
  - `TreeNodeKind = 'session' | 'turn' | 'skill' | 'tool' | 'artifact'`
  - `TreeNode = { id: string; kind: TreeNodeKind; label: string; time?: number; parentId?: string; data: Record<string, unknown> }`
  - `TraceTree = { nodes: TreeNode[]; edges: { id: string; source: string; target: string }[] }`
  - `buildTraceTree(trace: TraceSession): TraceTree` — root node `id: 'session'`; per turn a `turn-N` node; event nodes in time order; a `tool-call`/`artifact` event with `attributedSkill` parents onto the LAST `skill-load` node with that name inside the same turn (skill trigger chain); otherwise parents onto the turn node.
  - `aggregateStats(agent: string, traces: TraceSession[]): StatReport` — counts skill-load events per skill name across sessions; `perDay` keyed by UTC date `YYYY-MM-DD` of event time; skills sorted by `calls` desc.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/tree.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTraceTree } from '../src/tree.js';
import type { TraceSession } from '../src/trace-schema.js';

const trace: TraceSession = {
  schemaVersion: 1,
  agent: 'dsh',
  session: { id: 'session-1', title: 't', startedAt: 0 },
  turns: [
    {
      index: 0,
      startedAt: 1,
      events: [
        { type: 'skill-load', time: 2, skill: { name: 'alpha' } },
        { type: 'tool-call', time: 3, tool: { name: 'write' }, attributedSkill: 'alpha' },
        { type: 'artifact', time: 4, artifact: { kind: 'file', path: 'a.md' }, attributedSkill: 'alpha' },
        { type: 'tool-call', time: 5, tool: { name: 'pwsh' } },
        { type: 'skill-load', time: 6, skill: { name: 'beta' } },
        { type: 'artifact', time: 7, artifact: { kind: 'file', path: 'b.md' }, attributedSkill: 'beta' },
      ],
    },
    {
      index: 1,
      startedAt: 10,
      events: [
        { type: 'tool-call', time: 11, tool: { name: 'read' }, attributedSkill: 'alpha' },
      ],
    },
  ],
  stats: { skippedLines: 0, skippedChunkRows: 0, unknownEventTypes: [] },
};

describe('buildTraceTree', () => {
  const tree = buildTraceTree(trace);
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));

  it('has a session root and one node per turn', () => {
    expect(byId.get('session')?.kind).toBe('session');
    expect(byId.get('turn-0')?.kind).toBe('turn');
    expect(byId.get('turn-1')?.kind).toBe('turn');
  });

  it('links edges from session to turns', () => {
    const turnEdges = tree.edges.filter((e) => e.source === 'session');
    expect(turnEdges.map((e) => e.target).sort()).toEqual(['turn-0', 'turn-1']);
  });

  it('attaches attributed events to the last matching skill node within the same turn', () => {
    const alphaNode = tree.nodes.find((n) => n.kind === 'skill' && n.label === 'alpha');
    const alphaChildren = tree.edges.filter((e) => e.source === alphaNode?.id);
    expect(alphaChildren).toHaveLength(2); // the two alpha-attributed events of turn 0
  });

  it('does not let turn 1 attribution leak back into turn 0', () => {
    const readNode = tree.nodes.find((n) => n.kind === 'tool' && n.label === 'read');
    const parentEdge = tree.edges.find((e) => e.target === readNode?.id);
    expect(parentEdge?.source).toBe('turn-1'); // alpha existed in turn 0 only
  });

  it('parents unattributed events onto the turn', () => {
    const pwshNode = tree.nodes.find((n) => n.kind === 'tool' && n.label === 'pwsh');
    const parentEdge = tree.edges.find((e) => e.target === pwshNode?.id);
    expect(parentEdge?.source).toBe('turn-0');
  });
});
```

`packages/core/test/stat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { aggregateStats } from '../src/stat.js';
import type { TraceSession } from '../src/trace-schema.js';

function session(id: string, days: Array<[string, string]>): TraceSession {
  // days: [skillName, ISO time][]
  return {
    schemaVersion: 1,
    agent: 'dsh',
    session: { id, startedAt: 0 },
    turns: [{
      index: 0,
      events: days.map(([name, iso]) => ({
        type: 'skill-load' as const,
        time: new Date(iso).getTime(),
        skill: { name },
      })),
    }],
    stats: { skippedLines: 0, skippedChunkRows: 0, unknownEventTypes: [] },
  };
}

describe('aggregateStats', () => {
  it('aggregates per-skill calls, sessions, and per-day buckets', () => {
    const stat = aggregateStats('dsh', [
      session('s1', [['alpha', '2026-08-23T10:00:00Z'], ['beta', '2026-08-23T11:00:00Z']]),
      session('s2', [['alpha', '2026-08-23T12:00:00Z'], ['alpha', '2026-08-24T12:00:00Z']]),
    ]);
    const alpha = stat.skills.find((s) => s.name === 'alpha');
    expect(alpha?.calls).toBe(3);
    expect(alpha?.sessions).toBe(2);
    expect(alpha?.perDay).toEqual([
      { day: '2026-08-23', calls: 2 },
      { day: '2026-08-24', calls: 1 },
    ]);
    const beta = stat.skills.find((s) => s.name === 'beta');
    expect(beta?.calls).toBe(1);
    expect(beta?.sessions).toBe(1);
    expect(stat.sessions).toBe(2);
  });

  it('sorts skills by call count descending', () => {
    const stat = aggregateStats('dsh', [
      session('s1', [['rare', '2026-08-23T10:00:00Z'], ['hot', '2026-08-23T11:00:00Z'], ['hot', '2026-08-23T12:00:00Z']]),
    ]);
    expect(stat.skills.map((s) => s.name)).toEqual(['hot', 'rare']);
  });

  it('reports the covered time range', () => {
    const stat = aggregateStats('dsh', [
      session('s1', [['alpha', '2026-08-20T10:00:00Z']]),
      session('s2', [['beta', '2026-08-25T10:00:00Z']]),
    ]);
    expect(stat.range.firstAt).toBe(new Date('2026-08-20T10:00:00Z').getTime());
    expect(stat.range.lastAt).toBe(new Date('2026-08-25T10:00:00Z').getTime());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @skillsupertracker/core`
Expected: FAIL — `../src/tree.js` / `../src/stat.js` do not exist.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/tree.ts`:

```ts
import type { TraceSession } from './trace-schema.js';

export type TreeNodeKind = 'session' | 'turn' | 'skill' | 'tool' | 'artifact';

export interface TreeNode {
  id: string;
  kind: TreeNodeKind;
  label: string;
  time?: number;
  parentId?: string;
  data: Record<string, unknown>;
}

export interface TraceTree {
  nodes: TreeNode[];
  edges: { id: string; source: string; target: string }[];
}

/**
 * Display tree over a trajectory: session → turns → (skill | tool | artifact).
 * A tool-call/artifact carrying `attributedSkill` parents onto the LAST
 * skill-load node with that name in the SAME turn (the skill trigger chain);
 * everything else parents onto its turn. Attribution never crosses turns.
 */
export function buildTraceTree(trace: TraceSession): TraceTree {
  const nodes: TreeNode[] = [];
  const edges: { id: string; source: string; target: string }[] = [];
  const sessionNode: TreeNode = {
    id: 'session',
    kind: 'session',
    label: trace.session.title ?? trace.session.id ?? '(session)',
    time: trace.session.startedAt,
    data: {
      agent: trace.agent,
      ...(trace.session.id === undefined ? {} : { id: trace.session.id }),
      ...(trace.session.provider === undefined ? {} : { provider: trace.session.provider }),
      ...(trace.session.model === undefined ? {} : { model: trace.session.model }),
      ...(trace.session.tokenUsage === undefined ? {} : { tokenUsage: trace.session.tokenUsage }),
    },
  };
  nodes.push(sessionNode);

  for (const turn of trace.turns) {
    const turnId = `turn-${turn.index}`;
    nodes.push({
      id: turnId,
      kind: 'turn',
      label: `Turn ${turn.index + 1}`,
      time: turn.startedAt,
      parentId: sessionNode.id,
      data: {
        ...(turn.endedAt === undefined ? {} : { endedAt: turn.endedAt }),
        ...(turn.endReason === undefined ? {} : { endReason: turn.endReason }),
      },
    });
    edges.push({ id: `edge-${sessionNode.id}-${turnId}`, source: sessionNode.id, target: turnId });

    const skillNodes = new Map<string, string>(); // skill name -> node id (last wins, this turn only)
    let counter = 0;
    for (const event of turn.events) {
      const id = `${turnId}-event-${counter++}`;
      let kind: TreeNodeKind;
      let label: string;
      let data: Record<string, unknown>;
      if (event.type === 'skill-load') {
        kind = 'skill';
        label = event.skill.name;
        data = { name: event.skill.name, ...(event.skill.sourceRoot === undefined ? {} : { sourceRoot: event.skill.sourceRoot }) };
        skillNodes.set(event.skill.name, id);
      } else if (event.type === 'tool-call') {
        kind = 'tool';
        label = event.tool.name;
        data = { name: event.tool.name, ...(event.tool.target === undefined ? {} : { target: event.tool.target }), ...(event.outcome === undefined ? {} : { outcome: event.outcome }) };
      } else {
        kind = 'artifact';
        label = event.artifact.kind === 'file' ? event.artifact.path : 'commit';
        data = { ...event.artifact };
      }
      const parentId = event.type !== 'skill-load' && event.attributedSkill !== undefined
        ? (skillNodes.get(event.attributedSkill) ?? turnId)
        : turnId;
      nodes.push({ id, kind, label, time: event.time, parentId, data });
      edges.push({ id: `edge-${parentId}-${id}`, source: parentId, target: id });
    }
  }

  return { nodes, edges };
}
```

`packages/core/src/stat.ts`:

```ts
import type { StatReport, TraceSession } from './trace-schema.js';

interface SkillAccumulator {
  calls: number;
  sessions: Set<string>;
  firstAt: number;
  lastAt: number;
  perDay: Map<string, number>;
}

/**
 * Cross-session heat aggregation over skill-load events (spec: 调用频次/最近使用/趋势数值).
 * `perDay` buckets by UTC date; trend timeline visualization is P1.
 */
export function aggregateStats(agent: string, traces: TraceSession[]): StatReport {
  const skills = new Map<string, SkillAccumulator>();
  let firstAt: number | undefined;
  let lastAt: number | undefined;

  for (const trace of traces) {
    const sessionId = trace.session.id ?? '(unknown)';
    for (const turn of trace.turns) {
      for (const event of turn.events) {
        if (event.type !== 'skill-load') continue;
        if (firstAt === undefined || event.time < firstAt) firstAt = event.time;
        if (lastAt === undefined || event.time > lastAt) lastAt = event.time;
        const name = event.skill.name;
        const entry = skills.get(name) ?? { calls: 0, sessions: new Set<string>(), firstAt: event.time, lastAt: event.time, perDay: new Map<string, number>() };
        entry.calls += 1;
        entry.sessions.add(sessionId);
        if (event.time < entry.firstAt) entry.firstAt = event.time;
        if (event.time > entry.lastAt) entry.lastAt = event.time;
        const day = new Date(event.time).toISOString().slice(0, 10);
        entry.perDay.set(day, (entry.perDay.get(day) ?? 0) + 1);
        skills.set(name, entry);
      }
    }
  }

  return {
    agent,
    sessions: traces.length,
    range: { ...(firstAt === undefined ? {} : { firstAt }), ...(lastAt === undefined ? {} : { lastAt }) },
    skills: [...skills.entries()]
      .map(([name, entry]) => ({
        name,
        calls: entry.calls,
        sessions: entry.sessions.size,
        firstAt: entry.firstAt,
        lastAt: entry.lastAt,
        perDay: [...entry.perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, calls]) => ({ day, calls })),
      }))
      .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name)),
  };
}
```

`packages/core/src/index.ts` — append re-exports:

```ts
export { buildTraceTree } from './tree.js';
export type { TreeNode, TreeNodeKind, TraceTree } from './tree.js';
export { aggregateStats } from './stat.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @skillsupertracker/core`
Expected: PASS (all core tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tree.ts packages/core/src/stat.ts packages/core/src/index.ts packages/core/test/tree.test.ts packages/core/test/stat.test.ts
git commit -m "feat(core): display tree builder + cross-session stat aggregation"
```

---

### Task 5: adapters — adapter contract + DSH session-log discovery

**Files:**
- Create: `packages/adapters/src/types.ts`
- Create: `packages/adapters/src/dsh/discover.ts`
- Create: `packages/adapters/src/index.ts`
- Test: `packages/adapters/test/discover.test.ts`

**Interfaces:**
- Consumes: `TraceSession` type from `@skillsupertracker/core`.
- Produces:
  - `LogSource = { path: string; sessionDir: string; projectKey: string }` — `path` is the absolute artifact file (`session.jsonl.zstd` preferred over `session.jsonl`), `sessionDir` its enclosing session directory, `projectKey` the enclosing project directory name (DSH `--<key>--`).
  - `TraceAdapter = { readonly id: string; locate(rootDir: string, opts?: { signal?: AbortSignal }): Promise<LogSource[]>; parse(source: string | LogSource, opts?: { signal?: AbortSignal }): Promise<TraceSession> }` — the multi-agent contract (spec D2); `parse` accepts an artifact path or a `LogSource`.
  - `findSessionLogs(rootDir: string): Promise<LogSource[]>` — walks `rootDir` exactly two directory levels deep (project dir → session dir), returns sources sorted by path; missing root or unreadable entries yield `[]` / are skipped (read-only tolerance).

- [ ] **Step 1: Write the failing tests**

`packages/adapters/test/discover.test.ts`:

```ts
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findSessionLogs } from '../src/dsh/discover.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sst-discover-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function makeSession(project: string, session: string, fileName = 'session.jsonl.zstd'): Promise<void> {
  const dir = join(root, project, session);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), 'placeholder', 'utf8');
}

describe('findSessionLogs', () => {
  it('finds session.jsonl.zstd under project -> session dirs', async () => {
    await makeSession('--proj-a--', 'session-1');
    await makeSession('--proj-b--', 'session-2');
    const sources = await findSessionLogs(root);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ projectKey: '--proj-a--', sessionDir: join(root, '--proj-a--', 'session-1') });
    expect(sources[0].path).toBe(join(root, '--proj-a--', 'session-1', 'session.jsonl.zstd'));
  });

  it('falls back to uncompressed session.jsonl', async () => {
    await makeSession('--proj-a--', 'session-1', 'session.jsonl');
    const sources = await findSessionLogs(root);
    expect(sources).toHaveLength(1);
    expect(sources[0].path.endsWith('session.jsonl')).toBe(true);
  });

  it('prefers the zstd artifact when both exist', async () => {
    const dir = join(root, '--proj-a--', 'session-1');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'session.jsonl'), 'plain', 'utf8');
    await writeFile(join(dir, 'session.jsonl.zstd'), 'zstd', 'utf8');
    const sources = await findSessionLogs(root);
    expect(sources).toHaveLength(1);
    expect(sources[0].path.endsWith('.zstd')).toBe(true);
  });

  it('ignores session dirs without an artifact and non-directory noise', async () => {
    await mkdir(join(root, '--proj-a--', 'empty-session'), { recursive: true });
    await writeFile(join(root, '--proj-a--', 'session-1'), 'not-a-dir', 'utf8');
    await writeFile(join(root, 'stray.txt'), 'noise', 'utf8');
    const sources = await findSessionLogs(root);
    expect(sources).toHaveLength(0);
  });

  it('returns [] for a missing root', async () => {
    expect(await findSessionLogs(join(root, 'nope'))).toEqual([]);
  });

  it('sorts results by path', async () => {
    await makeSession('--proj-b--', 'session-2');
    await makeSession('--proj-a--', 'session-1');
    const sources = await findSessionLogs(root);
    expect(sources.map((s) => s.path)).toEqual([...sources.map((s) => s.path)].sort());
    expect(sources[0].path).toContain('--proj-a--');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @skillsupertracker/adapters`
Expected: FAIL — `../src/dsh/discover.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

`packages/adapters/src/types.ts`:

```ts
import type { TraceSession } from '@skillsupertracker/core';

/** One session artifact found by an adapter's discovery pass. */
export interface LogSource {
  /** Absolute path of the artifact file (e.g. session.jsonl.zstd). */
  path: string;
  /** Absolute path of the session directory containing the artifact. */
  sessionDir: string;
  /** The project-directory key the session belongs to (DSH: `--<projectKey>--`). */
  projectKey: string;
}

/**
 * The multi-agent adapter contract (spec D2): discovery locates artifacts,
 * `parse` turns one artifact into an agent-neutral trajectory. Claude Code and
 * friends arrive as additional implementations (P1+), never as core changes.
 */
export interface TraceAdapter {
  readonly id: string;
  locate(rootDir: string, opts?: { signal?: AbortSignal }): Promise<LogSource[]>;
  parse(source: string | LogSource, opts?: { signal?: AbortSignal }): Promise<TraceSession>;
}
```

`packages/adapters/src/dsh/discover.ts`:

```ts
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { LogSource } from '../types.js';

const ARTIFACT_NAMES = ['session.jsonl.zstd', 'session.jsonl'] as const;

/**
 * DSH session-root discovery: `<root>/--<projectKey>--/<sessionDir>/(session.jsonl.zstd | session.jsonl)`.
 * Read-only and tolerant: a missing root yields [], unreadable entries are skipped.
 */
export async function findSessionLogs(rootDir: string): Promise<LogSource[]> {
  const sources: LogSource[] = [];
  let projects;
  try {
    projects = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return sources;
  }
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const projectPath = join(rootDir, project.name);
    let sessions;
    try {
      sessions = await readdir(projectPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue;
      const sessionDir = join(projectPath, session.name);
      for (const name of ARTIFACT_NAMES) {
        const path = join(sessionDir, name);
        try {
          if ((await stat(path)).isFile()) {
            sources.push({ path, sessionDir, projectKey: project.name });
            break;
          }
        } catch {
          // artifact absent or unreadable — try the next name
        }
      }
    }
  }
  return sources.sort((a, b) => a.path.localeCompare(b.path));
}
```

`packages/adapters/src/index.ts`:

```ts
export type { LogSource, TraceAdapter } from './types.js';
export { findSessionLogs } from './dsh/discover.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @skillsupertracker/adapters`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/types.ts packages/adapters/src/dsh/discover.ts packages/adapters/src/index.ts packages/adapters/test/discover.test.ts
git commit -m "feat(adapters): adapter contract + DSH session-log discovery"
```

---

### Task 6: adapters — DSH format fingerprint + lenient JSONL row layer

**Files:**
- Create: `packages/adapters/src/dsh/fingerprint.ts`
- Create: `packages/adapters/src/dsh/jsonl.ts`
- Modify: `packages/adapters/src/index.ts` (re-export)
- Test: `packages/adapters/test/fingerprint.test.ts`, `packages/adapters/test/jsonl.test.ts`

**Interfaces:**
- Consumes: nothing beyond Node builtins.
- Produces:
  - `SessionFormatUnsupportedError extends Error` with `code = 'SESSION_FORMAT_UNSUPPORTED'`.
  - `DshFingerprint = { format: 'dsh-session-jsonl'; version: number; compression: 'zstd' | 'none' }`
  - `fingerprintDshLog(text: string, compression: 'zstd' | 'none'): DshFingerprint` — parses the first line; requires `type === 'session'`; `version` must be `0` (exactly — spec D8.3: unknown version = explicit downgrade error, never silent); anything else throws `SessionFormatUnsupportedError` with an actionable message.
  - `RowCounts = { skippedLines: number; skippedChunkRows: number; unknownEventTypes: string[] }`
  - `classifyRow(value: unknown): 'event' | 'chunk-row'` — `chunk-row` for `text-chunks` / `reasoning-chunks` / `tool-call-chunks` storage rows (they carry no trajectory meaning — spec's lenient read skips them and counts).
  - `splitRows(text: string, counts: RowCounts): string[]` — splits decoded plaintext into rows; a trailing fragment without `\n` (torn tail) is dropped and counted in `skippedLines`.

- [ ] **Step 1: Write the failing tests**

`packages/adapters/test/fingerprint.test.ts`:

```ts
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
```

`packages/adapters/test/jsonl.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classifyRow, splitRows, type RowCounts } from '../src/dsh/jsonl.js';

function counts(): RowCounts {
  return { skippedLines: 0, skippedChunkRows: 0, unknownEventTypes: [] };
}

describe('splitRows', () => {
  it('splits newline-terminated rows', () => {
    const rows = splitRows('a\nb\n', counts());
    expect(rows).toEqual(['a', 'b']);
  });

  it('drops and counts a torn trailing fragment', () => {
    const c = counts();
    const rows = splitRows('a\nb\npartial', c);
    expect(rows).toEqual(['a', 'b']);
    expect(c.skippedLines).toBe(1);
  });

  it('handles a single line without trailing newline as torn', () => {
    const c = counts();
    expect(splitRows('only', c)).toEqual([]);
    expect(c.skippedLines).toBe(1);
  });
});

describe('classifyRow', () => {
  it('classifies packed chunk storage rows', () => {
    for (const type of ['text-chunks', 'reasoning-chunks', 'tool-call-chunks']) {
      expect(classifyRow({ type, seq0: 0, time0: 1, data: {} })).toBe('chunk-row');
    }
  });

  it('classifies header and event rows', () => {
    expect(classifyRow({ type: 'session', version: 0 })).toBe('event');
    expect(classifyRow({ type: 'tool/call', seq: 1 })).toBe('event');
    expect(classifyRow(null)).toBe('event');
    expect(classifyRow(42)).toBe('event');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @skillsupertracker/adapters`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Write minimal implementation**

`packages/adapters/src/dsh/fingerprint.ts`:

```ts
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
```

`packages/adapters/src/dsh/jsonl.ts`:

```ts
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
```

`packages/adapters/src/index.ts` — append:

```ts
export { fingerprintDshLog, SessionFormatUnsupportedError } from './dsh/fingerprint.js';
export type { DshFingerprint } from './dsh/fingerprint.js';
export { classifyRow, splitRows } from './dsh/jsonl.js';
export type { RowCounts, RowKind } from './dsh/jsonl.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @skillsupertracker/adapters`
Expected: PASS (all adapters tests).

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/dsh/fingerprint.ts packages/adapters/src/dsh/jsonl.ts packages/adapters/src/index.ts packages/adapters/test/fingerprint.test.ts packages/adapters/test/jsonl.test.ts
git commit -m "feat(adapters): DSH format fingerprint + lenient JSONL row layer"
```

---

### Task 7: adapters — DSH event mapping (`parseDshText`) + the `dshAdapter`

**Files:**
- Create: `packages/adapters/src/dsh/map.ts`
- Create: `packages/adapters/src/dsh/parse.ts`
- Modify: `packages/adapters/src/index.ts` (export `dshAdapter`)
- Test: `packages/adapters/test/parse.test.ts`

**Interfaces:**
- Consumes: `decodeZstdLog` + `TraceSession` from `@skillsupertracker/core`; `fingerprintDshLog`, `splitRows`, `classifyRow`, `RowCounts`, `findSessionLogs` from Tasks 5–6.
- Produces:
  - `parseDshText(text: string, fingerprint: DshFingerprint): TraceSession` — the whole DSH→trajectory mapping (pure over text; the details below are the exact mapping rules).
  - `dshAdapter: TraceAdapter` (`id: 'dsh'`) — `locate` = `findSessionLogs`; `parse(source)` reads the file, chooses zstd/plain by the `.jsonl.zstd` suffix, decodes, fingerprints, and returns `parseDshText`.
- Mapping rules (verified against DSH rc.2 sources `@deepseek-ai/dsh-session` + real logs):
  - Header line → `session.{id, startedAt: createdAt, cwd}`.
  - `turn/start` `{turn}` → open turn (index = data.turn, `startedAt` = event time). `turn/end` `{turn, reason}` → close current turn (`endedAt`, `endReason = reason.kind`).
  - `tool/call` `{turn, step, callId, name, arguments}` → if `name === 'skill'`: parse `arguments` JSON, take `.name` → push `skill-load`; remember `{callId, event}` as pending to backfill `sourceRoot`. Else push `tool-call` with `target` = `arguments.file_path` for tools `read | write | edit | read_image`, and `attributedSkill` = current turn's last skill name. Record the call (`calls: Map<callId, record>`) for outcome/artifact backfill.
  - `tool/result` `{turn, step, message, error?, meta?}` → pair with the call via `message.source.callId`. If `error` present → `outcome: 'error'` on the tool-call event, no artifacts. If the paired call is a skill call, backfill the skill-load's `sourceRoot` from the result text line `Base directory for this skill: <path>` (best effort, spec: "来源根…若可提取"). Artifacts: `meta.diffs[].path` → `artifact {kind:'file'}`; paired `write`/`edit` call with `arguments.file_path` → `artifact {kind:'file'}`; paired tool name ending in `git_commit` → `artifact {kind:'commit', message?, repoPath?}` (from `arguments.message` / `arguments.repo_path`).
  - `session/title` `{title}` → `session.title`; `request/context` `{provider, model}` → `session.provider/model`; `assistant/message` `{usage}` → accumulate `session.tokenUsage.{input,output}`.
  - Unparseable lines → `skippedLines++`; chunk rows → `skippedChunkRows++`; unrecognized event types → collected in `unknownEventTypes` (never fatal — spec D8.2). `assistant/chunk`, `user/message` bodies and all other event types carry no trajectory node; they are ignored (counted as unknown only if truly unknown to DSH — the mapping switch lists them explicitly to avoid counting them as unknown).

- [ ] **Step 1: Write the failing tests**

`packages/adapters/test/parse.test.ts` (full synthetic-log test — header, events, zstd write, error lines, chunk rows, torn tail):

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync, constants as zlibConstants } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dshAdapter } from '../src/dsh/parse.js';

function compressFrame(text: string): Buffer {
  return zstdCompressSync(Buffer.from(text, 'utf8'), { params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 } });
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sst-parse-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function line(type: string, seq: number, time: number, data: Record<string, unknown>): string {
  return JSON.stringify({ type, seq, time, data });
}

const HEADER = { type: 'session', version: 0, id: 'session-fixture-1', createdAt: 1700000000000, cwd: 'C:\\work', delegationDepth: 0, agentPreset: 'cordis' };

const LOG_TEXT = [
  JSON.stringify(HEADER),
  line('request/context', 1, 10, { provider: 'kimi-coding', model: 'k3', contextWindow: 1048576 }),
  line('turn/start', 2, 11, { turn: 0 }),
  line('session/title', 3, 12, { title: 'fixture session' }),
  line('tool/call', 4, 20, { turn: 0, step: 0, callId: 'call-skill', name: 'skill', arguments: '{"name":"writing-plans"}' }),
  line('tool/result', 5, 21, { turn: 0, step: 0, message: { role: 'tool', id: 'm1', source: { kind: 'tool', callId: 'call-skill' }, content: [{ type: 'tool-result', toolCallId: 'call-skill', content: [{ type: 'text', text: 'Base directory for this skill: C:\\skills\\writing-plans\n...' }] }] } }),
  line('tool/call', 6, 22, { turn: 0, step: 0, callId: 'call-write', name: 'write', arguments: '{"file_path":"C:\\\\work\\\\docs\\\\plan.md","content":"x"}' }),
  line('tool/result', 7, 23, { turn: 0, step: 0, message: { role: 'tool', id: 'm2', source: { kind: 'tool', callId: 'call-write' }, content: [{ type: 'tool-result', toolCallId: 'call-write', content: [{ type: 'text', text: 'ok' }] }] }, meta: { diffs: [{ path: 'C:\\work\\docs\\plan.md', oldText: null, newText: 'x' }] } }),
  line('tool/call', 8, 24, { turn: 0, step: 0, callId: 'call-boom', name: 'pwsh', arguments: '{"command":"exit 1"}' }),
  line('tool/result', 9, 25, { turn: 0, step: 0, message: { role: 'tool', id: 'm3', source: { kind: 'tool', callId: 'call-boom' }, content: [{ type: 'tool-result', toolCallId: 'call-boom', content: [{ type: 'text', text: 'boom' }] }] }, error: { name: 'ToolError', code: 'E_TOOL' } }),
  line('tool/call', 10, 26, { turn: 0, step: 0, callId: 'call-commit', name: 'mcp__git__git_commit', arguments: '{"repo_path":"C:\\\\work","message":"feat: plan"}' }),
  line('tool/result', 11, 27, { turn: 0, step: 0, message: { role: 'tool', id: 'm4', source: { kind: 'tool', callId: 'call-commit' }, content: [{ type: 'tool-result', toolCallId: 'call-commit', content: [{ type: 'text', text: 'ok' }] }] } }),
  line('assistant/message', 12, 28, { turn: 0, step: 0, message: { role: 'assistant', id: 'm5', source: { kind: 'model', provider: 'kimi-coding', model: 'k3' }, content: [] }, usage: { inputTokens: 100, outputTokens: 25 } }),
  'this line is not json',
  JSON.stringify({ type: 'text-chunks', seq0: 13, time0: 29, data: { turn: 0, step: 0, index: 0, dt: [], texts: ['a'] } }),
  line('turn/end', 15, 30, { turn: 0, reason: { kind: 'completed' } }),
].join('\n') + '\n';

describe('dshAdapter.parse', () => {
  it('maps a full synthetic log into the trajectory', async () => {
    const path = join(dir, 'session.jsonl.zstd');
    await writeFile(path, Buffer.concat([compressFrame(LOG_TEXT.slice(0, 600)), compressFrame(LOG_TEXT.slice(600))]));
    // ^ two frames; a JSONL line spans the frame boundary (lenient read joins them)
    const trace = await dshAdapter.parse(path);

    expect(trace.schemaVersion).toBe(1);
    expect(trace.agent).toBe('dsh');
    expect(trace.session.id).toBe('session-fixture-1');
    expect(trace.session.title).toBe('fixture session');
    expect(trace.session.provider).toBe('kimi-coding');
    expect(trace.session.model).toBe('k3');
    expect(trace.session.tokenUsage).toEqual({ input: 100, output: 25 });
    expect(trace.turns).toHaveLength(1);
    const turn = trace.turns[0];
    expect(turn.index).toBe(0);
    expect(turn.endReason).toBe('completed');

    const kinds = turn.events.map((e) => e.type);
    expect(kinds).toEqual(['skill-load', 'tool-call', 'artifact', 'tool-call', 'tool-call', 'artifact']);
    // write 工具调用 + meta.diffs 产物（去重后 1 个 file artifact）、pwsh 工具调用（结果 error 无产物）、git_commit 工具调用 + commit artifact

    const skillLoad = turn.events.find((e) => e.type === 'skill-load');
    expect(skillLoad).toMatchObject({ skill: { name: 'writing-plans', sourceRoot: 'C:\\skills\\writing-plans' } });

    const writeCall = turn.events.find((e) => e.type === 'tool-call' && e.tool.name === 'write');
    expect(writeCall).toMatchObject({ tool: { name: 'write', target: 'C:\\work\\docs\\plan.md' }, outcome: 'ok', attributedSkill: 'writing-plans' });

    const boomCall = turn.events.find((e) => e.type === 'tool-call' && e.tool.name === 'pwsh');
    expect(boomCall).toMatchObject({ outcome: 'error', attributedSkill: 'writing-plans' });

    const fileArtifacts = turn.events.filter((e) => e.type === 'artifact' && e.artifact.kind === 'file');
    expect(fileArtifacts).toHaveLength(1); // meta.diffs + write-call path deduped to one artifact? see note below
    const commitArtifacts = turn.events.filter((e) => e.type === 'artifact' && e.artifact.kind === 'commit');
    expect(commitArtifacts).toHaveLength(1);
    expect(commitArtifacts[0]).toMatchObject({ artifact: { kind: 'commit', message: 'feat: plan', repoPath: 'C:\\work' } });

    expect(trace.stats).toEqual({ skippedLines: 1, skippedChunkRows: 1, unknownEventTypes: [] });
  });

  it('rejects an unsupported format version', async () => {
    const path = join(dir, 'bad.jsonl.zstd'); // the .jsonl.zstd suffix selects the zstd decode path
    const bad = JSON.stringify({ type: 'session', version: 99, id: 's', createdAt: 0, delegationDepth: 0 }) + '\n';
    await writeFile(path, compressFrame(bad), 'utf8');
    await expect(dshAdapter.parse(path)).rejects.toThrow(/version 99/);
  });

  it('reads plaintext session.jsonl too', async () => {
    const path = join(dir, 'session.jsonl');
    await writeFile(path, LOG_TEXT.slice(0, 700) + '\n', 'utf8');
    const trace = await dshAdapter.parse(path);
    expect(trace.session.id).toBe('session-fixture-1');
  });
});
```

Note for Step 1: the file-artifact assertion above (`toHaveLength(1)`) encodes the dedupe rule: the `write` call produces one `meta.diffs` artifact AND one call-path artifact for the same path; the mapping must dedupe by `(kind, path)` per tool result. Implement that in Step 3 (a `seenArtifacts` Set per turn keyed by `kind:path`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @skillsupertracker/adapters`
Expected: FAIL — `../src/dsh/parse.js` / `../src/dsh/map.js` do not exist.

- [ ] **Step 3: Write minimal implementation**

`packages/adapters/src/dsh/map.ts`:

```ts
import type { TraceEvent, TraceSession, TraceTurn } from '@skillsupertracker/core';
import { classifyRow, splitRows, type RowCounts } from './jsonl.js';
import type { DshFingerprint } from './fingerprint.js';

const FS_TOOLS_WITH_PATH = new Set(['read', 'write', 'edit', 'read_image']);
const COMMIT_TOOL_SUFFIX = 'git_commit';
const IGNORED_EVENT_TYPES = new Set([
  'user/message', 'assistant/chunk', 'assistant/message', 'step/start', 'step/end',
  'request/header', 'approval/asked', 'approval/decided', 'approval/policy', 'permission/preset',
  'sandbox/mode', 'todo/write', 'goal/change', 'plan/mode', 'feedback/record', 'hook/invoked',
  'hook/result', 'command/run', 'command/done', 'compaction/start', 'compaction/end',
  'compaction/prune', 'compaction/summary', 'llm/retry', 'llm/retry-started',
  'session/end-seed', 'session/title-llm-request', 'agent-preset/selected', 'agent/inbox/spliced',
  'schedule/change', 'subagent/descriptor', 'team/member', 'team/task', 'team/message/queued',
  'team/message/delivered', 'tool/code-dispatch', 'tool/code-dispatch-start',
  'tool-workflow/run-start', 'tool-workflow/run-end', 'tool-workflow/agent-start',
  'tool-workflow/agent-end', 'web/deepseek-search-llm-request',
]);

interface PendingCall {
  name: string;
  callId: string;
  arguments: unknown;
  attributedSkill?: string;
  event: Extract<TraceEvent, { type: 'tool-call' }>;
}

type OpenTurn = TraceTurn & { events: TraceEvent[] };

function toolTarget(name: string, args: unknown): string | undefined {
  if (!FS_TOOLS_WITH_PATH.has(name)) return undefined;
  if (typeof args !== 'object' || args === null) return undefined;
  const filePath = (args as { file_path?: unknown }).file_path;
  return typeof filePath === 'string' ? filePath : undefined;
}

function extractSkillSourceRoot(message: unknown): string | undefined {
  if (typeof message !== 'object' || message === null) return undefined;
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const inner = (block as { content?: unknown }).content;
    if (!Array.isArray(inner)) continue;
    for (const item of inner) {
      if (typeof item !== 'object' || item === null) continue;
      const text = (item as { text?: unknown }).text;
      if (typeof text !== 'string') continue;
      const match = /^Base directory for this skill: (.+)$/m.exec(text);
      if (match?.[1] !== undefined) return match[1];
    }
  }
  return undefined;
}

function resultCallId(message: unknown): string | undefined {
  if (typeof message !== 'object' || message === null) return undefined;
  const source = (message as { source?: unknown }).source;
  if (typeof source !== 'object' || source === null) return undefined;
  const callId = (source as { callId?: unknown }).callId;
  return typeof callId === 'string' ? callId : undefined;
}

/**
 * DSH session event stream → agent-neutral trajectory (pure over decoded text).
 */
export function parseDshText(text: string, _fingerprint: DshFingerprint): TraceSession {
  const counts: RowCounts = { skippedLines: 0, skippedChunkRows: 0, unknownEventTypes: [] };
  const rows = splitRows(text, counts);
  const headerLine = rows[0];
  if (headerLine === undefined) throw new Error('empty DSH session log');
  const header = JSON.parse(headerLine) as Record<string, unknown>;

  const turns: TraceTurn[] = [];
  const calls = new Map<string, PendingCall>();
  let current: { turn: OpenTurn; currentSkill?: string; pendingSkills: Map<string, Extract<TraceEvent, { type: 'skill-load' }>>; seenArtifacts: Set<string> } | undefined;
  let title: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  const tokenUsage = { input: 0, output: 0 };

  for (const raw of rows.slice(1)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      counts.skippedLines += 1;
      continue;
    }
    if (classifyRow(parsed) === 'chunk-row') {
      counts.skippedChunkRows += 1;
      continue;
    }
    const rec = parsed as { type?: unknown; time?: unknown; data?: unknown };
    if (typeof rec.type !== 'string') {
      counts.skippedLines += 1;
      continue;
    }
    const data = typeof rec.data === 'object' && rec.data !== null ? rec.data as Record<string, unknown> : {};
    const time = typeof rec.time === 'number' ? rec.time : 0;

    switch (rec.type) {
      case 'turn/start': {
        const turn: TraceTurn = {
          index: typeof data.turn === 'number' ? data.turn : turns.length,
          startedAt: time,
          events: [],
        };
        turns.push(turn);
        current = { turn: turn as OpenTurn, pendingSkills: new Map(), seenArtifacts: new Set() };
        break;
      }
      case 'turn/end': {
        if (current !== undefined) {
          current.turn.endedAt = time;
          const reason = data.reason;
          if (typeof reason === 'object' && reason !== null && typeof (reason as { kind?: unknown }).kind === 'string') {
            current.turn.endReason = (reason as { kind: string }).kind;
          }
          current = undefined;
        }
        break;
      }
      case 'tool/call': {
        const name = typeof data.name === 'string' ? data.name : undefined;
        const callId = typeof data.callId === 'string' ? data.callId : undefined;
        if (name === undefined || callId === undefined) {
          counts.skippedLines += 1;
          continue;
        }
        let args: unknown;
        try {
          args = typeof data.arguments === 'string' ? JSON.parse(data.arguments) : undefined;
        } catch {
          args = undefined;
        }
        if (name === 'skill') {
          const skillName = typeof args === 'object' && args !== null && typeof (args as { name?: unknown }).name === 'string'
            ? (args as { name: string }).name
            : '<unnamed>';
          if (current !== undefined) {
            current.currentSkill = skillName;
            const event: Extract<TraceEvent, { type: 'skill-load' }> = { type: 'skill-load', time, skill: { name: skillName } };
            current.turn.events.push(event);
            current.pendingSkills.set(callId, event);
          }
        } else if (current !== undefined) {
          const attributedSkill = current.currentSkill;
          const event: Extract<TraceEvent, { type: 'tool-call' }> = {
            type: 'tool-call',
            time,
            tool: { name, ...(toolTarget(name, args) === undefined ? {} : { target: toolTarget(name, args) }) },
            ...(attributedSkill === undefined ? {} : { attributedSkill }),
          };
          current.turn.events.push(event);
          calls.set(callId, { name, callId, arguments: args, attributedSkill, event });
        } else {
          calls.set(callId, { name, callId, arguments: args, event: { type: 'tool-call', time, tool: { name, ...(toolTarget(name, args) === undefined ? {} : { target: toolTarget(name, args) }) } } });
        }
        break;
      }
      case 'tool/result': {
        const callId = resultCallId(data.message);
        const call = callId === undefined ? undefined : calls.get(callId);
        const errored = data.error !== undefined;
        if (call !== undefined) {
          if (errored) call.event.outcome = 'error';
          else call.event.outcome = 'ok';
        }
        if (current === undefined) break;

        if (call !== undefined && !errored && call.name === 'skill') {
          const pending = current.pendingSkills.get(callId);
          if (pending !== undefined) {
            const sourceRoot = extractSkillSourceRoot(data.message);
            if (sourceRoot !== undefined) pending.skill.sourceRoot = sourceRoot;
          }
        }
        if (errored) break;

        const pushArtifact = (key: string, event: TraceEvent): void => {
          if (current.seenArtifacts.has(key)) return;
          current.seenArtifacts.add(key);
          current.turn.events.push(event);
        };
        const attributedSkill = current.currentSkill;

        const meta = data.meta;
        if (typeof meta === 'object' && meta !== null) {
          const diffs = (meta as { diffs?: unknown }).diffs;
          if (Array.isArray(diffs)) {
            for (const diff of diffs) {
              if (typeof diff !== 'object' || diff === null) continue;
              const path = (diff as { path?: unknown }).path;
              if (typeof path === 'string') {
                pushArtifact(`file:${path}`, { type: 'artifact', time, artifact: { kind: 'file', path }, ...(attributedSkill === undefined ? {} : { attributedSkill }) });
              }
            }
          }
        }

        if (call !== undefined) {
          if (call.name === 'write' || call.name === 'edit') {
            const filePath = toolTarget(call.name, call.arguments);
            if (filePath !== undefined) {
              pushArtifact(`file:${filePath}`, { type: 'artifact', time, artifact: { kind: 'file', path: filePath }, ...(call.attributedSkill === undefined ? {} : { attributedSkill: call.attributedSkill }) });
            }
          }
          if (call.name.endsWith(COMMIT_TOOL_SUFFIX)) {
            const a = typeof call.arguments === 'object' && call.arguments !== null ? call.arguments as Record<string, unknown> : {};
            const message = typeof a.message === 'string' ? a.message : undefined;
            const repoPath = typeof a.repo_path === 'string' ? a.repo_path : undefined;
            pushArtifact(`commit:${message ?? ''}:${repoPath ?? ''}`, {
              type: 'artifact', time,
              artifact: { kind: 'commit', ...(message === undefined ? {} : { message }), ...(repoPath === undefined ? {} : { repoPath }) },
              ...(call.attributedSkill === undefined ? {} : { attributedSkill: call.attributedSkill }),
            });
          }
        }
        break;
      }
      case 'session/title':
        if (typeof data.title === 'string') title = data.title;
        break;
      case 'request/context':
        if (typeof data.provider === 'string') provider = data.provider;
        if (typeof data.model === 'string') model = data.model;
        break;
      case 'assistant/message': {
        const usage = data.usage;
        if (typeof usage === 'object' && usage !== null) {
          const u = usage as { inputTokens?: unknown; outputTokens?: unknown };
          if (typeof u.inputTokens === 'number') tokenUsage.input += u.inputTokens;
          if (typeof u.outputTokens === 'number') tokenUsage.output += u.outputTokens;
        }
        break;
      }
      default:
        if (!IGNORED_EVENT_TYPES.has(rec.type) && !counts.unknownEventTypes.includes(rec.type)) {
          counts.unknownEventTypes.push(rec.type);
        }
        break;
    }
  }

  const lastTurn = turns.at(-1);
  return {
    schemaVersion: 1,
    agent: 'dsh',
    session: {
      ...(typeof header.id === 'string' ? { id: header.id } : {}),
      startedAt: typeof header.createdAt === 'number' ? header.createdAt : 0,
      ...(typeof header.cwd === 'string' ? { cwd: header.cwd } : {}),
      ...(title === undefined ? {} : { title }),
      ...(provider === undefined ? {} : { provider }),
      ...(model === undefined ? {} : { model }),
      ...(lastTurn?.endedAt === undefined ? {} : { endedAt: lastTurn.endedAt }),
      tokenUsage: {
        ...(tokenUsage.input > 0 ? { input: tokenUsage.input } : {}),
        ...(tokenUsage.output > 0 ? { output: tokenUsage.output } : {}),
      },
    },
    turns,
    stats: { skippedLines: counts.skippedLines, skippedChunkRows: counts.skippedChunkRows, unknownEventTypes: counts.unknownEventTypes },
  };
}
```

Note: the `pendingSkills` Map (keyed by callId) replaces a single pending slot so parallel skill calls in one step still get their `sourceRoot` backfilled when their results arrive out of order.

`packages/adapters/src/dsh/parse.ts`:

```ts
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
```

`packages/adapters/src/index.ts` — append:

```ts
export { dshAdapter } from './dsh/parse.js';
export { parseDshText } from './dsh/map.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @skillsupertracker/adapters`
Expected: PASS. If the two-frame split at character 600 lands exactly on a line boundary such that no line actually spans frames, that is still valid (join works either way); the assertions do not depend on which line spans.

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/src/dsh/map.ts packages/adapters/src/dsh/parse.ts packages/adapters/src/index.ts packages/adapters/test/parse.test.ts
git commit -m "feat(adapters): DSH event mapping + dshAdapter"
```

---

### Task 8: fixtures — anonymizer + golden sample + regression test

**Files:**
- Create: `fixtures/README.md`
- Create: `fixtures/anonymize.ts` (runs on Node 24 native type stripping; imports the built `dist` output of core/adapters — see Global Constraints)
- Create: `fixtures/golden/sample-1/session.jsonl.zstd` (generated from a real, user-authorized log — never commit the raw log)
- Create: `fixtures/golden/sample-1/expected.json` (generated)
- Create: `packages/adapters/test/fixtures.test.ts`
- Modify: `.gitignore` (append raw-log exclusion)

**Interfaces:**
- Consumes: `dshAdapter` from Task 7; `decodeZstdLog` from core.
- Produces: the golden-sample regression (spec D8.1): a checked-in anonymized real session plus its expected parse facts; `fixtures/anonymize.ts <src-zstd> <dst-dir>` rewrites a real log into an anonymized `session.jsonl.zstd`, fails on leaked machine tokens, parses the result with the real adapter, and writes `expected.json`.

Anonymization rules (spec §十.3 — 严格脱敏): keep the event envelope (`type/seq/time/surfaceOp/sourceEventSeqs/ignorable`), `turn/step/callId` structure, skill names, tool names, outcome presence, `usage` numbers, and `reason.kind` values; **redact every other string** (message bodies, file paths, repo paths, titles, cwd, session id → `session-fixture-0001`); delete the header `cwd` field; rebase all timestamps so `createdAt = 1700000000000` preserving relative offsets; keep numbers/booleans verbatim; packed chunk rows keep their structure with payload strings replaced by `<redacted>`.

- [ ] **Step 1: Write the failing test**

`packages/adapters/test/fixtures.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dshAdapter } from '../src/dsh/parse.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'fixtures', 'golden', 'sample-1');
// test dir = packages/adapters/test → three levels up is the repo root

describe('golden sample regression (spec D8.1)', () => {
  it('parses the anonymized real session to the recorded expected facts', async () => {
    const trace = await dshAdapter.parse(join(fixtureDir, 'session.jsonl.zstd'));
    const expected = JSON.parse(await readFile(join(fixtureDir, 'expected.json'), 'utf8')) as {
      agent: string;
      schemaVersion: number;
      turnCount: number;
      skillLoads: Array<{ name: string }>;
      toolCallCount: number;
      artifactCount: number;
      stats: { skippedLines: number; skippedChunkRows: number; unknownEventTypes: string[] };
    };
    expect(trace.agent).toBe(expected.agent);
    expect(trace.schemaVersion).toBe(expected.schemaVersion);
    expect(trace.turns).toHaveLength(expected.turnCount);
    const skillLoads = trace.turns.flatMap((t) => t.events.filter((e) => e.type === 'skill-load'));
    expect(skillLoads.map((e) => e.skill.name)).toEqual(expected.skillLoads.map((s) => s.name));
    const toolCalls = trace.turns.flatMap((t) => t.events.filter((e) => e.type === 'tool-call'));
    expect(toolCalls).toHaveLength(expected.toolCallCount);
    const artifacts = trace.turns.flatMap((t) => t.events.filter((e) => e.type === 'artifact'));
    expect(artifacts).toHaveLength(expected.artifactCount);
    expect(trace.stats).toEqual(expected.stats);
  });

  it('contains no raw-machine identifiers (anonymization guard)', async () => {
    const raw = await readFile(join(fixtureDir, 'session.jsonl.zstd'));
    const text = raw.toString('latin1'); // binary scan for leakage, not a decode
    expect(text).not.toContain('BaiduSyncdisk');
    expect(text).not.toContain('tafce');
    const trace = await dshAdapter.parse(join(fixtureDir, 'session.jsonl.zstd'));
    expect(trace.session.id).toBe('session-fixture-0001');
    expect(trace.session.cwd).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @skillsupertracker/adapters`
Expected: FAIL — fixture files do not exist.

- [ ] **Step 3: Generate the golden sample from a real authorized log**

Pick ONE real, finished session (authorized in spec §十.3). Recommended source: the most recently modified `session.jsonl.zstd` under `C:\Users\tafce\.dsh\sessions\--E-BaiduSyncdisk-Data-vibe-coding-kimi-tide--\` (a completed project session with rich skill/tool/artifact activity). Copy it to `fixtures/raw/` (gitignored) first — never point the script at `~/.dsh` and never commit the raw copy.

`fixtures/anonymize.ts` (imports the BUILT dist output — Node type stripping does not remap `.js` import specifiers, and the sources use `.js` extensions; see Global Constraints):

```ts
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
// NOTE: `reason` is intentionally NOT whitelisted (execution-time fix):
// turn/end's `reason.kind` survives via the whitelisted `kind` key, while
// approval/asked's free-text `reason` embeds message bodies + absolute paths.

/**
 * Recursive redactor: keep numbers/booleans and whitelisted structural keys
 * (type/kind/role/status/reason/name/provider/model/...), replace every other
 * string with `<redacted>`. Skill names survive because the skill tool-call
 * arguments use the whitelisted `name` key; message bodies, file paths, repo
 * paths, titles, message ids and cwd all sit on non-whitelisted keys.
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
```

- [ ] **Step 4: Generate and verify**

```powershell
# copy the chosen real log into the gitignored raw dir first, then:
npm run build -w @skillsupertracker/core
npm run build -w @skillsupertracker/adapters
node fixtures/anonymize.ts "fixtures\raw\<real-session>.zstd" "fixtures\golden\sample-1"
```

Expected: the script writes `fixtures/golden/sample-1/session.jsonl.zstd` AND `expected.json` (facts computed by the real adapter), printing a turn/tool-call summary. The leakage scan runs inside the script — a non-zero exit means a redaction rule missed a token; fix the rule and rerun. Then manually spot-check `expected.json` (skill names present, counts plausible, `stats` populated).

- [ ] **Step 5: Write the supporting docs + gitignore guard**

`fixtures/README.md`:

```markdown
# Golden fixtures

Real DSH session logs, strictly anonymized (user-authorized, spec §十.3):
event envelopes, turn/step structure, tool/skill call sequences, usage numbers
and reason kinds are kept; message bodies, file paths, repo paths, titles,
cwd and session ids are redacted; timestamps rebased to a fixed epoch
preserving offsets.

- `anonymize.ts` — generator: `node fixtures/anonymize.ts <src-session.jsonl.zstd> <dst-session-dir>`
- `golden/sample-1/` — one anonymized session + `expected.json` (parse facts)
- Regenerate after DSH upgrades, run `npm test` BEFORE publishing (spec D8.1).
- NEVER commit raw logs; `.gitignore` excludes them.
```

`.gitignore` — append:

```
fixtures/raw/
```

Place the raw copy under `fixtures/raw/` during generation (untracked, ignored), not anywhere tracked.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @skillsupertracker/adapters`
Expected: PASS — fixture parses, expected facts match, anonymization guards hold.

- [ ] **Step 7: Commit**

```bash
git add fixtures/README.md fixtures/anonymize.ts fixtures/golden/sample-1 packages/adapters/test/fixtures.test.ts .gitignore
git commit -m "test(fixtures): anonymized golden sample + regression"
```

---

### Task 9: cli — scaffolding, HTML render, `analyze` command

**Files:**
- Create: `packages/cli/src/open.ts`
- Create: `packages/cli/src/render.ts`
- Create: `packages/cli/src/analyze.ts`
- Create: `packages/cli/src/index.ts` (arg dispatch + `main`)
- Create: `packages/cli/src/cli.ts` (bin entry with shebang)
- Create: `packages/cli/test/helpers.ts`, `packages/cli/test/analyze.test.ts`
- Create: `packages/cli/templates/.gitkeep` (placeholder; real template lands in Task 11)

**Interfaces:**
- Consumes: `dshAdapter` (Task 7), `TraceSession` type.
- Produces:
  - `main(argv: string[], deps?: CliDeps): Promise<number>` — dispatch (`analyze`/`stat`/`--help`), exit codes 0/1/2; `CliDeps = { opener?, stdout?, stderr? }` for tests.
  - `runAnalyze(argv: string[], deps?: AnalyzeDeps): Promise<number>` — `analyze <session-id|dir> [--root <dir>] [--out <file>] [--open]`. Resolution order: direct existing file → direct existing session dir (must contain an artifact) → search `--root` (default `~/.dsh/sessions`) for a session dir whose basename equals the target. Output: `analyze-<slug>.html` (slug = sanitized `session.id`, fallback dir basename) in cwd unless `--out`; embeds `{ kind: 'analyze', trace }` into the template placeholder; `--open` opens the written file.
  - `renderTraceHtml(data: unknown, opts: { template?: string; out: string }): Promise<void>` — loads template, JSON-serializes with `</` escaped as `<\/`, replaces the first `__TRACE_DATA__`, writes; throws if the placeholder is missing.
  - `openPath(target: string): Promise<void>` — platform opener with `stdio: 'ignore'` (sandbox-safe spawn, no output capture).

- [ ] **Step 1: Write the failing tests**

`packages/cli/test/helpers.ts`:

```ts
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync, constants as zlibConstants } from 'node:zlib';

export function compress(text: string): Buffer {
  return zstdCompressSync(Buffer.from(text, 'utf8'), { params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 } });
}

export function headerLine(id: string, cwd: string): string {
  return JSON.stringify({ type: 'session', version: 0, id, createdAt: 1700000000000, cwd, delegationDepth: 0, agentPreset: 'cordis' });
}

export function eventLine(type: string, seq: number, time: number, data: Record<string, unknown>): string {
  return JSON.stringify({ type, seq, time, data });
}

/** Build `<root>/--<project>--/<sessionDir>/session.jsonl.zstd` with the given lines. */
export async function makeSession(root: string, project: string, sessionDir: string, lines: string[]): Promise<string> {
  const dir = join(root, project, sessionDir);
  await mkdir(dir, { recursive: true });
  const text = lines.join('\n') + '\n';
  await writeFile(join(dir, 'session.jsonl.zstd'), compress(text));
  return dir;
}

export async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'sst-cli-'));
}

export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export const STUB_TEMPLATE = '<!doctype html><html><body><script id="trace-data" type="application/json">__TRACE_DATA__</script></body></html>';

export async function writeStubTemplate(dir: string): Promise<string> {
  const path = join(dir, 'stub-template.html');
  await writeFile(path, STUB_TEMPLATE, 'utf8');
  return path;
}

export const SKILL_SESSION_LINES = [
  headerLine('session-aaa', 'C:\\work'),
  eventLine('turn/start', 0, 11, { turn: 0 }),
  eventLine('tool/call', 1, 20, { turn: 0, step: 0, callId: 'c1', name: 'skill', arguments: '{"name":"writing-plans"}' }),
  eventLine('tool/result', 2, 21, { turn: 0, step: 0, message: { role: 'tool', id: 'm1', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'Base directory for this skill: C:\\skills\\writing-plans' }] }] } }),
  eventLine('turn/end', 3, 30, { turn: 0, reason: { kind: 'completed' } }),
];
```

`packages/cli/test/analyze.test.ts`:

```ts
import { readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAnalyze } from '../src/analyze.js';
import { makeSession, makeTempDir, removeDir, SKILL_SESSION_LINES, writeStubTemplate } from './helpers.js';

let dir: string;
let opened: string[];

beforeEach(async () => {
  dir = await makeTempDir();
  opened = [];
});

afterEach(async () => {
  await removeDir(dir);
});

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

const deps = (template: string) => ({
  template,
  opener: async (target: string) => { opened.push(target); },
  stdout: () => {},
  stderr: () => {},
});

describe('runAnalyze', () => {
  it('parses a session dir and writes an HTML file with embedded trajectory', async () => {
    const sessionDir = await makeSession(dir, '--proj--', 'session-aaa', SKILL_SESSION_LINES);
    const template = await writeStubTemplate(dir);
    const out = join(dir, 'out.html');
    const code = await runAnalyze([sessionDir, '--out', out], deps(template));
    expect(code).toBe(0);
    const html = await readFile(out, 'utf8');
    expect(html).toContain('"kind":"analyze"');
    expect(html).toContain('writing-plans');
    expect(html).toContain('session-aaa');
    expect(opened).toEqual([]); // no --open
  });

  it('resolves a session by id under a custom --root', async () => {
    await makeSession(dir, '--proj--', 'session-aaa', SKILL_SESSION_LINES);
    const template = await writeStubTemplate(dir);
    const out = join(dir, 'out2.html');
    const code = await runAnalyze(['session-aaa', '--root', dir, '--out', out], deps(template));
    expect(code).toBe(0);
    expect(await readFile(out, 'utf8')).toContain('writing-plans');
  });

  it('defaults the output name to analyze-<slug>.html and honors --open', async () => {
    const sessionDir = await makeSession(dir, '--proj--', 'session-aaa', SKILL_SESSION_LINES);
    const template = await writeStubTemplate(dir);
    const code = await runAnalyze([sessionDir, '--open'], { ...deps(template), opener: async (t) => { opened.push(t); } });
    expect(code).toBe(0);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/analyze-session-aaa\.html$/);
    // the default output path resolves against process.cwd(); verify it exists, then clean up
    const defaultOut = resolve(opened[0]);
    expect(await isFile(defaultOut)).toBe(true);
    await rm(defaultOut, { force: true });
  });

  it('escapes </script> sequences in the embedded JSON', async () => {
    const evil = [...SKILL_SESSION_LINES];
    evil[0] = JSON.stringify({ type: 'session', version: 0, id: 'session-aaa', createdAt: 1700000000000, cwd: 'C:\\</script><script>alert(1)</script>', delegationDepth: 0, agentPreset: 'cordis' });
    const sessionDir = await makeSession(dir, '--proj--', 'session-aaa', evil);
    const template = await writeStubTemplate(dir);
    const out = join(dir, 'out3.html');
    await runAnalyze([sessionDir, '--out', out], deps(template));
    const html = await readFile(out, 'utf8');
    expect(html).not.toContain('</script><script>');
  });

  it('fails with exit 1 for an unknown target', async () => {
    const template = await writeStubTemplate(dir);
    const code = await runAnalyze(['no-such-session', '--root', dir, '--out', join(dir, 'x.html')], deps(template));
    expect(code).toBe(1);
  });

  it('rejects unknown flags with exit 2', async () => {
    const template = await writeStubTemplate(dir);
    expect(await runAnalyze(['--bogus'], deps(template))).toBe(2);
    expect(await runAnalyze([], deps(template))).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w skillsupertracker`
Expected: FAIL — `../src/analyze.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

`packages/cli/src/open.ts`:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Open a local file with the platform default app. `stdio: 'ignore'` keeps the spawn sandbox-friendly. */
export async function openPath(target: string): Promise<void> {
  if (process.platform === 'win32') await execFileAsync('cmd', ['/c', 'start', '', target], { stdio: 'ignore' });
  else if (process.platform === 'darwin') await execFileAsync('open', [target], { stdio: 'ignore' });
  else await execFileAsync('xdg-open', [target], { stdio: 'ignore' });
}
```

`packages/cli/src/render.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises';
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
  await writeFile(opts.out, template.replace('__TRACE_DATA__', () => json), 'utf8');
}
```

`packages/cli/src/analyze.ts`:

```ts
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { dshAdapter } from '@skillsupertracker/adapters';
import { openPath } from './open.js';
import { renderTraceHtml } from './render.js';

export interface AnalyzeDeps {
  opener?: (target: string) => Promise<void>;
  template?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export const ANALYZE_USAGE = [
  'usage: skillsupertracker analyze <session-id|dir> [--root <dir>] [--out <file>] [--open]',
  '  <session-id|dir>  DSH session id (searched under --root) or a path to a session directory / artifact file',
  '  --root <dir>      sessions root (default ~/.dsh/sessions)',
  '  --out <file>      output HTML path (default analyze-<id>.html in the current directory)',
  '  --open            open the output in the default browser after writing',
].join('\n');

interface AnalyzeArgs {
  target?: string;
  root?: string;
  out?: string;
  open: boolean;
}

export function parseAnalyzeArgs(argv: string[]): AnalyzeArgs | undefined {
  const args: AnalyzeArgs = { open: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--open') args.open = true;
    else if (a === '--root') {
      const v = argv[++i];
      if (v === undefined) return undefined;
      args.root = v;
    } else if (a === '--out') {
      const v = argv[++i];
      if (v === undefined) return undefined;
      args.out = v;
    } else if (a.startsWith('-')) return undefined;
    else if (args.target === undefined) args.target = a;
    else return undefined;
  }
  return args.target === undefined ? undefined : args;
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function artifactOfSessionDir(dir: string): Promise<string | undefined> {
  for (const name of ['session.jsonl.zstd', 'session.jsonl']) {
    const p = join(dir, name);
    if (await isFile(p)) return p;
  }
  return undefined;
}

async function resolveTarget(target: string, rootOverride?: string): Promise<string | undefined> {
  const direct = resolve(target);
  if (await isFile(direct)) return direct;
  const directArtifact = await artifactOfSessionDir(direct);
  if (directArtifact !== undefined) return directArtifact;
  const root = rootOverride ?? join(homedir(), '.dsh', 'sessions');
  const sources = await dshAdapter.locate(root);
  return sources.find((s) => basename(s.sessionDir) === target)?.path;
}

function slugFor(id: string | undefined, fallback: string): string {
  const raw = id ?? fallback;
  return raw.replaceAll(/[^A-Za-z0-9._-]/g, '-');
}

export async function runAnalyze(argv: string[], deps: AnalyzeDeps = {}): Promise<number> {
  const args = parseAnalyzeArgs(argv);
  if (args === undefined || args.target === undefined) {
    (deps.stderr ?? console.error)(ANALYZE_USAGE);
    return 2;
  }
  const artifact = await resolveTarget(args.target, args.root);
  if (artifact === undefined) {
    (deps.stderr ?? console.error)(`no DSH session found for "${args.target}"`);
    return 1;
  }
  const trace = await dshAdapter.parse(artifact);
  const out = args.out ?? `analyze-${slugFor(trace.session.id, basename(artifact))}.html`;
  await renderTraceHtml({ kind: 'analyze', trace }, { template: deps.template, out });
  (deps.stdout ?? console.log)(`wrote ${out}`);
  if (args.open) await (deps.opener ?? openPath)(out);
  return 0;
}
```

`packages/cli/src/index.ts`:

```ts
import { runAnalyze } from './analyze.js';
import { runStat } from './stat.js';

export interface CliDeps {
  opener?: (target: string) => Promise<void>;
  template?: string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

export const USAGE = [
  'skillsupertracker — AI agent skill-trace visualizer',
  'usage:',
  '  skillsupertracker analyze <session-id|dir> [--root <dir>] [--out <file>] [--open]',
  '  skillsupertracker stat [--root <dir>] [--out <file>] [--open]',
  '  skillsupertracker --help',
].join('\n');

export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const cmd = argv[0];
  const rest = argv.slice(1);
  if (cmd === 'analyze') return runAnalyze(rest, deps);
  if (cmd === 'stat') return runStat(rest, deps);
  if (cmd === undefined || cmd === '--help' || cmd === '-h') {
    (deps.stdout ?? console.log)(USAGE);
    return 0;
  }
  (deps.stderr ?? console.error)(`unknown command "${cmd}"\n\n${USAGE}`);
  return 2;
}
```

`packages/cli/src/cli.ts`:

```ts
#!/usr/bin/env node
import { main } from './index.js';

main(process.argv.slice(2))
  .then((code) => { process.exitCode = code; })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
```

`packages/cli/src/stat.ts` — Task 10 owns this file; for this task to compile, create a stub that returns 2 with a "stat is implemented in Task 10" message, and REPLACE it in Task 10:

```ts
import type { AnalyzeDeps } from './analyze.js';

// Task 10 replaces this stub with the real implementation.
export async function runStat(argv: string[], deps: AnalyzeDeps = {}): Promise<number> {
  (deps.stderr ?? console.error)('stat: not implemented yet');
  return 2;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w skillsupertracker`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/open.ts packages/cli/src/render.ts packages/cli/src/analyze.ts packages/cli/src/index.ts packages/cli/src/cli.ts packages/cli/src/stat.ts packages/cli/test/helpers.ts packages/cli/test/analyze.test.ts
git commit -m "feat(cli): analyze command with HTML render + open"
```

---

### Task 10: cli — `stat` command

**Files:**
- Modify: `packages/cli/src/stat.ts` (replace stub)
- Modify: `packages/cli/test/helpers.ts` (nothing needed — reuse)
- Test: `packages/cli/test/stat.test.ts`

**Interfaces:**
- Consumes: `dshAdapter` (Task 7), `aggregateStats` + `StatReport` (Task 4), `renderTraceHtml` (Task 9).
- Produces: `runStat(argv: string[], deps?: AnalyzeDeps): Promise<number>` — `stat [--root <dir>] [--out <file>] [--open]`. Locates every session under `--root` (default `~/.dsh/sessions`), parses each (a failing source logs a warning to stderr and is skipped, never fatal), aggregates, prints the `StatReport` JSON to stdout, writes `stat.html` (or `--out`) embedding `{ kind: 'stat', stat }`, opens with `--open`. `parseStatArgs(argv)` exported for tests.

- [ ] **Step 1: Write the failing tests**

`packages/cli/test/stat.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runStat } from '../src/stat.js';
import { eventLine, headerLine, makeSession, makeTempDir, removeDir, writeStubTemplate } from './helpers.js';

let dir: string;
let opened: string[];

beforeEach(async () => {
  dir = await makeTempDir();
  opened = [];
});

afterEach(async () => {
  await removeDir(dir);
});

function sessionLines(id: string, skill: string, time: number): string[] {
  return [
    headerLine(id, 'C:\\work'),
    eventLine('turn/start', 0, 11, { turn: 0 }),
    eventLine('tool/call', 1, time, { turn: 0, step: 0, callId: 'c1', name: 'skill', arguments: JSON.stringify({ name: skill }) }),
    eventLine('tool/result', 2, time + 1, { turn: 0, step: 0, message: { role: 'tool', id: 'm1', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'tool-result', toolCallId: 'c1', content: [{ type: 'text', text: 'ok' }] }] } }),
    eventLine('turn/end', 3, time + 2, { turn: 0, reason: { kind: 'completed' } }),
  ];
}

describe('runStat', () => {
  it('aggregates heat across sessions and writes HTML + JSON stdout', async () => {
    await makeSession(dir, '--proj-a--', 's1', sessionLines('s1', 'alpha', 1700000000000));
    await makeSession(dir, '--proj-a--', 's2', sessionLines('s2', 'alpha', 1700086400000));
    await makeSession(dir, '--proj-b--', 's3', sessionLines('s3', 'beta', 1700000001000));
    const template = await writeStubTemplate(dir);
    const out = join(dir, 'stat.html');
    const stdout: string[] = [];
    const code = await runStat(['--root', dir, '--out', out], { template, stdout: (t) => stdout.push(t), stderr: () => {} });
    expect(code).toBe(0);
    const json = JSON.parse(stdout.join('\n'));
    expect(json.skills.find((s: { name: string }) => s.name === 'alpha')).toMatchObject({ calls: 2, sessions: 2 });
    expect(json.skills.find((s: { name: string }) => s.name === 'beta')).toMatchObject({ calls: 1, sessions: 1 });
    expect(json.sessions).toBe(3);
    const html = await readFile(out, 'utf8');
    expect(html).toContain('"kind":"stat"');
    expect(html).toContain('alpha');
    expect(opened).toEqual([]);
  });

  it('skips a corrupt session with a warning instead of failing', async () => {
    await makeSession(dir, '--proj-a--', 'good', sessionLines('good', 'alpha', 1700000000000));
    // a non-header first line makes fingerprinting throw (the lenient parser tolerates bad
    // EVENT lines, so corrupt-ness here must come from the header)
    await makeSession(dir, '--proj-a--', 'bad', ['this is not a session header']);
    const template = await writeStubTemplate(dir);
    const stderr: string[] = [];
    const code = await runStat(['--root', dir, '--out', join(dir, 's.html')], { template, stdout: () => {}, stderr: (t) => stderr.push(t) });
    expect(code).toBe(0);
    expect(stderr.join('\n')).toContain('bad');
  });

  it('supports --open', async () => {
    await makeSession(dir, '--proj-a--', 's1', sessionLines('s1', 'alpha', 1700000000000));
    const template = await writeStubTemplate(dir);
    const code = await runStat(['--root', dir, '--out', join(dir, 's2.html'), '--open'], { template, opener: async (t) => { opened.push(t); }, stdout: () => {}, stderr: () => {} });
    expect(code).toBe(0);
    expect(opened).toHaveLength(1);
  });

  it('rejects unknown flags with exit 2', async () => {
    const template = await writeStubTemplate(dir);
    expect(await runStat(['--bogus'], { template, stderr: () => {} })).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w skillsupertracker`
Expected: FAIL — stat tests fail against the stub.

- [ ] **Step 3: Write minimal implementation**

Replace `packages/cli/src/stat.ts`:

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import { dshAdapter } from '@skillsupertracker/adapters';
import { aggregateStats, type TraceSession } from '@skillsupertracker/core';
import type { AnalyzeDeps } from './analyze.js';
import { openPath } from './open.js';
import { renderTraceHtml } from './render.js';

export const STAT_USAGE = [
  'usage: skillsupertracker stat [--root <dir>] [--out <file>] [--open]',
  '  --root <dir>  sessions root (default ~/.dsh/sessions)',
  '  --out <file>  output HTML path (default stat.html in the current directory)',
  '  --open        open the output in the default browser after writing',
].join('\n');

interface StatArgs {
  root?: string;
  out?: string;
  open: boolean;
}

export function parseStatArgs(argv: string[]): StatArgs | undefined {
  const args: StatArgs = { open: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--open') args.open = true;
    else if (a === '--root') {
      const v = argv[++i];
      if (v === undefined) return undefined;
      args.root = v;
    } else if (a === '--out') {
      const v = argv[++i];
      if (v === undefined) return undefined;
      args.out = v;
    } else return undefined;
  }
  return args;
}

export async function runStat(argv: string[], deps: AnalyzeDeps = {}): Promise<number> {
  const args = parseStatArgs(argv);
  if (args === undefined) {
    (deps.stderr ?? console.error)(STAT_USAGE);
    return 2;
  }
  const root = args.root ?? join(homedir(), '.dsh', 'sessions');
  const sources = await dshAdapter.locate(root);
  const traces: TraceSession[] = [];
  for (const source of sources) {
    try {
      traces.push(await dshAdapter.parse(source));
    } catch (error) {
      (deps.stderr ?? console.error)(`warning: skipping ${source.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const stat = aggregateStats('dsh', traces);
  const out = args.out ?? 'stat.html';
  (deps.stdout ?? console.log)(JSON.stringify(stat, null, 2));
  await renderTraceHtml({ kind: 'stat', stat }, { template: deps.template, out });
  if (args.open) await (deps.opener ?? openPath)(out);
  return 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w skillsupertracker`
Expected: PASS, 4 new + 6 existing.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/stat.ts packages/cli/test/stat.test.ts
git commit -m "feat(cli): stat command with cross-session heat aggregation"
```

---

### Task 11: web — self-contained single-file app (tree + heat + context menu)

**Files:**
- Create: `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/vite.config.ts`, `packages/web/index.html`
- Create: `packages/web/src/main.ts`, `packages/web/src/app.ts`, `packages/web/src/tree-view.ts`, `packages/web/src/heat-view.ts`, `packages/web/src/menu.ts`, `packages/web/src/detail.ts`
- Create: `packages/web/src/types/cytoscape-elk.d.ts`
- Test: `packages/web/test/menu.test.ts`, `packages/web/test/tree-model.test.ts`

**Interfaces:**
- Consumes: `buildTraceTree`/`TraceTree`/`TreeNodeKind`/`TraceSession`/`StatReport` from core (aliased to source in vite/vitest configs); runtime data injected by the CLI as `#trace-data` JSON of `{ kind: 'analyze', trace } | { kind: 'stat', stat }`.
- Produces:
  - `menuStateFor(kind: TreeNodeKind, layer: 'L0' | 'L1'): MenuItemState[]` — pure state machine (spec: 右键菜单按 L0/L1 分层点亮). L0 `detail` (查看详情) always enabled. L1 actions `select-opt | replace | delete | freeze` (选优/替换/删除/冻结) appear ONLY for `skill` nodes; on layer L0 (the whole MVP) they are disabled with reason `'写操作 P1 起（MVP 只读）'`; non-skill nodes hide them. **「更新」is deliberately NOT in the menu**: spec §六 rules it out until its semantics are defined (where updates come from, whether local changes are overwritten). `MenuItemState = { id, label, enabled, reason?, layer }`.
  - `toCytoscapeElements(tree: TraceTree)` — nodes/edges element arrays for cytoscape.
  - `mountTree(container, tree, onSelect)` — cytoscape + elk layered layout, node colors by kind, `tap` → detail, `cxttap` → self-drawn absolute menu (no cxtmenu dependency, spec D5).
  - `renderHeat(container, stat: StatReport)` — heat table (skill, calls, sessions, first/last, per-day trend numbers).
  - `renderDetail(container, node: TreeNode)` — detail panel from node data.
  - `app.ts` dispatches on the embedded data kind.

- [ ] **Step 1: Write the failing tests**

`packages/web/test/menu.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { menuStateFor } from '../src/menu.js';

describe('menuStateFor (L0/L1 layering)', () => {
  it('enables detail for every node kind', () => {
    for (const kind of ['session', 'turn', 'skill', 'tool', 'artifact'] as const) {
      const items = menuStateFor(kind, 'L0');
      const detail = items.find((i) => i.id === 'detail');
      expect(detail?.enabled).toBe(true);
    }
  });

  it('shows disabled L1 write actions only on skill nodes in the MVP layer', () => {
    const skillItems = menuStateFor('skill', 'L0');
    expect(skillItems.map((i) => i.id)).toEqual(['detail', 'select-opt', 'replace', 'delete', 'freeze']);
    for (const item of skillItems.filter((i) => i.layer === 'L1')) {
      expect(item.enabled).toBe(false);
      expect(item.reason).toMatch(/P1/);
    }
    expect(menuStateFor('tool', 'L0').map((i) => i.id)).toEqual(['detail']);
  });

  it('is deterministic and pure', () => {
    const a = menuStateFor('skill', 'L0');
    const b = menuStateFor('skill', 'L0');
    expect(a).not.toBe(b); // fresh arrays
    expect(a).toEqual(b);
  });
});
```

`packages/web/test/tree-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import cytoscape from 'cytoscape';
import { buildTraceTree, type TraceSession } from '@skillsupertracker/core';
import { toCytoscapeElements } from '../src/tree-view.js';

const trace: TraceSession = {
  schemaVersion: 1,
  agent: 'dsh',
  session: { id: 's1', title: 't', startedAt: 0 },
  turns: [{
    index: 0,
    startedAt: 1,
    events: [
      { type: 'skill-load', time: 2, skill: { name: 'alpha' } },
      { type: 'tool-call', time: 3, tool: { name: 'write' }, attributedSkill: 'alpha' },
    ],
  }],
  stats: { skippedLines: 0, skippedChunkRows: 0, unknownEventTypes: [] },
};

describe('toCytoscapeElements (render smoke)', () => {
  it('builds a valid headless graph', () => {
    const elements = toCytoscapeElements(buildTraceTree(trace));
    const cy = cytoscape({ headless: true, elements });
    expect(cy.nodes().length).toBe(4); // session, turn-0, skill, tool
    expect(cy.edges().length).toBe(3);
    cy.destroy();
  });

  it('runs the elk layered layout headless', async () => {
    const elements = toCytoscapeElements(buildTraceTree(trace));
    const cy = cytoscape({ headless: true, elements });
    cy.layout({ name: 'elk', elk: { 'elk.algorithm': 'layered', 'elk.direction': 'DOWN' } }).run();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(cy.nodes().some((n) => n.position().x !== 0 || n.position().y !== 0)).toBe(true);
    cy.destroy();
  }, 10000);
});
```

Node count note (verified by this test): session + turn-0 + skill + tool = **4 nodes**; edges: session→turn, turn→skill, skill→tool = **3 edges**. The headless elk layout run was empirically verified to compute positions on Node 24 (elkjs falls back to main-thread execution without a Worker) — in the browser the same main-thread execution means very large graphs (hundreds of nodes) will briefly block UI during layout; accepted for MVP and recorded in the README known limitations.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @skillsupertracker/web`
Expected: FAIL — `../src/menu.js` / `../src/tree-view.js` do not exist.

- [ ] **Step 3: Write minimal implementation**

`packages/web/package.json`:

```json
{
  "name": "@skillsupertracker/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc -p . --noEmit"
  },
  "dependencies": {
    "@skillsupertracker/core": "0.1.0",
    "cytoscape": "^3.34",
    "cytoscape-elk": "*"
  },
  "devDependencies": {
    "jsdom": "*",
    "vite": "*",
    "vite-plugin-singlefile": "*"
  }
}
```

`packages/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": []
  },
  "include": ["src"]
}
```

`packages/web/vite.config.ts`:

```ts
/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
  plugins: [viteSingleFile()],
  resolve: {
    alias: {
      '@skillsupertracker/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
});
```

`packages/web/src/types/cytoscape-elk.d.ts` (cytoscape-elk 2.3.0 ships no type declarations — verified):

```ts
declare module 'cytoscape-elk' {
  import type cytoscape from 'cytoscape';
  const register: (cytoscape: typeof cytoscape) => void;
  export default register;
}
```

`packages/web/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>skillsupertracker</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin: 0; font-family: system-ui, "Segoe UI", sans-serif; }
      #app { display: flex; flex-direction: column; height: 100vh; }
      header.top { padding: 8px 14px; font-size: 14px; border-bottom: 1px solid #8884; }
      main.split { flex: 1; display: flex; min-height: 0; }
      #tree { flex: 1; min-width: 0; }
      #detail { width: 320px; overflow: auto; border-left: 1px solid #8884; padding: 12px; font-size: 13px; }
      #heat { flex: 1; overflow: auto; padding: 12px; }
      table.heat { border-collapse: collapse; width: 100%; }
      table.heat th, table.heat td { border: 1px solid #8886; padding: 6px 10px; text-align: left; }
      .ctx-menu { position: absolute; z-index: 1000; background: Canvas; border: 1px solid #8888; border-radius: 6px; box-shadow: 0 4px 16px #0004; padding: 4px 0; min-width: 160px; font-size: 13px; }
      .ctx-menu button { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 7px 14px; cursor: pointer; color: inherit; font: inherit; }
      .ctx-menu button:disabled { opacity: 0.45; cursor: not-allowed; }
      .ctx-menu button:hover:not(:disabled) { background: #8882; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script id="trace-data" type="application/json">__TRACE_DATA__</script>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`packages/web/src/menu.ts`:

```ts
import type { TreeNodeKind } from '@skillsupertracker/core';

export type MenuActionId = 'detail' | 'select-opt' | 'replace' | 'delete' | 'freeze';
export type CapabilityLayer = 'L0' | 'L1';

export interface MenuItemState {
  id: MenuActionId;
  label: string;
  enabled: boolean;
  reason?: string;
  layer: CapabilityLayer;
}

// 「更新」is intentionally absent — spec §六: not in the menu until its semantics are defined.
const L1_ACTIONS: Array<{ id: MenuActionId; label: string }> = [
  { id: 'select-opt', label: '选优' },
  { id: 'replace', label: '替换' },
  { id: 'delete', label: '删除' },
  { id: 'freeze', label: '冻结' },
];

/**
 * Right-click menu state machine (spec §五): L0 read actions enabled,
 * L1 write actions layered — rendered disabled during the read-only MVP.
 */
export function menuStateFor(kind: TreeNodeKind, layer: CapabilityLayer): MenuItemState[] {
  const items: MenuItemState[] = [{ id: 'detail', label: '查看详情', enabled: true, layer: 'L0' }];
  if (kind !== 'skill') return items;
  for (const action of L1_ACTIONS) {
    items.push({
      ...action,
      layer: 'L1',
      enabled: layer === 'L1',
      ...(layer === 'L0' ? { reason: '写操作 P1 起（MVP 只读）' } : {}),
    });
  }
  return items;
}
```

`packages/web/src/tree-view.ts`:

```ts
import cytoscape from 'cytoscape';
import elk from 'cytoscape-elk';
import type { TraceTree, TreeNode } from '@skillsupertracker/core';
import { menuStateFor } from './menu.js';

cytoscape.use(elk);

const KIND_COLORS: Record<string, string> = {
  session: '#4a5568',
  turn: '#718096',
  skill: '#2f6fed',
  tool: '#805ad5',
  artifact: '#2c9e5a',
};

export function toCytoscapeElements(tree: TraceTree): cytoscape.ElementDefinition[] {
  return [
    ...tree.nodes.map((node): cytoscape.ElementDefinition => ({
      data: { id: node.id, label: node.label, kind: node.kind, ...node.data },
    })),
    ...tree.edges.map((edge): cytoscape.ElementDefinition => ({
      data: { id: edge.id, source: edge.source, target: edge.target },
    })),
  ];
}

export interface TreeViewHandle {
  cy: cytoscape.Core;
  destroy(): void;
}

export function mountTree(
  container: HTMLElement,
  tree: TraceTree,
  onSelect: (node: TreeNode) => void,
): TreeViewHandle {
  const cy = cytoscape({
    container,
    elements: toCytoscapeElements(tree),
    wheelSensitivity: 0.2,
    style: [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          'text-valign': 'center',
          'text-halign': 'right',
          'font-size': 11,
          'text-wrap': 'ellipsis',
          'text-max-width': '140px',
          width: 12,
          height: 12,
          'background-color': (el) => KIND_COLORS[String(el.data('kind'))] ?? '#999',
        },
      },
      {
        selector: 'node[kind = "session"], node[kind = "turn"]',
        style: { shape: 'round-rectangle', width: 12, height: 22 },
      },
      { selector: 'node[kind = "skill"]', style: { width: 14, height: 14, 'font-weight': 'bold' } },
      { selector: 'edge', style: { width: 1, 'line-color': '#8888', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#8888', 'curve-style': 'bezier', 'arrow-scale': 0.6 } },
    ],
  });

  cy.layout({ name: 'elk', elk: { 'elk.algorithm': 'layered', 'elk.direction': 'DOWN' } }).run();

  cy.on('tap', 'node', (event) => {
    const id = event.target.id();
    const node = tree.nodes.find((n) => n.id === id);
    if (node !== undefined) onSelect(node);
  });

  cy.on('cxttap', (event) => {
    if (event.target === cy) return;
    const id = (event.target as cytoscape.NodeSingular).id();
    const node = tree.nodes.find((n) => n.id === id);
    if (node === undefined) return;
    const pos = (event as cytoscape.EventObject).renderedPosition ?? event.renderedPosition;
    showContextMenu(container, pos, node, onSelect);
  });

  return { cy, destroy: () => cy.destroy() };
}

function showContextMenu(
  container: HTMLElement,
  pos: { x: number; y: number },
  node: TreeNode,
  onSelect: (node: TreeNode) => void,
): void {
  document.querySelector('.ctx-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.style.left = `${pos.x}px`;
  menu.style.top = `${pos.y}px`;
  for (const item of menuStateFor(node.kind, 'L0')) {
    const button = document.createElement('button');
    button.textContent = item.label;
    button.disabled = !item.enabled;
    if (item.reason !== undefined) button.title = item.reason;
    if (item.id === 'detail' && item.enabled) {
      button.addEventListener('click', () => { menu.remove(); onSelect(node); });
    }
    menu.appendChild(button);
  }
  container.appendChild(menu);
  const close = (): void => menu.remove();
  container.addEventListener('click', close, { once: true });
  window.addEventListener('keydown', function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { menu.remove(); window.removeEventListener('keydown', onKey); }
  });
}
```

`packages/web/src/detail.ts`:

```ts
import type { TreeNode } from '@skillsupertracker/core';

const KIND_LABELS: Record<string, string> = {
  session: '会话',
  turn: '轮次',
  skill: '技能',
  tool: '工具',
  artifact: '产物',
};

export function renderDetail(container: HTMLElement, node: TreeNode): void {
  const rows = Object.entries({ 类型: KIND_LABELS[node.kind] ?? node.kind, 名称: node.label, ...(node.time === undefined ? {} : { 时间: new Date(node.time).toLocaleString() }), ...Object.fromEntries(Object.entries(node.data).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [`data.${k}`, String(v)])) });
  container.innerHTML = `<h2>${escapeHtml(KIND_LABELS[node.kind] ?? node.kind)}</h2>` + rows.map(([k, v]) => `<div><strong>${escapeHtml(k)}</strong>: ${escapeHtml(v)}</div>`).join('');
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
```

`packages/web/src/heat-view.ts`:

```ts
import type { StatReport } from '@skillsupertracker/core';

export function renderHeat(container: HTMLElement, stat: StatReport): void {
  const rows = stat.skills.map((skill) => {
    const trend = skill.perDay.slice(-7).map((d) => d.calls).join(' / ');
    return `<tr>
      <td>${escapeHtml(skill.name)}</td>
      <td>${skill.calls}</td>
      <td>${skill.sessions}</td>
      <td>${new Date(skill.firstAt).toLocaleDateString()}</td>
      <td>${new Date(skill.lastAt).toLocaleDateString()}</td>
      <td>${trend || '—'}</td>
    </tr>`;
  }).join('');
  container.innerHTML = `
    <h2>技能使用热度（${stat.sessions} 个会话）</h2>
    <table class="heat">
      <thead><tr><th>技能</th><th>调用次数</th><th>会话数</th><th>首次</th><th>最近</th><th>近 7 天每日调用</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
```

`packages/web/src/app.ts`:

```ts
import { buildTraceTree, traceSessionSchema, statReportSchema, type StatReport, type TraceSession } from '@skillsupertracker/core';
import { renderDetail } from './detail.js';
import { renderHeat } from './heat-view.js';
import { mountTree } from './tree-view.js';

interface EmbeddedData {
  kind: 'analyze';
  trace: TraceSession;
} | {
  kind: 'stat';
  stat: StatReport;
}

function readEmbeddedData(): EmbeddedData {
  const el = document.getElementById('trace-data');
  if (el === null || el.textContent === null) throw new Error('missing #trace-data element');
  const parsed: unknown = JSON.parse(el.textContent);
  if (typeof parsed !== 'object' || parsed === null || (parsed as { kind?: unknown }).kind !== 'analyze' && (parsed as { kind?: unknown }).kind !== 'stat') {
    throw new Error('unrecognized embedded data');
  }
  const record = parsed as { kind: 'analyze' | 'stat' };
  if (record.kind === 'analyze') {
    return { kind: 'analyze', trace: traceSessionSchema.parse((parsed as { trace: unknown }).trace) };
  }
  return { kind: 'stat', stat: statReportSchema.parse((parsed as { stat: unknown }).stat) };
}

export function mountApp(root: HTMLElement): void {
  const data = readEmbeddedData();
  root.innerHTML = `
    <header class="top">skillsupertracker — ${data.kind === 'analyze' ? '单会话时序树' : '跨会话热度统计'}</header>
    <main class="split">
      ${data.kind === 'analyze' ? '<div id="tree"></div><aside id="detail"></aside>' : '<div id="heat"></div>'}
    </main>`;
  if (data.kind === 'stat') {
    renderHeat(root.querySelector<HTMLElement>('#heat')!, data.stat);
    return;
  }
  const detail = root.querySelector<HTMLElement>('#detail')!;
  renderDetail(detail, { id: 'session', kind: 'session', label: data.trace.session.title ?? data.trace.session.id ?? '(session)', data: {} });
  mountTree(root.querySelector<HTMLElement>('#tree')!, buildTraceTree(data.trace), (node) => renderDetail(detail, node));
}
```

`packages/web/src/main.ts`:

```ts
import { mountApp } from './app.js';

const root = document.getElementById('app');
if (root === null) throw new Error('missing #app element');
mountApp(root);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @skillsupertracker/web`
Expected: PASS (menu tests + headless cytoscape tests). If `cytoscape` import fails in jsdom, keep those tests on the default node environment instead: move `tree-model.test.ts` to use `// @vitest-environment node` in a file-level comment (cytoscape headless needs no DOM).

- [ ] **Step 5: Build the single-file output**

Run: `npm run build -w @skillsupertracker/web`
Expected: `packages/web/dist/index.html` exists, is one self-contained HTML (no external assets), and still contains the literal `__TRACE_DATA__` placeholder (verify with a grep).

- [ ] **Step 6: Commit**

```bash
git add packages/web
git commit -m "feat(web): self-contained trace tree + heat view with L0/L1 context menu"
```

---

### Task 12: Integration — template wiring, .bat launcher, README, full verification, push

**Files:**
- Create: `packages/cli/scripts/copy-template.mjs`
- Create: `skillsupertracker.bat`
- Modify: `README.md` (当前状态 + 快速开始 + 使用一节)
- Modify: `docs/superpowers/plans/` — no; nothing.

**Interfaces:**
- Consumes: everything above.
- Produces: the working end-to-end MVP (build → analyze a fixture → open a real single-file view) and the repo pushed to origin.

- [ ] **Step 1: Wire the web template into the CLI build**

`packages/cli/scripts/copy-template.mjs`:

```js
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'web', 'dist', 'index.html');
const dstDir = join(here, '..', 'templates');
await mkdir(dstDir, { recursive: true });
await copyFile(src, join(dstDir, 'trace-view.html'));
```

(`packages/cli/templates/` is already gitignored — it is a build artifact; `.gitkeep` from Task 9 can be removed.)

- [ ] **Step 2: Create the .bat launcher**

`skillsupertracker.bat`:

```bat
@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ^(>=22.15^) not found in PATH
  pause
  exit /b 1
)
node packages\cli\dist\cli.js analyze --open %*
if errorlevel 1 pause
```

(双击无参时 `analyze` 打印用法并 pause，窗口不会闪退；出错同样 pause。)

- [ ] **Step 3: Update README (replace 当前状态 + add 快速开始)**

Rewrite `README.md` sections: 「当前状态」→「**MVP 实施中/已交付**（2026-08-23）：`analyze`/`stat` CLI + 自包含时序树/热度视图已可用；写操作/推荐/选优 P1 起」。Add:

```markdown
## 快速开始

要求 Node >=22.15（zstd 内置）。首次使用：

```bash
npm install
npm run build
```

分析一个会话（会话 id 或会话目录），生成自包含 HTML 并在浏览器打开：

```bash
node packages/cli/dist/cli.js analyze <session-id|dir> --open
```

或双击 `skillsupertracker.bat`。跨会话热度统计：

```bash
node packages/cli/dist/cli.js stat --open
```

运行测试：

```bash
npm test
```
```

Add a 已知限制 section (keep it honest about MVP):

```markdown
## 已知限制（MVP）

- `stat` 每次全量解析所有会话（spec D7 允许），会话上百个时明显变慢——P1 的 node:sqlite 增量索引解决
- 时序树节点按类型着色（heat 在 stat 视图体现），按热度着色属后续打磨
- 大会话（数百节点）的 elk 布局在主线程计算（单文件无 Worker），布局期间界面短暂卡顿
- 仅在写操作上完全只读；技能目录管理（冻结/软删除等）P1 起分层交付
```

Keep the 核心决策速览 table, the spec link, and the License 待定 note unchanged in substance.

- [ ] **Step 4: Full verification (verification-before-completion discipline)**

Run all of these from the repo root and confirm real output:

```powershell
$env:npm_config_cache = "E:\BaiduSyncdisk\Data\vibe-coding\skillsupertracker\.npm-cache-tmp"
npm test                      # every package green (core/adapters/cli/web)
npm run build                 # tsc for core/adapters/cli + vite single-file web + template copy
npm run typecheck             # every package typechecks
node packages/cli/dist/cli.js analyze fixtures/golden/sample-1 --out dist/smoke-analyze.html
node packages/cli/dist/cli.js stat --root fixtures --out dist/smoke-stat.html
```

Then confirm: `dist/smoke-analyze.html` contains `"kind":"analyze"` and a skill name; `dist/smoke-stat.html` contains `"kind":"stat"` AND at least one skill name from `fixtures/golden/sample-1/expected.json` (`--root fixtures` walks project `golden` → session `sample-1`; `fixtures/golden` alone would find nothing because discovery expects two directory levels); both are self-contained (no `src="/assets` references); `packages/cli/templates/trace-view.html` exists. Clean up the smoke outputs (`git status` must show them as untracked only if not ignored — add `dist/` already ignored at repo root, so write them under `packages/cli/dist/smoke/` or root `dist/`; simplest: put them in root `dist/`, which `.gitignore` already covers).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/scripts/copy-template.mjs skillsupertracker.bat README.md
git commit -m "feat: wire web template into CLI, add .bat launcher and quick start"
```

- [ ] **Step 6: Push (whoever modified commits)**

```bash
git push origin main
```

If the push fails on sandbox/credential grounds, report the exact failure to the user — do not attempt escalation unless the session's approval policy permits it. After the push, verify with `git log origin/main -1 --oneline` and `git status` (clean working tree except ignored files).

Note on npm publishing (spec D6 `npx skillsupertracker` path): the cli package already carries `files` + `prepublishOnly` (Task 1), so publishing is `npm publish -w @skillsupertracker/core`, then `-w @skillsupertracker/adapters`, then the cli (the `0.1.0` version ranges resolve against the registry). The workspace packages are `private: true` until the user opts into publishing; MVP verification stays local build + `.bat`.

---

## Self-Review

- **Spec coverage:** D1/D2 (independent tool, adapter-first contract) → Tasks 5–7 (`TraceAdapter` contract + DSH-only implementation, agent-neutral schema); D3 (TS/Node ≥22.15, zod-only runtime deps, vite-plugin-singlefile, cytoscape/elk, vitest) → Tasks 1, 3, 11; D4 (vendored `scanZstdFrames`, per-frame decode, torn-frame tolerance) → Task 2 + fixtures test; D5 (Cytoscape + elk, self-drawn cxttap menu, no cxtmenu) → Task 11; D6 (`analyze --open` + `.bat`, no serve) → Tasks 9, 12; D7 (stat in-memory JSON + static HTML) → Tasks 4, 10; D8 (golden fixtures + lenient parse + fingerprint + torn tolerance + JSON Schema contract) → Tasks 3, 6, 7, 8; §五 component tree (`packages/core|adapters|cli|web`, `fixtures/`, `zstd-frames.ts`, `types.ts`, `dsh/`, `claude/` deferred) → Tasks 1, 5, 11 (claude dir intentionally absent — P1); §六 (no write ops in MVP; menu renders L1 disabled) → Task 11 `menuStateFor`; §七 test strategy → every task's tests. Explicitly out of MVP and NOT in this plan: serve, Claude adapter, recommendations, forkprobe, node:sqlite, freeze/delete implementation, trend timeline visualization, LICENSE choice.
- **Placeholder scan:** no TBD/TODO/placeholder steps; every step has runnable code or exact commands; the only "replace stub" note (Task 9 `stat.ts` stub → Task 10) ships the full replacement code inline.
- **Type consistency:** `scanZstdFrames`/`decodeZstdLog` signatures identical across Tasks 2/7/8; `TraceAdapter`/`LogSource` (Task 5) match usage in Tasks 7/9/10; `TraceSession` shape (Task 3) matches `parseDshText` output (Task 7) and web `app.ts` consumption (Task 11); `buildTraceTree`/`aggregateStats` (Task 4) match web/cli usage; `runAnalyze`/`runStat`/`main` signatures match cli tests; `menuStateFor` (Task 11) matches its tests.
- **Known deliberate deviations (documented):** chunk rows are skipped+counted, not expanded (they carry assistant deltas the trajectory does not model); torn tail is dropped, not partially recovered (committed-prefix semantics, same as DSH's `readRaw`); `stat` reads full logs rather than header-only (local volumes, MVP simplicity); timestamps in `perDay` are UTC; **「更新」is excluded from the right-click menu per spec §六** (semantics undefined until P1+); node colors encode node KIND rather than heat (spec §五's "颜色=heat" simplified for MVP — heat lives in the stat view); workspace deps use plain version ranges because npm rejects the `workspace:` protocol (verified); vitest 4 ignores `vitest.workspace.ts`, so projects are declared in the root `vitest.config.ts` and per-package runs use `npm test -w <pkg>` (verified); `fixtures/anonymize.ts` imports built `dist` output because Node type stripping does not remap `.js`→`.ts` specifiers (verified); npm publishing is prepared but deferred (packages stay `private` until the user opts in).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-23-mvp-implementation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
