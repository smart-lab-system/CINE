import { describe, expect, it } from 'vitest';
import { tellApart } from './tell-apart';

interface Item {
  label: string | null;
  term: string;
}
const run = (items: Item[]) =>
  tellApart(
    items,
    (i) => i.label,
    (i, label) => {
      i.label = label;
    },
    (i) => i.term,
  );

describe('tellApart', () => {
  it('nhãn không trùng thì KHÔNG đổi gì — nhãn gọn là mặc định', () => {
    const items: Item[] = [
      { label: 'A', term: 'HK1' },
      { label: 'B', term: 'HK2' },
    ];
    run(items);
    expect(items.map((i) => i.label)).toEqual(['A', 'B']);
  });

  it('chỉ những phần tử có nhãn TRÙNG mới được gắn hậu tố', () => {
    const items: Item[] = [
      { label: 'A', term: 'HK1' },
      { label: 'A', term: 'HK2' },
      { label: 'B', term: 'HK1' },
    ];
    run(items);
    expect(items.map((i) => i.label)).toEqual(['A · HK1', 'A · HK2', 'B']);
  });

  it('nhãn null không tính là trùng và không bị đổi', () => {
    const items: Item[] = [
      { label: null, term: 'HK1' },
      { label: null, term: 'HK2' },
    ];
    run(items);
    expect(items.map((i) => i.label)).toEqual([null, null]);
  });

  it('danh sách rỗng hoặc một phần tử không nổ', () => {
    expect(() => run([])).not.toThrow();
    const one: Item[] = [{ label: 'A', term: 'HK1' }];
    run(one);
    expect(one[0].label).toBe('A');
  });

  it('đếm nhãn TRƯỚC khi đổi: gắn hậu tố cho phần tử đầu không làm phần tử sau hết "trùng"', () => {
    const items: Item[] = [
      { label: 'A', term: 'x' },
      { label: 'A', term: 'y' },
      { label: 'A', term: 'z' },
    ];
    run(items);
    expect(items.map((i) => i.label)).toEqual(['A · x', 'A · y', 'A · z']);
  });
});
