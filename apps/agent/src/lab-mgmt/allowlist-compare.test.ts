import { describe, expect, it } from 'vitest';
import { compareInventory, summarizeComparisons } from './allowlist-compare';

describe('compareInventory', () => {
  it('marks global and course as allowed; others blocked', () => {
    const rows = compareInventory(
      [
        { extensionId: 'ms-python.python', version: '1' },
        { extensionId: 'evil.copilot', version: '2' },
        { extensionId: 'ms-vscode.cpptools', version: '3' },
      ],
      [
        { extensionId: 'ms-python.python', scope: 'global', match: 'any' },
        { extensionId: 'ms-vscode.cpptools', scope: 'course', match: 'any' },
      ],
    );
    expect(rows.find((r) => r.extensionId === 'ms-python.python')).toMatchObject({
      verdict: 'allowed',
      matchedScope: 'global',
    });
    expect(rows.find((r) => r.extensionId === 'ms-vscode.cpptools')).toMatchObject({
      verdict: 'allowed',
      matchedScope: 'course',
    });
    expect(rows.find((r) => r.extensionId === 'evil.copilot')).toMatchObject({
      verdict: 'blocked',
      matchedScope: null,
    });
  });

  it('prefers global when both scopes list the same id', () => {
    const rows = compareInventory(
      [{ extensionId: 'a.b', version: '1' }],
      [
        { extensionId: 'a.b', scope: 'course', match: 'any' },
        { extensionId: 'a.b', scope: 'global', match: 'any' },
      ],
    );
    expect(rows[0].matchedScope).toBe('global');
  });

  it('exact match only allows that version', () => {
    const rows = compareInventory(
      [
        { extensionId: 'ms-python.python', version: '1.2.3' },
        { extensionId: 'ms-python.python', version: '1.2.4' },
      ],
      [
        {
          extensionId: 'ms-python.python',
          scope: 'global',
          match: 'exact',
          version: '1.2.3',
        },
      ],
    );
    expect(rows[0]).toMatchObject({ version: '1.2.3', verdict: 'allowed' });
    expect(rows[1]).toMatchObject({ version: '1.2.4', verdict: 'blocked' });
  });

  it('wildcard * allows every version', () => {
    const rows = compareInventory(
      [
        { extensionId: 'ms-python.python', version: '1.2.3' },
        { extensionId: 'ms-python.python', version: '9.9.9' },
      ],
      [
        {
          extensionId: 'ms-python.python',
          scope: 'global',
          match: 'wildcard',
          version: '*',
        },
      ],
    );
    expect(rows.every((r) => r.verdict === 'allowed' && r.matchedScope === 'global')).toBe(
      true,
    );
  });

  it('summarizes violations', () => {
    const summary = summarizeComparisons([
      {
        extensionId: 'a',
        version: '1',
        verdict: 'allowed',
        matchedScope: 'global',
      },
      {
        extensionId: 'b',
        version: '1',
        verdict: 'blocked',
        matchedScope: null,
      },
    ]);
    expect(summary).toEqual({
      extensionCount: 2,
      violationCount: 1,
      status: 'has_violations',
    });
  });
});
