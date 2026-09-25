import {
  ArgumentsHost,
  Catch,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
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

// Extends BaseExceptionFilter (rather than plain `implements
// ExceptionFilter`) so the unmapped-code branch can delegate to Nest's own
// safe default handling via `super.catch()`. This filter is registered as
// the ONLY global filter (see main.ts) — it replaces Nest's built-in
// default rather than sitting alongside it, so when it doesn't recognize
// an error code there is nothing left above it to fall back on. A plain
// `throw exception` here used to escape as an unhandled rejection and
// crash the whole process (root cause of a real production 502 that
// looked, misleadingly, like a slow/timing-out request).
@Catch(QueryFailedError)
export class PostgresExceptionFilter extends BaseExceptionFilter<QueryFailedError> {
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
    super.catch(exception, host);
  }
}
