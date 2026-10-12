import { describe, expect, it } from 'vitest';
import { preflightOf, type PreflightInput } from './preflight';
import { criterion, overview } from '@/app/teacher/rules/_components/fixtures';
import type { Rubric } from './api/grading';

const rubric: Rubric = {
  id: 'ru-1', teacherId: 't', name: 'CTDL', version: 2, isActive: true, totalPoints: 10,
  criteria: [
    { id: 'c1', key: 'tinh_dung', description: 'Tính đúng', maxPoints: 6 },
    { id: 'c2', key: 'trinh_bay', description: 'Trình bày', maxPoints: 4 },
  ],
};

const base = (over: Partial<PreflightInput> = {}): PreflightInput => ({
  counts: { fullySubmitted: 30, partial: 2, attendedNoSubmission: 0, neverAttended: 0 },
  hasRubricId: true,
  rubric,
  readiness: { hasQuestion: true, hasModelAnswer: true },
  deliverables: [],
  bundle: { pinned: false, total: 0, approved: 0 },
  board: overview({
    rubricName: 'CTDL',
    criteria: [
      criterion({ key: 'tinh_dung', description: 'Tính đúng', maxPoints: 6, errorCount: 1 }),
      criterion({ key: 'trinh_bay', description: 'Trình bày', maxPoints: 4, errorCount: 1 }),
    ],
  }),
  dirty: false,
  ...over,
});

const codeDeliverable = (over: Partial<PreflightInput['deliverables'][number]> = {}): PreflightInput['deliverables'][number] => ({
  deliverableType: 'code_project', language: 'python', pipeline: 'investigator', ...over,
});

const row = (input: PreflightInput, key: string) => preflightOf(input).rows.find((r) => r.key === key)!;

describe('preflightOf — the "Trước khi bắt đầu" column (spec §3.7)', () => {
  it('a session that is fully prepared can start, and says how many results it will grade', () => {
    const out = preflightOf(base());
    expect(out.canStart).toBe(true);
    expect(out.reason).toBeNull();
    expect(out.collected).toBe(32);
  });

  describe('ceiling (Trần điểm)', () => {
    it('ok: names the rubric, its version, total and number of criteria', () => {
      expect(row(base(), 'ceiling')).toMatchObject({ status: 'ok', text: 'CTDL — phiên bản 2, 10,0 điểm, 2 tiêu chí' });
    });
    it('blocks when no rubric is pinned', () => {
      const input = base({ hasRubricId: false, rubric: undefined });
      expect(row(input, 'ceiling').status).toBe('block');
      expect(preflightOf(input).canStart).toBe(false);
      expect(preflightOf(input).reason).toMatch(/chưa gắn rubric/);
    });
    it('blocks when the pinned rubric cannot be found', () => {
      expect(row(base({ rubric: undefined }), 'ceiling').text).toMatch(/Không tìm thấy rubric/);
    });
    it('blocks a rubric with no criteria (the server refuses it too)', () => {
      expect(row(base({ rubric: { ...rubric, criteria: [] } }), 'ceiling').status).toBe('block');
    });
  });

  describe('question (Đề bài) — required by the spec', () => {
    it('ok when chosen', () => {
      expect(row(base(), 'question').status).toBe('ok');
    });
    it('blocks when not chosen, pointing at where to choose it', () => {
      const input = base({ readiness: { hasQuestion: false, hasModelAnswer: false } });
      expect(row(input, 'question').status).toBe('block');
      expect(row(input, 'question').text).toMatch(/khối "Đề bài"/);
    });
    it('blocks while readiness is still loading — no guessing', () => {
      const r = row(base({ readiness: undefined }), 'question');
      expect(r.status).toBe('block');
      expect(r.text).toMatch(/Đang đọc/);
    });
  });

  describe('model answer (Đáp án mẫu) — not required', () => {
    it('ok when present', () => {
      expect(row(base(), 'answer').status).toBe('ok');
    });
    it('a warning, not a block, when missing; auto-building it is "cần backend"', () => {
      const input = base({ readiness: { hasQuestion: true, hasModelAnswer: false } });
      expect(row(input, 'answer')).toMatchObject({ status: 'warn', needsBackend: true });
      expect(preflightOf(input).canStart).toBe(true);
    });
  });

  describe('test bundle (Gói test) — the server needs a PINNED bundle for code submissions', () => {
    it('not needed without a code deliverable', () => {
      expect(row(base(), 'bundle')).toMatchObject({ status: 'ok' });
    });
    // G1 §3: the server only demands a bundle for investigator-path submissions, so the UI must not ask for more.
    it('not needed when every code deliverable is graded by reading', () => {
      const input = base({ deliverables: [codeDeliverable({ language: 'java', pipeline: 'one_shot' }), codeDeliverable({ language: null, pipeline: 'one_shot' })] });
      expect(row(input, 'bundle')).toMatchObject({ status: 'ok' });
      expect(preflightOf(input).canStart).toBe(true);
    });
    it('ok when a bundle is pinned', () => {
      expect(row(base({ deliverables: [codeDeliverable()], bundle: { pinned: true, total: 1, approved: 1 } }), 'bundle').status).toBe('ok');
    });
    it.each([
      [{ pinned: false, total: 0, approved: 0 }, /Chưa có gói test nào/],
      [{ pinned: false, total: 2, approved: 0 }, /chưa duyệt/],
      [{ pinned: false, total: 2, approved: 1 }, /chưa ghim/],
    ])('blocks and says the next step (%j)', (bundle, text) => {
      const input = base({ deliverables: [codeDeliverable()], bundle });
      expect(row(input, 'bundle').status).toBe('block');
      expect(row(input, 'bundle').text).toMatch(text);
      expect(row(input, 'bundle').text).toMatch(/khối "Gói test"/);
      expect(preflightOf(input).canStart).toBe(false);
    });
  });

  describe('Bảng lỗi của rubric đã ghim — cảnh báo, không bao giờ chặn', () => {
    const board = (over: Parameters<typeof overview>[0]) => overview({ rubricName: 'CTDL', ...over });

    it('ok khi mọi lỗi có điểm trừ và mọi tiêu chí có lỗi', () => {
      expect(row(base(), 'rules').status).toBe('ok');
    });
    it('đếm lỗi chưa có điểm trừ và nói bài dính chúng sẽ cần giảng viên', () => {
      const input = base({ board: board({ unpricedCount: 2 }) });
      expect(row(input, 'rules')).toMatchObject({ status: 'warn' });
      expect(row(input, 'rules').text).toMatch(/2 lỗi chưa có điểm trừ/);
      expect(preflightOf(input).canStart).toBe(true);
    });
    it('gọi tên tiêu chí chưa có lỗi, và dẫn thẳng tới đúng rubric', () => {
      const input = base({
        board: board({ criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng', errorCount: 1 }), criterion({ key: 'trinh_bay', description: 'Trình bày', errorCount: 0 })] }),
      });
      expect(row(input, 'rules').text).toMatch(/Trình bày chưa có lỗi nào/);
      expect(row(input, 'rules').link).toEqual({ href: '/teacher/rules?rubric=CTDL', label: 'Mở Bảng lỗi' });
    });
    it('tiêu chí đã đánh dấu không trừ điểm thì không bị nhắc', () => {
      const input = base({
        board: board({ criteria: [criterion({ key: 'tinh_dung', errorCount: 1 }), criterion({ key: 'trinh_bay', description: 'Trình bày', errorCount: 0, waiverId: 'w1' })] }),
      });
      expect(row(input, 'rules').status).toBe('ok');
    });
    it('rubric chưa có lỗi nào: nói bài sẽ chuyển sang "Cần bạn xem"', () => {
      const input = base({ board: board({ criteria: [criterion({ errorCount: 0 })] }) });
      expect(row(input, 'rules').text).toMatch(/chưa có lỗi nào/);
      expect(row(input, 'rules').text).toMatch(/Cần bạn xem/);
    });
    it('chưa đọc xong Bảng lỗi: cảnh báo "đang đọc", không chặn', () => {
      const input = base({ board: undefined });
      expect(row(input, 'rules')).toMatchObject({ status: 'warn' });
      expect(row(input, 'rules').text).toMatch(/Đang đọc Bảng lỗi/);
      expect(preflightOf(input).canStart).toBe(true);
    });
  });

  describe('results to grade (Số bài sẽ chấm)', () => {
    it('blocks with nothing collected — the server would answer "queued: 0" and look like it worked', () => {
      const input = base({ counts: { fullySubmitted: 0, partial: 0, attendedNoSubmission: 3, neverAttended: 2 } });
      expect(row(input, 'count').status).toBe('block');
      expect(preflightOf(input).canStart).toBe(false);
    });
    it('says the number graded, and the students who will NOT be', () => {
      const input = base({ counts: { fullySubmitted: 30, partial: 2, attendedNoSubmission: 3, neverAttended: 5 } });
      expect(row(input, 'count').text).toBe('32 bài đã thu sẽ được chấm. 3 sinh viên vào phòng nhưng không có bài, 5 vắng — không chấm.');
    });
    it('says only what is true when nobody is missing', () => {
      expect(row(base(), 'count').text).toBe('32 bài đã thu sẽ được chấm.');
    });
  });

  describe('code language (G1 §3) — counted by the backend pipeline, never blocking', () => {
    it('no row without a code deliverable', () => {
      expect(preflightOf(base()).rows.some((r) => r.key === 'language')).toBe(false);
    });
    it('all run in the run environment → ok, no warning, no "cần backend"', () => {
      const r = row(base({ deliverables: [codeDeliverable(), codeDeliverable({ language: 'cpp' })], bundle: { pinned: true, total: 1, approved: 1 } }), 'language');
      expect(r.status).toBe('ok');
      expect(r.needsBackend).toBeUndefined();
      expect(r.text).toBe('2 bài code chạy trong môi trường chạy bài.');
    });
    it('some graded by reading → warns with the counts, and how many never declared a language', () => {
      const input = base({
        deliverables: [codeDeliverable(), codeDeliverable({ language: 'java', pipeline: 'one_shot' }), codeDeliverable({ language: null, pipeline: 'one_shot' })],
        bundle: { pinned: true, total: 1, approved: 1 },
      });
      const r = row(input, 'language');
      expect(r.status).toBe('warn');
      expect(r.text).toBe('1 bài code chạy trong môi trường chạy bài; 2 bài code chấm bằng đọc mã, không chạy (1 bài chưa khai ngôn ngữ).');
      expect(preflightOf(input).canStart).toBe(true);
    });
    it('documents and images are not counted as code', () => {
      const input = base({ deliverables: [{ deliverableType: 'document', language: null, pipeline: 'one_shot' }] });
      expect(preflightOf(input).rows.some((r) => r.key === 'language')).toBe(false);
    });
  });

  describe('unsaved reference (Review Focus 2)', () => {
    it('blocks starting while the reference form has unsaved changes', () => {
      const input = base({ dirty: true });
      expect(row(input, 'reference').status).toBe('block');
      expect(preflightOf(input).reason).toMatch(/Lưu tài liệu chấm/);
      expect(preflightOf(input).canStart).toBe(false);
    });
    it('no such row when clean', () => {
      expect(preflightOf(base()).rows.some((r) => r.key === 'reference')).toBe(false);
    });
  });

  it('the reason is the FIRST blocking row', () => {
    const input = base({ hasRubricId: false, rubric: undefined, readiness: { hasQuestion: false, hasModelAnswer: false } });
    expect(preflightOf(input).reason).toBe(row(input, 'ceiling').text);
  });
});
