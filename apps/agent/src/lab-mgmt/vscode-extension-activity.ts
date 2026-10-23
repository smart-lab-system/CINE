import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type ExtensionActivityAction = 'install' | 'uninstall';

export interface ExtensionActivityEvent {
  action: ExtensionActivityAction;
  /** Đúng chuỗi trong log, giờ local, `YYYY-MM-DD HH:mm:ss.SSS`. */
  occurredAt: string;
  extensionId: string;
  version: string | null;
  /** Tên thư mục phiên, ví dụ `20261022T171030`. */
  sessionFolder: string;
  profileLocation: string | null;
}

export interface ExtensionActivityReadResult {
  ok: true;
  events: ExtensionActivityEvent[];
  filesRead: string[];
  warnings: { path: string; message: string }[];
}

export interface ExtensionActivityPayload {
  events: ExtensionActivityEvent[];
  warnings: { path: string; message: string }[];
}

function isActivityEvent(value: unknown): value is ExtensionActivityEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as ExtensionActivityEvent;
  return (
    (event.action === 'install' || event.action === 'uninstall') &&
    typeof event.occurredAt === 'string' &&
    typeof event.extensionId === 'string' &&
    (event.version === null || typeof event.version === 'string') &&
    typeof event.sessionFolder === 'string' &&
    (event.profileLocation === null || typeof event.profileLocation === 'string')
  );
}

function isWarning(value: unknown): value is { path: string; message: string } {
  if (!value || typeof value !== 'object') return false;
  const warning = value as { path?: unknown; message?: unknown };
  return typeof warning.path === 'string' && typeof warning.message === 'string';
}

/** Payload lệnh LAN. `null` khi thân không đúng dạng — Hub báo lỗi, không hiện nửa danh sách. */
export function extensionActivityFromPayload(payload: unknown): ExtensionActivityPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as { events?: unknown; warnings?: unknown };
  if (!Array.isArray(body.events)) return null;
  if (body.warnings !== undefined && !Array.isArray(body.warnings)) return null;
  const events: ExtensionActivityEvent[] = [];
  for (const item of body.events) {
    if (!isActivityEvent(item)) return null;
    events.push(item);
  }
  const warnings: { path: string; message: string }[] = [];
  if (Array.isArray(body.warnings)) {
    for (const item of body.warnings) {
      if (!isWarning(item)) return null;
      warnings.push(item);
    }
  }
  return { events, warnings };
}

const INFO_LINE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) \[info\] (.*)$/;
const INSTALL_OK = /^Extension installed successfully:\s+(\S+)(?:\s+(\S+))?$/;
const UNINSTALL_OK =
  /^Successfully uninstalled extension from the profile\s+([^\s@]+)@([^\s]+)(?:\s+(\S+))?$/;
const INSTALLING = /^Installing extension:\s+(\S+)/;
const RENAMED = /^Renamed to\s+(.+)$/;
const EXTRACTED = /^Extracted extension to\s+(\S+):\s+(\S+)\s*$/;
const SESSION_DIR = /^\d{8}T\d{6}$/;

interface PendingInstall {
  version: string | null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function localDay(now: Date): { folder: string; line: string } {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { folder: `${y}${m}${d}`, line: `${y}-${m}-${d}` };
}

function lastPathSegment(pathOrUri: string): string {
  const noQuery = pathOrUri.split('?')[0]?.split('#')[0] ?? pathOrUri;
  const parts = noQuery.split(/[/\\]/);
  return parts[parts.length - 1] ?? '';
}

/** Version là phần sau tiền tố `<extensionId>-`, không cắt theo dấu `-` cuối. */
function versionFromFolderName(folderName: string, extensionId: string): string | null {
  const prefix = `${extensionId}-`;
  if (!folderName.startsWith(prefix)) {
    return null;
  }
  const version = folderName.slice(prefix.length);
  return version.length > 0 ? version : null;
}

function matchPendingId(folderName: string, pending: Map<string, PendingInstall>): string | null {
  let best: string | null = null;
  for (const id of pending.keys()) {
    if (versionFromFolderName(folderName, id) === null) {
      continue;
    }
    if (best === null || id.length > best.length) {
      best = id;
    }
  }
  return best;
}

function keepLinesOnLocalDay(text: string, lineDay: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const date = /^(\d{4}-\d{2}-\d{2}) /.exec(line);
      return date !== null && date[1] === lineDay;
    })
    .join('\n');
}

function defaultLogsRoot(): string {
  return join(homedir(), 'AppData', 'Roaming', 'Code', 'logs');
}

/**
 * Parser thuần. Không lọc theo ngày — caller quyết định dòng nào được đưa vào.
 * `sessionFolder` gắn vào mỗi sự kiện.
 */
export function parseSharedProcessLog(text: string, sessionFolder: string): ExtensionActivityEvent[] {
  const pending = new Map<string, PendingInstall>();
  const events: ExtensionActivityEvent[] = [];

  for (const line of text.split(/\r?\n/)) {
    const info = INFO_LINE.exec(line);
    if (!info) {
      continue;
    }
    const occurredAt = info[1];
    const message = info[2];
    if (occurredAt === undefined || message === undefined) {
      continue;
    }

    const installing = INSTALLING.exec(message);
    if (installing?.[1]) {
      pending.set(installing[1], { version: null });
      continue;
    }

    const renamed = RENAMED.exec(message);
    if (renamed?.[1]) {
      const folderName = lastPathSegment(renamed[1].trim());
      const id = matchPendingId(folderName, pending);
      if (id) {
        const slot = pending.get(id);
        const version = versionFromFolderName(folderName, id);
        if (slot && version) {
          slot.version = version;
        }
      }
      continue;
    }

    const extracted = EXTRACTED.exec(message);
    if (extracted?.[1] && extracted[2]) {
      const id = extracted[2];
      const slot = pending.get(id);
      if (slot && slot.version === null) {
        const version = versionFromFolderName(lastPathSegment(extracted[1]), id);
        if (version) {
          slot.version = version;
        }
      }
      continue;
    }

    const installed = INSTALL_OK.exec(message);
    if (installed?.[1]) {
      const extensionId = installed[1];
      const slot = pending.get(extensionId);
      events.push({
        action: 'install',
        occurredAt,
        extensionId,
        version: slot?.version ?? null,
        sessionFolder,
        profileLocation: installed[2] ?? null,
      });
      pending.delete(extensionId);
      continue;
    }

    const uninstalled = UNINSTALL_OK.exec(message);
    if (uninstalled?.[1] && uninstalled[2]) {
      events.push({
        action: 'uninstall',
        occurredAt,
        extensionId: uninstalled[1],
        version: uninstalled[2],
        sessionFolder,
        profileLocation: uninstalled[3] ?? null,
      });
    }
  }

  return events;
}

export function readVscodeExtensionActivity(options?: {
  logsRoot?: string;
  now?: Date;
}): ExtensionActivityReadResult {
  const now = options?.now ?? new Date();
  const logsRoot = options?.logsRoot ?? defaultLogsRoot();
  const day = localDay(now);
  const empty: ExtensionActivityReadResult = { ok: true, events: [], filesRead: [], warnings: [] };

  if (!existsSync(logsRoot)) {
    return empty;
  }

  let folderNames: string[];
  try {
    folderNames = readdirSync(logsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && SESSION_DIR.test(entry.name) && entry.name.startsWith(day.folder))
      .map((entry) => entry.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  } catch (err) {
    return { ok: true, events: [], filesRead: [], warnings: [{ path: logsRoot, message: errorMessage(err) }] };
  }

  const events: ExtensionActivityEvent[] = [];
  const filesRead: string[] = [];
  const warnings: { path: string; message: string }[] = [];

  for (const sessionFolder of folderNames) {
    const filePath = join(logsRoot, sessionFolder, 'sharedprocess.log');
    let text: string;
    try {
      text = readFileSync(filePath, { encoding: 'utf8', flag: 'r' });
    } catch (err) {
      warnings.push({ path: filePath, message: errorMessage(err) });
      continue;
    }
    filesRead.push(filePath);
    events.push(...parseSharedProcessLog(keepLinesOnLocalDay(text, day.line), sessionFolder));
  }

  events.sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) {
      return a.occurredAt < b.occurredAt ? -1 : 1;
    }
    if (a.sessionFolder !== b.sessionFolder) {
      return a.sessionFolder < b.sessionFolder ? -1 : 1;
    }
    return 0;
  });

  return { ok: true, events, filesRead, warnings };
}
