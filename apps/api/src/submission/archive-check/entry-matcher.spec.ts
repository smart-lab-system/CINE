import { matchEntries } from './entry-matcher';

describe('matchEntries', () => {
  it('đủ hết thì không thiếu gì', () => {
    expect(matchEntries(['Main.java', 'BaoCao.docx'], ['Main.java', 'BaoCao.docx'])).toEqual([]);
  });

  it('trả về đúng phần thiếu, theo thứ tự giảng viên khai', () => {
    expect(matchEntries(['A.java', 'B.docx', 'C.txt'], ['B.docx'])).toEqual(['A.java', 'C.txt']);
  });

  // §3.2 — lý do cả thiết kế chọn khớp theo tên: em nén CẢ THƯ MỤC CHỨA là
  // lỗi phổ biến nhất, và khớp theo đường dẫn sẽ đánh trượt toàn bộ bài dù
  // em không thiếu gì.
  it('khớp file nằm sâu trong thư mục', () => {
    expect(matchEntries(['Main.java'], ['BaiThi_2180123/src/Main.java'])).toEqual([]);
  });

  it('không phân biệt hoa thường — Windows coi chúng là một file', () => {
    expect(matchEntries(['Main.java'], ['MAIN.JAVA'])).toEqual([]);
    expect(matchEntries(['Main.java'], ['src/main.java'])).toEqual([]);
  });

  it('entry thư mục không bao giờ khớp', () => {
    expect(matchEntries(['src'], ['src/'])).toEqual(['src']);
  });

  it('kỳ vọng rỗng thì không thiếu gì', () => {
    expect(matchEntries([], ['bat.ky.gi'])).toEqual([]);
  });

  it('thực tế rỗng thì thiếu hết', () => {
    expect(matchEntries(['A.java'], [])).toEqual(['A.java']);
  });

  // Một số công cụ nén trên Windows ghi '\' làm dấu phân cách.
  it('coi cả "\\" là dấu phân cách', () => {
    expect(matchEntries(['Main.java'], ['src\\Main.java'])).toEqual([]);
  });

  it('bỏ qua thư mục ghi bằng "\\"', () => {
    expect(matchEntries(['src'], ['src\\'])).toEqual(['src']);
  });

  it('một entry trùng tên ở hai thư mục vẫn chỉ cần khớp một lần', () => {
    expect(matchEntries(['Main.java'], ['a/Main.java', 'b/Main.java'])).toEqual([]);
  });
});
