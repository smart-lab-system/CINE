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

describe('describeAuditEntry — hành động chưa có mô tả riêng', () => {
  it('rơi về tên hành động, loại đối tượng và 8 ký tự đầu của id', () => {
    expect(
      describeAuditEntry({
        action: 'room.create',
        targetType: 'room',
        targetId: '9f8e7d6c-1111-2222-3333-444444444444',
        oldValue: {},
        newValue: {},
      }),
    ).toBe('room.create · room 9f8e7d6c…');
  });

  it('dùng targetLabel (quy ước cho hành động dữ liệu nền) thay cho id khi có', () => {
    expect(
      describeAuditEntry({
        action: 'room.update',
        targetType: 'room',
        targetId: '9f8e7d6c-1111-2222-3333-444444444444',
        oldValue: { capacity: 40 },
        newValue: { targetLabel: 'H3.03', capacity: 45 },
      }),
    ).toBe('room.update · room H3.03: sức chứa 40 → 45');
  });

  it('liệt kê mọi trường đổi, nhãn tiếng Việt cho trường quen thuộc, giữ nguyên tên trường lạ', () => {
    const text = describeAuditEntry({
      action: 'semester.update',
      targetType: 'semester',
      targetId: '9f8e7d6c-1111-2222-3333-444444444444',
      oldValue: { endDate: '2027-01-31', mysteryField: 1 },
      newValue: { targetLabel: 'HK1 2026-2027', endDate: '2027-02-15', mysteryField: 2 },
    });
    expect(text).toBe(
      'semester.update · semester HK1 2026-2027: ngày kết thúc 2027-01-31 → 2027-02-15; mysteryField 1 → 2',
    );
  });

  it('hiện kiểu luận lý bằng có/không và rút gọn uuid dài trong giá trị', () => {
    const text = describeAuditEntry({
      action: 'room.update',
      targetType: 'room',
      targetId: '9f8e7d6c-1111-2222-3333-444444444444',
      oldValue: { isActive: true },
      newValue: { targetLabel: 'H3.03', isActive: false, ownerId: 'abcdef01-1111-2222-3333-444444444444' },
    });
    expect(text).toContain('đang hoạt động có → không');
    expect(text).toContain('ownerId abcdef01…');
  });

  it('chỉ có giá trị mới (tạo) thì hiện giá trị, không có mũi tên', () => {
    const text = describeAuditEntry({
      action: 'room.create',
      targetType: 'room',
      targetId: '9f8e7d6c-1111-2222-3333-444444444444',
      oldValue: {},
      newValue: { targetLabel: 'H3.04', capacity: 30 },
    });
    expect(text).toBe('room.create · room H3.04: sức chứa 30');
  });

  it('chịu được giá trị null (bị cắt vì quá lớn) mà không ném', () => {
    expect(() =>
      describeAuditEntry({
        action: 'class.update',
        targetType: 'class',
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
