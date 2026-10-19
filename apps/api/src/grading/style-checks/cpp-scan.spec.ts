import { scanCpp } from './cpp-scan';

describe('scanCpp — tách chú thích và chuỗi khỏi mã', () => {
  it('nhận chú thích // và /* */ và trả về nội dung của chúng', () => {
    const r = scanCpp('int a; // ghi chú\n/* khối\nnhiều dòng */ int b;');
    expect(r.comments).toEqual([' ghi chú', ' khối\nnhiều dòng ']);
  });

  it('không coi // bên trong chuỗi là chú thích', () => {
    const r = scanCpp('const char* url = "http://example.com"; int a;');
    expect(r.comments).toEqual([]);
    expect(r.code).toContain('int a;');
  });

  it('không coi ký tự / là chú thích và xử lý dấu " escape trong chuỗi', () => {
    const r = scanCpp('char c = \'/\'; char* s = "say \\"hi\\" // not a comment"; int b;');
    expect(r.comments).toEqual([]);
    expect(r.code).toContain('int b;');
  });

  it('giữ nguyên số dòng và vị trí mã sau khi xoá chú thích và chuỗi', () => {
    const src = 'int a; // c1\n"x"\n/* c2\n */ int b;';
    const r = scanCpp(src);
    expect(r.code.split('\n').length).toBe(src.split('\n').length);
    expect(r.code).toContain('int b;');
    expect(r.code).not.toContain('c1');
  });
});
