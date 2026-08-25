import cytoscape from 'cytoscape';
import elk from 'cytoscape-elk';
import type { TraceTree, TreeNode, TreeNodeKind } from '@skillsupertracker/core/pure';
import { menuStateFor } from './menu.js';

cytoscape.use(elk);

const KIND_COLORS: Record<string, string> = {
  session: '#4a5568',
  turn: '#718096',
  skill: '#2f6fed',
  tool: '#805ad5',
  artifact: '#2c9e5a',
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

function formatTime(t: number): string {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function cardLines(node: TreeNode): { title: string; subtitle: string } {
  switch (node.kind) {
    case 'session':
      return { title: node.label, subtitle: String(node.data.agent ?? '') };
    case 'turn':
      return { title: node.label, subtitle: node.time === undefined ? '' : formatTime(node.time) };
    case 'skill':
      return { title: node.label, subtitle: '技能' };
    case 'tool':
      return { title: shortLabel('tool', node.label), subtitle: typeof node.data.outcome === 'string' ? node.data.outcome : '工具' };
    case 'artifact':
      return { title: shortLabel('artifact', node.label), subtitle: '产物' };
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
          subtitle: lines.subtitle,
          label: `${lines.title}\n${lines.subtitle}`,
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
      padding: '10px',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '240px',
      'font-size': 11,
      color: '#e5e7eb',
      'background-color': '#16181d',
      'border-width': 1.5,
      'border-color': (el) => KIND_COLORS[String(el.data('kind'))] ?? '#999',
      label: 'data(label)',
    },
  },
  {
    selector: 'node[kind = "skill"]',
    style: { 'font-weight': 'bold' },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 2.5,
      'border-color': '#f59e0b',
      'background-color': '#1d2027',
      'shadow-blur': 14,
      'shadow-color': '#f59e0b',
      'shadow-opacity': 0.55,
      'shadow-offset-x': 0,
      'shadow-offset-y': 0,
    } as cytoscape.Css.Node,
  },
  {
    selector: 'edge',
    style: {
      width: 1.2,
      'line-color': '#3f4653',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#3f4653',
      'curve-style': 'bezier',
      'control-point-distance': 48,
      'control-point-weight': 0.5,
      'arrow-scale': 0.7,
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
    style: TREE_STYLE,
  });

  const layout = cy.layout({
    name: 'elk',
    elk: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': 60,
      'elk.spacing.nodeNodeBetweenLayers': 110,
    },
  } as unknown as cytoscape.LayoutOptions);
  layout.on('layoutstop', () => cy.fit(undefined, 32));
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
