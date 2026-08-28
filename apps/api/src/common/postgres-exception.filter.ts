import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  BadRequestException,
  HttpException,
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
// Lifecycle guards (frozen rows, illegal child mutation, append-only tables)
// raise `object_not_in_prerequisite_state`. Without this mapping they 500.
const OBJECT_NOT_IN_PREREQUISITE_STATE = '55000';

@Catch(QueryFailedError)
export class PostgresExceptionFilter implements ExceptionFilter {
  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const code = postgresCode(exception);

    if (code === EXCLUSION_VIOLATION) {
      return reply(
        response,
        new ConflictException(exclusionMessage(exception)),
      );
    }
    if (
      code === UNIQUE_VIOLATION ||
      code === FOREIGN_KEY_VIOLATION ||
      code === OBJECT_NOT_IN_PREREQUISITE_STATE
    ) {
      return reply(
        response,
        new ConflictException(
          clientMessage(
            exception,
            'This request conflicts with an existing record.',
          ),
        ),
      );
    }
    if (code === CHECK_VIOLATION) {
      return reply(
        response,
        new BadRequestException(
          clientMessage(exception, 'This request violates a data rule.'),
        ),
      );
    }
    throw exception;
  }
}

function reply(
  response: { status: (code: number) => { json: (body: unknown) => unknown } },
  error: HttpException,
) {
  return response.status(error.getStatus()).json(error.getResponse());
}

function postgresCode(exception: QueryFailedError): string | undefined {
  const fromException = (exception as QueryFailedError & { code?: string })
    .code;
  const fromDriver = (exception.driverError as { code?: string } | undefined)
    ?.code;
  return fromException ?? fromDriver;
}

const EXCLUSION_MESSAGES: Record<string, string> = {
  ex_lab_sessions_no_overlap:
    'This lab is already booked for an overlapping sitting.',
  ex_lecturer_bookings_no_overlap:
    'This proctor is already booked for an overlapping sitting.',
  ex_student_bookings_no_overlap:
    'This student is already booked for an overlapping sitting.',
};

function exclusionMessage(exception: QueryFailedError): string {
  const raw = clientMessage(
    exception,
    'This booking overlaps an existing room, proctor, or student reservation.',
  );
  for (const [constraint, message] of Object.entries(EXCLUSION_MESSAGES)) {
    if (raw.includes(constraint)) {
      return message;
    }
  }
  return raw.includes('overlap') || raw.includes('exclusion')
    ? raw
    : 'This booking overlaps an existing room, proctor, or student reservation.';
}

function clientMessage(exception: QueryFailedError, fallback: string): string {
  const fromDriver = (exception.driverError as { message?: string } | undefined)
    ?.message;
  return trimPostgresMessage(fromDriver ?? exception.message) || fallback;
}

function trimPostgresMessage(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const firstLine = raw
    .replace(/^(error:\s*)+/i, '')
    .split(/\r?\n/, 1)[0]
    ?.trim();
  return firstLine || undefined;
}
