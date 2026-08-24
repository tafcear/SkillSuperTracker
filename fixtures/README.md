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
