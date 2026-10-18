import { NGAN_XEP_V1 } from '../../eval/rehearsal/scenarios/ngan-xep-v1';
import { hasComment } from './comment-presence';
import { shortNameDeclarations } from './short-names';
import { shadowStyleVerdict } from './shadow-verdict';

const code = (mssv: string) => NGAN_XEP_V1.submissions.find((s) => s.mssv === mssv)!.code;

describe('hasComment — có chú thích thật hay không', () => {
  it('bài không có chú thích nào → false', () => {
    expect(hasComment('int main() { return 0; }')).toBe(false);
  });

  it('chỉ có chuỗi chứa // → false (không phải chú thích)', () => {
    expect(hasComment('const char* u = "//";')).toBe(false);
  });

  it('có một chú thích // bất kỳ → true (kiểm tra có/không, không kiểm tra chú thích có ích)', () => {
    expect(hasComment('int a; // x')).toBe(true);
  });
});

describe('shortNameDeclarations — tên 1–2 ký tự được khai báo', () => {
  it('biến khai báo ngắn bị bắt', () => {
    expect(shortNameDeclarations('int a;', {})).toEqual(['a']);
  });

  it('tham số hàm và kiểu tham chiếu bị bắt, tên dài không bị bắt', () => {
    expect(shortNameDeclarations('void f(Node*& t, long long value) {}', {})).toEqual(['t']);
  });

  it('trường của struct bị bắt', () => {
    expect(shortNameDeclarations('struct N { int v; N* n; };', {})).toEqual(['n', 'v']);
  });

  it('kiểu std::/vector<...> và tên ngắn sau nó bị bắt', () => {
    expect(shortNameDeclarations('vector<long long> a(n);', {})).toEqual(['a']);
    expect(shortNameDeclarations('std::string s = "";', {})).toEqual(['s']);
  });

  it('bộ đếm vòng lặp i/j/k không bị tính', () => {
    expect(shortNameDeclarations('for (int i = 0; i < 3; i++) {}', {})).toEqual([]);
  });

  it('tên trong danh sách ngoại lệ của câu không bị tính', () => {
    expect(shortNameDeclarations('long long n;', { exceptions: ['n'] })).toEqual([]);
  });

  it('từ khóa và câu lệnh không bị nhận là khai báo', () => {
    expect(shortNameDeclarations('return x;', {})).toEqual([]);
    expect(shortNameDeclarations('else x = 1;', {})).toEqual([]);
  });

  it('phép so sánh < và > trong điều kiện không bị nhận là kiểu mẫu (review W1)', () => {
    expect(shortNameDeclarations('if (a<b && c> d) {}', {})).toEqual([]);
    expect(shortNameDeclarations('while(top<sz && arr[top]> x) { }', {})).toEqual([]);
    expect(shortNameDeclarations('if(n<max && val> m) x = 1;', {})).toEqual([]);
    expect(shortNameDeclarations('push(a<b && c> d);', {})).toEqual([]);
  });

  it('kiểu mẫu lồng nhau và có số vẫn được nhận (không hồi quy)', () => {
    expect(shortNameDeclarations('vector<vector<int>> g(n);', {})).toEqual(['g']);
    expect(shortNameDeclarations('std::array<int, 5> a;', {})).toEqual(['a']);
  });

  it('khởi tạo biến kiểu constructor không bị nhận là khai báo hàm (review W2)', () => {
    expect(shortNameDeclarations('Node a(5);', {})).toEqual(['a']);
    expect(shortNameDeclarations('int b(n);', {})).toEqual(['b']);
  });

  it('khai báo hàm không bị tính là biến', () => {
    expect(shortNameDeclarations('void f() {}', {})).toEqual([]);
    // Tên hàm g không tính, nhưng tham số t là tên một ký tự và vẫn tính.
    expect(shortNameDeclarations('int g(Node* t);', {})).toEqual(['t']);
  });

  it('chú thích và chuỗi không bị quét', () => {
    expect(shortNameDeclarations('// int a;\nconst char* text = "int b;";', {})).toEqual([]);
  });
});

describe('shadowStyleVerdict — trên năm bài diễn tập ngan-xep-v1', () => {
  // Kỳ vọng suy từ kịch bản: thieu_chu_thich có ở 018 và 021 (không có chú thích nào); ten_bien ở 018 (a,x,t,p,f,v,n),
  // và 021 có a,x (n là chữ đề bài, nằm trong ngoại lệ của câu).
  const EXCEPTIONS = { exceptions: ['n'] };

  it('HS2410018: thiếu chú thích và có tên một chữ', () => {
    const v = shadowStyleVerdict(code('HS2410018'), EXCEPTIONS);
    expect(v.thieuChuThich).toBe(true);
    expect(v.tenBienVoNghia).toBe(true);
    expect(v.shortNames).toEqual(expect.arrayContaining(['a', 'x', 't', 'p', 'f', 'v']));
  });

  it('HS2410021: thiếu chú thích, tên ngắn chỉ là a và x (n được ngoại lệ)', () => {
    const v = shadowStyleVerdict(code('HS2410021'), EXCEPTIONS);
    expect(v.thieuChuThich).toBe(true);
    expect(v.shortNames.sort()).toEqual(['a', 'x']);
  });

  it.each(['HS2410019', 'HS2410020', 'HS2410022'])('%s: có chú thích và không có tên ngắn → không bị gắn luật nào', (mssv) => {
    const v = shadowStyleVerdict(code(mssv), EXCEPTIONS);
    expect(v.thieuChuThich).toBe(false);
    expect(v.tenBienVoNghia).toBe(false);
  });
});
