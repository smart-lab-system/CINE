import { AUDIT_VALUE_CAP_BYTES, buildAuditWhere } from './audit-log-query';

describe('buildAuditWhere', () => {
  it('không có bộ lọc thì không có mệnh đề WHERE', () => {
    expect(buildAuditWhere({})).toEqual({ clause: '', params: [] });
  });

  it('một hành động chính xác dùng so bằng, không LIKE', () => {
    const built = buildAuditWhere({ actions: ['room.update'] });
    expect(built.clause).toBe('WHERE (a.action = $1)');
    expect(built.params).toEqual(['room.update']);
  });

  it('mục kết thúc bằng dấu chấm là tiền tố, dùng starts_with', () => {
    const built = buildAuditWhere({ actions: ['room.'] });
    expect(built.clause).toBe('WHERE (starts_with(a.action, $1))');
    expect(built.params).toEqual(['room.']);
  });

  it('nhiều mục nối bằng OR trong một cặp ngoặc, đánh số theo thứ tự', () => {
    const built = buildAuditWhere({ actions: ['semester.', 'class.create', 'room.'] });
    expect(built.clause).toBe(
      'WHERE (starts_with(a.action, $1) OR a.action = $2 OR starts_with(a.action, $3))',
    );
    expect(built.params).toEqual(['semester.', 'class.create', 'room.']);
  });

  it('mọi bộ lọc nối bằng AND và đánh số liên tục', () => {
    const from = new Date('2026-10-01T00:00:00.000Z');
    const to = new Date('2026-10-02T00:00:00.000Z');
    const built = buildAuditWhere({
      actions: ['room.'],
      actorId: '11111111-1111-4111-8111-111111111111',
      targetType: 'room',
      targetId: '22222222-2222-4222-8222-222222222222',
      from,
      to,
    });
    expect(built.clause).toBe(
      'WHERE (starts_with(a.action, $1)) AND a.actor_id = $2 AND a.target_type = $3 ' +
        'AND a.target_id = $4 AND a.occurred_at >= $5 AND a.occurred_at < $6',
    );
    expect(built.params).toEqual([
      'room.',
      '11111111-1111-4111-8111-111111111111',
      'room',
      '22222222-2222-4222-8222-222222222222',
      from,
      to,
    ]);
  });

  it('không bao giờ nội suy giá trị người dùng vào câu SQL, kể cả ký tự đại diện LIKE', () => {
    const built = buildAuditWhere({ actions: ["room.%", "x_y.", "'; DROP TABLE audit_log; --"] });
    expect(built.clause).not.toMatch(/LIKE/i);
    expect(built.clause).not.toContain('DROP');
    expect(built.clause).not.toContain('%');
    expect(built.params).toEqual(["room.%", "x_y.", "'; DROP TABLE audit_log; --"]);
  });

  it('mảng hành động rỗng không sinh mệnh đề rỗng "()"', () => {
    expect(buildAuditWhere({ actions: [] })).toEqual({ clause: '', params: [] });
  });
});

describe('AUDIT_VALUE_CAP_BYTES', () => {
  it('là 4 KB theo spec §4.2', () => {
    expect(AUDIT_VALUE_CAP_BYTES).toBe(4096);
  });
});
