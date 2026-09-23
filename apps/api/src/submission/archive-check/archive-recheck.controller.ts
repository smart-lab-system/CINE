import { Controller, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ArchiveRecheckService } from './archive-recheck.service';

/**
 * `POST /exam-sessions/:id/archive-recheck` — sống trong module SUBMISSION,
 * không phải exam-session, dù chia sẻ tiền tố đường dẫn với
 * `ExamSessionController`.
 *
 * KHÔNG PHẢI tuỳ tiện: `ArchiveRecheckService` cần `SubmissionEntity` +
 * `ARCHIVE_CHECK_QUEUE`, cả hai đăng ký trong `SubmissionModule`. Đặt
 * service ở `exam-session/` (như một bản nháp ban đầu của kế hoạch có
 * nêu) sẽ buộc `ExamSessionModule` phải import `SubmissionModule` để lấy
 * nó — nhưng `SubmissionModule` ĐÃ import `ExamSessionModule` (lấy
 * `ExamSessionService`), nên chiều ngược lại tạo một vòng lặp module cần
 * `forwardRef()`. Codebase này đã có đúng một tiền lệ cho tình huống này:
 * `SubmissionController` tự nó là `@Controller('exam-sessions/:examSessionId
 * /submissions')` — sống trong module submission, route dưới tiền tố
 * exam-sessions. Controller này theo đúng khuôn đó, không phải lối tắt.
 *
 * Guard và cấu trúc @Roles('teacher') sao y `ExamSessionController`'s
 * `POST :id/recollect` — cùng hình dạng "đọc-rồi-xếp-hàng, bấm nhiều lần
 * vô hại", và `@HttpCode(200)` cũng vì cùng lý do: đây không tạo một tài
 * nguyên mới, mặc định 201 của Nest cho POST không đúng ở đây.
 */
@Controller('exam-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ArchiveRecheckController {
  constructor(private readonly archiveRecheckService: ArchiveRecheckService) {}

  @Post(':id/archive-recheck')
  @Roles('teacher')
  @HttpCode(200)
  archiveRecheck(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.archiveRecheckService.requeue(id, req.user!.sub);
  }
}
