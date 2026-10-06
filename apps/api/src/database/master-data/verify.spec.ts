import { compareSnapshots, type DbSnapshot } from './verify';

const snapshot = (tables: Record<string, number>, checksums: Record<string, string> = { grading_result: 'aaa', score_computation: 'bbb' }): DbSnapshot => ({
  takenAt: '2026-10-06T00:00:00.000Z', tables, checksums,
});

describe('compareSnapshots — T-GR-2 và số dòng (spec §8.5)', () => {
  const before = snapshot({ account: 4, class: 3, enrollment: 63, exam_session: 29, grading_result: 62, migrations: 46 });

  it('không đổi gì và không mong đợi gì → đạt', () => {
    const result = compareSnapshots(before, snapshot({ ...before.tables }));
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it('mức đổi mong đợi khớp → đạt; bảng MỚI (không có ở bản "trước") tính là 0 dòng', () => {
    const after = snapshot({ ...before.tables, class: 2, enrollment: 54, student: 54, semester: 1, room: 4, administrative_class: 2, migrations: 48 });
    const result = compareSnapshots(before, after, { class: -1, enrollment: -9, student: 54, semester: 1, room: 4, administrative_class: 2 });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.lines.join('\n')).toContain('enrollment: 63 → 54');
  });

  it('Review Focus 5: một bảng đổi NGOÀI mong đợi → lỗi nêu đúng tên bảng và mức đổi', () => {
    const after = snapshot({ ...before.tables, exam_session: 28 });
    const result = compareSnapshots(before, after);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(['exam_session: đổi -1, mong đợi 0']);
  });

  it('mong đợi đổi mà không đổi → cũng là lỗi (backfill im lặng không làm gì)', () => {
    const result = compareSnapshots(before, snapshot({ ...before.tables }), { student: 54 });
    expect(result.problems).toEqual(['student: đổi 0, mong đợi 54']);
  });

  it('Review Focus 5: checksum điểm khác → lỗi, kể cả khi MỌI số dòng đều đúng', () => {
    const after = snapshot({ ...before.tables }, { grading_result: 'aaa', score_computation: 'ĐÃ-ĐỔI' });
    const result = compareSnapshots(before, after);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(['checksum score_computation KHÁC: bbb → ĐÃ-ĐỔI']);
  });

  it('bảng `migrations` đổi theo bản chất của việc chạy migration — không tính', () => {
    expect(compareSnapshots(before, snapshot({ ...before.tables, migrations: 99 })).ok).toBe(true);
  });
});
