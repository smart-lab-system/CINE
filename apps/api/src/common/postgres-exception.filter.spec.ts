import { ArgumentsHost } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { PostgresExceptionFilter } from './postgres-exception.filter';

function fabricateError(code: string): QueryFailedError {
  const driverError: any = new Error('simulated postgres error');
  driverError.code = code;
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

/**
 * BaseExceptionFilter.handleUnknownError reads the response via
 * `host.getArgByIndex(1)`, not `host.switchToHttp().getResponse()` — a
 * different accessor than the DTO-mapped branches above use. Both must
 * resolve to the SAME response object for a real request.
 */
function createBaseFilterHost() {
  const response = {};
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({}) }),
    getArgByIndex: (index: number) => (index === 1 ? response : undefined),
  } as unknown as ArgumentsHost;
  return { host, response };
}

function createApplicationRef() {
  return {
    isHeadersSent: jest.fn().mockReturnValue(false),
    reply: jest.fn(),
    end: jest.fn(),
  };
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

  it('maps foreign_key_violation (23503) to 409 Conflict — the code guard_master_soft_delete() actually raises when a row still has active children', () => {
    const { host, status, json } = createHost();

    filter.catch(fabricateError('23503'), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409 }),
    );
  });

  it('maps check_violation (23514) to 400 Bad Request', () => {
    const { host, status } = createHost();

    filter.catch(fabricateError('23514'), host);

    expect(status).toHaveBeenCalledWith(400);
  });

  // Real bug, 2026-09 (original 502 investigation): this filter is the
  // ONLY global filter (main.ts replaces Nest's own default entirely), so
  // a plain `throw exception` here for an unmapped code had nothing left
  // to catch it — it crashed the whole Node process instead of producing
  // an HTTP response. Falling through to BaseExceptionFilter's own
  // handling (via `super.catch`) is what Nest's built-in default filter
  // would have done anyway, had this filter not replaced it.
  it('for an unrecognized code, replies with a safe 500 instead of throwing', () => {
    const { host, response } = createBaseFilterHost();
    const applicationRef = createApplicationRef();
    const filterWithAdapter = new PostgresExceptionFilter(applicationRef as any);

    expect(() => filterWithAdapter.catch(fabricateError('99999'), host)).not.toThrow();

    expect(applicationRef.reply).toHaveBeenCalledWith(
      response,
      { statusCode: 500, message: 'Internal server error' },
      500,
    );
  });
});
