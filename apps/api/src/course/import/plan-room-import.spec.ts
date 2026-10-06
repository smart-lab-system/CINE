import { planRoomImport, type ExistingRoom } from './plan-room-import';

const existing: ExistingRoom[] = [
  { id: 'r1', name: 'Phòng máy A1', capacity: 40 },
  { id: 'r2', name: 'Phòng máy B1', capacity: null },
  { id: 'r3', name: 'Phòng H3.03', capacity: 30 },
];
const row = (line: number, name: string, capacity = '') => ({ line, name, capacity });

describe('planRoomImport', () => {
  it('phòng chưa có là "new": tên được chuẩn hoá, sức chứa được đọc', () => {
    const plan = planRoomImport([row(2, '  Phòng   Mới  ', '50')], existing);
    // Dòng MỚI cũng mang giá trị đã hiểu (từ null → giá trị): bản xem trước phải cho admin thấy 50 là thứ sẽ được ghi.
    expect(plan.rows).toEqual([
      {
        line: 2,
        status: 'new',
        label: 'Phòng Mới',
        changes: [{ field: 'capacity', label: 'Sức chứa', from: null, to: '50' }],
        errors: [],
        similar: [],
      },
    ]);
    expect(plan.writes).toEqual([{ kind: 'create', name: 'Phòng Mới', capacity: 50 }]);
  });

  it('phòng mới không có sức chứa thì không có gì để hiện ngoài tên', () => {
    const plan = planRoomImport([row(2, 'Phòng Mới')], existing);
    expect(plan.rows[0].changes).toEqual([]);
  });

  it('sức chứa để trống ở phòng mới là null, không phải lỗi', () => {
    const plan = planRoomImport([row(2, 'Phòng Mới')], existing);
    expect(plan.writes).toEqual([{ kind: 'create', name: 'Phòng Mới', capacity: null }]);
  });

  it('khoá là TÊN không phân biệt hoa-thường: dòng khớp phòng có sẵn không đổi tên (nguyên tắc 2)', () => {
    const plan = planRoomImport([row(2, 'PHÒNG MÁY A1', '40')], existing);
    expect(plan.rows[0]).toMatchObject({ status: 'unchanged', label: 'Phòng máy A1' }); // tên đang LƯU
    expect(plan.writes).toEqual([]);
  });

  it('sức chứa khác: "update" kèm từ → đến, và chỉ sức chứa được ghi', () => {
    const plan = planRoomImport([row(2, 'Phòng máy A1', '45')], existing);
    expect(plan.rows[0]).toMatchObject({
      status: 'update',
      changes: [{ field: 'capacity', label: 'Sức chứa', from: '40', to: '45' }],
    });
    expect(plan.writes).toEqual([{ kind: 'update', id: 'r1', capacity: 45 }]);
  });

  it('phòng chưa có sức chứa nhận sức chứa từ file (từ null)', () => {
    const plan = planRoomImport([row(2, 'Phòng máy B1', '60')], existing);
    expect(plan.rows[0].changes).toEqual([{ field: 'capacity', label: 'Sức chứa', from: null, to: '60' }]);
  });

  it('ô sức chứa TRỐNG không xoá sức chứa đang có (Review Focus 3)', () => {
    const plan = planRoomImport([row(2, 'Phòng máy A1', '')], existing);
    expect(plan.rows[0].status).toBe('unchanged');
    expect(plan.writes).toEqual([]);
  });

  it('phòng có sẵn mà file không nhắc tới không bao giờ có dòng nào (không xoá)', () => {
    const plan = planRoomImport([row(2, 'Phòng máy A1', '40')], existing);
    expect(plan.rows).toHaveLength(1);
    expect(plan.writes).toEqual([]);
  });

  it.each([
    [row(2, ''), /để trống/i],
    [row(3, 'x'.repeat(101)), /100/],
    [row(4, 'Phòng ok1', '0'), /sức chứa/i],
    [row(5, 'Phòng ok2', '1001'), /sức chứa/i],
    [row(6, 'Phòng ok3', 'abc'), /sức chứa/i],
    [row(7, 'Phòng ok4', '40.5'), /sức chứa/i],
  ])('dòng lỗi: %j', (input, pattern) => {
    const plan = planRoomImport([input], existing);
    expect(plan.rows[0].status).toBe('error');
    expect(plan.rows[0].errors.join(' ')).toMatch(pattern);
    expect(plan.rows[0].line).toBe(input.line);
  });

  it('dòng lỗi mang nhãn "Dòng N" khi chưa đọc ra tên', () => {
    expect(planRoomImport([row(9, '')], existing).rows[0].label).toBe('Dòng 9');
  });

  it('một dòng lỗi gom MỌI lỗi của nó thay vì dừng ở lỗi đầu', () => {
    const plan = planRoomImport([row(2, '', 'abc')], existing);
    expect(plan.rows[0].errors).toHaveLength(2);
  });

  it('trùng trong file (không phân biệt hoa-thường): dòng sau là lỗi nêu số dòng đầu', () => {
    const plan = planRoomImport([row(2, 'Phòng Z9'), row(3, 'PHÒNG z9')], existing);
    expect(plan.rows.map((r) => r.status)).toEqual(['new', 'error']);
    expect(plan.rows[1].errors[0]).toMatch(/dòng 2/);
    expect(plan.writes).toHaveLength(1);
  });

  it('phòng mới gần giống phòng có sẵn: similar nêu id, tên, lý do (T-IMP-8)', () => {
    const plan = planRoomImport([row(2, 'Phong H303')], existing);
    expect(plan.rows[0].status).toBe('new');
    expect(plan.rows[0].similar).toEqual([
      { id: 'r3', name: 'Phòng H3.03', reason: 'normalized', source: 'existing', line: null },
    ]);
  });

  it('KHÔNG cảnh báo nhầm trên các phòng thật khác nhau (Review Focus 4)', () => {
    const plan = planRoomImport([row(2, 'Phòng máy C1'), row(3, 'Phòng máy A2')], existing);
    expect(plan.rows.map((r) => r.similar)).toEqual([[], []]);
  });

  it('hai dòng MỚI giống nhau trong cùng file đều được đánh dấu', () => {
    const plan = planRoomImport([row(2, 'P.A101'), row(3, 'P A101')], []);
    expect(plan.rows[0].similar).toEqual([{ id: null, name: 'P A101', reason: 'normalized', source: 'file', line: 3 }]);
    expect(plan.rows[1].similar).toEqual([{ id: null, name: 'P.A101', reason: 'normalized', source: 'file', line: 2 }]);
  });

  it('dòng lỗi không tham gia so sánh gần giống', () => {
    const plan = planRoomImport([row(2, 'P.A101', 'abc'), row(3, 'P A101')], []);
    expect(plan.rows[0].status).toBe('error');
    expect(plan.rows[1].similar).toEqual([]);
  });

  it('dòng có sẵn không bao giờ bị đánh dấu gần giống, dù giống một phòng khác', () => {
    const plan = planRoomImport([row(2, 'Phòng H3.03', '30')], existing);
    expect(plan.rows[0]).toMatchObject({ status: 'unchanged', similar: [] });
  });
});
