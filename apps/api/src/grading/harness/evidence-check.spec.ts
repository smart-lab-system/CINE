import { verifyEvidence } from './evidence-check';

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
