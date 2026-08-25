import cytoscape from 'cytoscape';
import elk from 'cytoscape-elk';
import type { TraceTree, TreeNode, TreeNodeKind } from '@skillsupertracker/core/pure';
import { KIND_ICONS } from './icons.js';
import { menuStateFor } from './menu.js';

cytoscape.use(elk);

const KIND_COLORS: Record<string, string> = {
  session: '#64748B',
  turn: '#94A3B8',
  skill: '#3B82F6',
  tool: '#8B5CF6',
  artifact: '#16A34A',
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
      return { title: node.label, lines };
    }
    case 'turn': {
      const lines: string[] = [];
      if (node.time !== undefined) lines.push(formatTime(node.time));
      const endedAt = node.data.endedAt;
      if (typeof endedAt === 'number' && node.time !== undefined) {
        lines.push(`${((endedAt - node.time) / 1000).toFixed(1)}s`);
      }
      return { title: node.label, lines };
    }
    case 'skill': {
      const lines: string[] = ['技能'];
      if (typeof node.data.sourceRoot === 'string') lines.push(basename(node.data.sourceRoot));
      return { title: node.label, lines };
    }
    case 'tool': {
      const lines: string[] = [node.data.outcome === 'error' ? '结果: ✗ error' : node.data.outcome === 'ok' ? '结果: ✓ ok' : '工具'];
      if (typeof node.data.target === 'string') lines.push(basename(node.data.target));
      return { title: shortLabel('tool', node.label), lines };
    }
    case 'artifact': {
      const lines: string[] = ['产物'];
      if (typeof node.data.message === 'string') lines.push(node.data.message);
      return { title: shortLabel('artifact', node.label), lines };
    }
  }
}

export function toCytoscapeElements(tree: TraceTree): cytoscape.ElementDefinition[] {
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
          label: [lines.title, ...lines.lines].join('\n'),
        },
      };
    }),
    ...tree.edges.map((edge): cytoscape.ElementDefinition => ({
      data: { id: edge.id, source: edge.source, target: edge.target },
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
      padding: '12px',
      'background-color': '#FFFFFF',
      'background-image': (el: cytoscape.NodeSingular) => KIND_ICONS[String(el.data('kind')) as TreeNodeKind] ?? undefined,
      'background-width': '22px',
      'background-height': '22px',
      'background-position-x': '10px',
      'background-position-y': '50%',
      'text-halign': 'left',
      'text-valign': 'center',
      'text-margin-x': 16,
      'text-wrap': 'wrap',
      'text-max-width': '190px',
      'font-size': 11,
      color: '#1F2329',
      'border-width': 1,
      'border-color': (el: cytoscape.NodeSingular) => KIND_COLORS[String(el.data('kind'))] ?? '#999',
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
    selector: 'edge',
    style: {
      width: 1.5,
      'line-color': '#6366F1',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#6366F1',
      'curve-style': 'bezier',
      'control-point-distance': 56,
      'control-point-weight': 0.5,
      'arrow-scale': 0.8,
    },
  },
];

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
    minZoom: 0.05,
    background: false,
    style: TREE_STYLE,
  } as cytoscape.CytoscapeOptions);

  const layout = cy.layout({
    name: 'elk',
    elk: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': 50,
      'elk.spacing.nodeNodeBetweenLayers': 120,
    },
  } as unknown as cytoscape.LayoutOptions);
  layout.on('layoutstop', () => cy.fit(undefined, 48));
  layout.run();

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
