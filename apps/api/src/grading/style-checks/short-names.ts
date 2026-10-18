import { scanCpp } from './cpp-scan';

/** Từ khóa và câu lệnh không bao giờ là kiểu của một khai báo. */
const NOT_TYPES = new Set([
  'return', 'delete', 'new', 'else', 'case', 'throw', 'using', 'namespace', 'typename', 'struct', 'class', 'template',
  'if', 'while', 'for', 'do', 'goto', 'sizeof', 'cout', 'cin', 'endl', 'std', 'const', 'static', 'unsigned', 'signed',
  'public', 'private', 'protected', 'break', 'continue', 'switch', 'default', 'operator', 'this', 'nullptr', 'true', 'false',
]);

/** Bộ đếm vòng lặp: đề chính sách ngoại lệ cố định (rubric: "trừ biến đếm vòng lặp i/j/k"). */
const LOOP_COUNTERS = new Set(['i', 'j', 'k']);

const TYPE_PREFIX = String.raw`(?:(?:const|unsigned|signed|static)\s+)*`;
// Nhóm 1: kiểu. Nhóm 2: tên được khai báo. Nhóm 3: ký tự ngay sau tên (để phân biệt khai báo hàm).
const TYPE = String.raw`(long\s+long|long|int|short|char|bool|float|double|auto|void|size_t|[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*(?:<[^;{}()]*>)?)`;
// Giữa kiểu và tên bắt buộc có khoảng trắng hoặc * / &. Không có ràng buộc này, `top` bị đọc thành kiểu `to` và tên `p`.
const SEPARATOR = String.raw`(?:\s*[*&]+\s*|\s+)`;
const DECL = new RegExp(
  String.raw`(?:^|[;{}(,])\s*${TYPE_PREFIX}${TYPE}${SEPARATOR}([A-Za-z_]\w*)(?=\s*([=;,)\[{:(]|$))`,
  'gm',
);

/**
 * Tên 1–2 ký tự được khai báo trong bài (biến, tham số, trường struct), đã bỏ qua i/j/k và các tên trong
 * `exceptions` (chữ của đề bài, ví dụ `n`). Heuristic: nhận dạng khai báo bằng mẫu "kiểu rồi tên" trên mã đã
 * bỏ chú thích và chuỗi. Không hiểu đầy đủ ngữ pháp C++: `int a = 1, b;` chỉ bắt được `a`.
 */
export function shortNameDeclarations(source: string, opts: { exceptions?: string[] }): string[] {
  const exceptions = new Set(opts.exceptions ?? []);
  const { code } = scanCpp(source);
  const found = new Set<string>();
  for (const m of code.matchAll(DECL)) {
    const typeText = m[1].replace(/\s+/g, ' ');
    const typeBase = typeText.replace(/<.*$/, '').trim();
    const name = m[2];
    const following = m[3] ?? '';
    if (NOT_TYPES.has(typeBase)) continue;
    // `T f(...)` với T không có tham số kiểu là khai báo hàm, không phải biến. `vector<long long> a(n)` là biến.
    if (following === '(' && !typeText.includes('<')) continue;
    if (name.length > 2 || LOOP_COUNTERS.has(name) || exceptions.has(name)) continue;
    found.add(name);
  }
  return [...found].sort();
}
