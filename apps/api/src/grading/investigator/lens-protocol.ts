import { z } from 'zod';
import { TOOL_NAMES } from './types';
import { readSingleJson } from './verdict-reader';

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

/** Qua bộ đọc §5.2 (`readSingleJson`) rồi zod — cùng khuôn `parseReply()` của protocol.ts, bản cho lens. */
export function parsePerErrorReply(content: string): PerErrorReply | null {
  const read = readSingleJson(content);
  if (!read.ok) return null;
  const parsed = perErrorReplySchema.safeParse(read.value);
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

export const CASE_NOTE_MAX = 500;

/** Cắt chứ không từ chối: một kết luận hợp lệ không được mất trắng chỉ vì model viết dài. */
export function clampNote(note: string): string {
  return note.length <= CASE_NOTE_MAX ? note : `${note.slice(0, CASE_NOTE_MAX - 1)}…`;
}

const caseLensConclusion = z.object({ suspected: z.boolean(), note: z.string().transform(clampNote) });
const caseLensReplySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('call'), calls: z.array(callSchema).min(1), conclusion: z.null() }),
  z.object({ action: z.literal('final'), calls: z.array(z.unknown()), conclusion: caseLensConclusion }),
]);
export type CaseLensReply = z.infer<typeof caseLensReplySchema>;

export function parseCaseLensReply(content: string): CaseLensReply | null {
  const read = readSingleJson(content);
  if (!read.ok) return null;
  const parsed = caseLensReplySchema.safeParse(read.value);
  return parsed.success ? parsed.data : null;
}

/**
 * Bỏ sót khai DANH SÁCH luật nó cho là bị bỏ sót, không tự khai cờ `suspected`: diễn tập
 * 2026-09-28 có hai lần model đặt suspected=true trong khi chính ghi chú của nó nói lỗi đó
 * đã được kết luận, hay là luật máy kiểm. Code đối chiếu danh sách với bảng lỗi rồi mới quyết cờ.
 */
export const OMISSION_JSON_SCHEMA: Record<string, unknown> = {
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
          required: ['missedRuleKeys', 'note'],
          properties: { missedRuleKeys: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } },
        },
      ],
    },
  },
};

const omissionConclusion = z.object({
  missedRuleKeys: z.array(z.string().max(64)).max(30).default([]),
  note: z.string().transform(clampNote),
});
const omissionReplySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('call'), calls: z.array(callSchema).min(1), conclusion: z.null() }),
  z.object({ action: z.literal('final'), calls: z.array(z.unknown()), conclusion: omissionConclusion }),
]);
export type OmissionReply = z.infer<typeof omissionReplySchema>;

export function parseOmissionReply(content: string): OmissionReply | null {
  const read = readSingleJson(content);
  if (!read.ok) return null;
  const parsed = omissionReplySchema.safeParse(read.value);
  return parsed.success ? parsed.data : null;
}
