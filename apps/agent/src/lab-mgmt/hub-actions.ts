/**
 * Handlers nút trên Teacher Hub — mỗi action độc lập, không chain tự động.
 * Spec §5: register máy không được gọi các hàm này.
 */

import type { ComparedExtension } from './allowlist-compare';
import { compareInventory, summarizeComparisons } from './allowlist-compare';
import type { EffectiveExtension } from './allowlist-compare';
import type { RegisteredNode, TeacherHub } from './teacher-hub';

export type HubActionName =
  | 'refresh_machines'
  | 'scan_extensions'
  | 'compare_allowlist'
  | 'aggregate_room'
  | 'sync_backend';

/** Đảm bảo register path không gọi action nghiệp vụ — dùng trong test. */
export const ACTIONS_NOT_TRIGGERED_ON_REGISTER: readonly HubActionName[] = [
  'scan_extensions',
  'compare_allowlist',
  'aggregate_room',
  'sync_backend',
] as const;

export function refreshMachines(hub: TeacherHub): void {
  hub.refreshRegistry();
}

export async function scanExtensions(
  hub: TeacherHub,
  machineIds?: string[],
): Promise<void> {
  await hub.sendCommand('SCAN_VSCODE_EXTENSIONS', machineIds);
}

export interface MachineComparison {
  machineId: string;
  studentMssv: string;
  hostname: string;
  rows: ComparedExtension[];
  extensionCount: number;
  violationCount: number;
  status: 'clean' | 'has_violations';
  error?: string;
}

export function compareAllowlist(
  nodes: RegisteredNode[],
  effective: EffectiveExtension[],
): MachineComparison[] {
  return nodes.map((node) => {
    if (node.inventoryError) {
      return {
        machineId: node.machineId,
        studentMssv: node.studentMssv ?? '',
        hostname: node.hostname,
        rows: [],
        extensionCount: 0,
        violationCount: 0,
        status: 'has_violations',
        error: node.inventoryError,
      };
    }
    if (!node.inventory) {
      return {
        machineId: node.machineId,
        studentMssv: node.studentMssv ?? '',
        hostname: node.hostname,
        rows: [],
        extensionCount: 0,
        violationCount: 0,
        status: 'clean',
        error: 'Chưa quét — bấm «Quét extension VS Code» trước.',
      };
    }
    const rows = compareInventory(node.inventory, effective);
    const summary = summarizeComparisons(rows);
    return {
      machineId: node.machineId,
      studentMssv: node.studentMssv ?? '',
      hostname: node.hostname,
      rows,
      ...summary,
    };
  });
}

export interface RoomAggregate {
  machinesWithInventory: number;
  machinesWithViolations: number;
  blockedExtensionIds: string[];
}

export function aggregateRoom(comparisons: MachineComparison[]): RoomAggregate {
  const blocked = new Set<string>();
  let withInv = 0;
  let withViol = 0;
  for (const c of comparisons) {
    if (c.rows.length > 0 || c.error) withInv += 1;
    if (c.violationCount > 0 || c.error) withViol += 1;
    for (const row of c.rows) {
      if (row.verdict === 'blocked') blocked.add(row.extensionId);
    }
  }
  return {
    machinesWithInventory: withInv,
    machinesWithViolations: withViol,
    blockedExtensionIds: [...blocked].sort(),
  };
}
