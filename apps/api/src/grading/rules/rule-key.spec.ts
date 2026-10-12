import { slugifyRuleKey } from './rule-key';

describe('slugifyRuleKey', () => {
  it('bỏ dấu tiếng Việt kể cả đ, hạ chữ thường, gạch dưới', () => {
    expect(slugifyRuleKey('Tên biến không nói lên vai trò')).toBe('ten_bien_khong_noi_len_vai_tro');
    expect(slugifyRuleKey('Đệ quy sai')).toBe('de_quy_sai');
  });
  it('tối đa 60 ký tự để còn chỗ cho hậu tố _N, không kết thúc bằng gạch dưới', () => {
    const k = slugifyRuleKey('a'.repeat(200));
    expect(k.length).toBeLessThanOrEqual(60);
    expect(k.endsWith('_')).toBe(false);
  });
  it('chuỗi không còn ký tự nào → loi_moi', () => {
    expect(slugifyRuleKey('???')).toBe('loi_moi');
  });
});
