import { describe, expect, it } from 'vitest';
import { ACTOR_SYSTEM_LABEL, describeAuditEntry } from './audit-describe';

const base = { targetType: 'exam_session', targetId: '12345678-aaaa-bbbb-cccc-1234567890ab' };

describe('describeAuditEntry — năm hành động đã có', () => {
  it('chuyển chủ phiên thi', () => {
    expect(
      describeAuditEntry({
        ...base,
        action: 'exam_session.reassign_teacher',
        oldValue: { teacherId: 'aaaaaaaa-1111-2222-3333-444444444444' },
        newValue: { teacherId: 'bbbbbbbb-1111-2222-3333-444444444444' },
      }),
    ).toBe('Chuyển phiên thi sang giảng viên khác (aaaaaaaa… → bbbbbbbb…)');
  });

  it('duyệt cho sinh viên vào phòng thi, kèm lý do', () => {
    expect(
      describeAuditEntry({
        ...base,
        action: 'exam_session.access_granted',
        oldValue: null,
        newValue: { studentMssv: 'SV0001', studentName: 'Nguyễn Văn A', reason: 'Thi bù do ốm' },
      }),
    ).toBe('Duyệt cho sinh viên Nguyễn Văn A (SV0001) vào phòng thi — lý do: Thi bù do ốm');
  });

  it('duyệt vào phòng thi khi không có lý do thì không để thừa dấu gạch', () => {
    expect(
      describeAuditEntry({
        ...base,
        action: 'exam_session.access_granted',
        oldValue: null,
        newValue: { studentMssv: 'SV0001', studentName: 'Nguyễn Văn A' },
      }),
    ).toBe('Duyệt cho sinh viên Nguyễn Văn A (SV0001) vào phòng thi');
  });

  it('ba kiểu sửa điểm sau khi công bố', () => {
    expect(
      describeAuditEntry({
        targetType: 'grading_result',
        targetId: base.targetId,
        action: 'grading_result.manual_score_after_finalize',
        oldValue: { score: '7,50' },
        newValue: { score: '8,00' },
      }),
    ).toBe('Sửa điểm sau khi đã công bố: 7,50 → 8,00');

    expect(
      describeAuditEntry({
        targetType: 'grading_result',
        targetId: base.targetId,
        action: 'grading_result.score_edited_after_finalize',
        oldValue: { finalScore: '6,00' },
        newValue: { finalScore: '6,50', privateNote: 'em xin phúc khảo' },
      }),
    ).toBe('Sửa điểm sau khi đã công bố: 6,00 → 6,50 (có ghi chú riêng)');

    expect(
      describeAuditEntry({
        targetType: 'grading_result',
        targetId: base.targetId,
        action: 'grading_result.score_reapplied_after_finalize',
        oldValue: { score: '5,00' },
        newValue: { score: '4,75' },
      }),
    ).toBe('Áp lại bảng giá cho bài đã công bố: 5,00 → 4,75');
  });

  it('không lộ nội dung ghi chú riêng của giảng viên', () => {
    const text = describeAuditEntry({
      targetType: 'grading_result',
      targetId: base.targetId,
      action: 'grading_result.score_edited_after_finalize',
      oldValue: { finalScore: '6,00' },
      newValue: { finalScore: '6,50', privateNote: 'BÍ MẬT' },
    });
    expect(text).not.toContain('BÍ MẬT');
  });

  it('điểm trước đó không có thì hiện dấu gạch ngang, không hiện "null"', () => {
    expect(
      describeAuditEntry({
        targetType: 'grading_result',
        targetId: base.targetId,
        action: 'grading_result.manual_score_after_finalize',
        oldValue: { score: null },
        newValue: { score: '8,00' },
      }),
    ).toBe('Sửa điểm sau khi đã công bố: — → 8,00');
  });
});

// Tên hành động ở đây là BỊA (`widget.*`) có chủ ý: mọi hành động thật ghi audit đều có câu riêng (khối "dữ liệu nền" ở cuối file, T-AUD-5),
// nên dùng tên thật làm ví dụ cho nhánh dự phòng sẽ vỡ ngay khi hành động đó được thêm câu. Ngày trong giá trị vẫn được đọc dd/mm/yyyy
// vì `format` dùng chung cho cả hai nhánh.
describe('describeAuditEntry — hành động chưa có mô tả riêng', () => {
  it('rơi về tên hành động, loại đối tượng và 8 ký tự đầu của id', () => {
    expect(
      describeAuditEntry({
        action: 'widget.create',
        targetType: 'widget',
        targetId: '9f8e7d6c-1111-2222-3333-444444444444',
        oldValue: {},
        newValue: {},
      }),
    ).toBe('widget.create · widget 9f8e7d6c…');
  });

  it('dùng targetLabel (quy ước cho hành động dữ liệu nền) thay cho id khi có', () => {
    expect(
      describeAuditEntry({
        action: 'widget.update',
        targetType: 'widget',
        targetId: '9f8e7d6c-1111-2222-3333-444444444444',
        oldValue: { capacity: 40 },
        newValue: { targetLabel: 'H3.03', capacity: 45 },
      }),
    ).toBe('widget.update · widget H3.03: sức chứa 40 → 45');
  });

  it('liệt kê mọi trường đổi, nhãn tiếng Việt cho trường quen thuộc, giữ nguyên tên trường lạ', () => {
    const text = describeAuditEntry({
      action: 'widget.rename',
      targetType: 'widget',
      targetId: '9f8e7d6c-1111-2222-3333-444444444444',
      oldValue: { endDate: '2027-01-31', mysteryField: 1 },
      newValue: { targetLabel: 'HK1 2026-2027', endDate: '2027-02-15', mysteryField: 2 },
    });
    expect(text).toBe(
      'widget.rename · widget HK1 2026-2027: ngày kết thúc 31/01/2027 → 15/02/2027; mysteryField 1 → 2',
    );
  });

  it('hiện kiểu luận lý bằng có/không và rút gọn uuid dài trong giá trị', () => {
    const text = describeAuditEntry({
      action: 'widget.update',
      targetType: 'widget',
      targetId: '9f8e7d6c-1111-2222-3333-444444444444',
      oldValue: { isActive: true },
      newValue: { targetLabel: 'H3.03', isActive: false, ownerId: 'abcdef01-1111-2222-3333-444444444444' },
    });
    expect(text).toContain('đang hoạt động có → không');
    expect(text).toContain('ownerId abcdef01…');
  });

  it('chỉ có giá trị mới (tạo) thì hiện giá trị, không có mũi tên', () => {
    const text = describeAuditEntry({
      action: 'widget.create',
      targetType: 'widget',
      targetId: '9f8e7d6c-1111-2222-3333-444444444444',
      oldValue: {},
      newValue: { targetLabel: 'H3.04', capacity: 30 },
    });
    expect(text).toBe('widget.create · widget H3.04: sức chứa 30');
  });

  it('chịu được giá trị null (bị cắt vì quá lớn) mà không ném', () => {
    expect(() =>
      describeAuditEntry({
        action: 'widget.archive',
        targetType: 'widget',
        targetId: '9f8e7d6c-1111-2222-3333-444444444444',
        oldValue: null,
        newValue: null,
      }),
    ).not.toThrow();
  });
});

describe('ACTOR_SYSTEM_LABEL', () => {
  it('là "Hệ thống"', () => {
    expect(ACTOR_SYSTEM_LABEL).toBe('Hệ thống');
  });
});

/**
 * Câu cho các hành động dữ liệu nền và hai hành động sửa/huỷ phiên (plan C, D, E1, F). Mỗi hành động ghi audit PHẢI có một câu ở đây:
 * hành động chưa có câu vẫn đọc được qua nhánh dự phòng, nhưng "room.update · room 9f8e7d6c…" không giúp ai điều tra gì (spec §4.2).
 */
const entry = (
  action: string,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
  targetType = action.split('.')[0],
) => ({ action, targetType, targetId: '9f8e7d6c-1111-4222-8333-444455556666', oldValue, newValue });

describe('describeAuditEntry — dữ liệu nền', () => {
  describe('học kỳ', () => {
    it('semester.create nêu nhãn và khoảng ngày dd/mm/yyyy', () => {
      expect(
        describeAuditEntry(
          entry('semester.create', null, {
            targetLabel: 'HK1 2026-2027',
            startDate: '2026-09-01',
            endDate: '2027-01-31',
          }),
        ),
      ).toBe('Tạo học kỳ HK1 2026-2027 (01/09/2026–31/01/2027)');
    });

    it('semester.update nêu nhãn và từ → đến của đúng các trường đổi', () => {
      expect(
        describeAuditEntry(
          entry('semester.update', { endDate: '2027-01-31' }, { targetLabel: 'HK1 2026-2027', endDate: '2027-02-15' }),
        ),
      ).toBe('Sửa học kỳ HK1 2026-2027: ngày kết thúc 31/01/2027 → 15/02/2027');
    });

    it('semester.delete đọc nhãn từ oldValue', () => {
      expect(describeAuditEntry(entry('semester.delete', { targetLabel: 'HK3 2025-2026' }, null))).toBe(
        'Xoá học kỳ HK3 2025-2026',
      );
    });
  });

  describe('phòng', () => {
    it('room.create nêu tên và sức chứa', () => {
      expect(
        describeAuditEntry(entry('room.create', null, { targetLabel: 'Phòng H3.03', capacity: 40, isActive: true })),
      ).toBe('Thêm phòng Phòng H3.03 (sức chứa 40)');
    });

    it('room.create không có sức chứa thì không nói về nó', () => {
      expect(describeAuditEntry(entry('room.create', null, { targetLabel: 'Phòng H3.04', capacity: null, isActive: true }))).toBe(
        'Thêm phòng Phòng H3.04',
      );
    });

    it('room.update: ví dụ trong spec — đổi sức chứa 40 → 45', () => {
      expect(
        describeAuditEntry(entry('room.update', { capacity: 40 }, { targetLabel: 'H3.03', capacity: 45 })),
      ).toBe('Sửa phòng H3.03: sức chứa 40 → 45');
    });

    it('room.update tắt hoạt động đọc được bằng chữ có/không', () => {
      expect(
        describeAuditEntry(entry('room.update', { isActive: true }, { targetLabel: 'H3.03', isActive: false })),
      ).toBe('Sửa phòng H3.03: đang hoạt động có → không');
    });

    it('room.delete', () => {
      expect(describeAuditEntry(entry('room.delete', { targetLabel: 'H3.03', capacity: 40 }, null))).toBe('Xoá phòng H3.03');
    });
  });

  describe('Danh mục lớp danh nghĩa', () => {
    it('create / update / delete', () => {
      expect(describeAuditEntry(entry('administrative_class.create', null, { targetLabel: 'DHKTPM18A', code: 'DHKTPM18A' }))).toBe(
        'Thêm mã lớp danh nghĩa DHKTPM18A vào Danh mục',
      );
      expect(
        describeAuditEntry(
          entry('administrative_class.update', { code: 'DHKTPM18A' }, { targetLabel: 'DHKTPM18B', code: 'DHKTPM18B' }),
        ),
      ).toBe('Đổi mã lớp danh nghĩa DHKTPM18A → DHKTPM18B (nhãn của mọi lớp dùng mã này đổi theo)');
      expect(describeAuditEntry(entry('administrative_class.delete', { targetLabel: 'DHKTPM18A', code: 'DHKTPM18A' }, null))).toBe(
        'Xoá mã lớp danh nghĩa DHKTPM18A khỏi Danh mục',
      );
    });
  });

  describe('lớp', () => {
    it('class.create nêu nhãn kèm học kỳ và giảng viên', () => {
      expect(
        describeAuditEntry(
          entry('class.create', null, {
            targetLabel: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027',
            teacherName: 'Nguyễn Văn A',
          }),
        ),
      ).toBe('Tạo lớp DHKTPM18A – Nhóm 1 · HK1 2026-2027, giảng viên Nguyễn Văn A');
    });

    it('class.update nêu các trường đổi bằng nhãn tiếng Việt', () => {
      expect(
        describeAuditEntry(
          entry('class.update', { groupName: 'Nhóm 1' }, { targetLabel: 'DHKTPM18A – Nhóm 2 · HK1 2026-2027', groupName: 'Nhóm 2' }),
        ),
      ).toBe('Sửa lớp DHKTPM18A – Nhóm 2 · HK1 2026-2027: nhóm Nhóm 1 → Nhóm 2');
    });

    it('class.reassign_teacher nêu A → B', () => {
      expect(
        describeAuditEntry(
          entry(
            'class.reassign_teacher',
            { teacherName: 'Nguyễn Văn A' },
            { targetLabel: 'DHKTPM18A · HK1 2026-2027', teacherName: 'Trần Thị B' },
          ),
        ),
      ).toBe('Đổi giảng viên lớp DHKTPM18A · HK1 2026-2027: Nguyễn Văn A → Trần Thị B');
    });

    it('class.delete', () => {
      expect(describeAuditEntry(entry('class.delete', { targetLabel: 'DHKTPM18A · HK1 2026-2027' }, null))).toBe(
        'Xoá lớp DHKTPM18A · HK1 2026-2027',
      );
    });
  });

  describe('nhập từ file', () => {
    it.each([
      ['semester.import', 'học kỳ'],
      ['room.import', 'phòng thi'],
      ['administrative_class.import', 'mã lớp danh nghĩa'],
      ['class.import', 'lớp'],
    ])('%s nêu loại và số lượng thêm / cập nhật / giữ nguyên', (action, noun) => {
      expect(describeAuditEntry(entry(action, null, { targetLabel: 'x', added: 3, updated: 1, unchanged: 6 }))).toBe(
        `Nhập ${noun} từ file: thêm 3, cập nhật 1, giữ nguyên 6`,
      );
    });

    it('class.import nêu số lớp đổi giảng viên', () => {
      expect(
        describeAuditEntry(
          entry('class.import', null, {
            targetLabel: 'Lớp (nhập từ file)',
            added: 0,
            updated: 2,
            unchanged: 5,
            reassignedTotal: 2,
            reassigned: [{ label: 'A', from: 'X', to: 'Y' }],
          }),
        ),
      ).toBe('Nhập lớp từ file: thêm 0, cập nhật 2, giữ nguyên 5 — đổi giảng viên 2 lớp');
    });
  });

  describe('phiên thi (plan F)', () => {
    it('exam_session.update nêu phiên và các trường đổi; thời điểm theo giờ Việt Nam, không theo máy người xem', () => {
      expect(
        describeAuditEntry(
          entry(
            'exam_session.update',
            { room: 'Phòng A1', startTime: '2026-10-20T01:00:00.000Z' },
            {
              targetLabel: 'Cuối kỳ CTDL',
              code: 'AB12CD',
              room: 'Phòng B2',
              startTime: '2026-10-20T02:30:00.000Z',
            },
          ),
        ),
      ).toBe('Sửa phiên thi Cuối kỳ CTDL (AB12CD): phòng Phòng A1 → Phòng B2; giờ bắt đầu 20/10/2026 08:00 → 20/10/2026 09:30');
    });

    it('exam_session.cancel nêu phiên và lý do nếu có', () => {
      expect(
        describeAuditEntry(
          entry('exam_session.cancel', { status: 'active' }, { targetLabel: 'Cuối kỳ CTDL', code: 'AB12CD', status: 'cancelled', reason: 'Nhầm phòng' }),
        ),
      ).toBe('Huỷ phiên thi Cuối kỳ CTDL (AB12CD) — lý do: Nhầm phòng');
      expect(
        describeAuditEntry(entry('exam_session.cancel', { status: 'active' }, { targetLabel: 'Cuối kỳ CTDL', code: 'AB12CD', status: 'cancelled' })),
      ).toBe('Huỷ phiên thi Cuối kỳ CTDL (AB12CD)');
    });
  });

  it('thiếu targetLabel thì dùng 8 ký tự đầu của id thay vì "undefined" hay "[object Object]" (Review Focus 7)', () => {
    expect(describeAuditEntry(entry('room.delete', {}, null))).toBe('Xoá phòng 9f8e7d6c…');
  });

  it('giá trị bị cắt ở API (null) không làm nổ câu mô tả', () => {
    expect(describeAuditEntry(entry('room.update', null, null))).toBe('Sửa phòng 9f8e7d6c…');
  });
});
