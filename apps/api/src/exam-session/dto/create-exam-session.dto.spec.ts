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

function validateFilenames(requiredFilenames: unknown) {
  const dto = plainToInstance(CreateExamSessionDto, {
    name: 'Phiên thi',
    classId: '11111111-1111-1111-1111-111111111111',
    roomId: '22222222-2222-2222-2222-222222222222',
    examType: 'TK',
    startTime: '2027-01-01T08:00:00.000Z',
    endTime: '2027-01-01T10:00:00.000Z',
    requiredFilenames,
  });
  return validateSync(dto).filter((error) => error.property === 'requiredFilenames');
}

describe('CreateExamSessionDto.requiredFilenames', () => {
  it('từ chối tên file đi ngược thư mục dù filename-template được nạp trước', () => {
    // Bài test hồi quy cho vòng lặp import. Nó KHÔNG kiểm regex — chỗ đó
    // đã có filename-template.spec.ts — mà kiểm rằng regex thật sự tới
    // được decorator. Một `@Matches(undefined)` vẫn cho ra DTO hợp lệ,
    // nên bộ e2e chỉ thấy 201 ở nơi lẽ ra phải là 400.
    const errors = validateFilenames(['../etc/passwd']);

    expect(errors).toHaveLength(1);
    expect(Object.keys(errors[0].constraints ?? {})).toContain('matches');
  });

  it('từ chối ô không tồn tại', () => {
    expect(validateFilenames(['{LOP}_Cau1.docx'])).toHaveLength(1);
  });

  it('nhận tên file thường và mẫu có ô hợp lệ', () => {
    expect(validateFilenames(['Cau1.docx', '{PHONG}_{MSSV}_{TEN}_{SOMAY}.docx'])).toHaveLength(0);
  });
});
