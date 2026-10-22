import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MachineComparison } from './hub-actions';
import { collectViolationVsixTargets, downloadViolationVsixFiles, VSIX_DOWNLOAD_FOLDER } from './violation-vsix';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function machine(
  label: string,
  rows: MachineComparison['rows'],
): MachineComparison {
  return {
    machineId: label,
    studentMssv: label,
    hostname: `${label}-pc`,
    rows,
    extensionCount: rows.length,
    violationCount: rows.filter((row) => row.verdict === 'blocked').length,
    status: rows.some((row) => row.verdict === 'blocked') ? 'has_violations' : 'clean',
  };
}

describe('collectViolationVsixTargets', () => {
  it('keeps one file per extension version across every student machine', () => {
    const targets = collectViolationVsixTargets([
      machine('SV1', [
        { extensionId: 'evil.tool', version: '1.0.0', verdict: 'blocked', matchedScope: null },
        { extensionId: 'ok.ext', version: '2.0.0', verdict: 'allowed', matchedScope: 'global' },
      ]),
      machine('SV2', [
        { extensionId: 'evil.tool', version: '1.0.0', verdict: 'blocked', matchedScope: null },
        { extensionId: 'evil.tool', version: '1.2.0', verdict: 'blocked', matchedScope: null },
      ]),
    ]);

    expect(targets).toEqual([
      { extensionId: 'evil.tool', version: '1.0.0', displayName: undefined, machines: ['SV1', 'SV2'] },
      { extensionId: 'evil.tool', version: '1.2.0', displayName: undefined, machines: ['SV2'] },
    ]);
  });
});

describe('downloadViolationVsixFiles', () => {
  it('writes a new vsix and skips the file on the next run', async () => {
    const downloads = mkdtempSync(join(tmpdir(), 'cine-vsix-dl-'));
    roots.push(downloads);
    const comparisons = [
      machine('SV1', [
        { extensionId: 'evil.tool', version: '1.4.5', verdict: 'blocked', matchedScope: null },
      ]),
    ];
    const fetchImpl = vi.fn(async () => new Response(Uint8Array.from([1, 2, 3, 4]), { status: 200 }));

    const first = await downloadViolationVsixFiles({ comparisons, downloadsDir: downloads, fetchImpl });
    const second = await downloadViolationVsixFiles({ comparisons, downloadsDir: downloads, fetchImpl });

    expect(first.folder).toBe(join(downloads, VSIX_DOWNLOAD_FOLDER));
    expect(first.entries).toMatchObject([{ extensionId: 'evil.tool', version: '1.4.5', status: 'downloaded' }]);
    expect(second.entries).toMatchObject([{ status: 'already', fileName: 'evil.tool-1.4.5.vsix' }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('marks an existing file as already downloaded without calling Marketplace', async () => {
    const downloads = mkdtempSync(join(tmpdir(), 'cine-vsix-had-'));
    roots.push(downloads);
    const folder = join(downloads, VSIX_DOWNLOAD_FOLDER);
    const { mkdirSync } = await import('node:fs');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'evil.tool-1.0.0.vsix'), 'already');
    const fetchImpl = vi.fn();

    const report = await downloadViolationVsixFiles({
      comparisons: [
        machine('SV9', [
          { extensionId: 'evil.tool', version: '1.0.0', verdict: 'blocked', matchedScope: null },
        ]),
      ],
      downloadsDir: downloads,
      fetchImpl,
    });

    expect(report.entries[0]?.status).toBe('already');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('records a failed download and still returns the other packages', async () => {
    const downloads = mkdtempSync(join(tmpdir(), 'cine-vsix-fail-'));
    roots.push(downloads);
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/publishers/missing/')) return new Response('nope', { status: 404 });
      return new Response(Uint8Array.from([9]), { status: 200 });
    });

    const report = await downloadViolationVsixFiles({
      comparisons: [
        machine('SV1', [
          { extensionId: 'missing.ext', version: '0.1.0', verdict: 'blocked', matchedScope: null },
          { extensionId: 'good.ext', version: '2.0.0', verdict: 'blocked', matchedScope: null },
        ]),
      ],
      downloadsDir: downloads,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(report.entries.map((entry) => [entry.extensionId, entry.status])).toEqual([
      ['good.ext', 'downloaded'],
      ['missing.ext', 'failed'],
    ]);
    expect(report.entries.find((entry) => entry.status === 'failed')?.error).toMatch(/404/);
  });
});
