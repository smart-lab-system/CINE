import 'reflect-metadata';
// Giữ thứ tự giống create-exam-session.dto.spec.ts (filename-template trước DTO).
import '../filename-template';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ReplaceRequiredDeliverablesDto } from './replace-required-deliverables.dto';

function validate(requiredFilenames: unknown) {
  const dto = plainToInstance(ReplaceRequiredDeliverablesDto, { requiredFilenames });
  return validateSync(dto);
}

describe('ReplaceRequiredDeliverablesDto - một gói archive', () => {
  it('nhận đúng một .zip', () => {
    expect(validate([{ filename: '{SOMAY}_{MSSV}_{HOTEN}.zip' }])).toHaveLength(0);
  });

  it('nhận đúng một .rar kèm entries', () => {
    expect(validate([{ filename: 'BaiThi.rar', entries: ['Main.java'] }])).toHaveLength(0);
  });

  it('từ chối file lẻ .docx', () => {
    expect(validate([{ filename: 'Bai.docx' }]).length).toBeGreaterThan(0);
  });

  it('từ chối danh sách rỗng', () => {
    expect(validate([]).length).toBeGreaterThan(0);
  });

  it('từ chối hai gói', () => {
    expect(validate([{ filename: 'a.zip' }, { filename: 'b.zip' }]).length).toBeGreaterThan(0);
  });
});
