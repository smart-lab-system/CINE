import { describe, expect, it } from 'vitest';
import { preflightOf, type PreflightInput } from './preflight';
import { rule } from '@/app/teacher/rules/_components/fixtures';
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
  hasCodeDeliverable: false,
  bundle: { pinned: false, total: 0, approved: 0 },
  rules: [
    rule({ id: 'r1', revision: { criterionKey: 'tinh_dung' }, deduction: '1.00' }),
    rule({ id: 'r2', revision: { criterionKey: 'trinh_bay' }, deduction: '0.50' }),
  ],
  waivedKeys: [],
  dirty: false,
  ...over,
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
    it('ok when a bundle is pinned', () => {
      expect(row(base({ hasCodeDeliverable: true, bundle: { pinned: true, total: 1, approved: 1 } }), 'bundle').status).toBe('ok');
    });
    it.each([
      [{ pinned: false, total: 0, approved: 0 }, /Chưa có gói test nào/],
      [{ pinned: false, total: 2, approved: 0 }, /chưa duyệt/],
      [{ pinned: false, total: 2, approved: 1 }, /chưa ghim/],
    ])('blocks and says the next step (%j)', (bundle, text) => {
      const input = base({ hasCodeDeliverable: true, bundle });
      expect(row(input, 'bundle').status).toBe('block');
      expect(row(input, 'bundle').text).toMatch(text);
      expect(row(input, 'bundle').text).toMatch(/khối "Gói test"/);
      expect(preflightOf(input).canStart).toBe(false);
    });
  });

  describe('rules table (Bảng lỗi) — warns, never blocks', () => {
    it('ok when every rule is priced and every criterion has a rule', () => {
      expect(row(base(), 'rules').status).toBe('ok');
    });
    it('counts unpriced rules and says results hitting them will need the teacher', () => {
      const input = base({ rules: [rule({ id: 'a', deduction: null, revision: { criterionKey: 'tinh_dung' } }), rule({ id: 'b', deduction: null, revision: { criterionKey: 'trinh_bay' } })] });
      expect(row(input, 'rules')).toMatchObject({ status: 'warn' });
      expect(row(input, 'rules').text).toMatch(/2 luật chưa có giá/);
      expect(preflightOf(input).canStart).toBe(true);
    });
    it('names a criterion with no rule, and offers the waiver route', () => {
      const input = base({ rules: [rule({ id: 'a', revision: { criterionKey: 'tinh_dung' } })] });
      expect(row(input, 'rules').text).toMatch(/trinh_bay chưa có luật nào/);
      expect(row(input, 'rules').link).toEqual({ href: '/teacher/rules', label: 'Mở Bảng lỗi' });
    });
    it('a waived criterion is not reported', () => {
      const input = base({ rules: [rule({ id: 'a', revision: { criterionKey: 'tinh_dung' } })], waivedKeys: ['trinh_bay'] });
      expect(row(input, 'rules').status).toBe('ok');
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

  describe('code language — the API does not return it yet', () => {
    it('is a "cần backend" note only when the session has code deliverables', () => {
      expect(preflightOf(base()).rows.some((r) => r.key === 'language')).toBe(false);
      const r = row(base({ hasCodeDeliverable: true, bundle: { pinned: true, total: 1, approved: 1 } }), 'language');
      expect(r).toMatchObject({ status: 'warn', needsBackend: true });
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
