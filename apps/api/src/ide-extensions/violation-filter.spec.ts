import { isViolationPairStillOpen } from './violation-filter';

describe('isViolationPairStillOpen', () => {
  it('stays open when nothing approved', () => {
    expect(isViolationPairStillOpen('a.b', '1.0.0', [])).toBe(true);
  });

  it('closes all versions when * approved', () => {
    const approved = [{ identifier: 'a.b', version: '*' }];
    expect(isViolationPairStillOpen('a.b', '1.0.0', approved)).toBe(false);
    expect(isViolationPairStillOpen('a.b', '9.9.9', approved)).toBe(false);
    expect(isViolationPairStillOpen('a.b', null, approved)).toBe(false);
  });

  it('closes only exact version when that version approved', () => {
    const approved = [{ identifier: 'a.b', version: '1.2.3' }];
    expect(isViolationPairStillOpen('a.b', '1.2.3', approved)).toBe(false);
    expect(isViolationPairStillOpen('a.b', '1.2.4', approved)).toBe(true);
  });

  it('null version stays open until * approved', () => {
    expect(
      isViolationPairStillOpen('a.b', null, [{ identifier: 'a.b', version: '1.0.0' }]),
    ).toBe(true);
    expect(isViolationPairStillOpen('a.b', null, [{ identifier: 'a.b', version: '*' }])).toBe(
      false,
    );
  });

  it('ignores approvals for other identifiers', () => {
    const approved = [{ identifier: 'other.ext', version: '*' }];
    expect(isViolationPairStillOpen('a.b', '1.0.0', approved)).toBe(true);
  });
});
