/** Kết quả tách một bài C++: mã đã xoá chú thích và chuỗi, và nội dung các chú thích. */
export interface CppScan {
  code: string;
  comments: string[];
}

/**
 * Tách chú thích (`//`, `/* *\/`) và chuỗi/ký tự (`"..."`, `'...'`) khỏi mã C++.
 * Phần bị tách được thay bằng khoảng trắng, còn xuống dòng được giữ nguyên để số dòng và vị trí không đổi.
 * Chỉ là bộ quét đơn giản: không xử lý chuỗi raw (R"(...)") và không xử lý tiền xử lý nhiều dòng.
 */
export function scanCpp(source: string): CppScan {
  const n = source.length;
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  let code = '';
  const comments: string[] = [];
  let i = 0;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      let end = source.indexOf('\n', i);
      if (end === -1) end = n;
      comments.push(source.slice(i + 2, end));
      code += blank(source.slice(i, end));
      i = end;
    } else if (c === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      comments.push(source.slice(i + 2, close === -1 ? n : close));
      code += blank(source.slice(i, end));
      i = end;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && source[j] !== c && source[j] !== '\n') {
        if (source[j] === '\\') j += 1;
        j += 1;
      }
      const end = Math.min(j + 1, n);
      code += blank(source.slice(i, end));
      i = end;
    } else {
      code += c;
      i += 1;
    }
  }
  return { code, comments };
}
