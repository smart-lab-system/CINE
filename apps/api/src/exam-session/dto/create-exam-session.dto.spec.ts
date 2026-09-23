import 'reflect-metadata';
// THỨ TỰ HAI DÒNG IMPORT NÀY LÀ NỘI DUNG CỦA BÀI TEST. Nạp
// filename-template TRƯỚC là đúng thứ tự đã làm lỗ hổng lộ ra ngày
// 2026-09-11: hồi đó hai file import lẫn nhau, CommonJS gỡ vòng lặp theo
// module nào được require trước, và khi filename-template thắng thì
// `FILENAME_TEMPLATE_REGEX` còn `undefined` lúc decorator của DTO chạy.
// `@Matches(undefined)` không ném lỗi — class-validator ghi nhận nó rồi
// cho qua MỌI chuỗi. Đừng đảo hai dòng này, và đừng gộp chúng.
import '../filename-template';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateExamSessionDto } from './create-exam-session.dto';

const BASE = {
  name: 'Phiên thi',
  classId: '11111111-1111-1111-1111-111111111111',
  roomName: 'Phòng A101',
  semesterName: 'HK1 2026-2027',
  examType: 'TK',
  startTime: '2027-01-01T08:00:00.000Z',
  endTime: '2027-01-01T10:00:00.000Z',
};

function validateFilenames(requiredFilenames: unknown) {
  const dto = plainToInstance(CreateExamSessionDto, { ...BASE, requiredFilenames });
  return validateSync(dto).filter((error) => error.property === 'requiredFilenames');
}

describe('CreateExamSessionDto.requiredFilenames', () => {
  it('từ chối tên file đi ngược thư mục dù filename-template được nạp trước', () => {
    // Bài test hồi quy cho vòng lặp import. Nó KHÔNG kiểm regex — chỗ đó
    // đã có filename-template.spec.ts — mà kiểm rằng regex thật sự tới
    // được decorator. Một `@Matches(undefined)` vẫn cho ra DTO hợp lệ,
    // nên bộ e2e chỉ thấy 201 ở nơi lẽ ra phải là 400.
    const errors = validateFilenames(['../etc/passwd']);

    // Hình dạng lỗi lồng (property 'nested', hay lỗi con) là chi tiết cài
    // đặt của class-validator — điều cần đúng là CÓ lỗi, tức regex tới
    // được decorator thật, không phải @Matches(undefined) âm thầm cho qua.
    expect(errors.length).toBeGreaterThan(0);
  });

  it('từ chối ô không tồn tại', () => {
    expect(validateFilenames(['{LOP}_Cau1.docx'])).toHaveLength(1);
  });

  it('nhận tên file thường và mẫu có ô hợp lệ', () => {
    expect(validateFilenames(['Cau1.docx', '{PHONG}_{MSSV}_{TEN}_{SOMAY}.docx'])).toHaveLength(0);
  });
});

describe('CreateExamSessionDto.requiredFilenames — trùng tên (Important #2 fix, hồi quy)', () => {
  it('TỪ CHỐI hai tên file trần trùng nhau — trước đây lọt DTO, chết ở 409 tầng DB', () => {
    expect(validateFilenames(['Cau1.docx', 'Cau1.docx'])).not.toHaveLength(0);
  });

  it('TỪ CHỐI trùng tên khi một bên là object có entries', () => {
    expect(
      validateFilenames(['BaiThi.zip', { filename: 'BaiThi.zip', entries: ['Main.java'] }]),
    ).not.toHaveLength(0);
  });

  it('không báo trùng khi tên khác nhau', () => {
    expect(validateFilenames(['Cau1.docx', 'Cau2.docx'])).toHaveLength(0);
  });
});

describe('CreateExamSessionDto.requiredFilenames — file bên trong (đợt archive-content-validation)', () => {
  it('nhận chuỗi trần (tương thích ngược)', () => {
    expect(validateFilenames(['a.docx'])).toHaveLength(0);
  });

  it('nhận object kèm entries cho .zip', () => {
    expect(
      validateFilenames([{ filename: 'BaiThi_{MSSV}.zip', entries: ['Main.java'] }]),
    ).toHaveLength(0);
  });

  it('nhận object kèm entries cho .RAR viết hoa', () => {
    expect(
      validateFilenames([{ filename: 'BaiThi.RAR', entries: ['Main.java'] }]),
    ).toHaveLength(0);
  });

  it('TỪ CHỐI entries trên deliverable không phải file nén', () => {
    expect(
      validateFilenames([{ filename: 'BaoCao.docx', entries: ['Main.java'] }]),
    ).not.toHaveLength(0);
  });

  it('TỪ CHỐI entry chứa dấu "/" — khớp theo tên, đường dẫn là vô nghĩa', () => {
    expect(
      validateFilenames([{ filename: 'a.zip', entries: ['src/Main.java'] }]),
    ).not.toHaveLength(0);
  });

  it('TỪ CHỐI entry chứa "\.."', () => {
    expect(
      validateFilenames([{ filename: 'a.zip', entries: ['../etc/passwd'] }]),
    ).not.toHaveLength(0);
  });

  it('TỪ CHỐI entry trùng nhau', () => {
    expect(
      validateFilenames([{ filename: 'a.zip', entries: ['M.java', 'M.java'] }]),
    ).not.toHaveLength(0);
  });

  it('TỪ CHỐI quá 20 entry', () => {
    const entries = Array.from({ length: 21 }, (_, i) => `f${i}.java`);
    expect(validateFilenames([{ filename: 'a.zip', entries }])).not.toHaveLength(0);
  });

  it('CHO ĐÚNG 20 entry', () => {
    const entries = Array.from({ length: 20 }, (_, i) => `f${i}.java`);
    expect(validateFilenames([{ filename: 'a.zip', entries }])).toHaveLength(0);
  });

  it('entries rỗng thì như không khai gì — vẫn hợp lệ trên .docx', () => {
    expect(validateFilenames([{ filename: 'a.docx', entries: [] }])).toHaveLength(0);
  });

  it('object không kèm entries vẫn hợp lệ', () => {
    expect(validateFilenames([{ filename: 'a.docx' }])).toHaveLength(0);
  });

  it('trộn chuỗi trần và object trong cùng mảng', () => {
    expect(
      validateFilenames(['Cau1.docx', { filename: 'BaiThi.zip', entries: ['Main.java'] }]),
    ).toHaveLength(0);
  });
});
