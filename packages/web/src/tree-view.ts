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

export function toCytoscapeElements(tree: TraceTree): cytoscape.ElementDefinition[] {
  return [
    ...tree.nodes.map((node): cytoscape.ElementDefinition => ({
      data: { ...node.data, id: node.id, label: node.label, kind: node.kind, shortLabel: shortLabel(node.kind, node.label) },
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
          label: 'data(shortLabel)',
          'text-valign': 'center',
          'text-halign': 'right',
          'font-size': 10,
          'text-wrap': 'ellipsis',
          'text-max-width': '110px',
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
      { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#f59e0b', 'border-opacity': 1 } },
      { selector: 'edge', style: { width: 1, 'line-color': '#8888', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#8888', 'curve-style': 'bezier', 'arrow-scale': 0.6 } },
    ],
  });

  cy.layout({ name: 'elk', elk: { 'elk.algorithm': 'layered', 'elk.direction': 'DOWN', 'elk.spacing.nodeNodeBetweenLayers': 90 } } as unknown as cytoscape.LayoutOptions).run();

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