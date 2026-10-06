import {
  administrativeCodeProblem,
  normalizeAdministrativeCode,
  normalizeRoomName,
  roomNameProblem,
} from './master-data-normalize';

describe('normalizeRoomName', () => {
  it('cắt đầu-cuối và gộp khoảng trắng liên tiếp thành một', () => {
    expect(normalizeRoomName('  Phòng   máy  A1 ')).toBe('Phòng máy A1');
    expect(normalizeRoomName('P\tA101')).toBe('P A101');
  });
  it('không đổi hoa-thường hay dấu', () => {
    expect(normalizeRoomName('Phòng H3.03')).toBe('Phòng H3.03');
  });
});

describe('roomNameProblem', () => {
  it('rỗng và quá 100 ký tự là lỗi', () => {
    expect(roomNameProblem('')).toMatch(/không được để trống/);
    expect(roomNameProblem('x'.repeat(101))).toMatch(/tối đa 100/);
  });
  it('tên hợp lệ không có lỗi', () => {
    expect(roomNameProblem('Phòng máy A1')).toBeNull();
    expect(roomNameProblem('x'.repeat(100))).toBeNull();
  });
});

describe('normalizeAdministrativeCode', () => {
  it('viết hoa và cắt khoảng trắng', () => {
    expect(normalizeAdministrativeCode(' dhktpm18a ')).toBe('DHKTPM18A');
  });
  it('KHÔNG bỏ khoảng trắng ở giữa: đó là lỗi để người dùng sửa, không phải để đoán', () => {
    expect(normalizeAdministrativeCode('dhk tpm18a')).toBe('DHK TPM18A');
  });
  it('lấy mã trong ngoặc CUỐI của chuỗi dạng Tên(mã), như danh sách của trường hay xuất (quyết định của user 06/10)', () => {
    expect(normalizeAdministrativeCode('Anh văn 4(422001525805)')).toBe('422001525805');
    expect(normalizeAdministrativeCode(' Cấu trúc dữ liệu ( dhktpm18a ) ')).toBe('DHKTPM18A');
    expect(normalizeAdministrativeCode('(ABC123)')).toBe('ABC123');
  });
  it('ngoặc không chứa một mã hợp lệ, hoặc nhiều cặp ngoặc → KHÔNG đoán: giữ nguyên chuỗi (viết hoa) để administrativeCodeProblem báo lỗi', () => {
    expect(normalizeAdministrativeCode('Lớp A(2)')).toBe('LỚP A(2)');
    expect(normalizeAdministrativeCode('ABC(DEF)(GHI)')).toBe('ABC(DEF)(GHI)');
    expect(normalizeAdministrativeCode('ABC(DE F)')).toBe('ABC(DE F)');
    expect(administrativeCodeProblem(normalizeAdministrativeCode('Lớp A(2)'))).toMatch(/chữ và số/);
  });
});

describe('administrativeCodeProblem', () => {
  it('chấp nhận mã 3–30 ký tự chữ HOA và số', () => {
    expect(administrativeCodeProblem('DHKTPM18A')).toBeNull();
    expect(administrativeCodeProblem('A1B')).toBeNull();
    expect(administrativeCodeProblem('A'.repeat(30))).toBeNull();
  });
  it('từ chối quá ngắn, quá dài, có ký tự lạ, chữ thường', () => {
    expect(administrativeCodeProblem('AB')).toMatch(/3–30/);
    expect(administrativeCodeProblem('A'.repeat(31))).toMatch(/3–30/);
    expect(administrativeCodeProblem('DHK-TPM')).toMatch(/chữ và số/);
    expect(administrativeCodeProblem('DHK TPM')).toMatch(/chữ và số/);
    expect(administrativeCodeProblem('dhktpm18a')).toMatch(/chữ và số/);
  });
});
