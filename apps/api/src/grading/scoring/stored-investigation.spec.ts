import { readStoredInvestigation } from './stored-investigation';

describe('readStoredInvestigation()', () => {
  it('hồ sơ cũ không có field challenge vẫn đọc được (bước 6 thêm SAU)', () => {
    const legacy = { version: 1, result: { kind: 'ungradable', ungradable: { class: 'system', reason: 'x' } }, rulesSeen: [], ruleTable: [], modelCeiling: 1 };
    expect(() => readStoredInvestigation(legacy)).not.toThrow();
    expect(readStoredInvestigation(legacy).challenge).toBeUndefined();
  });
});
