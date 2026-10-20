import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema';
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

/**
 * Một instance tối thiểu đúng khuôn: mỗi trường bắt buộc một giá trị, mỗi mảng đúng một phần tử. Sinh TỪ schema: nếu zod đòi một
 * trường mà schema không có, instance thiếu trường đó và parser đỏ ngay trong test, không chờ đến lượt chạy thật.
 */
function sampleOf(schema: Node, pickNull: boolean): unknown {
  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf as Node[];
    const hit = branches.find((b) => (b.type === 'null') === pickNull);
    if (!hit) throw new Error(`anyOf thiếu nhánh ${pickNull ? 'null' : 'không-null'}`);
    return sampleOf(hit, pickNull);
  }
  switch (schema.type) {
    case 'object': {
      const props = schema.properties as Record<string, Node>;
      return Object.fromEntries((schema.required as string[]).map((k) => [k, sampleOf(props[k], pickNull)]));
    }
    case 'array':
      return [sampleOf(schema.items as Node, pickNull)];
    case 'string':
      return 'x';
    case 'boolean':
      return true;
    case 'null':
      return null;
    default:
      throw new Error(`kiểu chưa hỗ trợ trong khuôn: ${String(schema.type)}`);
  }
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

  it('theo bộ lọc của SDK, không từ khoá nào bị loại khỏi schema', () => {
    expect(transformJSONSchema(RULER_OUTPUT_SCHEMA)).toEqual(RULER_OUTPUT_SCHEMA);
  });

  it('instance sinh từ chính schema đi qua parseRulerResponse, cả hai chế độ', () => {
    const statement = parseRulerResponse(JSON.stringify(sampleOf(RULER_OUTPUT_SCHEMA, false)), 'statement');
    const answer = parseRulerResponse(JSON.stringify(sampleOf(RULER_OUTPUT_SCHEMA, true)), 'answer');

    expect(statement.modelAnswer).toBe('x');
    expect(statement.cases).toHaveLength(1);
    expect(answer.modelAnswer).toBeNull();
  });

  it('khuôn thiếu nhánh null của modelAnswer thì sinh instance ném lỗi, không rơi âm thầm về string', () => {
    const noNullBranch = {
      ...RULER_OUTPUT_SCHEMA,
      properties: { ...(RULER_OUTPUT_SCHEMA.properties as Node), modelAnswer: { anyOf: [{ type: 'string' }] } },
    };

    expect(() => sampleOf(noNullBranch, true)).toThrow(/anyOf thiếu nhánh null/);
  });
});
