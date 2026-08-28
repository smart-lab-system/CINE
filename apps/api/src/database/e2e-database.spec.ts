import {
  applyE2eDatabaseEnv,
  assertE2eDatabaseUrl,
  resolveE2eDatabaseUrl,
} from './e2e-database';

describe('e2e-database guard', () => {
  const originalE2eUrl = process.env.E2E_DATABASE_URL;

  afterEach(() => {
    if (originalE2eUrl === undefined) {
      delete process.env.E2E_DATABASE_URL;
    } else {
      process.env.E2E_DATABASE_URL = originalE2eUrl;
    }
  });

  it('refuses the dev lab_management database', () => {
    expect(() =>
      assertE2eDatabaseUrl(
        'postgresql://lab_admin:lab_admin_password@localhost:5442/lab_management',
      ),
    ).toThrow(/refusing to run e2e/i);
  });

  it('defaults to lab_management_e2e', () => {
    delete process.env.E2E_DATABASE_URL;
    expect(resolveE2eDatabaseUrl()).toContain('lab_management_e2e');
  });

  it('routes Nest to the e2e database URL', () => {
    process.env.E2E_DATABASE_URL =
      'postgresql://lab_admin:lab_admin_password@localhost:5442/lab_management_e2e';
    const url = applyE2eDatabaseEnv();
    expect(url).toContain('lab_management_e2e');
    expect(process.env.DATABASE_URL).toContain('lab_management_e2e');
  });
});
