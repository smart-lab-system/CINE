import { mergeUsage, totalOf, UNATTRIBUTED, UsageSink } from './usage-sink';

describe('UsageSink', () => {
  it('cộng dồn token theo từng model', () => {
    const sink = new UsageSink();
    sink.add('A', { inputTokens: 100, outputTokens: 20 });
    sink.add('A', { inputTokens: 10, outputTokens: 5 });
    sink.add('B', { inputTokens: 1, outputTokens: 2 });
    expect(sink.snapshot()).toEqual({
      A: { inputTokens: 110, outputTokens: 25 },
      B: { inputTokens: 1, outputTokens: 2 },
    });
  });

  it('snapshot là bản sao: thêm sau đó không làm đổi bản đã chụp', () => {
    const sink = new UsageSink();
    sink.add('A', { inputTokens: 1, outputTokens: 1 });
    const first = sink.snapshot();
    sink.add('A', { inputTokens: 5, outputTokens: 5 });
    expect(first).toEqual({ A: { inputTokens: 1, outputTokens: 1 } });
  });

  it('hai sink độc lập không lẫn nhau', () => {
    const a = new UsageSink();
    const b = new UsageSink();
    a.add('A', { inputTokens: 7, outputTokens: 7 });
    expect(b.snapshot()).toEqual({});
  });

  it('UNATTRIBUTED là khoá thường, cộng như mọi model khác', () => {
    const sink = new UsageSink();
    sink.add(UNATTRIBUTED, { inputTokens: 3, outputTokens: 1 });
    expect(sink.snapshot()[UNATTRIBUTED]).toEqual({ inputTokens: 3, outputTokens: 1 });
  });
});

describe('mergeUsage / totalOf', () => {
  it('mergeUsage cộng theo model qua nhiều phần và không sửa đầu vào', () => {
    const p1 = { A: { inputTokens: 1, outputTokens: 2 } };
    const p2 = { A: { inputTokens: 10, outputTokens: 20 }, B: { inputTokens: 5, outputTokens: 5 } };
    expect(mergeUsage(p1, p2)).toEqual({
      A: { inputTokens: 11, outputTokens: 22 },
      B: { inputTokens: 5, outputTokens: 5 },
    });
    expect(p1).toEqual({ A: { inputTokens: 1, outputTokens: 2 } });
  });

  it('mergeUsage không có phần nào → rỗng', () => {
    expect(mergeUsage()).toEqual({});
  });

  it('totalOf cộng mọi model', () => {
    expect(totalOf({ A: { inputTokens: 1, outputTokens: 2 }, B: { inputTokens: 10, outputTokens: 20 } })).toEqual({
      inputTokens: 11,
      outputTokens: 22,
    });
    expect(totalOf({})).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
