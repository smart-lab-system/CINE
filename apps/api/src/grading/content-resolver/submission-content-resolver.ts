import { DeliverableType } from '../../exam-session/entities/required-deliverable.entity';

/**
 * Cái mà mọi nhánh chấm trả về, bất kể bài nộp là gì.
 *
 * Seam này tồn tại để nhánh ẢNH và nhánh CODE thêm được mà không phải mổ
 * lại `GradingService`. Hôm nay chỉ có `DocumentResolver`; hai nhánh kia
 * có spec riêng, và khi tới lượt chúng chỉ cần đăng ký thêm.
 */
export interface ResolvedContent {
  /**
   * Văn bản để chấm VÀ để guard verbatim đối chiếu.
   *
   * Rỗng nghĩa là không đọc được — một sự thật về việc trích xuất, không
   * bao giờ là phán xét về bài làm. Nó tới provider dưới dạng nội dung
   * rỗng, và đó là thứ đẩy bài sang cho con người.
   */
  text: string;

  /**
   * Hiện vật trung gian mà giảng viên cần đọc được.
   *
   * `document`: không dùng — file gốc đã là thứ đọc được.
   * `image` (spec sau): BẢN PHIÊN ÂM. Sai lầm số một khi chấm chữ viết tay
   *   là ĐỌC NHẦM, và nếu nó bị giấu bên trong một lời gọi thì giảng viên
   *   không kiểm được — họ sẽ phải tự đọc lại cả 40 bài, tức ta không tự
   *   động hoá được gì.
   * `code_project` (spec sau): log chạy test.
   */
  artifact?: string;
}

/**
 * Một loại bài nộp, một cách lấy văn bản ra khỏi nó.
 *
 * `handles` là loại ĐÃ ĐƯỢC KHAI ở `required_deliverable.deliverable_type`,
 * không phải loại đoán từ tên file hay MIME.
 */
export interface SubmissionContentResolver {
  readonly handles: DeliverableType;
  resolve(bytes: Buffer, declaredFilename: string): Promise<ResolvedContent>;
}

/** Nest injection token — một interface không có định danh lúc chạy. */
export const SUBMISSION_CONTENT_RESOLVERS = Symbol('SUBMISSION_CONTENT_RESOLVERS');
