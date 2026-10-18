import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanVscodeExtensions } from './vscode-extensions-scan';

describe('scanVscodeExtensions', () => {
  it('reads publisher.name from package.json under extension dirs', () => {
    const root = join(tmpdir(), `cine-ext-scan-${Date.now()}`);
    const extDir = join(root, 'ms-python.python-2024.0.0');
    mkdirSync(extDir, { recursive: true });
    writeFileSync(
      join(extDir, 'package.json'),
      JSON.stringify({
        publisher: 'ms-python',
        name: 'python',
        version: '2024.0.0',
        displayName: 'Python',
      }),
    );

    const result = scanVscodeExtensions([root]);
    expect(result.ok).toBe(true);
    expect(result.extensions).toEqual([
      {
        extensionId: 'ms-python.python',
        version: '2024.0.0',
        displayName: 'Python',
      },
    ]);
  });

  it('fails clearly when no extension directory exists', () => {
    const result = scanVscodeExtensions([join(tmpdir(), `missing-${Date.now()}`)]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Không tìm thấy/);
  });
});
