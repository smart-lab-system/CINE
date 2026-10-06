import { findNearDuplicates, nearDuplicateReason, normalizeForCompare } from './near-duplicate';

describe('normalizeForCompare', () => {
  it('bỏ dấu tiếng Việt, kể cả đ/Đ', () => {
    expect(normalizeForCompare('Đại sảnh 1')).toBe('daisanh1');
    expect(normalizeForCompare('PHÒNG MÁY A1')).toBe('phongmaya1');
  });

  it('bỏ hoa-thường và mọi ký tự không phải chữ/số', () => {
    expect(normalizeForCompare('P.A101')).toBe('pa101');
    expect(normalizeForCompare(' p-a 101 ')).toBe('pa101');
  });

  it('chuỗi chỉ toàn ký tự bị bỏ thì ra rỗng', () => {
    expect(normalizeForCompare('...--  ')).toBe('');
  });
});

describe('nearDuplicateReason', () => {
  // Cặp THẬT từ phép đo 2026-10-04: khác nhau ở khoảng cách chỉnh sửa 1 nhưng là
  // các thực thể khác nhau. Luật "khoảng cách ≤ 2" của bản spec đầu sẽ cảnh báo nhầm
  // đúng chúng — đây là lý do luật hiện nay không tính ký tự thay thế.
  const DISTINCT_REAL_PAIRS: Array<[string, string]> = [
    ['Phòng máy A1', 'Phòng máy B1'],
    ['Phòng máy A1', 'Phòng H3.03'],
    ['Phòng máy B1', 'Phòng H3.03'],
    ['DHKTPM18ATT', 'DHKTPM18CTT'],
  ];

  it.each(DISTINCT_REAL_PAIRS)('KHÔNG cảnh báo cặp thật khác nhau: %s ~ %s', (a, b) => {
    expect(nearDuplicateReason(a, b)).toBeNull();
    expect(nearDuplicateReason(b, a)).toBeNull();
  });

  // Phòng và mã đánh số liên tiếp (reviewer cụm 1, I1): thêm/bớt/đổi chỗ một CHỮ SỐ là một thực thể
  // KHÁC (phòng 1 ≠ phòng 10, H3.01 ≠ H3.10). Tiền tố "Phòng máy" làm chuỗi đủ dài để vượt ngưỡng 5,
  // nên nếu không loại chữ số, import cả một tầng phòng (H3.01…H3.12) sẽ bật cảnh báo hàng loạt.
  const NUMBERED_PAIRS: Array<[string, string]> = [
    ['Phòng máy 1', 'Phòng máy 10'],
    ['Phòng máy 2', 'Phòng máy 12'],
    ['Phòng máy 12', 'Phòng máy 21'],
    ['Phòng A101', 'Phòng A110'],
    ['Phòng H3.01', 'Phòng H3.10'],
    ['Phòng máy A1', 'Phòng máy A12'],
    ['422001525812', '422001525821'],
  ];

  it.each(NUMBERED_PAIRS)('KHÔNG cảnh báo cặp đánh số liên tiếp: %s ~ %s', (a, b) => {
    expect(nearDuplicateReason(a, b)).toBeNull();
    expect(nearDuplicateReason(b, a)).toBeNull();
  });

  it('vẫn cảnh báo khi chữ CÁI thừa/đổi chỗ cạnh một dãy số', () => {
    expect(nearDuplicateReason('Phòng máy 12A', 'Phòng máy 12AA')).toBe('insert_delete');
    expect(nearDuplicateReason('DHKTPM18ATT', 'DHKTPM18TAT')).toBe('swap');
    // đổi chỗ một chữ cái với một chữ số vẫn là lỗi gõ điển hình
    expect(nearDuplicateReason('DHKTPM18ATT', 'DHKTPM1A8TT')).toBe('swap');
  });

  const SHOULD_WARN: Array<[string, string, string]> = [
    ['P.A101', 'P A101', 'normalized'],
    ['P.A101', 'p-a101', 'normalized'],
    ['Phòng H3.03', 'Phong h3.03', 'normalized'],
    ['PHÒNG MÁY A1', 'Phòng máy A1', 'normalized'],
    ['Đại sảnh 1', 'Dai sanh 1', 'normalized'],
    ['DHKTPM18ATT', 'DHKTMP18ATT', 'swap'],
    ['DHKTPM18ATT', 'DHKTPM18AT', 'insert_delete'],
    ['DHKTPM18ATT', 'DHKTPM18ATTT', 'insert_delete'],
  ];

  it.each(SHOULD_WARN)('cảnh báo lỗi gõ điển hình: %s ~ %s (%s)', (a, b, reason) => {
    expect(nearDuplicateReason(a, b)).toBe(reason);
    // Đối xứng: lỗi gõ đúng cả chiều ngược lại.
    expect(nearDuplicateReason(b, a)).toBe(reason);
  });

  it('chuỗi ngắn (< 5 sau chuẩn hoá) không bị so mờ: A1 ≠ A12, H3 ≠ H4', () => {
    expect(nearDuplicateReason('A1', 'A12')).toBeNull();
    expect(nearDuplicateReason('H3', 'H4')).toBeNull();
  });

  it('chuỗi ngắn vẫn bị bắt khi bằng nhau sau chuẩn hoá', () => {
    expect(nearDuplicateReason('A-1', 'a 1')).toBe('normalized');
  });

  it('giống hệt (cả hoa-thường) cũng là "normalized"; việc coi nó là trùng cứng là của người gọi', () => {
    expect(nearDuplicateReason('P101', 'P101')).toBe('normalized');
  });

  it('rỗng sau chuẩn hoá không bao giờ là gần giống', () => {
    expect(nearDuplicateReason('...', '---')).toBeNull();
    expect(nearDuplicateReason('', 'abc')).toBeNull();
  });

  it('khác hai ký tự thay thế thì không', () => {
    expect(nearDuplicateReason('DHKTPM18ATT', 'DHKTPM18CCT')).toBeNull();
  });

  it('hoán vị hai ký tự KHÔNG liền kề không tính', () => {
    expect(nearDuplicateReason('DHKTPM18ATT', 'DHKPTM18ATT')).toBe('swap');
    expect(nearDuplicateReason('ABCDEFG', 'CBADEFG')).toBeNull();
  });
});

describe('findNearDuplicates', () => {
  const rooms = [
    { id: '1', name: 'Phòng máy A1' },
    { id: '2', name: 'Phòng máy B1' },
    { id: '3', name: 'Phòng H3.03' },
  ];

  it('trả các ứng viên gần giống kèm lý do, giữ thứ tự đầu vào', () => {
    const found = findNearDuplicates('Phong may a1', rooms, (r) => r.name);
    expect(found).toEqual([{ candidate: rooms[0], reason: 'normalized' }]);
  });

  it('không có gì gần giống thì mảng rỗng, kể cả khi chỉ khác một ký tự thay thế', () => {
    expect(findNearDuplicates('Phòng máy C1', rooms, (r) => r.name)).toEqual([]);
  });

  it('danh sách rỗng thì mảng rỗng', () => {
    expect(findNearDuplicates('Phòng máy A1', [], (r: { name: string }) => r.name)).toEqual([]);
  });
});
