import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface SkillMeta {
  category?: string;
  summary?: string;
  detail?: string;
}

const META_KEYS: Record<string, 'category' | 'summary'> = {
  description: 'summary',
  category: 'category',
  classification: 'category',
  分类: 'category',
};

const DETAIL_MAX = 400;
const SKILL_MD_MAX_BYTES = 262144; // 256KB 上限：SKILL.md 是短文档，超限视为异常不读取
const ELLIPSIS = '…';

/**
 * 读取技能根目录下 SKILL.md 的分类（frontmatter category/分类）、
 * 简要概述（frontmatter description）与详细作用（正文首段，截断 400 字）。
 * 文件缺失、超限或无可提取字段时返回 undefined。
 */
export async function readSkillMeta(root: string): Promise<SkillMeta | undefined> {
  const skillFile = join(resolve(root), 'SKILL.md');
  const info = await stat(skillFile).catch(() => undefined);
  if (info === undefined || !info.isFile() || info.size > SKILL_MD_MAX_BYTES) return undefined;
  const text = await readFile(skillFile, 'utf8');
  const meta: SkillMeta = {};
  let body = text;
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) {
      body = text.slice(text.indexOf('\n', end + 1) + 1);
      for (const line of text.slice(4, end).split('\n')) {
        const m = /^([A-Za-z_-]+|[\u4e00-\u9fa5]+)\s*:\s*(.+)$/.exec(line.trim());
        if (m === null) continue;
        const target = META_KEYS[m[1].toLowerCase()] ?? META_KEYS[m[1]];
        if (target === undefined) continue;
        const value = m[2].trim();
        meta[target] = value.replace(/^["']/g, '').replace(/["']$/g, '');
      }
    }
  }
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').filter((l) => !l.trim().startsWith('#')).join(' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p !== '');
  if (paragraphs.length > 0) {
    const first = paragraphs[0];
    meta.detail = first.length > DETAIL_MAX ? first.slice(0, DETAIL_MAX - 1) + ELLIPSIS : first;
  }
  return meta.category !== undefined || meta.summary !== undefined || meta.detail !== undefined ? meta : undefined;
}

/** 从轨迹里收集 技能名→sourceRoot（首次出现为准），并读取各自的 SKILL.md 元数据 */
export async function collectSkillMeta(
  turns: Array<{ events: Array<{ type: string; skill?: { name: string; sourceRoot?: string } }> }>,
): Promise<Record<string, SkillMeta> | undefined> {
  const roots = new Map<string, string>();
  for (const turn of turns) {
    for (const event of turn.events) {
      if (event.type === 'skill-load' && event.skill?.sourceRoot !== undefined && !roots.has(event.skill.name)) {
        roots.set(event.skill.name, event.skill.sourceRoot);
      }
    }
  }
  const entries = await Promise.all([...roots.entries()].map(async ([name, root]) => [name, await readSkillMeta(root)] as const));
  const defined = entries.filter((e): e is readonly [string, SkillMeta] => e[1] !== undefined);
  const skillMeta: Record<string, SkillMeta> = Object.fromEntries(defined);
  return Object.keys(skillMeta).length > 0 ? skillMeta : undefined;
}
