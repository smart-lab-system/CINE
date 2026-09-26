import { DEFAULT_BUDGET } from '../budget';
import { InvestigationContext } from '../types';

/** Ngữ cảnh tí hon cho test đơn vị của vòng điều tra — không có Docker, không có model. */
export const CTX: InvestigationContext = {
  language: 'cpp',
  problemStatement: 'Sắp xếp tăng dần.',
  requiredComplexity: 'O(n log n)',
  submission: { files: [{ path: 'main.cpp', content: 'int f();\n' }] },
  driver: 'int main(){}\n',
  entry: null,
  testBundle: {
    id: 'sap-xep@abc',
    cases: [
      { name: 'cb1', group: 'co_ban', input: '1\n', expected: 'BÍ MẬT_MONG_ĐỢI\n' },
      { name: 'cb2', group: 'co_ban', input: '2\n', expected: '2\n' },
      { name: 'tl1', group: 'trung_lap', input: '3\n', expected: '3\n' },
    ],
  },
  modelAnswerAvailable: true,
  rules: [
    { ruleKey: 'sai_ca_co_ban', title: 'Sai ca cơ bản', criterionKey: 'tinh_dung', priced: true, checkedBy: 'machine', machineNote: 'nhóm test co_ban' },
    { ruleKey: 'chu_thich_sai', title: 'Chú thích sai', criterionKey: 'trinh_bay', priced: false, checkedBy: 'model', machineNote: null },
  ],
  budget: DEFAULT_BUDGET,
};
