import { ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { PostgresExceptionFilter } from './postgres-exception.filter';

function fabricateError(code: string, message = 'simulated postgres error') {
  const driverError: Error & { code: string } = Object.assign(
    new Error(message),
    { code },
  );
  return new QueryFailedError('SELECT 1', [], driverError);
}

function createHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, json }),
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('PostgresExceptionFilter', () => {
  let filter: PostgresExceptionFilter;

  beforeEach(() => {
    filter = new PostgresExceptionFilter();
  });

  it('maps unique_violation (23505) to 409 Conflict', () => {
    const { host, status } = createHost();

    filter.catch(fabricateError('23505'), host);

    expect(status).toHaveBeenCalledWith(409);
  });

  it('maps exclusion_violation (23P01) to 409 Conflict', () => {
    const { host, status } = createHost();

    filter.catch(fabricateError('23P01'), host);

    expect(status).toHaveBeenCalledWith(409);
  });

  it('maps a lab sitting exclusion to a room conflict message', () => {
    const { host, json } = createHost();

    filter.catch(
      fabricateError(
        '23P01',
        'conflicting key value violates exclusion constraint "ex_lab_sessions_no_overlap"',
      ),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message: 'This lab is already booked for an overlapping sitting.',
      }),
    );
  });

  it('maps a lecturer booking exclusion to a proctor conflict message', () => {
    const { host, json } = createHost();

    filter.catch(
      fabricateError(
        '23P01',
        'conflicting key value violates exclusion constraint "ex_lecturer_bookings_no_overlap"',
      ),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message:
          'This proctor is already booked for an overlapping sitting.',
      }),
    );
  });

  it('maps a student booking exclusion to a student conflict message', () => {
    const { host, json } = createHost();

    filter.catch(
      fabricateError(
        '23P01',
        'conflicting key value violates exclusion constraint "ex_student_bookings_no_overlap"',
      ),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        message:
          'This student is already booked for an overlapping sitting.',
      }),
    );
  });

  it('maps foreign_key_violation (23503) to 409 Conflict — the code guard_master_soft_delete() actually raises when a row still has active children', () => {
    const { host, status, json } = createHost();

    filter.catch(fabricateError('23503'), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409 }),
    );
  });

  it('maps object_not_in_prerequisite_state (55000) to 409 Conflict', () => {
    const { host, status, json } = createHost();
    const message = 'Published exam event configuration is immutable';

    filter.catch(fabricateError('55000', message), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message }),
    );
  });

  it('maps check_violation (23514) to 400 Bad Request', () => {
    const { host, status } = createHost();

    filter.catch(fabricateError('23514'), host);

    expect(status).toHaveBeenCalledWith(400);
  });

  it('surfaces a trimmed driverError.message on 400 check violations', () => {
    const { host, json } = createHost();
    const message = 'Invalid exam event status transition: scheduled -> draft';

    filter.catch(
      fabricateError('23514', `error: ${message}\nDETAIL: extra`),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message }),
    );
  });

  it('rethrows unrecognized Postgres error codes', () => {
    const { host } = createHost();

    expect(() => filter.catch(fabricateError('99999'), host)).toThrow();
  });
});
