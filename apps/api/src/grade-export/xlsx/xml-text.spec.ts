import { colToIndex, decodeXml, encodeXml, indexToCol, parseRef, readAttr, readPrefixedAttr } from './xml-text';

describe('decodeXml / encodeXml', () => {
  it('decodes the five entities and numeric references', () => {
    expect(decodeXml('A &amp; B &lt;C&gt; &quot;d&quot; &apos;e&apos; &#65;&#x42;')).toBe('A & B <C> "d" \'e\' AB');
  });
  it('decodes Excel\'s _xHHHH_ control escapes, and only once', () => {
    expect(decodeXml('a_x000D_b')).toBe('a\rb');
    expect(decodeXml('_x005F_x000D_')).toBe('_x000D_');
  });
  it('leaves an unknown entity alone and drops an out-of-range code point', () => {
    expect(decodeXml('&nbsp;')).toBe('&nbsp;');
    expect(decodeXml('&#x110000;')).toBe('');
  });
  it('encodes markup characters and strips characters XML 1.0 forbids', () => {
    expect(encodeXml('=SUM(A1) & <b> "x"')).toBe('=SUM(A1) &amp; &lt;b&gt; &quot;x&quot;');
    expect(encodeXml('a\u0000b\u0008c')).toBe('abc');
  });
  it('round-trips Vietnamese text', () => {
    const text = 'Vắng — không có bài nộp';
    expect(decodeXml(encodeXml(text))).toBe(text);
  });
});

describe('column and reference helpers', () => {
  it.each([['A', 1], ['Z', 26], ['AA', 27], ['AZ', 52], ['BH', 60], ['XFD', 16384]])('%s ↔ %i', (letters, index) => {
    expect(colToIndex(letters as string)).toBe(index);
    expect(indexToCol(index as number)).toBe(letters);
  });
  it('parses a cell reference, and refuses anything else', () => {
    expect(parseRef('F12')).toEqual({ col: 6, row: 12 });
    expect(parseRef('AA1')).toEqual({ col: 27, row: 1 });
    for (const bad of ['', 'A', '12', 'A0', 'a1', 'F-1', 'ABCD1', 'A1:B2']) expect(parseRef(bad)).toBeNull();
  });
});

describe('attribute readers', () => {
  it('reads double- and single-quoted attributes and decodes them', () => {
    expect(readAttr(' r="A1" s=\'3\' name="A &amp; B"', 'r')).toBe('A1');
    expect(readAttr(' r="A1" s=\'3\'', 's')).toBe('3');
    expect(readAttr(' name="A &amp; B"', 'name')).toBe('A & B');
  });
  it('does not confuse an attribute with one that merely ends the same way', () => {
    expect(readAttr(' sheetId="2" r:id="rId1"', 'id')).toBeNull();
    expect(readAttr(' dyDescent="1" r="5"', 'r')).toBe('5');
  });
  it('reads a namespace-prefixed attribute whatever the prefix is', () => {
    expect(readPrefixedAttr(' name="S" sheetId="1" r:id="rId7"', 'id')).toBe('rId7');
    expect(readPrefixedAttr(' name="S" ns1:id="rId9"', 'id')).toBe('rId9');
    expect(readPrefixedAttr(' name="S" sheetId="1"', 'id')).toBeNull();
  });
});
