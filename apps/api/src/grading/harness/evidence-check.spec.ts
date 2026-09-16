import { locateEvidence, verifyEvidence } from './evidence-check';

const BAI =
  'Thuật toán sắp xếp nổi bọt so sánh từng cặp phần tử kề nhau, ' +
  'rồi hoán đổi nếu chúng sai thứ tự. Độ phức tạp là O(n^2).';

/**
 * Guard verbatim (spec §6 G2).
 *
 * Bộ test này có hai nhiệm vụ đối nghịch nhau, và cả hai đều quan trọng:
 * bắt được dẫn chứng bịa, VÀ không báo động giả trên bài trung thực. Một
 * guard quá nhạy sẽ bị tắt đi sau tuần đầu; một guard quá lỏng thì vô dụng.
 */
describe('verifyEvidence', () => {
  it('T-G2-2: khác hoa/thường và khoảng trắng → vẫn ok', () => {
    expect(verifyEvidence(BAI, 'SO SÁNH   TỪNG cặp phần tử')).toBe('ok');
  });

  it('T-G2-2: ngoặc cong, em-dash, NBSP → vẫn ok', () => {
    // Model tự chuẩn hoá dấu câu khi tái tạo trích dẫn. Khác kiểu chữ in
    // KHÔNG BAO GIỜ là bịa đặt.
    expect(verifyEvidence('Em viết “đúng” — thật sự vậy', '"đúng" - thật sự vậy')).toBe('ok');
    expect(verifyEvidence('a b c dài hơn mười ký', 'a b c dài hơn mười ký')).toBe('ok');
    expect(verifyEvidence('dùng dấu ‘nháy đơn’ ở đây', "dùng dấu 'nháy đơn' ở đây")).toBe('ok');
  });

  it('T-G2-3: evidence rỗng → empty, KHÔNG phải unverified', () => {
    // Rỗng nghĩa là sinh viên không đề cập — tín hiệu hợp lệ, và là đầu
    // vào của cổng Advocate.
    expect(verifyEvidence(BAI, '')).toBe('empty');
    expect(verifyEvidence(BAI, '   ')).toBe('empty');
  });

  it('T-G2-1: không có trong bài → unverified', () => {
    expect(verifyEvidence(BAI, 'sinh viên đã chứng minh định lý Fermat')).toBe('unverified');
  });

  it('T-G2-4: elision ĐÚNG thứ tự → ok', () => {
    expect(verifyEvidence(BAI, 'so sánh từng cặp … Độ phức tạp là O(n^2)')).toBe('ok');
    expect(verifyEvidence(BAI, 'so sánh từng cặp ... Độ phức tạp là O(n^2)')).toBe('ok');
  });

  it('T-G2-5: elision NGƯỢC thứ tự → unverified', () => {
    // Không có ràng buộc thứ tự thì việc tách elision tự mở một lỗ mới:
    // ghép hai mẩu từ hai chỗ xa nhau, không liên quan gì nhau, thành một
    // "trích dẫn" trông hợp lệ.
    expect(verifyEvidence(BAI, 'Độ phức tạp là O(n^2) … so sánh từng cặp')).toBe('unverified');
  });

  it('mỗi mẩu elision phải đủ dài, không chỉ mẩu đầu', () => {
    expect(verifyEvidence(BAI, 'so sánh từng cặp phần tử … là')).toBe('unverified');
  });

  it('trích quá ngắn → unverified, không khớp bừa', () => {
    // "là" là chuỗi con của gần như mọi bài làm tiếng Việt.
    expect(verifyEvidence(BAI, 'là')).toBe('unverified');
    expect(verifyEvidence(BAI, 'thuật')).toBe('unverified');
  });

  it('bài rỗng → mọi trích dẫn khác rỗng đều unverified', () => {
    // Bài không đọc được tới đây dưới dạng chuỗi rỗng. Model vẫn có thể
    // trả về "dẫn chứng" — và đó chính xác là ca phải bắt.
    expect(verifyEvidence('', 'bất cứ thứ gì dài hơn mười ký tự')).toBe('unverified');
  });

  it('khớp nguyên cả bài → ok', () => {
    expect(verifyEvidence(BAI, BAI)).toBe('ok');
  });
});

/**
 * Định vị dẫn chứng (spec §5.2).
 *
 * `locateEvidence` trả về VỊ TRÍ, và `verifyEvidence` giờ chỉ là một lời
 * gọi tới nó. Bộ test này khoá hai điều: toạ độ trỏ đúng chỗ trong chuỗi
 * GỐC, và hai câu hỏi không bao giờ cho hai câu trả lời khác nhau.
 */
describe('locateEvidence', () => {
  const TEXT =
    'Ưu điểm lớn nhất là khả năng mở rộng từng phần.\n\n' +
    'Nhược điểm là dữ liệu bị phân mảnh giữa các dịch vụ.';

  it('trả span trỏ đúng đoạn trong chuỗi gốc', () => {
    const got = locateEvidence(TEXT, 'khả năng mở rộng từng phần', { spans: true });
    expect(got.check).toBe('ok');
    expect(got.spans).toHaveLength(1);
    expect(TEXT.slice(got.spans[0].start, got.spans[0].end)).toBe('khả năng mở rộng từng phần');
  });

  it('định vị được trích dẫn VẮT QUA ranh giới đoạn', () => {
    // Ca mà mọi cách chẻ đoạn ở client sẽ trượt: chuẩn hoá gộp xuống dòng
    // thành một dấu cách, nên trích dẫn này hợp lệ với server.
    const got = locateEvidence(TEXT, 'từng phần. Nhược điểm là dữ liệu', { spans: true });
    expect(got.check).toBe('ok');
    expect(got.spans).toHaveLength(1);
    expect(TEXT.slice(got.spans[0].start, got.spans[0].end)).toContain('Nhược điểm');
  });

  it('trả một span cho mỗi mẩu của trích dẫn rút gọn bằng elision', () => {
    const got = locateEvidence(TEXT, 'Ưu điểm lớn nhất … dữ liệu bị phân mảnh', { spans: true });
    expect(got.check).toBe('ok');
    expect(got.spans).toHaveLength(2);
    expect(got.spans[0].end).toBeLessThanOrEqual(got.spans[1].start);
  });

  it('không định vị được thì trả unverified và không span nào', () => {
    const got = locateEvidence(TEXT, 'một hệ thống giám sát tập trung', { spans: true });
    expect(got.check).toBe('unverified');
    expect(got.spans).toEqual([]);
  });

  it('trích dẫn rỗng là empty, không phải unverified', () => {
    expect(locateEvidence(TEXT, '   ', { spans: true }).check).toBe('empty');
  });

  it('bỏ span thì không dựng bảng ánh xạ', () => {
    const got = locateEvidence(TEXT, 'khả năng mở rộng từng phần');
    expect(got.check).toBe('ok');
    expect(got.spans).toEqual([]);
  });

  it('zero-width bị XOÁ, không thành dấu cách', () => {
    // U+FEFF nằm trong `\s` của JS, nhưng bảng gấp kiểu chữ in xoá hẳn nó
    // TRƯỚC khi khoảng trắng được gộp. Kiểm đúng thứ tự đó: đảo ngược nó
    // là một lệch âm thầm giữa hai hàm, và không test nào khác bắt được.
    const withBom = 'khả năng mở\uFEFF rộng từng phần';
    expect(locateEvidence(withBom, 'khả năng mở rộng từng phần', { spans: true }).check).toBe('ok');
  });

  it('span trỏ vào chuỗi NFC, kể cả khi bài làm ở dạng tổ hợp', () => {
    // Tiếng Việt gõ bằng một số bộ gõ ra dạng NFD. NFC chạy trước, và
    // toạ độ nói về chuỗi SAU NFC — nên người gọi phải NFC hoá trước khi
    // cắt. Test này khoá lại giao kèo đó.
    const nfd = 'khả năng mở rộng từng phần'.normalize('NFD');
    const got = locateEvidence(nfd, 'khả năng mở rộng', { spans: true });
    expect(got.check).toBe('ok');
    expect(nfd.normalize('NFC').slice(got.spans[0].start, got.spans[0].end)).toBe(
      'khả năng mở rộng',
    );
  });
});

describe('locateEvidence và verifyEvidence không bao giờ bất đồng', () => {
  const TEXT = 'Sinh viên viết một câu dài đủ để vượt ngưỡng mười ký tự, rồi thêm một câu nữa.';
  const CASES = [
    'một câu dài đủ để vượt ngưỡng',
    'câu không hề có trong bài làm này',
    '',
    'ngắn',
    'Sinh viên viết … thêm một câu nữa',
    'thêm một câu nữa … Sinh viên viết',
  ];

  it.each(CASES)('cho cùng một verdict với %p', (evidence) => {
    expect(locateEvidence(TEXT, evidence, { spans: true }).check).toBe(
      verifyEvidence(TEXT, evidence),
    );
  });
});
