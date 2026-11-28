import { describe, expect, it } from 'vitest';
import { renderInstructions, type InstructionsInput } from './exam-materials';

function base(overrides: Partial<InstructionsInput> = {}): InstructionsInput {
  return {
    sessionName: 'Giữa kỳ CTDL&GT',
    studentName: 'Nguyễn Văn A',
    studentId: 'SV20120001',
    endTime: '2026-09-25T10:00:00.000Z',
    requiredDeliverables: [{ filename: '{SOMAY}_{MSSV}_{HOTEN}.zip', entries: [] }],
    materialFileNames: [],
    ...overrides,
  };
}

describe('renderInstructions', () => {
  it('gói zip nói làm trong thư mục stem + nén nội dung', () => {
    const text = renderInstructions(base());
    expect(text).toContain('* {SOMAY}_{MSSV}_{HOTEN}.zip');
    expect(text).toMatch(/thư mục "\{SOMAY\}_\{MSSV\}_\{HOTEN\}\/"/i);
    expect(text).toMatch(/nén NỘI DUNG/i);
    expect(text).not.toContain('Bên trong PHẢI có');
  });

  it('file có entries thì liệt kê trong thư mục stem', () => {
    const text = renderInstructions(
      base({
        requiredDeliverables: [
          { filename: 'BaiThi.zip', entries: ['Main.java', 'BaoCao.docx'] },
        ],
      }),
    );
    expect(text).toMatch(/Trong thư mục "BaiThi\/" PHẢI có/i);
    expect(text).toContain('Main.java');
    expect(text).toContain('BaoCao.docx');
  });

  it('file .rar thì nhắc WinRAR + thư mục stem', () => {
    const text = renderInstructions(
      base({ requiredDeliverables: [{ filename: 'BaiThi.rar', entries: [] }] }),
    );
    expect(text).toMatch(/BaiThi\//);
    expect(text).toMatch(/winrar/i);
  });

  it('đuôi không phải archive thì không có câu đóng gói thư mục', () => {
    const text = renderInstructions(
      base({ requiredDeliverables: [{ filename: 'Cau2.py', entries: [] }] }),
    );
    expect(text).toContain('* Cau2.py');
    expect(text).not.toMatch(/nén NỘI DUNG/i);
  });
});
