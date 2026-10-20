import { parseRulerResponse, RULER_OUTPUT_SCHEMA } from './ruler-prompt';

type Node = Record<string, unknown>;

/** Mọi nút object (`type: 'object'`) trong schema, duyệt đệ quy. */
function objectNodes(node: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    node.forEach((child) => objectNodes(child, out));
  } else if (node !== null && typeof node === 'object') {
    const n = node as Node;
    if (n.type === 'object') out.push(n);
    Object.values(n).forEach((child) => objectNodes(child, out));
  }
  return out;
}

/** Mọi từ khoá xuất hiện ở bất kỳ tầng nào của schema. */
function allKeys(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((child) => allKeys(child, out));
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Node)) {
      out.push(key);
      allKeys(value, out);
    }
  }
  return out;
}

describe('RULER_OUTPUT_SCHEMA (khuôn structured outputs)', () => {
  it('mọi object đều additionalProperties: false và liệt kê đủ mọi trường trong required', () => {
    const objects = objectNodes(RULER_OUTPUT_SCHEMA);

    expect(objects).toHaveLength(3); // gốc, examples[], cases[]
    for (const o of objects) {
      expect(o.additionalProperties).toBe(false);
      expect(Object.keys(o.properties as Node).sort()).toEqual([...(o.required as string[])].sort());
    }
  });

  it('không dùng ràng buộc số hay độ dài mà structured outputs không nhận (zod kiểm phần đó)', () => {
    const FORBIDDEN = ['minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum', 'multipleOf', 'pattern'];

    expect(allKeys(RULER_OUTPUT_SCHEMA).filter((k) => FORBIDDEN.includes(k))).toEqual([]);
  });

  it('một đề xuất đúng khuôn schema đi qua parseRulerResponse, cả hai chế độ', () => {
    const statementMode = JSON.stringify({
      modelAnswer: 'int main() { std::cout << "Xin chào"; }',
      examples: [],
      cases: [{ name: 'c1', group: 'co_ban', input: '1\n', quote: 'Cho n', answerIsUnique: true }],
    });
    const answerMode = JSON.stringify({
      modelAnswer: null,
      examples: [],
      cases: [{ name: 'c1', group: 'co_ban', input: '1\n', quote: 'Cho n', answerIsUnique: true }],
    });

    expect(parseRulerResponse(statementMode, 'statement').modelAnswer).toBe('int main() { std::cout << "Xin chào"; }');
    expect(parseRulerResponse(answerMode, 'answer').modelAnswer).toBeNull();
  });
});
