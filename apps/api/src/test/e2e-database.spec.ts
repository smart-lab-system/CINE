import {
  assertE2eDatabase,
  databaseNameFromUrl,
  E2E_DATABASE_NAME,
  MAIN_DATABASE_NAME,
  toE2eDatabaseUrl,
} from '../../test/e2e-database';

describe('e2e-database guard', () => {
  it('rewrites the main database URL onto examcollect_e2e', () => {
    const url =
      'postgresql://examcollect_admin:pass@localhost:5442/examcollect';
    expect(databaseNameFromUrl(toE2eDatabaseUrl(url))).toBe(E2E_DATABASE_NAME);
  });

  it('leaves an already-*_e2e URL unchanged', () => {
    const url =
      'postgresql://examcollect_admin:pass@localhost:5442/examcollect_e2e';
    expect(toE2eDatabaseUrl(url)).toBe(url);
  });

  it('refuses a non-e2e, non-main database name', () => {
    expect(() =>
      toE2eDatabaseUrl(
        'postgresql://examcollect_admin:pass@localhost:5442/production',
      ),
    ).toThrow(/Refusing/);
  });

  it('assertE2eDatabase rejects the main database name', () => {
    expect(() =>
      assertE2eDatabase(
        `postgresql://u:p@localhost:5442/${MAIN_DATABASE_NAME}`,
      ),
    ).toThrow(/Refusing to run e2e/);
  });

  it('assertE2eDatabase accepts examcollect_e2e', () => {
    expect(() =>
      assertE2eDatabase(
        `postgresql://u:p@localhost:5442/${E2E_DATABASE_NAME}`,
      ),
    ).not.toThrow();
  });
});
