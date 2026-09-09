import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

// Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const EXCLUSION_VIOLATION = '23P01';
// The DDL's guard_master_soft_delete() trigger raises this code (not a CHECK
// violation) via `USING ERRCODE = 'foreign_key_violation'` when a row still
// has active children (e.g. soft-deleting a user who still has active
// user_roles). It's a conflict with existing state, same bucket as the
// unique/exclusion violations below.
const FOREIGN_KEY_VIOLATION = '23503';

@Catch(QueryFailedError)
export class PostgresExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PostgresExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const code = (exception as any).code as string | undefined;

    if (
      code === UNIQUE_VIOLATION ||
      code === EXCLUSION_VIOLATION ||
      code === FOREIGN_KEY_VIOLATION
    ) {
      const conflict = new ConflictException(
        'This request conflicts with an existing record.',
      );
      return response.status(conflict.getStatus()).json(conflict.getResponse());
    }
    if (code === CHECK_VIOLATION) {
      const badRequest = new BadRequestException(
        'This request violates a data rule.',
      );
      return response
        .status(badRequest.getStatus())
        .json(badRequest.getResponse());
    }
    /**
     * Mã lạ: trả 500 và GHI LOG. Trước đây dòng này là `throw exception`.
     *
     * Ném lại BÊN TRONG một exception filter là không gửi gì cả — không có
     * filter nào phía sau để bắt, nên client treo tới khi timeout thay vì nhận
     * 500. Đã đo được thật: một lỗi 42803 (thiếu cột trong GROUP BY) làm mỗi
     * request treo 5 giây, rồi `app.close()` treo theo, rồi cả jest treo. Một
     * lỗi SQL không lường trước phải to và nhìn thấy được, không được biến
     * thành một cái treo trông như mạng chậm.
     *
     * Log giữ nguyên mã và stack: đổi "treo" lấy một 500 im lặng thì chỉ là
     * đổi kiểu mù, nên chỗ này là nơi duy nhất còn dấu vết để chẩn đoán.
     */
    this.logger.error(
      `Unmapped Postgres error ${code ?? '(no code)'}: ${exception.message}`,
      exception.stack ?? '(no stack)',
    );
    const internal = new InternalServerErrorException();
    return response.status(internal.getStatus()).json(internal.getResponse());
  }
}
