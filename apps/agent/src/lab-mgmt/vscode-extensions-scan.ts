import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface ScannedExtension {
  extensionId: string;
  version: string;
  displayName?: string;
}

export interface ScanResult {
  ok: boolean;
  error?: string;
  extensions: ScannedExtension[];
  vscodeVersion?: string;
  scannedPaths: string[];
}

/** Các thư mục extensions phổ biến trên Windows / cross-platform. */
export function defaultExtensionDirs(home = homedir()): string[] {
  return [
    join(home, '.vscode', 'extensions'),
    join(home, '.vscode-insiders', 'extensions'),
    // Portable / user-level Windows install variants
    join(home, 'AppData', 'Roaming', 'Code', 'User', 'extensions'),
  ];
}

function readPackageJson(dir: string): {
  publisher?: string;
  name?: string;
  version?: string;
  displayName?: string;
} | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      publisher?: string;
      name?: string;
      version?: string;
      displayName?: string;
    };
  } catch {
    return null;
  }
}

/**
 * Quét thư mục extensions — mỗi thư mục con có package.json hợp lệ
 * thành một entry `publisher.name`.
 */
export function scanVscodeExtensions(dirs: string[] = defaultExtensionDirs()): ScanResult {
  const found = new Map<string, ScannedExtension>();
  const scannedPaths: string[] = [];
  let anyDirExists = false;

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      continue;
    }
    anyDirExists = true;
    scannedPaths.push(dir);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (err) {
      return {
        ok: false,
        error: `Không đọc được thư mục ${dir}: ${err instanceof Error ? err.message : String(err)}`,
        extensions: [],
        scannedPaths,
      };
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      const pkg = readPackageJson(full);
      if (!pkg?.publisher || !pkg?.name) {
        continue;
      }
      const extensionId = `${pkg.publisher}.${pkg.name}`;
      found.set(extensionId, {
        extensionId,
        version: pkg.version ?? '0.0.0',
        displayName: pkg.displayName,
      });
    }
  }

  if (!anyDirExists) {
    return {
      ok: false,
      error:
        'Không tìm thấy thư mục extensions VS Code (.vscode/extensions). Kiểm tra VS Code đã cài trên máy này.',
      extensions: [],
      scannedPaths,
    };
  }

  return {
    ok: true,
    extensions: [...found.values()].sort((a, b) => a.extensionId.localeCompare(b.extensionId)),
    scannedPaths,
  };
}
