import { Inject, Injectable } from '@nestjs/common';
import { DeliverableType } from '../../exam-session/entities/required-deliverable.entity';
import {
  SUBMISSION_CONTENT_RESOLVERS,
  SubmissionContentResolver,
} from './submission-content-resolver';

/**
 * Bộ định tuyến TẤT ĐỊNH: 0 token, ~0ms, chính xác tuyệt đối.
 *
 * Giảng viên ĐÃ KHAI `deliverable_type` lúc tạo phiên thi. Dùng LLM để
 * phân loại lại thứ đã biết là vừa tốn token, vừa thêm độ trễ, vừa thêm
 * một đường sai (model phân loại nhầm một bài code thành tự luận).
 *
 * Đây là Strategy Pattern ở tầng code, đúng nguyên tắc "không đoán khi có
 * thể thiết kế để khỏi phải đoán" của CLAUDE.md.
 */
@Injectable()
export class ContentResolverRegistry {
  private readonly byType = new Map<DeliverableType, SubmissionContentResolver>();

  constructor(
    @Inject(SUBMISSION_CONTENT_RESOLVERS) resolvers: SubmissionContentResolver[],
  ) {
    for (const resolver of resolvers) {
      this.byType.set(resolver.handles, resolver);
    }
  }

  for(type: DeliverableType): SubmissionContentResolver {
    const resolver = this.byType.get(type);
    if (!resolver) {
      // NỔ, không im lặng rơi về `document`.
      //
      // Trước seam này `deliverableType` bị hardcode `'document'`, nên một
      // bài code hay một ảnh viết tay đi qua đường trích text của Word và
      // cho ra một con số trông hoàn toàn hợp lệ — từ một đường xử lý sai,
      // mà không ai phát hiện. Hỏng to và sớm an toàn hơn hỏng nhỏ và muộn.
      throw new Error(
        `Loại bài nộp "${type}" chưa có resolver — chưa chấm tự động được`,
      );
    }
    return resolver;
  }
}
