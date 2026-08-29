import cytoscape from 'cytoscape';
import elk from 'cytoscape-elk';
import type { TraceTree, TreeNode, TreeNodeKind } from '@skillsupertracker/core/pure';
import { menuStateFor } from './menu.js';

cytoscape.use(elk);

export const KIND_COLORS: Record<TreeNodeKind, string> = {
  session: '#64748B',
  turn: '#94A3B8',
  skill: '#3B82F6',
  tool: '#8B5CF6',
  artifact: '#16A34A',
};

export const KIND_EMOJI: Record<TreeNodeKind, string> = {
  session: '🗂',
  turn: '⏱',
  skill: '⚡',
  tool: '🔧',
  artifact: '📦',
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

export function cardLines(node: TreeNode): { title: string; lines: string[] } {
  switch (node.kind) {
    case 'session': {
      const lines: string[] = [String(node.data.agent ?? 'dsh')];
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
      const parts: string[] = [];
      if (node.time !== undefined) parts.push(formatTime(node.time).slice(0, 5));
      const endedAt = node.data.endedAt;
      if (typeof endedAt === 'number' && node.time !== undefined) {
        parts.push(`${((endedAt - node.time) / 1000).toFixed(1)}s`);
      }
      return { title: node.label, lines: parts.length > 0 ? [parts.join(' · ')] : [] };
    }
    case 'skill':
      return { title: node.label, lines: [] };
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

export function toCytoscapeElements(tree: TraceTree): cytoscape.ElementDefinition[] {
  const turnIds = new Set(tree.nodes.filter((n) => n.kind === 'turn').map((n) => n.id));
  const eventEdges = tree.edges.filter((e) => !(e.source === 'session' && turnIds.has(e.target)));
  return [
    ...tree.nodes.map((node): cytoscape.ElementDefinition => {
      const lines = cardLines(node);
      return {
        data: {
          ...node.data,
          id: node.id,
          kind: node.kind,
          shortLabel: shortLabel(node.kind, node.label),
          title: lines.title,
          lines: lines.lines,
          label: [`${KIND_EMOJI[node.kind] ?? ''} ${lines.title}`.trim(), ...lines.lines].join('\n'),
        },
      };
    }),
    ...eventEdges.map((edge): cytoscape.ElementDefinition => ({
      data: { id: edge.id, source: edge.source, target: edge.target },
    })),
    ...temporalEdges(tree).map((edge): cytoscape.ElementDefinition => ({
      data: { id: edge.id, source: edge.source, target: edge.target, chain: true },
    })),
  ];
}

export const TREE_STYLE: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      shape: 'round-rectangle',
      width: 'label',
      height: 'label',
      padding: '10px',
      'background-color': '#FFFFFF',
      'text-halign': 'center',
      'text-valign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '150px',
      'line-height': 1.4,
      'font-size': 11,
      color: '#1F2329',
      'border-width': 1,
      'border-color': (el: cytoscape.NodeSingular) => KIND_COLORS[String(el.data('kind')) as TreeNodeKind] ?? '#999',
      'shadow-blur': 6,
      'shadow-color': '#0a0a0a',
      'shadow-opacity': 0.08,
      'shadow-offset-x': 0,
      'shadow-offset-y': 2,
      label: 'data(label)',
    } as cytoscape.Css.Node,
  },
  {
    selector: 'node[kind = "skill"]',
    style: { 'font-weight': 'bold' },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 2,
      'border-color': '#6366F1',
      'shadow-blur': 10,
      'shadow-color': '#6366F1',
      'shadow-opacity': 0.35,
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
    selector: 'edge',
    style: {
      width: 1.2,
      'line-color': '#CBD5E1',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#CBD5E1',
      'curve-style': 'bezier',
      'control-point-distance': 56,
      'control-point-weight': 0.5,
      'arrow-scale': 0.65,
    },
  },
  {
    // 主时序流（session→turn-0→turn-1→…）比事件边略深略粗，区分层级
    selector: 'edge[chain]',
    style: {
      width: 2,
      'line-color': '#94A3B8',
      'target-arrow-color': '#94A3B8',
      'arrow-scale': 0.9,
    },
  },
];

export interface TreeViewHandle {
  cy: cytoscape.Core;
  destroy(): void;
}

/** fit 后若整体缩放低于可读阈值，锚定 session 用可读缩放展示首屏 */
function settleInitialView(cy: cytoscape.Core): void {
  cy.fit(undefined, 48);
  if (cy.zoom() < 0.5) {
    cy.zoom(0.5);
    const anchor = cy.getElementById('session');
    if (anchor.nonempty()) cy.center(anchor);
  }
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
    minZoom: 0.05,
    maxZoom: 2,
    background: false,
    style: TREE_STYLE,
  } as cytoscape.CytoscapeOptions);

  const layout = cy.layout({
    name: 'elk',
    elk: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': 24,
      'elk.spacing.nodeNodeBetweenLayers': 56,
    },
  } as unknown as cytoscape.LayoutOptions);
  layout.on('layoutstop', () => settleInitialView(cy));
  layout.run();

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
  controls.appendChild(button('⛶', '适配全图', () => settleInitialView(cy)));
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
    if (node !== undefined) {
      onSelect(node);
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
      controls.remove();
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
