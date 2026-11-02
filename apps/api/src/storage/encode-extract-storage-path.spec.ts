import {
  encodeExtractStoragePath,
  encodeExtractStorageSegment,
} from './storage.types';

describe('encodeExtractStorageSegment', () => {
  it('leaves SAFE_KEY alphabet unchanged', () => {
    expect(encodeExtractStorageSegment('package.json')).toBe('package.json');
    expect(encodeExtractStorageSegment('extension_v1')).toBe('extension_v1');
  });

  it('bang-hex-encodes brackets used by VSIX [Content_Types].xml', () => {
    // Supabase rejects both `[` `]` and `%` — cannot use percent-encoding.
    expect(encodeExtractStorageSegment('[Content_Types].xml')).toBe(
      '!5BContent_Types!5D.xml',
    );
  });

  it('bang-hex-encodes spaces, bang, and UTF-8 bytes', () => {
    expect(encodeExtractStorageSegment('a b')).toBe('a!20b');
    expect(encodeExtractStorageSegment('a!b')).toBe('a!21b');
    expect(encodeExtractStorageSegment('á')).toBe('!C3!A1');
  });

  it('stays within Supabase isValidKey character class', () => {
    const key = `ide-extensions/x/y/extracted/${encodeExtractStorageSegment('[Content_Types].xml')}`;
    expect(/^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/.test(key)).toBe(true);
  });
});

describe('encodeExtractStoragePath', () => {
  it('encodes each segment independently', () => {
    expect(encodeExtractStoragePath('dir/[Content_Types].xml')).toBe(
      'dir/!5BContent_Types!5D.xml',
    );
  });
});
