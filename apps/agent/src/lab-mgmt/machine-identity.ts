import { createHash, randomUUID } from 'node:crypto';
import { hostname as osHostname, networkInterfaces, platform, release } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `machine_id` ổn định trên máy — spec §3.2.
 * Persist UUID lần đầu vào thư mục userData (Electron) hoặc đường dẫn inject (test).
 */
export function loadOrCreateMachineId(userDataDir: string): string {
  const dir = join(userDataDir, 'lab-mgmt');
  const file = join(dir, 'machine-id');
  if (existsSync(file)) {
    const existing = readFileSync(file, 'utf8').trim();
    if (existing.length > 0) {
      return existing;
    }
  }
  mkdirSync(dir, { recursive: true });
  const id = randomUUID();
  writeFileSync(file, id, 'utf8');
  return id;
}

/** Fallback khi không có file: hash hostname (không ổn định bằng UUID persist). */
export function deriveMachineIdFromHost(): string {
  return createHash('sha256').update(`${osHostname()}:${platform()}`).digest('hex').slice(0, 32);
}

export function getHostname(): string {
  return osHostname();
}

/** IPv4 không phải loopback — lấy địa chỉ LAN đầu tiên tìm thấy. */
export function getLocalIp(): string {
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return '127.0.0.1';
}

export function getOsLabel(): string {
  return `${platform()} ${release()}`;
}

export const APP_VERSION = '0.1.0';
