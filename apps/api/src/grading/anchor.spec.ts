import { buildGraderPrompt } from './ai-provider/grader-prompt';
import { Anchor } from './ai-provider/anchor.types';
import { estimateTokens } from './anchor.service';
import {
  ANCHOR_MAX_PER_CRITERION,
  ANCHOR_MAX_TOKENS,
  GRADING_ANCHORS_ENABLED,
} from './grading.types';

const CRITERIA = [{ id: 'c1', description: 'Trình bày thuật toán', maxPoints: 10 }];

function anchor(overrides: Partial<Anchor> = {}): Anchor {
  return {
    criterionId: 'c1',
    studentExcerpt: 'em dùng cây phân đoạn',
    aiVerdict: 'not_met',
    teacherVerdict: 'met',
    reviewedAt: '2026-09-01T00:00:00.000Z',
    reviewId: 'r1',
    ...overrides,
  };
}

describe('Anchor (§10)', () => {
  describe('T-ANCHOR-0: mặc định TẮT', () => {
    it('không truyền anchor → prompt KHÔNG có khối nào', () => {
      // Khẳng định trên PROMPT ĐÃ RENDER, không trên cờ. Kiểm
      // `GRADING_ANCHORS_ENABLED === false` chỉ là kiểm `false === false`
      // — nó không nói gì về việc thứ gì thật sự tới tay model.
      const prompt = buildGraderPrompt({ criteria: CRITERIA, studentText: 'bài làm' });

      const rendered = JSON.stringify([prompt.system, prompt.userContent]);
      expect(rendered).not.toContain('teacher_corrections');
      expect(rendered).not.toContain('correction criterion');
      expect(rendered).not.toContain('teacher_said');
    });

    it('cờ mặc định là false khi env không đặt gì', () => {
      // `=== 'true'` chứ không `Boolean(...)`: `Boolean('false')` là `true`.
      // Repo này đã mất một buổi vì đúng họ lỗi đó ở `GRADE_CONCURRENCY`.
      if (process.env.GRADING_ANCHORS_ENABLED === undefined) {
        expect(GRADING_ANCHORS_ENABLED).toBe(false);
      }
    });

    it('mảng anchor RỖNG cũng không để lại thẻ trống nào', () => {
      // Đường không-anchor là đường chạy của gần như mọi lượt chấm, nên
      // một thẻ rỗng thừa ở đó sẽ đổi byte lớp cache ② cho TOÀN BỘ hệ
      // thống mà không đổi lấy gì.
      const off = buildGraderPrompt({ criteria: CRITERIA, studentText: 'bài làm' });
      const empty = buildGraderPrompt({
        criteria: CRITERIA,
        studentText: 'bài làm',
        anchors: [],
      });

      // So KHỐI ② thôi, không so cả `userContent`: khối bài làm mang mã
      // định danh ngẫu nhiên mỗi lượt (T-SEC-4), nên hai lời gọi không
      // bao giờ giống nhau ở đó — và đó là hành vi ĐÚNG.
      expect(JSON.stringify(empty.userContent[0])).toBe(JSON.stringify(off.userContent[0]));
    });
  });

  describe('khi BẬT', () => {
    it('anchor vào ĐÚNG khối cache ②, cạnh rubric', () => {
      // Cùng vòng đời với rubric (khoá theo `rubric_id_version`), nên tách
      // breakpoint riêng không mua được gì — và ngân sách breakpoint là 4.
      const prompt = buildGraderPrompt({
        criteria: CRITERIA,
        studentText: 'bài làm',
        anchors: [anchor()],
      });

      const block = prompt.userContent[0] as { text: string; cache_control?: unknown };
      expect(block.text).toContain('<rubric>');
      expect(block.text).toContain('teacher_corrections');
      expect(block.cache_control).toBeDefined();
    });

    it('mang CẢ HAI phán đoán, không chỉ đáp án đúng', () => {
      // Đóng khung là "hai người chấm bất đồng". Chỉ đưa verdict của giảng
      // viên là dạy model một đáp án; đưa cả hai là cho nó thấy CHUẨN khác
      // nhau ở chỗ nào.
      const prompt = buildGraderPrompt({
        criteria: CRITERIA,
        studentText: 'bài làm',
        anchors: [anchor({ aiVerdict: 'not_met', teacherVerdict: 'met' })],
      });

      const text = (prompt.userContent[0] as { text: string }).text;
      expect(text).toContain('<system_said>not_met</system_said>');
      expect(text).toContain('<teacher_said>met</teacher_said>');
    });

    it('cùng tập anchor → prompt GIỐNG NHAU TỪNG BYTE (A4)', () => {
      // Thứ tự đổi = byte đổi = cache chết. Đây là khẳng định duy nhất nói
      // được điều đó, vì mọi thứ khác đều đúng dù thứ tự có xáo.
      const anchors = [
        anchor({ reviewId: 'r1', reviewedAt: '2026-09-01T00:00:00.000Z' }),
        anchor({ reviewId: 'r2', reviewedAt: '2026-09-02T00:00:00.000Z' }),
      ];

      const first = buildGraderPrompt({ criteria: CRITERIA, studentText: 'x', anchors });
      const second = buildGraderPrompt({ criteria: CRITERIA, studentText: 'x', anchors });

      expect(JSON.stringify(first.userContent[0])).toBe(JSON.stringify(second.userContent[0]));
    });
  });

  describe('trần (§10.0)', () => {
    it('K = 3 mỗi tiêu chí, trần tổng 4.000 token', () => {
      // Hai con số này là ranh giới khiến "loãng chú ý" không thành vấn đề
      // dù nó có thật — tức ta không phải chờ ai chứng minh nó trước khi
      // bật. Đổi chúng là đổi lập luận đó.
      expect(ANCHOR_MAX_PER_CRITERION).toBe(3);
      expect(ANCHOR_MAX_TOKENS).toBe(4000);
    });

    it('ước lượng token thận trọng: chia 3, không chia 4', () => {
      // Tiếng Việt có dấu tốn nhiều token hơn tiếng Anh trên cùng số ký
      // tự. Ước lượng THẤP hơn thực tế thì cắt hơi nhiều — chấp nhận
      // được; ước lượng CAO hơn thực tế thì vượt trần — không.
      expect(estimateTokens('a'.repeat(300))).toBe(100);
      expect(estimateTokens('')).toBe(0);
    });
  });
});
