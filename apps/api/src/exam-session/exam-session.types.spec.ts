import {
  AUTO_OPEN_LEAD_MS,
  EARLY_JOIN_LEAD_MS,
  canCancelExamSession,
  isAgentJoinOpen,
  isAwaitingOpen,
  isCollectionOpen,
  isExamOver,
  slotStillHeldSql,
} from './exam-session.types';

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
    expect(isExamOver('not_ready')).toBe(false);
    expect(isExamOver('missed')).toBe(false);
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
    expect(isCollectionOpen('not_ready')).toBe(false);
    expect(isCollectionOpen('missed')).toBe(false);
    expect(isCollectionOpen('cancelled')).toBe(false);
  });

  it('KHÁC isExamOver ở đúng `active` — hai khái niệm, không gộp được', () => {
    expect(isCollectionOpen('active')).toBe(true);
    expect(isExamOver('active')).toBe(false);
  });
});

describe('canCancelExamSession', () => {
  it('cho huỷ khi chưa mở, kể cả đã tùy chỉnh danh sách', () => {
    expect(canCancelExamSession('draft')).toBe(true);
    expect(canCancelExamSession('scheduled')).toBe(true);
    expect(canCancelExamSession('not_ready')).toBe(true);
    expect(canCancelExamSession('missed')).toBe(true);
  });

  it('không huỷ khi đã mở hoặc đã kết thúc', () => {
    expect(canCancelExamSession('active')).toBe(false);
    expect(canCancelExamSession('collecting')).toBe(false);
    expect(canCancelExamSession('completed')).toBe(false);
    expect(canCancelExamSession('cancelled')).toBe(false);
  });
});

describe('isAwaitingOpen', () => {
  it('đúng cho scheduled và not_ready', () => {
    expect(isAwaitingOpen('scheduled')).toBe(true);
    expect(isAwaitingOpen('not_ready')).toBe(true);
  });

  it('sai cho missed — phiên đó không mở lại được', () => {
    expect(isAwaitingOpen('missed')).toBe(false);
    expect(isAwaitingOpen('active')).toBe(false);
    expect(isAwaitingOpen('cancelled')).toBe(false);
  });
});

describe('isAgentJoinOpen', () => {
  const start = new Date('2026-10-23T08:00:00.000Z');
  const end = new Date('2026-10-23T09:00:00.000Z');

  it('cho vào khi active, từ 5 phút trước giờ bắt đầu đến hết giờ', () => {
    expect(EARLY_JOIN_LEAD_MS).toBe(5 * 60 * 1000);
    expect(isAgentJoinOpen('active', start, end, new Date(start.getTime() - EARLY_JOIN_LEAD_MS))).toBe(
      true,
    );
    expect(isAgentJoinOpen('active', start, end, new Date(start.getTime() - 1))).toBe(true);
    expect(isAgentJoinOpen('active', start, end, start)).toBe(true);
    expect(isAgentJoinOpen('active', start, end, end)).toBe(true);
  });

  it('từ chối sớm hơn 5 phút, sau giờ kết thúc, hoặc phiên chưa active', () => {
    expect(
      isAgentJoinOpen('active', start, end, new Date(start.getTime() - EARLY_JOIN_LEAD_MS - 1)),
    ).toBe(false);
    expect(isAgentJoinOpen('active', start, end, new Date(end.getTime() + 1))).toBe(false);
    expect(isAgentJoinOpen('scheduled', start, end, start)).toBe(false);
    expect(isAgentJoinOpen('not_ready', start, end, start)).toBe(false);
  });
});

describe('slotStillHeldSql', () => {
  it('nhả chỗ cho missed và vẫn giữ not_ready', () => {
    const sql = slotStillHeldSql('s.status');
    expect(sql).toContain("s.status <> 'missed'");
    expect(sql).not.toContain('not_ready');
    expect(AUTO_OPEN_LEAD_MS).toBe(10 * 60 * 1000);
  });
});
