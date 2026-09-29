import { describe, expect, it } from 'vitest';
import { NO_QUESTION, buildReferencePayload, referenceIsDirty, type ReferenceDraft } from './grading-reference-form';

const draft = (over: Partial<ReferenceDraft> = {}): ReferenceDraft => ({
  questionTouched: false,
  questionId: NO_QUESTION,
  note: '',
  initialNote: '',
  fileName: null,
  storageKey: null,
  ...over,
});

/**
 * Ported from GradingReferenceDialog. The DTO distinguishes three states per field — absent = KEEP, `null` =
 * CLEAR, value = SET — and sending the whole object each time would silently drop the question the moment
 * the teacher only edited the note.
 */
describe('buildReferencePayload — only what changed', () => {
  it('nothing touched → an empty payload (everything is kept)', () => {
    expect(buildReferencePayload(draft())).toEqual({});
  });

  it('picking a question sets it — and only it', () => {
    expect(buildReferencePayload(draft({ questionTouched: true, questionId: 'm1' }))).toEqual({ questionMaterialId: 'm1' });
  });

  it('choosing "Không dùng đề bài" sends an explicit null (clear), not nothing', () => {
    expect(buildReferencePayload(draft({ questionTouched: true, questionId: NO_QUESTION }))).toEqual({ questionMaterialId: null });
  });

  it('typing a note sets it, trimmed; a note that is only whitespace clears it', () => {
    expect(buildReferencePayload(draft({ note: '  chấp nhận Outbox  ' }))).toEqual({ modelAnswerNote: 'chấp nhận Outbox' });
    expect(buildReferencePayload(draft({ note: '   ', initialNote: 'cũ' }))).toEqual({ modelAnswerNote: null });
  });

  it('an untouched note is not sent (so a note set earlier is kept)', () => {
    expect(buildReferencePayload(draft({ note: 'cũ', initialNote: 'cũ' }))).toEqual({});
  });

  it('an uploaded answer key sends its storage key AND file name together, only when both exist', () => {
    expect(buildReferencePayload(draft({ storageKey: 'grading-reference/x', fileName: 'dap-an.py' }))).toEqual({
      modelAnswerStorageKey: 'grading-reference/x',
      modelAnswerFilename: 'dap-an.py',
    });
    expect(buildReferencePayload(draft({ storageKey: 'grading-reference/x', fileName: null }))).toEqual({});
    expect(buildReferencePayload(draft({ storageKey: null, fileName: 'dap-an.py' }))).toEqual({});
  });

  it('everything changed at once is sent together', () => {
    expect(
      buildReferencePayload(
        draft({ questionTouched: true, questionId: 'm2', note: 'ghi chú', storageKey: 'k', fileName: 'f.py' }),
      ),
    ).toEqual({ questionMaterialId: 'm2', modelAnswerNote: 'ghi chú', modelAnswerStorageKey: 'k', modelAnswerFilename: 'f.py' });
  });
});

describe('referenceIsDirty (drives "Lưu tài liệu trước khi bắt đầu")', () => {
  it('clean by default', () => {
    expect(referenceIsDirty(draft(), false)).toBe(false);
  });
  it('dirty when the question was touched, the note edited, or a file chosen but not yet uploaded', () => {
    expect(referenceIsDirty(draft({ questionTouched: true }), false)).toBe(true);
    expect(referenceIsDirty(draft({ note: 'x' }), false)).toBe(true);
    expect(referenceIsDirty(draft(), true)).toBe(true);
  });
});
