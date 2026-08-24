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