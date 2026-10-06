import { attachSimilar, type NewEntry } from './import-similar';
import { blankRow, type ImportRowResult } from './import.types';

function rowsFor(entries: NewEntry[]): ImportRowResult[] {
  const results: ImportRowResult[] = [];
  for (const entry of entries) {
    results[entry.index] = { ...blankRow(entry.line, entry.name), status: 'new' };
  }
  return results;
}

describe('attachSimilar', () => {
  const existing = [
    { id: 'r1', name: 'Phòng máy A1' },
    { id: 'r2', name: 'Phòng máy B1' },
    { id: 'r3', name: 'Phòng H3.03' },
  ];

  it('mục mới gần giống mục có sẵn: ghi id, tên, lý do và nguồn', () => {
    const news = [{ index: 0, line: 2, name: 'Phong H303' }];
    const results = rowsFor(news);
    attachSimilar(results, news, existing);
    expect(results[0].similar).toEqual([
      { id: 'r3', name: 'Phòng H3.03', reason: 'normalized', source: 'existing', line: null },
    ]);
  });

  it('KHÔNG cảnh báo các cặp thật khác nhau: A1/B1 và mọi phòng khác tên (Review Focus 4)', () => {
    const news = [
      { index: 0, line: 2, name: 'Phòng máy C1' },
      { index: 1, line: 3, name: 'Phòng máy A2' },
    ];
    const results = rowsFor(news);
    attachSimilar(results, news, existing);
    expect(results[0].similar).toEqual([]);
    expect(results[1].similar).toEqual([]);
  });

  it('hai mục MỚI gần giống nhau trong cùng file: cả hai được đánh dấu, nguồn là file kèm số dòng', () => {
    const news = [
      { index: 0, line: 2, name: 'P.A101' },
      { index: 1, line: 3, name: 'P A101' },
    ];
    const results = rowsFor(news);
    attachSimilar(results, news, []);
    expect(results[0].similar).toEqual([
      { id: null, name: 'P A101', reason: 'normalized', source: 'file', line: 3 },
    ]);
    expect(results[1].similar).toEqual([
      { id: null, name: 'P.A101', reason: 'normalized', source: 'file', line: 2 },
    ]);
  });

  it('một mục có thể gần giống cả mục có sẵn lẫn mục trong file', () => {
    const news = [
      { index: 0, line: 2, name: 'Phong H303' },
      { index: 1, line: 3, name: 'Phòng H3-03' },
    ];
    const results = rowsFor(news);
    attachSimilar(results, news, existing);
    expect(results[0].similar.map((s) => [s.source, s.name])).toEqual([
      ['existing', 'Phòng H3.03'],
      ['file', 'Phòng H3-03'],
    ]);
  });

  it('mục không gần giống ai nhận mảng rỗng, không phải undefined', () => {
    const news = [{ index: 0, line: 2, name: 'Giảng đường lớn' }];
    const results = rowsFor(news);
    attachSimilar(results, news, existing);
    expect(results[0].similar).toEqual([]);
  });
});
