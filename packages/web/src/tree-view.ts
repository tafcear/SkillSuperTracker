import cytoscape from 'cytoscape';
import elk from 'cytoscape-elk';
import type { TraceTree, TreeNode, TreeNodeKind } from '@skillsupertracker/core/pure';
import { getTheme, onThemeChange, themePalette, type Theme } from './theme.js';
import { menuStateFor } from './menu.js';

cytoscape.use(elk);

/** archify 语义色：颜色只表意不装饰（DESIGN.md Semantic Color Rule），明暗主题分别取描边档 */
export const MONO_FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const KIND_EMOJI: Record<TreeNodeKind, string> = {
  session: '🗂',
  turn: '⏱',
  skill: '⚡',
  tool: '🔧',
  artifact: '📦',
};

export const KIND_LABELS: Record<TreeNodeKind, string> = {
  session: '会话',
  turn: '轮次',
  skill: '技能',
  tool: '工具',
  artifact: '产物',
};

export function shortLabel(kind: TreeNodeKind, label: string): string {
  if (kind === 'tool') {
    const idx = label.lastIndexOf('__');
    return idx === -1 ? label : label.slice(idx + 2);
  }
  if (kind === 'artifact') {
    const slash = label.lastIndexOf('/');
    const back = label.lastIndexOf('\\');
    const idx = Math.max(slash, back);
    return idx === -1 ? label : label.slice(idx + 1);
  }
  return label;
}

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  const back = path.lastIndexOf('\\');
  const idx = Math.max(slash, back);
  return idx === -1 ? path : path.slice(idx + 1);
}

function formatTime(t: number): string {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** 卡片上的正文摘要：压成单行，超长截断 */
function excerpt(s: string, max: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

export function cardLines(node: TreeNode): { title: string; lines: string[] } {
  switch (node.kind) {
    case 'session': {
      const lines: string[] = [];
      if (typeof node.data.id === 'string' && node.data.id !== '') lines.push(`ID: ${node.data.id}`);
      lines.push(String(node.data.agent ?? 'dsh'));
      if (typeof node.data.model === 'string') lines.push(node.data.model);
      if (node.data.tokenUsage !== undefined && typeof node.data.tokenUsage === 'object' && node.data.tokenUsage !== null) {
        const tu = node.data.tokenUsage as { input?: number; output?: number };
        if (tu.input !== undefined || tu.output !== undefined) {
          lines.push(`Tokens: ${(tu.input ?? 0) + (tu.output ?? 0)}`);
        }
      }
      return { title: node.label || '(未命名会话)', lines };
    }
    case 'turn': {
      // 内容优先：用户这轮发了什么放第一行，时间退到次要行
      const parts: string[] = [];
      const prompt = typeof node.data.prompt === 'string' ? excerpt(node.data.prompt, 36) : undefined;
      if (prompt !== undefined && prompt !== '') parts.push(prompt);
      if (node.time !== undefined) parts.push(formatTime(node.time).slice(0, 5));
      return { title: node.label, lines: parts };
    }
    case 'skill': {
      const lines: string[] = [];
      if (typeof node.data.category === 'string' && node.data.category !== '') lines.push(node.data.category);
      return { title: node.label, lines };
    }
    case 'tool': {
      const glyph = node.data.outcome === 'error' ? ' ✗' : node.data.outcome === 'ok' ? ' ✓' : '';
      const lines: string[] = [];
      if (typeof node.data.target === 'string') lines.push(basename(node.data.target));
      return { title: shortLabel('tool', node.label) + glyph, lines };
    }
    case 'artifact': {
      const lines: string[] = [];
      if (typeof node.data.message === 'string') lines.push(node.data.message);
      return { title: shortLabel('artifact', node.label), lines };
    }
  }
}

/**
 * Display-only edge list that turns the session→turn star into a temporal
 * chain (session→turn-0→turn-1→…). Turns are sequential in time; a star
 * makes elk stack every turn into one towering column, while a chain lays
 * the session out left-to-right like a workflow. Core tree data is unchanged.
 */
export function temporalEdges(tree: TraceTree): { id: string; source: string; target: string; chain: true }[] {
  const turns = tree.nodes
    .filter((n): n is TreeNode & { id: string } => n.kind === 'turn')
    .map((n) => ({ id: n.id, index: Number(n.id.slice('turn-'.length)) }))
    .sort((a, b) => a.index - b.index);
  const edges: { id: string; source: string; target: string; chain: true }[] = [];
  let prev: { id: string; index: number } | undefined;
  for (const turn of turns) {
    if (prev === undefined) {
      edges.push({ id: `edge-chain-session-${turn.id}`, source: 'session', target: turn.id, chain: true });
    } else {
      edges.push({ id: `edge-chain-${prev.id}-${turn.id}`, source: prev.id, target: turn.id, chain: true });
    }
    prev = turn;
  }
  return edges;
}

function nodeDef(tree: TraceTree, node: TreeNode): cytoscape.ElementDefinition {
  const lines = cardLines(node);
  const kindLabel = KIND_LABELS[node.kind] ?? node.kind;
  return {
    data: {
      ...node.data,
      id: node.id,
      kind: node.kind,
      shortLabel: shortLabel(node.kind, node.label),
      title: lines.title,
      lines: lines.lines,
      label: [`${KIND_EMOJI[node.kind] ?? ''}（${kindLabel}）${lines.title}`.trim(), ...lines.lines].join('\n'),
    },
  };
}

export function toCytoscapeElements(tree: TraceTree): cytoscape.ElementDefinition[] {
  const turnIds = new Set(tree.nodes.filter((n) => n.kind === 'turn').map((n) => n.id));
  const eventEdges = tree.edges.filter((e) => !(e.source === 'session' && turnIds.has(e.target)));
  return [
    ...tree.nodes.map((node) => nodeDef(tree, node)),
    ...eventEdges.map((edge): cytoscape.ElementDefinition => ({
      data: { id: edge.id, source: edge.source, target: edge.target },
    })),
    ...temporalEdges(tree).map((edge): cytoscape.ElementDefinition => ({
      data: { id: edge.id, source: edge.source, target: edge.target, chain: true },
    })),
  ];
}

export function eventCountFor(tree: TraceTree, turnId: string): number {
  return tree.nodes.filter((n) => n.id.startsWith(`${turnId}-event-`)).length;
}

function turnMarker(expanded: boolean): string {
  return expanded ? '▾' : '▸';
}

function turnDisplayLabel(tree: TraceTree, node: TreeNode, expanded: boolean): string {
  const c = cardLines(node);
  const lines = [...c.lines];
  const count = eventCountFor(tree, node.id);
  if (count > 0) lines.push(`${count} 事件`);
  return [`${KIND_EMOJI.turn}（轮次）${c.title} ${turnMarker(expanded)}`.trim(), ...lines].join('\n');
}

/**
 * Level 1 of the collapsible view: session + turn chain only. Turn cards carry
 * an event count and a ▸/▾ marker so the graph reads as one clean timeline;
 * events stay hidden until their turn is expanded (see turnEventElements).
 */
export function chainElements(tree: TraceTree, expanded: ReadonlySet<string>): cytoscape.ElementDefinition[] {
  const nodes = tree.nodes
    .filter((n) => n.kind === 'session' || n.kind === 'turn')
    .map((node) => {
      const def = nodeDef(tree, node);
      if (node.kind === 'turn') {
        def.data.label = turnDisplayLabel(tree, node, expanded.has(node.id));
      }
      return def;
    });
  const edges = temporalEdges(tree).map((edge): cytoscape.ElementDefinition => ({
    data: { id: edge.id, source: edge.source, target: edge.target, chain: true },
  }));
  return [...nodes, ...edges];
}

/** Level 2: one turn's event nodes + the edges binding them to it (skill→tool chains included). */
export function turnEventElements(
  tree: TraceTree,
  turnId: string,
  kindFilter?: ReadonlySet<string>,
): cytoscape.ElementDefinition[] {
  const prefix = `${turnId}-event-`;
  const ids = new Set(tree.nodes.filter((n) => n.id.startsWith(prefix)).map((n) => n.id));
  const nodes = tree.nodes.filter((n) => ids.has(n.id) && (kindFilter === undefined || kindFilter.has(n.kind)));
  const visible = new Set<string>([turnId, ...nodes.map((n) => n.id)]);
  const edges = tree.edges
    .filter((e) => visible.has(e.source) && visible.has(e.target))
    .map((edge): cytoscape.ElementDefinition => ({
      data: { id: edge.id, source: edge.source, target: edge.target },
    }));
  return [...nodes.map((node) => nodeDef(tree, node)), ...edges];
}

/** 把主流程（会话+轮次链）钉成一条水平直线，放在所有事件下方 */
export function alignChainToBottom(cy: cytoscape.Core, tree: TraceTree): void {
  const chainSet = new Set(['session', ...tree.nodes.filter((n) => n.kind === 'turn').map((n) => n.id)]);
  const chainNodes = cy.nodes().filter((n) => chainSet.has(n.id()));
  if (chainNodes.empty()) return;
  const events = cy.nodes().filter((n) => !chainSet.has(n.id()));
  let chainY: number;
  if (events.empty()) {
    chainY = chainNodes[0].position().y;
  } else {
    let maxY = 0;
    events.forEach((n) => {
      maxY = Math.max(maxY, n.position().y + n.outerHeight() / 2);
    });
    chainY = maxY + 90;
  }
  chainNodes.forEach((n) => n.position({ x: n.position().x, y: chainY }));
}

export function treeStyle(t: Theme): cytoscape.StylesheetStyle[] {
  const p = themePalette(t);
  return [
    {
      selector: 'node',
      style: {
        shape: 'round-rectangle',
        width: 'label',
        height: 'label',
        padding: '12px',
        'background-color': (el: cytoscape.NodeSingular) =>
          themePalette(getTheme()).fills[String(el.data('kind')) as TreeNodeKind] ?? p.fills.session,
        'text-halign': 'center',
        'text-valign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': '170px',
        'line-height': 1.4,
        'font-family': MONO_FONT,
        'font-size': 13,
        'font-weight': 600,
        color: p.text,
        'border-width': 2,
        'border-color': (el: cytoscape.NodeSingular) =>
          themePalette(getTheme()).strokes[String(el.data('kind')) as TreeNodeKind] ?? p.strokes.session,
        'transition-property': 'opacity',
        'transition-duration': '150ms',
        label: 'data(label)',
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node[kind = "skill"]',
      style: { 'font-weight': 700 },
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 3,
        'border-color': p.selectedBorder,
        'shadow-blur': 7,
        'shadow-color': p.selectedGlow,
        'shadow-opacity': 0.55,
        'shadow-offset-x': 0,
        'shadow-offset-y': 0,
      } as cytoscape.Css.Node,
    },
    {
      // 选中聚焦：与选中节点无关的部分整体淡出，压低画面噪声
      selector: '.dimmed',
      style: { opacity: 0.12 },
    },
    {
      // archify 主流程：proof green 直角航线
      selector: 'edge',
      style: {
        width: 1.5,
        'line-color': p.edge,
        'target-arrow-shape': 'triangle',
        'target-arrow-color': p.edge,
        'curve-style': 'taxi',
        'taxi-direction': 'auto',
        'taxi-turn': '18px',
        'transition-property': 'opacity',
        'transition-duration': '150ms',
      },
    },
    {
      selector: 'edge[chain]',
      style: {
        width: 2,
        'line-color': p.chain,
        'target-arrow-color': p.chain,
      },
    },
  ];
}

/** 兼容别名：浅色主题样式（运行时请用 treeStyle(getTheme()) 以支持主题切换） */
export const TREE_STYLE = treeStyle('light');

export interface TreeViewHandle {
  cy: cytoscape.Core;
  destroy(): void;
}

/** fit 后若整体缩放低于可读阈值，锚定 session 用可读缩放展示首屏 */
function settleInitialView(cy: cytoscape.Core): void {
  cy.fit(undefined, 48);
  if (cy.zoom() < 0.6) {
    cy.zoom(0.6);
    const anchor = cy.getElementById('session');
    if (anchor.nonempty()) cy.center(anchor);
  }
}

export function mountTree(
  container: HTMLElement,
  tree: TraceTree,
  onSelect: (node: TreeNode) => void,
): TreeViewHandle {
  const expanded = new Set<string>();
  const cy = cytoscape({
    container,
    elements: chainElements(tree, expanded),
    wheelSensitivity: 0.3,
    minZoom: 0.05,
    maxZoom: 2.5,
    background: false,
    style: treeStyle(getTheme()),
  } as cytoscape.CytoscapeOptions);
  const offTheme = onThemeChange((t) => cy.style(treeStyle(t)));

  const layoutOpts = {
    name: 'elk',
    elk: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': 24,
      'elk.spacing.nodeNodeBetweenLayers': 56,
    },
  } as unknown as cytoscape.LayoutOptions;
  const layout = cy.layout(layoutOpts);
  layout.on('layoutstop', () => {
    alignChainToBottom(cy, tree);
    settleInitialView(cy);
  });
  layout.run();

  /** 系统开了「减少动态效果」时不做过渡动画（archify 动效规则） */
  const motionOk = typeof window.matchMedia === 'function' ? !window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
  const EASE = 'ease-in-out';

  /** 展开/收起一个轮次后重排：先算好目标布局，再让所有节点从原位滑过去，视口同步缓动 */
  const relayoutAround = (turnId: string): void => {
    const before = new Map(cy.nodes().map((n) => [n.id(), { x: n.position().x, y: n.position().y }]));
    const l = cy.layout({ ...layoutOpts, animate: false });
    l.on('layoutstop', () => {
      alignChainToBottom(cy, tree);
      const targetZoom = Math.max(cy.zoom(), 0.6);
      const anchor = cy.getElementById(turnId);
      const dur = motionOk ? 300 : 0;
      const finals = new Map(cy.nodes().map((n) => [n.id(), { x: n.position().x, y: n.position().y }]));
      if (dur === 0) {
        if (anchor.nonempty()) cy.center(anchor);
        return;
      }
      cy.nodes().forEach((n) => {
        const from = before.get(n.id());
        const to = finals.get(n.id());
        if (from === undefined || to === undefined) return; // 新展开的节点直接出现在目标位
        n.position(from);
        n.animate({ position: to }, { duration: dur, easing: EASE });
      });
      if (anchor.nonempty()) {
        cy.stop();
        cy.animate({ center: { els: anchor }, zoom: targetZoom }, { duration: dur, easing: EASE });
      }
    });
    l.run();
  };

  const EVENT_KINDS = ['skill', 'tool', 'artifact'] as const;
  const activeKinds = new Set<string>(EVENT_KINDS);
  const applyFilter = (): void => {
    const filter = activeKinds.size === EVENT_KINDS.length ? undefined : activeKinds;
    for (const turnId of Array.from(expanded)) {
      const evNodes = cy.nodes(`[id ^= "${turnId}-event-"]`);
      evNodes.connectedEdges().remove();
      evNodes.remove();
      cy.add(turnEventElements(tree, turnId, filter));
    }
    relayoutAround(Array.from(expanded)[0] ?? 'session');
  };

  const bar = document.createElement('div');
  bar.className = 'filter-bar';
  const syncChipStates = (): void => {
    bar.querySelectorAll('button').forEach((x) => {
      const f = x.dataset.filter;
      x.classList.toggle('active', f === 'all' ? activeKinds.size === EVENT_KINDS.length : activeKinds.has(f ?? ''));
    });
  };
  const kindButton = (kind: string, text: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = text;
    b.dataset.filter = kind;
    b.classList.add('active');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeKinds.has(kind) && activeKinds.size === 1) return; // 至少保留一类，避免全空
      if (activeKinds.has(kind)) activeKinds.delete(kind);
      else activeKinds.add(kind);
      syncChipStates();
      applyFilter();
    });
    return b;
  };
  const allButton = document.createElement('button');
  allButton.textContent = '全部';
  allButton.dataset.filter = 'all';
  allButton.classList.add('active');
  allButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeKinds.size === EVENT_KINDS.length) return;
    EVENT_KINDS.forEach((k) => activeKinds.add(k));
    syncChipStates();
    applyFilter();
  });
  bar.appendChild(allButton);
  bar.appendChild(kindButton('skill', '⚡ 技能'));
  bar.appendChild(kindButton('tool', '🔧 工具'));
  bar.appendChild(kindButton('artifact', '📦 产物'));
  container.appendChild(bar);

  const toggleTurn = (turnId: string): void => {
    if (expanded.has(turnId)) {
      const evNodes = cy.nodes(`[id ^= "${turnId}-event-"]`);
      evNodes.connectedEdges().remove();
      evNodes.remove();
      expanded.delete(turnId);
      clearFocus();
    } else {
      const filter = activeKinds.size === EVENT_KINDS.length ? undefined : activeKinds;
      const added = turnEventElements(tree, turnId, filter);
      cy.add(added);
      // 新节点默认落在 (0,0)，会让动画从画布原点飞入——把它们先放到所属轮次卡片处，从卡片向外展开
      const spawn = { ...cy.getElementById(turnId).position() };
      cy.nodes(`[id ^= "${turnId}-event-"]`).forEach((n) => n.position(spawn));
      expanded.add(turnId);
      clearFocus();
    }
    const node = tree.nodes.find((n) => n.id === turnId);
    if (node !== undefined) {
      cy.getElementById(turnId).data('label', turnDisplayLabel(tree, node, expanded.has(turnId)));
    }
    relayoutAround(turnId);
  };

  const controls = document.createElement('div');
  controls.className = 'canvas-controls';
  const button = (text: string, title: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = text;
    b.title = title;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  };
  controls.appendChild(button('＋', '放大', () => cy.zoom(Math.min(cy.zoom() * 1.25, cy.maxZoom()))));
  controls.appendChild(button('－', '缩小', () => cy.zoom(Math.max(cy.zoom() / 1.25, cy.minZoom()))));
  controls.appendChild(button('⛶', '适配全图', () => {
    if (!motionOk) {
      settleInitialView(cy);
      return;
    }
    cy.stop();
    cy.animate(
      { fit: { els: cy.elements(), padding: 48 } },
      { duration: 300, easing: EASE },
    );
  }));
  container.appendChild(controls);

  const focusOn = (id: string): void => {
    const keep = cy.getElementById(id).closedNeighborhood();
    cy.elements().forEach((el) => el.addClass('dimmed'));
    keep.removeClass('dimmed');
  };
  const clearFocus = (): void => cy.elements().removeClass('dimmed');

  cy.on('tap', 'node', (event) => {
    const id = event.target.id();
    const node = tree.nodes.find((n) => n.id === id);
    if (node === undefined) return;
    onSelect(node);
    if (node.kind === 'turn') {
      toggleTurn(id);
    } else {
      focusOn(id);
    }
  });

  cy.on('tap', (event) => {
    if (event.target === cy) clearFocus();
  });

  cy.on('cxttap', (event) => {
    if (event.target === cy) return;
    const id = (event.target as cytoscape.NodeSingular).id();
    const node = tree.nodes.find((n) => n.id === id);
    if (node === undefined) return;
    const pos = (event as cytoscape.EventObject).renderedPosition ?? event.renderedPosition;
    showContextMenu(container, pos, node, onSelect);
  });

  return {
    cy,
    destroy: () => {
      offTheme();
      controls.remove();
      bar.remove();
      cy.destroy();
    },
  };
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
