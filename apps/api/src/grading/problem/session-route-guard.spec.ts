import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { assertBundleRouteAllowed, assertSessionRouteAllowed } from './session-route-guard';

/** Giả lập transaction: câu lệnh khoá giảng viên và truy vấn owner được bỏ qua, truy vấn phiên trả `row`. */
function managerWith(row: { blueprint_confirmed_at: Date | null; problem_count: number }, owner: boolean = true): EntityManager {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('SELECT teacher_id')) return owner ? [{ teacher_id: 'teacher-1' }] : [];
    if (sql.includes('pg_advisory')) return [];
    return [row];
  });
  return { query } as unknown as EntityManager;
}

describe('assertSessionRouteAllowed — route cấp phiên (ghi vào câu mặc định)', () => {
  it('phiên một câu chưa xác nhận đề cương → cho qua', async () => {
    await expect(assertSessionRouteAllowed(managerWith({ blueprint_confirmed_at: null, problem_count: 1 }), 's')).resolves.toBeUndefined();
  });

  it('phiên nhiều câu → 409, vì route cấp phiên không biết câu nào để ghi', async () => {
    await expect(assertSessionRouteAllowed(managerWith({ blueprint_confirmed_at: null, problem_count: 3 }), 's')).rejects.toThrow(
      ConflictException,
    );
  });

  it('đề cương đã xác nhận → 409', async () => {
    await expect(assertSessionRouteAllowed(managerWith({ blueprint_confirmed_at: new Date(), problem_count: 1 }), 's')).rejects.toThrow(
      ConflictException,
    );
  });

  it('phiên không tồn tại hoặc không thuộc giảng viên này → 404', async () => {
    await expect(assertSessionRouteAllowed(managerWith({ blueprint_confirmed_at: null, problem_count: 1 }, false), 's')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('assertBundleRouteAllowed — route theo gói test của một câu', () => {
  it('phiên nhiều câu chưa xác nhận → cho qua: gói đã gắn câu của nó', async () => {
    await expect(assertBundleRouteAllowed(managerWith({ blueprint_confirmed_at: null, problem_count: 3 }), 's')).resolves.toBeUndefined();
  });

  it('phiên một câu chưa xác nhận → cho qua', async () => {
    await expect(assertBundleRouteAllowed(managerWith({ blueprint_confirmed_at: null, problem_count: 1 }), 's')).resolves.toBeUndefined();
  });

  it('đề cương đã xác nhận → vẫn 409: đề cương khoá thì gói không đổi nữa', async () => {
    await expect(assertBundleRouteAllowed(managerWith({ blueprint_confirmed_at: new Date(), problem_count: 3 }), 's')).rejects.toThrow(
      ConflictException,
    );
  });

  it('phiên không tồn tại hoặc không thuộc giảng viên này → 404', async () => {
    await expect(assertBundleRouteAllowed(managerWith({ blueprint_confirmed_at: null, problem_count: 3 }, false), 's')).rejects.toThrow(
      NotFoundException,
    );
  });
});
