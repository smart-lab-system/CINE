import { deriveCatalogStatus } from './catalog-status';

describe('deriveCatalogStatus', () => {
  it('wildcard_approved when * is approved', () => {
    expect(
      deriveCatalogStatus([
        { version: '*', approvalStatus: 'approved' },
        { version: '1.0.0', approvalStatus: 'pending' },
      ]),
    ).toBe('wildcard_approved');
  });

  it('has_pending when any pending and no * approved', () => {
    expect(
      deriveCatalogStatus([
        { version: '1.0.0', approvalStatus: 'approved' },
        { version: '2.0.0', approvalStatus: 'pending' },
      ]),
    ).toBe('has_pending');
  });

  it('fully_approved when all concrete versions approved', () => {
    expect(
      deriveCatalogStatus([
        { version: '1.0.0', approvalStatus: 'approved' },
        { version: '2.0.0', approvalStatus: 'approved' },
      ]),
    ).toBe('fully_approved');
  });

  it('none_approved when empty or none approved', () => {
    expect(deriveCatalogStatus([])).toBe('none_approved');
    expect(
      deriveCatalogStatus([{ version: '1.0.0', approvalStatus: 'rejected' }]),
    ).toBe('none_approved');
  });
});
