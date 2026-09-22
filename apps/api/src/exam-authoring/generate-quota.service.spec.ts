import { HttpException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AiUsageEntity } from './entities/ai-usage.entity';
import { GenerateQuotaService } from './generate-quota.service';

describe('GenerateQuotaService', () => {
  let clock: number;
  let counted: number;
  let usage: Repository<AiUsageEntity>;

  function make(overrides: Partial<ConstructorParameters<typeof GenerateQuotaService>[1]> = {}) {
    return new GenerateQuotaService(usage, {
      burstLimit: 3,
      burstWindowMs: 60_000,
      dailyLimit: 5,
      now: () => clock,
      ...overrides,
    });
  }

  beforeEach(() => {
    clock = 1_000_000;
    counted = 0;
    usage = { count: jest.fn(async () => counted) } as unknown as Repository<AiUsageEntity>;
  });

  it('cho qua tới đúng trần rồi mới chặn', async () => {
    const quota = make();

    await quota.assertWithin('gv-1');
    await quota.assertWithin('gv-1');
    await quota.assertWithin('gv-1');

    await expect(quota.assertWithin('gv-1')).rejects.toBeInstanceOf(HttpException);
  });

  it('chặn bằng 429, không phải 400 hay 500', async () => {
    const quota = make();
    for (let i = 0; i < 3; i++) await quota.assertWithin('gv-1');

    await quota.assertWithin('gv-1').catch((error: HttpException) => {
      expect(error.getStatus()).toBe(429);
      expect(error.message).toContain('phút');
    });
    expect.assertions(2);
  });

  // Tiền tiêu theo NGƯỜI: hạn mức của giảng viên này không được ăn sang
  // giảng viên khác.
  it('đếm riêng từng giảng viên', async () => {
    const quota = make();
    for (let i = 0; i < 3; i++) await quota.assertWithin('gv-1');

    await expect(quota.assertWithin('gv-2')).resolves.toBeUndefined();
  });

  it('qua cửa sổ thì mở lại', async () => {
    const quota = make();
    for (let i = 0; i < 3; i++) await quota.assertWithin('gv-1');

    clock += 60_001;

    await expect(quota.assertWithin('gv-1')).resolves.toBeUndefined();
  });

  // Đây là ca mà "ghi dấu vết SAU khi gọi model xong" sẽ trượt: ba lượt cùng
  // xuất phát trước khi lượt nào kịp xong.
  it('ba lượt song song không cùng lọt qua một khe', async () => {
    const quota = make({ burstLimit: 2 });

    const results = await Promise.allSettled([
      quota.assertWithin('gv-1'),
      quota.assertWithin('gv-1'),
      quota.assertWithin('gv-1'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('hết hạn mức ngày thì chặn dù cửa sổ trượt còn trống', async () => {
    counted = 5;
    const quota = make();

    await quota.assertWithin('gv-1').catch((error: HttpException) => {
      expect(error.getStatus()).toBe(429);
      expect(error.message).toContain('24 giờ');
    });
    expect.assertions(2);
  });

  it('dưới trần ngày thì vẫn cho qua', async () => {
    counted = 4;
    const quota = make();

    await expect(quota.assertWithin('gv-1')).resolves.toBeUndefined();
  });

  // Map giữ trong bộ nhớ, không có sự kiện "ngắt kết nối" để dọn theo như bộ
  // chặn của gateway — nên nó phải tự dọn, nếu không sẽ phình theo số giảng
  // viên từng gọi.
  it('quên hẳn giảng viên đã nguội, không giữ khoá vô hạn', async () => {
    const quota = make();
    await quota.assertWithin('gv-cu');
    clock += 60_001;
    await quota.assertWithin('gv-moi');

    const attempts = (quota as unknown as { attempts: Map<string, number[]> }).attempts;
    expect(attempts.has('gv-cu')).toBe(false);
    expect(attempts.has('gv-moi')).toBe(true);
  });
});
