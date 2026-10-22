import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebStream } from 'node:stream/web';
import type { MachineComparison } from './hub-actions';

/** Thư mục cố định trong Downloads để lần sau nhận ra file đã tải. */
export const VSIX_DOWNLOAD_FOLDER = 'cine-vsix';

export type VsixDownloadStatus = 'downloaded' | 'already' | 'failed';

export interface ViolationVsixTarget {
  extensionId: string;
  version: string;
  displayName?: string;
  machines: string[];
}

export interface VsixDownloadEntry {
  extensionId: string;
  version: string;
  displayName?: string;
  machines: string[];
  fileName: string;
  status: VsixDownloadStatus;
  error?: string;
}

export interface VsixDownloadReport {
  folder: string;
  entries: VsixDownloadEntry[];
}

const PACKAGE_URL =
  'https://marketplace.visualstudio.com/_apis/public/gallery/publishers';

function machineLabel(row: MachineComparison): string {
  return row.studentMssv.trim() || row.hostname;
}

/**
 * Gộp extension bị chặn trên mọi máy. Cùng id và cùng version chỉ tải một lần.
 * Khác version thì là hai gói — đúng bản đang cài trên máy sinh viên.
 */
export function collectViolationVsixTargets(comparisons: MachineComparison[]): ViolationVsixTarget[] {
  const byKey = new Map<string, ViolationVsixTarget>();
  for (const machine of comparisons) {
    const label = machineLabel(machine);
    for (const row of machine.rows) {
      if (row.verdict !== 'blocked') continue;
      const key = `${row.extensionId}\0${row.version}`;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.machines.includes(label)) existing.machines.push(label);
        if (!existing.displayName && row.displayName) existing.displayName = row.displayName;
        continue;
      }
      byKey.set(key, {
        extensionId: row.extensionId,
        version: row.version,
        displayName: row.displayName,
        machines: [label],
      });
    }
  }
  return [...byKey.values()]
    .map((target) => ({ ...target, machines: [...target.machines].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.extensionId.localeCompare(b.extensionId) || a.version.localeCompare(b.version));
}

export function vsixPackageUrl(extensionId: string, version: string): string | null {
  const dot = extensionId.indexOf('.');
  if (dot <= 0 || dot === extensionId.length - 1) return null;
  if (!version.trim()) return null;
  const publisher = encodeURIComponent(extensionId.slice(0, dot));
  const name = encodeURIComponent(extensionId.slice(dot + 1));
  const ver = encodeURIComponent(version.trim());
  return `${PACKAGE_URL}/${publisher}/vsextensions/${name}/${ver}/vspackage`;
}

export function vsixFileName(extensionId: string, version: string): string {
  const raw = `${extensionId}-${version}.vsix`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  return basename(raw) === raw ? raw : 'extension.vsix';
}

async function fileReady(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

async function downloadOne(
  target: ViolationVsixTarget,
  folder: string,
  fetchImpl: typeof fetch,
): Promise<VsixDownloadEntry> {
  const fileName = vsixFileName(target.extensionId, target.version);
  const dest = join(folder, fileName);
  const base = {
    extensionId: target.extensionId,
    version: target.version,
    displayName: target.displayName,
    machines: target.machines,
    fileName,
  };
  if (await fileReady(dest)) {
    return { ...base, status: 'already' };
  }
  const url = vsixPackageUrl(target.extensionId, target.version);
  if (!url) {
    return { ...base, status: 'failed', error: 'Không có publisher.name hoặc phiên bản để tải.' };
  }
  const partial = `${dest}.partial`;
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: 'application/octet-stream' },
      redirect: 'follow',
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok || !res.body) {
      return { ...base, status: 'failed', error: `Marketplace trả HTTP ${res.status}.` };
    }
    await pipeline(Readable.fromWeb(res.body as unknown as NodeWebStream), createWriteStream(partial));
    const written = await stat(partial);
    if (!written.isFile() || written.size === 0) {
      await unlink(partial).catch(() => undefined);
      return { ...base, status: 'failed', error: 'File tải về rỗng.' };
    }
    await rename(partial, dest);
    return { ...base, status: 'downloaded' };
  } catch (err) {
    await unlink(partial).catch(() => undefined);
    return {
      ...base,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function downloadViolationVsixFiles(input: {
  comparisons: MachineComparison[];
  downloadsDir: string;
  fetchImpl?: typeof fetch;
}): Promise<VsixDownloadReport> {
  const folder = join(input.downloadsDir, VSIX_DOWNLOAD_FOLDER);
  const targets = collectViolationVsixTargets(input.comparisons);
  if (targets.length === 0) {
    return { folder, entries: [] };
  }
  await mkdir(folder, { recursive: true });
  const fetchImpl = input.fetchImpl ?? fetch;
  const entries: VsixDownloadEntry[] = [];
  for (const target of targets) {
    entries.push(await downloadOne(target, folder, fetchImpl));
  }
  return { folder, entries };
}
