import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { GenerateExamDto } from './generate-exam.dto';

/** Đề mới chỉ sinh được ngôn ngữ mà sandbox chạy được (G2b A2a, spec §3 luật 5). */
function languageErrors(language: string): string[] {
  const dto = plainToInstance(GenerateExamDto, {
    prompt: 'Viết một đề về dãy số cho sinh viên năm nhất',
    questionCount: 1,
    language,
  });
  return validateSync(dto).filter((e) => e.property === 'language').flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('GenerateExamDto.language', () => {
  it.each(['cpp', 'python'])('%s được nhận', (language) => {
    expect(languageErrors(language)).toEqual([]);
  });

  it.each(['java', 'node'])('%s bị từ chối: sandbox không chạy được ngôn ngữ này', (language) => {
    expect(languageErrors(language).length).toBeGreaterThan(0);
  });
});
