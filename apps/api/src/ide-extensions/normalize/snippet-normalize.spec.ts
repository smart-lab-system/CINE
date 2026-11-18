import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildNormalizedSourcesFromPackage,
  parseCodeSnippetsDocument,
  parsePackageSnippetsContributes,
  resolveSnippetContributePath,
  safeIdFromPrefix,
  SnippetNormalizeError,
  stripSnippetTabstops,
} from './snippet-normalize';

// apps/api/src/ide-extensions/normalize → repo root (5× ..)
const SAMPLE_ROOT = path.resolve(
  __dirname,
  '../../../../../sample extension/hungzazed01.react-bootstrap-kit-0.1.2-sample',
);

describe('stripSnippetTabstops', () => {
  it('replaces ${n:default} with default and drops bare tabstops', () => {
    expect(stripSnippetTabstops('Hello ${1:Name} $2 ${3}')).toBe('Hello Name  ');
  });
});

describe('safeIdFromPrefix', () => {
  it('sanitizes prefix for file-like ids', () => {
    expect(safeIdFromPrefix('ptgdud:footer')).toBe('ptgdud-footer');
    expect(safeIdFromPrefix('  ')).toBe('snippet');
  });
});

describe('resolveSnippetContributePath', () => {
  it('resolves relative path under extension/', () => {
    expect(resolveSnippetContributePath('./snippets/snippets.code-snippets')).toBe(
      'extension/snippets/snippets.code-snippets',
    );
  });

  it('rejects traversal', () => {
    expect(() => resolveSnippetContributePath('../evil')).toThrow(SnippetNormalizeError);
  });
});

describe('parsePackageSnippetsContributes', () => {
  it('reads sample package.json contributes.snippets', () => {
    const text = fs.readFileSync(
      path.join(SAMPLE_ROOT, 'extension', 'package.json'),
      'utf8',
    );
    const { packageName, contributes } = parsePackageSnippetsContributes(JSON.parse(text));
    expect(packageName).toBe('react-bootstrap-kit');
    expect(contributes).toEqual([
      { path: 'extension/snippets/snippets.code-snippets', language: null },
    ]);
  });

  it('keeps language when present', () => {
    const { contributes } = parsePackageSnippetsContributes({
      name: 'x',
      contributes: { snippets: [{ language: 'cpp', path: './snippets/a.code-snippets' }] },
    });
    expect(contributes[0]?.language).toBe('cpp');
  });
});

describe('parseCodeSnippetsDocument + sample fixture', () => {
  it('extracts prefixes from sample snippets.code-snippets', () => {
    const text = fs.readFileSync(
      path.join(SAMPLE_ROOT, 'extension', 'snippets', 'snippets.code-snippets'),
      'utf8',
    );
    const { items } = parseCodeSnippetsDocument(JSON.parse(text), {
      path: 'extension/snippets/snippets.code-snippets',
      language: null,
      stripTabstops: true,
    });
    const prefixes = items.map((i) => i.prefix);
    expect(prefixes).toEqual(
      expect.arrayContaining(['ptgdud:footer', 'ptgdud:header', 'ptgdud:app']),
    );
    const footer = items.find((i) => i.prefix === 'ptgdud:footer');
    expect(footer?.content).toContain('const Footer');
    expect(footer?.content).not.toMatch(/\$\{\d+:/);
    expect(footer?.id).toBe('ptgdud-footer');
  });
});

describe('buildNormalizedSourcesFromPackage', () => {
  it('end-to-end from sample package + loader', () => {
    const pkg = fs.readFileSync(path.join(SAMPLE_ROOT, 'extension', 'package.json'), 'utf8');
    const result = buildNormalizedSourcesFromPackage(pkg, (rel) => {
      expect(rel).toBe('extension/snippets/snippets.code-snippets');
      return fs.readFileSync(path.join(SAMPLE_ROOT, ...rel.split('/')));
    });
    expect(result.mode).toBe('snippets');
    expect(result.packageName).toBe('react-bootstrap-kit');
    expect(result.items.length).toBeGreaterThan(10);
  });

  it('returns mode none when no contributes.snippets', () => {
    const result = buildNormalizedSourcesFromPackage(
      JSON.stringify({ name: 'plain', contributes: {} }),
      () => {
        throw new Error('should not load');
      },
    );
    expect(result).toEqual({ mode: 'none', packageName: 'plain', items: [] });
  });
});
