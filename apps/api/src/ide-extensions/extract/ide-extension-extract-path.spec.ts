import {
  sanitizeExtractRelativePath,
  UnsafeExtractPathError,
} from './ide-extension-extract-path';

describe('sanitizeExtractRelativePath', () => {
  it('normalizes backslashes and strips trailing slash', () => {
    expect(sanitizeExtractRelativePath('extension\\package.json')).toBe('extension/package.json');
    expect(sanitizeExtractRelativePath('extension/')).toBe('extension');
  });

  it('allows typical VSIX names including brackets', () => {
    expect(sanitizeExtractRelativePath('[Content_Types].xml')).toBe('[Content_Types].xml');
  });

  it.each([
    ['../etc/passwd', 'traversal'],
    ['a/../../b', 'nested traversal'],
    ['/abs', 'absolute'],
    ['C:/windows', 'drive'],
    ['a/\0/b', 'null byte'],
  ])('rejects %s (%s)', (path) => {
    expect(() => sanitizeExtractRelativePath(path)).toThrow(UnsafeExtractPathError);
  });
});
