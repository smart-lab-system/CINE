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

  it('rethrows unrecognized Postgres error codes', () => {
    const { host } = createHost();

    expect(() => filter.catch(fabricateError('99999'), host)).toThrow();
  });
});
