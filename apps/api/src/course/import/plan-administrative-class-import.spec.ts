import { planAdministrativeClassImport } from './plan-administrative-class-import';

const existing = [
  { id: 'a1', code: 'DHKTPM18ATT' },
  { id: 'a2', code: 'DHKTPM18CTT' },
];
const row = (line: number, code: string) => ({ line, code });

describe('planAdministrativeClassImport', () => {
  it('mã mới được viết hoa và cắt khoảng trắng; ghi create', () => {
    const plan = planAdministrativeClassImport([row(2, ' dhktpm19a ')], existing);
    expect(plan.rows[0]).toMatchObject({ status: 'new', label: 'DHKTPM19A', similar: [] });
    expect(plan.writes).toEqual([{ code: 'DHKTPM19A' }]);
  });

  it('ô dạng Tên(mã) được đọc thành mã trong ngoặc; bản xem trước hiện mã đã hiểu (quyết định của user 06/10)', () => {
    const plan = planAdministrativeClassImport([row(2, 'Anh văn 4(422001525805)')], existing);
    expect(plan.rows[0]).toMatchObject({ status: 'new', label: '422001525805' });
    expect(plan.writes).toEqual([{ code: '422001525805' }]);
  });

  it('mã đã có (không phân biệt hoa-thường) là "unchanged", không ghi gì, KHÔNG sửa (chỉ thêm)', () => {
    const plan = planAdministrativeClassImport([row(2, 'dhktpm18att')], existing);
    expect(plan.rows[0]).toMatchObject({ status: 'unchanged', label: 'DHKTPM18ATT' });
    expect(plan.writes).toEqual([]);
  });

  it('KHÔNG cảnh báo cặp thật anh em ATT/CTT (Review Focus 4)', () => {
    const plan = planAdministrativeClassImport([row(2, 'DHKTPM18BTT')], existing);
    expect(plan.rows[0].similar).toEqual([]);
  });

  it('cảnh báo mã mới thừa một ký tự so với mã có sẵn', () => {
    const plan = planAdministrativeClassImport([row(2, 'DHKTPM18ATTT')], existing);
    expect(plan.rows[0].similar).toEqual([
      { id: 'a1', name: 'DHKTPM18ATT', reason: 'insert_delete', source: 'existing', line: null },
    ]);
  });

  it('cảnh báo hai ký tự liền kề đổi chỗ', () => {
    const plan = planAdministrativeClassImport([row(2, 'DHKPTM18ATT')], existing);
    expect(plan.rows[0].similar[0]).toMatchObject({ id: 'a1', reason: 'swap' });
  });

  it.each([
    [row(2, ''), /3–30/],
    [row(3, 'AB'), /3–30/],
    [row(4, 'DHK-TPM'), /chữ và số/],
    [row(5, 'DHK TPM18'), /chữ và số/],
  ])('mã không hợp lệ: %j', (input, pattern) => {
    const plan = planAdministrativeClassImport([input], existing);
    expect(plan.rows[0].status).toBe('error');
    expect(plan.rows[0].errors[0]).toMatch(pattern);
  });

  it('mã trùng trong file (khác hoa-thường): dòng sau là lỗi nêu số dòng đầu', () => {
    const plan = planAdministrativeClassImport([row(2, 'abc123'), row(3, 'ABC123')], existing);
    expect(plan.rows.map((r) => r.status)).toEqual(['new', 'error']);
    expect(plan.rows[1].errors[0]).toMatch(/dòng 2/);
  });

  it('hai mã MỚI gần giống nhau trong cùng file đều bị đánh dấu', () => {
    const plan = planAdministrativeClassImport([row(2, 'DHKTPM19A'), row(3, 'DHKTPM19AA')], []);
    expect(plan.rows[0].similar).toEqual([
      { id: null, name: 'DHKTPM19AA', reason: 'insert_delete', source: 'file', line: 3 },
    ]);
    expect(plan.rows[1].similar).toEqual([
      { id: null, name: 'DHKTPM19A', reason: 'insert_delete', source: 'file', line: 2 },
    ]);
  });

  it('mã có sẵn mà file không nhắc tới không có dòng nào (không xoá)', () => {
    const plan = planAdministrativeClassImport([row(2, 'DHKTPM19A')], existing);
    expect(plan.rows).toHaveLength(1);
  });
});
