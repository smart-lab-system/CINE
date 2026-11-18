import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type CachedMachineRole = 'teacher' | 'student';

export interface MachineRoleCache {
  role: CachedMachineRole;
  roomId: string | null;
  computerId: string | null;
  reason: string | null;
  syncedAt: string;
}

function cachePath(userDataDir: string): string {
  return join(userDataDir, 'lab-mgmt', 'machine-role.json');
}

export function loadMachineRoleCache(userDataDir: string): MachineRoleCache | null {
  const file = cachePath(userDataDir);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<MachineRoleCache>;
    if (raw.role !== 'teacher' && raw.role !== 'student') return null;
    return {
      role: raw.role,
      roomId: raw.roomId ?? null,
      computerId: raw.computerId ?? null,
      reason: raw.reason ?? null,
      syncedAt: raw.syncedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveMachineRoleCache(
  userDataDir: string,
  cache: Omit<MachineRoleCache, 'syncedAt'> & { syncedAt?: string },
): MachineRoleCache {
  const dir = join(userDataDir, 'lab-mgmt');
  mkdirSync(dir, { recursive: true });
  const full: MachineRoleCache = {
    role: cache.role,
    roomId: cache.roomId,
    computerId: cache.computerId,
    reason: cache.reason,
    syncedAt: cache.syncedAt ?? new Date().toISOString(),
  };
  writeFileSync(cachePath(userDataDir), JSON.stringify(full, null, 2), 'utf8');
  return full;
}
