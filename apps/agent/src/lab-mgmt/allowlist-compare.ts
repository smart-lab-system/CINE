import type { ScannedExtension } from './vscode-extensions-scan';

export type MatchedScope = 'global' | 'course';
export type ExtensionVerdict = 'allowed' | 'blocked';
export type EffectiveMatch = 'wildcard' | 'exact' | 'any';

export interface EffectiveExtension {
  extensionId: string;
  scope: MatchedScope;
  /** Spec §6.1a — thiếu match → treat as `any` (tương thích payload cũ). */
  match?: EffectiveMatch;
  version?: string | null;
}

export interface ComparedExtension {
  extensionId: string;
  version: string;
  displayName?: string;
  verdict: ExtensionVerdict;
  matchedScope: MatchedScope | null;
}

function ruleMatches(rule: EffectiveExtension, installedVersion: string): boolean {
  const match = rule.match ?? 'any';
  if (match === 'wildcard' || match === 'any') return true;
  if (match === 'exact') return (rule.version ?? '') === installedVersion;
  return false;
}

/**
 * Spec §6.1a + §6.2: exact / wildcard (*) / course any; ưu tiên matched_scope = global.
 */
export function compareInventory(
  inventory: ScannedExtension[],
  effective: EffectiveExtension[],
): ComparedExtension[] {
  return inventory.map((ext) => {
    const candidates = effective.filter((r) => r.extensionId === ext.extensionId);
    const globalHit = candidates.find(
      (r) => r.scope === 'global' && ruleMatches(r, ext.version),
    );
    if (globalHit) {
      return {
        extensionId: ext.extensionId,
        version: ext.version,
        displayName: ext.displayName,
        verdict: 'allowed' as const,
        matchedScope: 'global' as const,
      };
    }
    const courseHit = candidates.find(
      (r) => r.scope === 'course' && ruleMatches(r, ext.version),
    );
    if (courseHit) {
      return {
        extensionId: ext.extensionId,
        version: ext.version,
        displayName: ext.displayName,
        verdict: 'allowed' as const,
        matchedScope: 'course' as const,
      };
    }
    return {
      extensionId: ext.extensionId,
      version: ext.version,
      displayName: ext.displayName,
      verdict: 'blocked' as const,
      matchedScope: null,
    };
  });
}

export function summarizeComparisons(rows: ComparedExtension[]): {
  extensionCount: number;
  violationCount: number;
  status: 'clean' | 'has_violations';
} {
  const violationCount = rows.filter((r) => r.verdict === 'blocked').length;
  return {
    extensionCount: rows.length,
    violationCount,
    status: violationCount > 0 ? 'has_violations' : 'clean',
  };
}
