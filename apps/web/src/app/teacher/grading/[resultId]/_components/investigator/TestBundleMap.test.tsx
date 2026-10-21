import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TestBundleMap } from './TestBundleMap';
import type { TestBundleView } from '@/lib/api/grading';

const bundle = (over: Partial<TestBundleView> = {}): TestBundleView => ({
  id: 'b1',
  version: 2,
  origin: 'teacher',
  filename: 'de-ctdl.json',
  approved: true,
  caseCount: 4,
  droppedCount: 1,
  groups: [
    {
      group: 'bien',
      cases: [
        { caseKey: 'c1', status: 'pass', ms: 3, constraintQuote: null, input: '1', expectedOutput: '2', diff: null },
        { caseKey: 'c2', status: 'fail', ms: 5, constraintQuote: 'Đọc n', input: '2', expectedOutput: '4', diff: '- 4\n+ 5' },
      ],
      rules: [{ ruleId: 'r1', ruleKey: 'sai_ca_bien', deductionHundredths: 150, triggered: true }],
    },
    {
      group: 'ghi',
      cases: [{ caseKey: 'c3', status: 'not_run', ms: null, constraintQuote: null, input: '3', expectedOutput: '9', diff: null }],
      rules: [],
    },
  ],
  unmeasuredRules: [],
  uncoveredFailingCases: [],
  ...over,
});

describe('TestBundleMap', () => {
  it('dòng giới thiệu: phiên bản, nguồn, tên file, đã duyệt, số ca và số ca bị bỏ', () => {
    render(<TestBundleMap bundle={bundle()} />);
    expect(screen.getByText(/Gói v2 · bạn tải lên \(de-ctdl\.json\) · đã duyệt · 4 ca · 2 nhóm · 1 ca bị hệ thống tự bỏ/)).toBeInTheDocument();
  });

  it('nhóm có quy tắc: nêu quy tắc đang trừ điểm; ca không đạt là bằng chứng cho quy tắc đó', () => {
    render(<TestBundleMap bundle={bundle()} />);
    expect(screen.getByText('Nhóm “bien”: 1 ca không đạt')).toBeInTheDocument();
    expect(screen.getByText(/sai_ca_bien \(đang trừ điểm\)/)).toBeInTheDocument();
    const failing = screen.getByText('c2').closest('li')!;
    expect(within(failing).getByText('bằng chứng cho sai_ca_bien')).toBeInTheDocument();
    expect(within(failing).getByText('Đề yêu cầu: “Đọc n”')).toBeInTheDocument();
  });

  it('ca chưa chạy hiện "Chưa chạy" và câu "chưa chạy không có nghĩa là đạt"', () => {
    render(<TestBundleMap bundle={bundle()} />);
    expect(screen.getByText('Chưa chạy')).toBeInTheDocument();
    expect(screen.getByText('Chưa chạy không có nghĩa là đạt.')).toBeInTheDocument();
  });

  it('ca không đạt chưa thuộc quy tắc nào: nêu rõ không bị trừ điểm và mời thêm quy tắc', () => {
    const b = bundle({
      groups: [{
        group: 'ghi',
        cases: [{ caseKey: 'c9', status: 'fail', ms: 1, constraintQuote: null, input: '', expectedOutput: '', diff: null }],
        rules: [],
      }],
      uncoveredFailingCases: ['c9'],
    });
    render(<TestBundleMap bundle={b} rulesHref="/teacher/rules" />);
    expect(screen.getByText(/Ca không đạt chưa thuộc quy tắc nào: c9\. Các ca này không bị trừ điểm\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Thêm quy tắc cho nhóm' })).toHaveAttribute('href', '/teacher/rules');
  });

  it('quy tắc dùng nhóm mà gói không có: "chưa đo được", không có nghĩa là đạt', () => {
    const b = bundle({ unmeasuredRules: [{ ruleId: 'r7', ruleKey: 'thieu_nhom_x', group: 'x' }] });
    const { container } = render(<TestBundleMap bundle={b} />);
    expect(container).toHaveTextContent('Chưa đo được: thieu_nhom_x dùng nhóm “x”, mà gói này không có nhóm đó.');
    expect(container).toHaveTextContent('Không trừ điểm, và không có nghĩa là đạt.');
  });
});
