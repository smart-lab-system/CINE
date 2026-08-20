import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  BadRequestException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

// Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const EXCLUSION_VIOLATION = '23P01';

@Catch(QueryFailedError)
export class PostgresExceptionFilter implements ExceptionFilter {
  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const code = (exception as any).code as string | undefined;

    if (code === UNIQUE_VIOLATION || code === EXCLUSION_VIOLATION) {
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
    throw exception;
  }
}
