import { ForbiddenException } from '@nestjs/common';
import { ExamBankService } from './exam-bank.service';

describe('ExamBankService.assertTeachesCourse', () => {
  function serviceWithCount(n: number): ExamBankService {
    return new ExamBankService(
      {} as never,
      {} as never,
      {} as never,
      { count: jest.fn().mockResolvedValue(n) } as never,
      {} as never,
    );
  }

  it('cho phép khi GV có lớp của môn', async () => {
    await expect(serviceWithCount(1).assertTeachesCourse('t1', 'c1')).resolves.toBeUndefined();
  });

  it('403 khi GV không dạy môn', async () => {
    await expect(serviceWithCount(0).assertTeachesCourse('t1', 'c1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
