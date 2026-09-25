import { describe, expect, it } from 'vitest';
import { renderInstructions, type InstructionsInput } from './exam-materials';

/**
 * `renderInstructions` chưa từng có test riêng — trước đây chỉ được đi qua
 * gián tiếp bởi `session-controller.test.ts`, và test đó không kiểm nội
 * dung tờ hướng dẫn. Bộ này là coverage MỚI hoàn toàn cho hàm thuần.
 */

function base(overrides: Partial<InstructionsInput> = {}): InstructionsInput {
  return {
    sessionName: 'Giữa kỳ CTDL&GT',
    studentName: 'Nguyễn Văn A',
    studentId: 'SV20120001',
    endTime: '2026-09-25T10:00:00.000Z',
    requiredDeliverables: [{ filename: 'Cau1.docx', entries: [] }],
    materialFileNames: [],
    ...overrides,
  };
}

describe('renderInstructions', () => {
  it('file KHÔNG có entries thì không có khối con bên dưới', () => {
    const text = renderInstructions(base());
    expect(text).toContain('* Cau1.docx');
    expect(text).not.toContain('Bên trong PHẢI có');
  });

  // Lỗi thật 2026-09-25: trước đây tờ hướng dẫn chỉ nói "nộp file .zip/.rar",
  // không nói bên trong cần gì — giảng viên khai entries qua
  // ArchiveEntriesField.tsx, và chính UI đó ghi rõ hệ thống KHÔNG cảnh báo
  // lúc đang thi. Tờ hướng dẫn là nơi DUY NHẤT thông tin này tới được sinh
  // viên trước khi quá muộn.
  it('file có entries thì liệt kê đúng danh sách bên trong, dưới đúng tên file', () => {
    const text = renderInstructions(
      base({
        requiredDeliverables: [
          { filename: 'BaiThi.zip', entries: ['Main.java', 'BaoCao.docx'] },
        ],
      }),
    );
    const zipLine = text.indexOf('* BaiThi.zip');
    const mainLine = text.indexOf('Main.java');
    const baoCaoLine = text.indexOf('BaoCao.docx');
    expect(zipLine).toBeGreaterThan(-1);
    expect(mainLine).toBeGreaterThan(zipLine);
    expect(baoCaoLine).toBeGreaterThan(mainLine);
    expect(text).toContain('Bên trong PHẢI có');
  });

  // `.rar` không có cách nào hợp lệ tạo trước (xem workspace-files.ts) —
  // đây là sự thật TĨNH về đuôi file, không phụ thuộc kết quả một lượt
  // `createSubmissionFiles` cụ thể nào, nên `renderInstructions` tự kiểm
  // đuôi, không nhận qua tham số.
  it('file .rar thì có câu giải thích KHÔNG tạo trước được', () => {
    const text = renderInstructions(
      base({ requiredDeliverables: [{ filename: 'BaiThi.rar', entries: [] }] }),
    );
    expect(text).toMatch(/không tạo trước được/i);
    expect(text).toMatch(/winrar/i);
  });

  it('file .zip thì KHÔNG có câu giải thích của .rar', () => {
    const text = renderInstructions(
      base({ requiredDeliverables: [{ filename: 'BaiThi.zip', entries: [] }] }),
    );
    expect(text).not.toMatch(/không tạo trước được/i);
  });

  it('đuôi không phải archive thì không đổi gì so với trước — không có khối con, không câu .rar', () => {
    const text = renderInstructions(base({ requiredDeliverables: [{ filename: 'Cau2.py', entries: [] }] }));
    expect(text).toContain('* Cau2.py');
    expect(text).not.toContain('Bên trong PHẢI có');
    expect(text).not.toMatch(/không tạo trước được/i);
  });

  it('nhiều file bắt buộc vẫn liệt kê đủ, đúng thứ tự', () => {
    const text = renderInstructions(
      base({
        requiredDeliverables: [
          { filename: 'Cau1.docx', entries: [] },
          { filename: 'BaiThi.zip', entries: ['Main.java'] },
        ],
      }),
    );
    const i1 = text.indexOf('* Cau1.docx');
    const i2 = text.indexOf('* BaiThi.zip');
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
  });
});
