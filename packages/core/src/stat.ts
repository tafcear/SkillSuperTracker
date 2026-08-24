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
