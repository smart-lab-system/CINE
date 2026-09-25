import { canonicalStringify } from './canonical-json';
import { DUPLICATE_LIMITS, DuplicateGuard, signatureOf } from './dedup';

describe('chống trùng — §7.1', () => {
  it('khoá là tên + tham số sắp ĐỆ QUY: thứ tự khoá không đổi chữ ký', () => {
    expect(signatureOf('run', { n: 100, lang: 'py' })).toBe(signatureOf('run', { lang: 'py', n: 100 }));
    expect(canonicalStringify({ b: { y: 1, x: 2 }, a: [3, { d: 4, c: 5 }] })).toBe(
      '{"a":[3,{"c":5,"d":4}],"b":{"x":2,"y":1}}',
    );
  });

  it('T-AG-4 — cùng tên, KHÁC tham số → không bị chặn', () => {
    const guard = new DuplicateGuard();
    for (let i = 0; i < 20; i++) {
      expect(guard.admit('read_file', { path: `bai-nop/f${i}.cpp` })).toEqual({ admitted: true });
    }
  });

  it('chạm hạn mức cùng chữ ký → trả CHUỖI nói rõ đã chặn, không ném', () => {
    const guard = new DuplicateGuard();
    for (let i = 0; i < DUPLICATE_LIMITS.read_file; i++) {
      expect(guard.admit('read_file', { path: 'bai-nop/main.cpp' }).admitted).toBe(true);
    }
    const blocked = guard.admit('read_file', { path: 'bai-nop/main.cpp' });
    expect(blocked.admitted).toBe(false);
    if (!blocked.admitted) expect(blocked.message).toMatch(/Đã chặn: read_file/);
  });

  it('hạn mức phân tầng của spec: run 8, read_file 4, còn lại 2', () => {
    expect(DUPLICATE_LIMITS).toEqual({ run: 8, read_file: 4, run_tests: 2, list_files: 2 });
  });

  it('T-AG-5 — bị chặn 3 lần LIÊN TIẾP → kẹt; một lời gọi được nhận ở giữa thì đếm lại', () => {
    const guard = new DuplicateGuard();
    guard.admit('list_files', {});
    guard.admit('list_files', {});
    guard.admit('list_files', {}); // chặn 1
    guard.admit('list_files', {}); // chặn 2
    expect(guard.stuck).toBe(false);
    guard.admit('read_file', { path: 'de-bai.md' }); // nhận → đếm lại
    guard.admit('list_files', {}); // chặn 1
    guard.admit('list_files', {}); // chặn 2
    expect(guard.stuck).toBe(false);
    guard.admit('list_files', {}); // chặn 3
    expect(guard.stuck).toBe(true);
  });
});
