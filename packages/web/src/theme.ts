import type { TreeNodeKind } from '@skillsupertracker/core/pure';

/** 界面主题：archify 式明暗双主题（DESIGN.md Theme Parity Rule——换材质不换语义） */
export type Theme = 'light' | 'dark';

export interface ThemePalette {
  /** 各 kind 的描边色 */
  strokes: Record<TreeNodeKind, string>;
  /** 各 kind 的卡片底色 */
  fills: Record<TreeNodeKind, string>;
  /** 普通事件边 */
  edge: string;
  /** 主时序链（proof green，明暗同义） */
  chain: string;
  /** 卡片正文 */
  text: string;
  selectedBorder: string;
  selectedGlow: string;
}

const LIGHT: ThemePalette = {
  strokes: { session: '#64748B', turn: '#0891B2', skill: '#059669', tool: '#EA580C', artifact: '#7C3AED' },
  fills: { session: '#F8FAFC', turn: '#ECFEFF', skill: '#ECFDF5', tool: '#FFF7ED', artifact: '#F5F3FF' },
  edge: '#94A3B8',
  chain: '#059669',
  text: '#1E293B',
  selectedBorder: '#0E7490',
  selectedGlow: '#22D3EE',
};

const DARK: ThemePalette = {
  strokes: { session: '#94A3B8', turn: '#22D3EE', skill: '#34D399', tool: '#FB923C', artifact: '#A78BFA' },
  fills: { session: '#0F172A', turn: '#0F172A', skill: '#0F172A', tool: '#0F172A', artifact: '#0F172A' },
  edge: '#475569',
  chain: '#34D399',
  text: '#F1F5F9',
  selectedBorder: '#22D3EE',
  selectedGlow: '#22D3EE',
};

export function themePalette(t: Theme): ThemePalette {
  return t === 'dark' ? DARK : LIGHT;
}

const KEY = 'sst-theme';
let current: Theme = 'light';
const listeners = new Set<(t: Theme) => void>();

function applyBodyClass(t: Theme): void {
  if (typeof document !== 'undefined') document.body.classList.toggle('dark', t === 'dark');
}

/** 启动时调用：读回记忆的主题并落到 body class */
export function initTheme(): Theme {
  let stored: string | null = null;
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  } catch {
    stored = null; // 隐私模式等 localStorage 不可用时仅会话内生效
  }
  current = stored === 'dark' ? 'dark' : 'light';
  applyBodyClass(current);
  return current;
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(t: Theme): void {
  current = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // 同上：存不进就只影响当前会话
  }
  applyBodyClass(t);
  listeners.forEach((l) => l(t));
}

export function toggleTheme(): Theme {
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

export function onThemeChange(cb: (t: Theme) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
