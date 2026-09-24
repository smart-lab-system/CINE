import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_TTL_MS, clearDraft, loadDraft, saveDraft } from './exam-draft';
import type { GeneratedExam } from './api/exam-authoring';

const exam: GeneratedExam = {
  title: 'Đề thử',
  language: 'python',
  questions: [],
  verification: { status: 'unverified', reason: 'sandbox_unavailable' },
};

const PROMPT = 'hai câu về cây nhị phân tìm kiếm';
const QUESTION_COUNT = 3;
const LANGUAGE = 'python' as const;

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('exam-draft', () => {
  it('lưu rồi đọc lại ra đúng bộ ba VÀ đúng yêu cầu đã sinh ra nó', () => {
    // `prompt`/`questionCount`/`language` PHẢI đi cùng `exam`: "Sinh lại
    // riêng câu này" gửi lại `prompt` gốc, và nếu chỉ `exam` được nhớ, sau
    // một lượt tải lại trang thì `prompt` rơi về '' — request 400 vì
    // `GenerateExamDto.prompt` đòi tối thiểu 10 ký tự (bug thật 2026-09-24).
    saveDraft(exam, PROMPT, QUESTION_COUNT, LANGUAGE);
    expect(loadDraft()).toEqual({
      exam,
      prompt: PROMPT,
      questionCount: QUESTION_COUNT,
      language: LANGUAGE,
    });
  });

  it('chưa có nháp thì trả null, không ném', () => {
    expect(loadDraft()).toBeNull();
  });

  it('nháp quá 24 giờ TỰ XOÁ', () => {
    // Máy phòng máy là máy DÙNG CHUNG. Một đề chưa thi nằm mãi trong
    // localStorage của một máy mà sinh viên cũng ngồi là đường rò thật.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T08:00:00Z'));
    saveDraft(exam, PROMPT, QUESTION_COUNT, LANGUAGE);
    vi.setSystemTime(new Date('2026-09-22T08:00:01Z'));
    expect(loadDraft()).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it('nháp sát hạn (23h59) vẫn còn', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-09-21T08:00:00Z').getTime();
    vi.setSystemTime(t0);
    saveDraft(exam, PROMPT, QUESTION_COUNT, LANGUAGE);
    vi.setSystemTime(t0 + DRAFT_TTL_MS - 1000);
    expect(loadDraft()).toEqual({
      exam,
      prompt: PROMPT,
      questionCount: QUESTION_COUNT,
      language: LANGUAGE,
    });
  });

  it('dữ liệu hỏng trong localStorage trả null và tự dọn', () => {
    window.localStorage.setItem('examcollect:exam-draft', '{ hong');
    expect(loadDraft()).toBeNull();
    expect(window.localStorage.getItem('examcollect:exam-draft')).toBeNull();
  });

  it('nháp thiếu trường savedAt cũng bị coi là hỏng', () => {
    window.localStorage.setItem(
      'examcollect:exam-draft',
      JSON.stringify({ exam, prompt: PROMPT, questionCount: QUESTION_COUNT, language: LANGUAGE }),
    );
    expect(loadDraft()).toBeNull();
  });

  // Nháp ĐÃ LƯU TỪ TRƯỚC lượt sửa này (hình dạng cũ: chỉ có `savedAt`+`exam`)
  // vẫn còn thật trên máy giảng viên sau khi triển khai bản vá — coi là hỏng
  // và TỰ DỌN, giống mọi nháp hỏng khác, thay vì khôi phục nửa vời (exam có,
  // prompt rỗng) — đó CHÍNH LÀ trạng thái gây ra bug, chỉ là không còn ai
  // biết để tránh nó. Nháp cũng hết hạn tự nhiên trong 24 giờ, nên đây chỉ
  // là khoảng chuyển tiếp ngắn.
  it('nháp hình dạng CŨ (thiếu prompt/questionCount/language) bị coi là hỏng, không khôi phục nửa vời', () => {
    window.localStorage.setItem(
      'examcollect:exam-draft',
      JSON.stringify({ savedAt: Date.now(), exam }),
    );
    expect(loadDraft()).toBeNull();
    expect(window.localStorage.getItem('examcollect:exam-draft')).toBeNull();
  });

  it('clearDraft xoá thật', () => {
    saveDraft(exam, PROMPT, QUESTION_COUNT, LANGUAGE);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('localStorage ném thì không làm hỏng màn hình', () => {
    // Chế độ riêng tư, hoặc site data bị chặn: chỉ ĐỌC cũng ném.
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => saveDraft(exam, PROMPT, QUESTION_COUNT, LANGUAGE)).not.toThrow();
    spy.mockRestore();
  });
});
