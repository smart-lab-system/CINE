import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_TTL_MS, clearDraft, loadDraft, saveDraft } from './exam-draft';
import type { GeneratedExam } from './api/exam-authoring';

const exam: GeneratedExam = {
  title: 'Đề thử',
  language: 'python',
  questions: [],
  verification: { status: 'unverified', reason: 'sandbox_unavailable' },
};

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('exam-draft', () => {
  it('lưu rồi đọc lại ra đúng bộ ba', () => {
    saveDraft(exam);
    expect(loadDraft()).toEqual(exam);
  });

  it('chưa có nháp thì trả null, không ném', () => {
    expect(loadDraft()).toBeNull();
  });

  it('nháp quá 24 giờ TỰ XOÁ', () => {
    // Máy phòng máy là máy DÙNG CHUNG. Một đề chưa thi nằm mãi trong
    // localStorage của một máy mà sinh viên cũng ngồi là đường rò thật.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T08:00:00Z'));
    saveDraft(exam);
    vi.setSystemTime(new Date('2026-09-22T08:00:01Z'));
    expect(loadDraft()).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('nháp sát hạn (23h59) vẫn còn', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-09-21T08:00:00Z').getTime();
    vi.setSystemTime(t0);
    saveDraft(exam);
    vi.setSystemTime(t0 + DRAFT_TTL_MS - 1000);
    expect(loadDraft()).toEqual(exam);
  });

  it('dữ liệu hỏng trong localStorage trả null và tự dọn', () => {
    window.localStorage.setItem('examcollect:exam-draft', '{ hong');
    expect(loadDraft()).toBeNull();
    expect(window.localStorage.getItem('examcollect:exam-draft')).toBeNull();
  });

  it('nháp thiếu trường savedAt cũng bị coi là hỏng', () => {
    window.localStorage.setItem('examcollect:exam-draft', JSON.stringify({ exam }));
    expect(loadDraft()).toBeNull();
  });

  it('clearDraft xoá thật', () => {
    saveDraft(exam);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('localStorage ném thì không làm hỏng màn hình', () => {
    // Chế độ riêng tư, hoặc site data bị chặn: chỉ ĐỌC cũng ném.
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => saveDraft(exam)).not.toThrow();
    spy.mockRestore();
  });
});
