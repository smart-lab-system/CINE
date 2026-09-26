import { assignCriterionKeys, DuplicateCriterionKeyError } from './criterion-key';

describe('assignCriterionKeys', () => {
  it('sinh key từ mô tả: bỏ dấu, đ → d, chữ thường, ký tự lạ thành _', () => {
    expect(assignCriterionKeys([{ description: 'Tính đúng đắn (C++)' }, { description: 'Hiệu năng — độ phức tạp' }]))
      .toEqual(['tinh_dung_dan_c', 'hieu_nang_do_phuc_tap']);
  });

  it('key khai sẵn được giữ nguyên', () => {
    expect(assignCriterionKeys([{ description: 'Gì cũng được', key: 'tinh_dung' }])).toEqual(['tinh_dung']);
  });

  it('mô tả trùng → thêm hậu tố _2, _3; không đụng key khai sẵn', () => {
    expect(assignCriterionKeys([
      { description: 'Trình bày' },
      { description: 'Trình bày' },
      { description: 'x', key: 'trinh_bay_3' },
      { description: 'Trình bày' },
    ])).toEqual(['trinh_bay', 'trinh_bay_2', 'trinh_bay_3', 'trinh_bay_4']);
  });

  it('mô tả không còn ký tự nào dùng được → tieu_chi_{vị trí}', () => {
    expect(assignCriterionKeys([{ description: '—' }, { description: '!!!' }])).toEqual(['tieu_chi_1', 'tieu_chi_2']);
  });

  it('cắt ở 48 ký tự và không để _ ở cuối', () => {
    const [key] = assignCriterionKeys([{ description: 'a'.repeat(47) + ' bcd' }]);
    expect(key.length).toBeLessThanOrEqual(48);
    expect(key.endsWith('_')).toBe(false);
  });

  it('hai key KHAI SẴN trùng nhau → lỗi, không tự đổi tên key của giảng viên', () => {
    expect(() => assignCriterionKeys([{ description: 'a', key: 'k' }, { description: 'b', key: 'k' }]))
      .toThrow(DuplicateCriterionKeyError);
  });
});
