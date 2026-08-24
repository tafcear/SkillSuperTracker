import type { TreeNodeKind } from '@skillsupertracker/core/pure';

export type MenuActionId = 'detail' | 'select-opt' | 'replace' | 'delete' | 'freeze';
export type CapabilityLayer = 'L0' | 'L1';

export interface MenuItemState {
  id: MenuActionId;
  label: string;
  enabled: boolean;
  reason?: string;
  layer: CapabilityLayer;
}

// 「更新」is intentionally absent — spec §六: not in the menu until its semantics are defined.
const L1_ACTIONS: Array<{ id: MenuActionId; label: string }> = [
  { id: 'select-opt', label: '选优' },
  { id: 'replace', label: '替换' },
  { id: 'delete', label: '删除' },
  { id: 'freeze', label: '冻结' },
];

/**
 * Right-click menu state machine (spec §五): L0 read actions enabled,
 * L1 write actions layered — rendered disabled during the read-only MVP.
 */
export function menuStateFor(kind: TreeNodeKind, layer: CapabilityLayer): MenuItemState[] {
  const items: MenuItemState[] = [{ id: 'detail', label: '查看详情', enabled: true, layer: 'L0' }];
  if (kind !== 'skill') return items;
  for (const action of L1_ACTIONS) {
    items.push({
      ...action,
      layer: 'L1',
      enabled: layer === 'L1',
      ...(layer === 'L0' ? { reason: '写操作 P1 起（MVP 只读）' } : {}),
    });
  }
  return items;
}