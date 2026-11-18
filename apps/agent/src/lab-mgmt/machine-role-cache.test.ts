import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { loadMachineRoleCache, saveMachineRoleCache } from './machine-role-cache';

describe('machine-role-cache', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it('round-trips teacher role', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cine-role-'));
    dirs.push(dir);
    saveMachineRoleCache(dir, {
      role: 'teacher',
      roomId: 'room-1',
      computerId: 'pc-1',
      reason: 'teacher_machine',
    });
    const loaded = loadMachineRoleCache(dir);
    expect(loaded?.role).toBe('teacher');
    expect(loaded?.roomId).toBe('room-1');
  });

  it('returns null when missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cine-role-'));
    dirs.push(dir);
    expect(loadMachineRoleCache(dir)).toBeNull();
  });
});
