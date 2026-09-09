import { ArgumentsHost, Logger } from '@nestjs/common';
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

  it('trả 500 cho mã Postgres lạ — KHÔNG ném lại, vì ném lại là không gửi gì cả', () => {
    // Bản trước `throw exception` ở nhánh này. Ném lại BÊN TRONG một exception
    // filter thì response không bao giờ được gửi: client treo tới khi timeout
    // thay vì nhận 500. Đã đo được thật — một lỗi 42803 (GROUP BY) làm supertest
    // treo 5s mỗi request, rồi `app.close()` treo theo, rồi cả jest treo 47 phút.
    // Một lỗi SQL lạ phải thành 500 nhìn thấy được, không thành một cái treo.
    const { host, status, json } = createHost();

    expect(() => filter.catch(fabricateError('42803'), host)).not.toThrow();
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    );
  });

  it('vẫn ghi log mã và stack của lỗi lạ — 500 im lặng thì không chẩn đoán được', () => {
    // Đổi từ "ném lại" sang "trả 500" có nguy cơ NUỐT lỗi. Stack phải đi đâu đó,
    // nếu không ta đổi một cái treo lấy một cái 500 vô nghĩa.
    const { host } = createHost();
    const logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    filter.catch(fabricateError('42803'), host);

    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('42803'),
      expect.any(String),
    );
    logError.mockRestore();
  });
});
