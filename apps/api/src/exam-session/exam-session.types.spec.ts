import { isCollectionOpen, isExamOver } from './exam-session.types';

/**
 * Hai hàm này tồn tại vì ba guard trong codebase từng viết
 * `=== 'completed'` khi đó là trạng thái hậu-thi DUY NHẤT (spec §5).
 * Test khoá lại đúng chỗ chúng KHÁC nhau — `active` — vì gộp hai khái
 * niệm vào một hàm là cách hỏng dễ xảy ra nhất.
 */
describe('isExamOver', () => {
  it('đúng cho collecting và completed', () => {
    expect(isExamOver('collecting')).toBe(true);
    expect(isExamOver('completed')).toBe(true);
  });

  it('sai cho mọi trạng thái trước khi thi xong', () => {
    expect(isExamOver('draft')).toBe(false);
    expect(isExamOver('scheduled')).toBe(false);
    expect(isExamOver('active')).toBe(false);
    expect(isExamOver('cancelled')).toBe(false);
  });
});

describe('isCollectionOpen', () => {
  it('đúng cho active, collecting, completed', () => {
    expect(isCollectionOpen('active')).toBe(true);
    expect(isCollectionOpen('collecting')).toBe(true);
    expect(isCollectionOpen('completed')).toBe(true);
  });

  it('sai cho draft, scheduled, cancelled', () => {
    expect(isCollectionOpen('draft')).toBe(false);
    expect(isCollectionOpen('scheduled')).toBe(false);
    expect(isCollectionOpen('cancelled')).toBe(false);
  });

  it('KHÁC isExamOver ở đúng `active` — hai khái niệm, không gộp được', () => {
    expect(isCollectionOpen('active')).toBe(true);
    expect(isExamOver('active')).toBe(false);
  });
});
