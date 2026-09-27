import { z } from 'zod';
import { SYSTEM_DELIMITER_RULE } from '../harness/submission-envelope';
import { TOOL_NAMES } from './types';

/** Cùng bốn công cụ của đường điều tra lớn (§6 ràng buộc 2) — lăng kính không có công cụ riêng
 *  NGOÀI bốn cái này (probe/ast_query/compare_peers là bước 5, chưa tồn tại). */
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const nullableInteger = { anyOf: [{ type: 'integer' }, { type: 'null' }] };

const CALL_PROPERTIES = {
  tool: { type: 'string', enum: [...TOOL_NAMES] },
  input: nullableString,
  group: nullableString,
  path: nullableString,
  fromLine: nullableInteger,
  toLine: nullableInteger,
};

const callSchema = z
  .object({
    tool: z.enum(TOOL_NAMES),
    input: z.string().nullish(),
    group: z.string().nullish(),
    path: z.string().nullish(),
    fromLine: z.number().int().nullish(),
    toLine: z.number().int().nullish(),
  })
  .transform((c) => ({
    tool: c.tool,
    input: c.input ?? null,
    group: c.group ?? null,
    path: c.path ?? null,
    fromLine: c.fromLine ?? null,
    toLine: c.toLine ?? null,
  }));

export type LensCall = z.infer<typeof callSchema>;

/** Tham số chuẩn hoá theo công cụ — bản riêng của lens (protocol.ts không export bản của nó). */
export function lensArgsFor(call: LensCall): Record<string, unknown> {
  switch (call.tool) {
    case 'run':
      return { input: call.input };
    case 'run_tests':
      return { group: call.group };
    case 'read_file':
      return { path: call.path, fromLine: call.fromLine, toLine: call.toLine };
    case 'list_files':
      return {};
  }
}

const REVIEW_JSON_SCHEMA_BASE = {
  action: { type: 'string', enum: ['call', 'final'] },
  calls: {
    type: 'array',
    items: { type: 'object', additionalProperties: false, required: Object.keys(CALL_PROPERTIES), properties: CALL_PROPERTIES },
  },
};

/** Lăng kính PER-ERROR (Tính đúng, Quá tay) — kết luận là confirmed/refuted + bằng chứng. */
export const PER_ERROR_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'calls', 'conclusion'],
  properties: {
    ...REVIEW_JSON_SCHEMA_BASE,
    conclusion: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['status', 'toolCallIds'],
          properties: {
            status: { type: 'string', enum: ['confirmed', 'refuted'] },
            toolCallIds: { type: 'array', items: { type: 'string' } },
          },
        },
      ],
    },
  },
};

const perErrorConclusion = z.object({
  status: z.enum(['confirmed', 'refuted']),
  toolCallIds: z.array(z.string().max(32)).max(25),
});
const perErrorReplySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('call'), calls: z.array(callSchema).min(1), conclusion: z.null() }),
  z.object({ action: z.literal('final'), calls: z.array(z.unknown()), conclusion: perErrorConclusion }),
]);
export type PerErrorReply = z.infer<typeof perErrorReplySchema>;

/** Qua bộ đọc §5.2 rồi zod — cùng khuôn `parseReply()` của protocol.ts, bản cho lens. */
export function parsePerErrorReply(content: string): PerErrorReply | null {
  const parsed = perErrorReplySchema.safeParse(safeJson(content));
  return parsed.success ? parsed.data : null;
}

/** Lăng kính CẤP BÀI (Bỏ sót, Gian lận) — kết luận là một ghi chú + cờ nghi ngờ. */
export const CASE_LENS_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'calls', 'conclusion'],
  properties: {
    ...REVIEW_JSON_SCHEMA_BASE,
    conclusion: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['suspected', 'note'],
          properties: { suspected: { type: 'boolean' }, note: { type: 'string' } },
        },
      ],
    },
  },
};

const caseLensConclusion = z.object({ suspected: z.boolean(), note: z.string().max(500) });
const caseLensReplySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('call'), calls: z.array(callSchema).min(1), conclusion: z.null() }),
  z.object({ action: z.literal('final'), calls: z.array(z.unknown()), conclusion: caseLensConclusion }),
]);
export type CaseLensReply = z.infer<typeof caseLensReplySchema>;

export function parseCaseLensReply(content: string): CaseLensReply | null {
  const parsed = caseLensReplySchema.safeParse(safeJson(content));
  return parsed.success ? parsed.data : null;
}

/** Model đôi khi bọc JSON trong ```json …``` dù được dặn không làm vậy — cắt vỏ trước khi parse. */
function safeJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export const LENS_SYSTEM_DELIMITER = SYSTEM_DELIMITER_RULE;
