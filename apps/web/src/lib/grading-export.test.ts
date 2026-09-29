import { describe, expect, it } from 'vitest';
import { gradingCsvFilename, gradingResultsToCsv } from './grading-export';
import type { GradingResult } from '@/lib/api/grading';

function result(over: Partial<GradingResult> = {}): GradingResult {
  return {
    id: 'r1',
    submissionId: 's1',
    studentMssv: '2151010023',
    studentName: 'Nguyễn Minh Anh',
    homeClassId: 'class-a',
    homeClassName: 'N01',
    status: 'auto_approved',
    modelUsed: 'keyword-match@1',
    aiTotalScore: 8,
    confidence: 0.9,
    flagForReview: false,
    ungradableReason: null,
    criterionResults: [],
    advocateOpinion: null,
    contextUsedQuestion: null,
    contextUsedModelAnswer: null,
    finalScore: null,
    reviewedAt: null,
    reviewedByName: null,
    editedCriteria: null,
    currentScore: 8,
    ...over,
  } as GradingResult;
}

describe('gradingResultsToCsv', () => {
  it('mở đầu bằng BOM UTF-8, để Excel không hiện tên tiếng Việt thành dấu hỏi', () => {
    const csv = gradingResultsToCsv([result()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('đọc điểm từ currentScore, không phải aiTotalScore hay finalScore', () => {
    const csv = gradingResultsToCsv([
      result({ aiTotalScore: 5, finalScore: 6, currentScore: 7 }),
    ]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toContain(',7,');
  });

  it('bài chưa có điểm (currentScore null) để ô trống, không hiện "0"', () => {
    // 0 đọc thành "chấm 0 điểm" — điểm null nghĩa là chưa có ý kiến.
    const csv = gradingResultsToCsv([result({ currentScore: null })]);
    const dataLine = csv.split('\r\n')[1];
    // Cột thứ 5 (chỉ số 4): MSSV, Họ tên, Lớp, Trạng thái, Điểm.
    const cols = dataLine.split(',');
    expect(cols[4]).toBe('');
  });

  it('sắp theo MSSV tăng dần, không theo thứ tự truyền vào', () => {
    const csv = gradingResultsToCsv([
      result({ studentMssv: '2151010099' }),
      result({ studentMssv: '2151010001' }),
    ]);
    const lines = csv.trim().split('\r\n').slice(1);
    expect(lines[0]).toContain('2151010001');
    expect(lines[1]).toContain('2151010099');
  });

  it('tên có dấu phẩy được bọc trong ngoặc kép và nhân đôi dấu ngoặc bên trong', () => {
    const csv = gradingResultsToCsv([
      result({ studentName: 'Trần "Bảo", Gia' }),
    ]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toContain('"Trần ""Bảo"", Gia"');
  });

  it('currentScore = 0 xuất ra "0", không phải ô trống', () => {
    // `??` chứ không `||` — 0 là một điểm thật, khác "chưa có ý kiến" (null).
    const csv = gradingResultsToCsv([result({ currentScore: 0 })]);
    const cols = csv.split('\r\n')[1].split(',');
    expect(cols[4]).toBe('0');
  });

  it('tên bắt đầu bằng "=" không bị Excel/Sheets hiểu thành công thức (CWE-1236)', () => {
    const csv = gradingResultsToCsv([
      result({ studentName: '=HYPERLINK("http://evil","click")' }),
    ]);
    const dataLine = csv.split('\r\n')[1];
    // Dấu `'` đứng trước buộc trình đọc hiểu là văn bản — Excel tự bỏ dấu
    // đó khi hiện ô, không hiện nguyên văn cho người đọc.
    expect(dataLine).toContain("'=HYPERLINK");
    expect(dataLine).not.toMatch(/,=HYPERLINK/);
  });

  it('lý do không chấm được cũng được chặn công thức, không chỉ tên', () => {
    const csv = gradingResultsToCsv([
      result({ ungradableReason: '@SUM(1+1)', currentScore: null }),
    ]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toContain("'@SUM(1+1)");
  });

  it('lý do không chấm được đi vào cột Ghi chú', () => {
    const csv = gradingResultsToCsv([
      result({ ungradableReason: 'file nén không đọc được', currentScore: null }),
    ]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toContain('file nén không đọc được');
  });

  // Cùng một từ với danh sách bài và hồ sơ (STATE_LABEL của session-triage): file CSV không được nói khác màn hình.
  it.each([
    ['flagged_for_review', null, 'Cần bạn xem'],
    ['flagged_for_review', 'file nén không đọc được', 'Không chấm được'],
    ['auto_approved', null, 'Tự quyết'],
    ['audit_pending', null, 'Kiểm mẫu'],
    ['teacher_reviewed', null, 'Đã duyệt'],
    ['finalized', null, 'Đã chốt'],
    ['ai_grading', null, 'Đang chấm'],
  ])('trạng thái %s (lý do: %s) ra nhãn "%s"', (status, ungradableReason, label) => {
    const csv = gradingResultsToCsv([result({ status, ungradableReason, currentScore: ungradableReason ? null : 8 })]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine.split(',')[3]).toBe(label);
  });

  it('danh sách rỗng vẫn ra đúng dòng tiêu đề, không lỗi', () => {
    const csv = gradingResultsToCsv([]);
    expect(csv.replace('﻿', '').trim()).toBe(
      'MSSV,Họ tên,Lớp,Trạng thái,Điểm,Ghi chú',
    );
  });
});

describe('gradingCsvFilename', () => {
  // Giờ ĐỊA PHƯƠNG (không phải chuỗi ISO/UTC): hàm đọc ngày bằng
  // getFullYear/getMonth/getDate, nên test phải dựng Date theo cách đó —
  // dùng chuỗi ISO UTC sẽ cho ngày khác nhau tuỳ múi giờ máy chạy test.
  const now = new Date(2026, 8, 29, 10, 0, 0);

  it('bỏ dấu tiếng Việt và khoảng trắng khỏi tên phiên', () => {
    expect(gradingCsvFilename('Kiểm tra giữa kỳ Đại số', 'ABCDEF', now)).toBe(
      'diem-kiem-tra-giua-ky-dai-so-2026-09-29.csv',
    );
  });

  it('tên phiên rỗng sau khi lọc thì rơi về mã phiên', () => {
    expect(gradingCsvFilename('!!!', 'ABCDEF', now)).toBe('diem-abcdef-2026-09-29.csv');
  });
});
