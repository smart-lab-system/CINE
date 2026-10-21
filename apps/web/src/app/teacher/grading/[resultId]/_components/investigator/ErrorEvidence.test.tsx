import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorEvidence, type ErrorEvidenceItem } from './ErrorEvidence';
import type { ChallengeVerdict, ResultDetailError, ToolCallView } from '@/lib/api/grading';

const error = (over: Partial<ResultDetailError> = {}): ResultDetailError => ({
  ruleId: 'r1',
  ruleKey: 'sai_ca_bien',
  ruleName: 'Sai ca biên',
  ruleDescription: 'Bỏ sót ca biên n = 0',
  predicate: { kind: 'test_group_failed', group: 'bien' },
  criterionKey: 'tinh_dung',
  source: 'deterministic',
  toolCallIds: ['tc-2'],
  deductionHundredths: 150,
  counted: 'counted',
  agreement: { n: 0, disagreements: 0, paused: false },
  ...over,
});

const call = (id: string, over: Partial<ToolCallView> = {}): ToolCallView => ({
  id,
  tool: 'run_tests',
  args: {},
  status: 'ok',
  output: 'Kết cục: fail',
  structuredRef: id,
  startedAt: '2026-10-21T00:00:00Z',
  wallMs: 12,
  injectionSuspected: false,
  ...over,
});

const noVerdicts: ChallengeVerdict[] = [];

describe('ErrorEvidence', () => {
  it('hiện luật, điều kiện đo, và cách phát hiện với mức chắc chắn, không dùng từ của AI', () => {
    render(<ErrorEvidence error={error()} toolCalls={[]} verdicts={noVerdicts} note={null} />);
    expect(screen.getByText(/Có ca kiểm thử thuộc nhóm “bien” không đạt/)).toBeInTheDocument();
    expect(screen.getByText('Bỏ sót ca biên n = 0')).toBeInTheDocument();
    expect(screen.getByText(/Hệ thống đo bằng cách chạy bài/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bmodel\b|\bAI\b|agent/i);
  });

  it('không có bằng chứng kèm theo → nói thẳng đây là nhận định của hệ thống', () => {
    render(<ErrorEvidence error={error({ toolCallIds: [] })} toolCalls={[]} verdicts={noVerdicts} note={null} />);
    expect(screen.getByText('Chưa có bằng chứng kèm theo; đây mới là nhận định của hệ thống.')).toBeInTheDocument();
  });

  it('lời gọi làm căn cứ: neo #N tới đúng dòng trong đường điều tra, và nêu VIỆC thay vì tên công cụ', () => {
    render(<ErrorEvidence error={error()} toolCalls={[call('tc-2')]} verdicts={noVerdicts} note={null} />);
    const link = screen.getByRole('link', { name: '#2' });
    expect(link).toHaveAttribute('href', '#tc-2');
    expect(screen.getByText('Chạy gói test')).toBeInTheDocument();
    expect(screen.queryByText('run_tests')).not.toBeInTheDocument();
  });

  it('ca không đạt đứng trước ca đạt trong kết quả chạy có cấu trúc', () => {
    const structured = {
      'tc-2': {
        kind: 'run_tests' as const,
        aborted: false,
        cases: [
          { name: 'c1', group: 'bien', status: 'pass', diff: null, ms: 3 },
          { name: 'c2', group: 'bien', status: 'fail', diff: '- 4\n+ 5', ms: 5 },
        ],
      },
    };
    render(<ErrorEvidence error={error()} toolCalls={[call('tc-2')]} structuredResults={structured} verdicts={noVerdicts} note={null} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('c2');
    expect(items[1]).toHaveTextContent('c1');
  });

  it('bước căn cứ không còn trong hồ sơ → báo rõ, không im lặng', () => {
    render(<ErrorEvidence error={error({ toolCallIds: ['tc-9'] })} toolCalls={[]} verdicts={noVerdicts} note={null} />);
    expect(screen.getByText('Bước #9 không còn trong hồ sơ.')).toBeInTheDocument();
  });

  it('kết luận của góc kiểm lại: câu hỏi của góc, lý do, và căn cứ; thiếu lý do thì nói rõ', () => {
    const verdicts: ChallengeVerdict[] = [
      { lens: 'tinh_dung', ruleKey: 'sai_ca_bien', status: 'unverified', reason: null, toolCallIds: [] },
      { lens: 'qua_tay', ruleKey: 'sai_ca_bien', status: 'confirmed', reason: 'Trừ 150 là đúng', toolCallIds: ['tc-2'] },
    ];
    render(<ErrorEvidence error={error()} toolCalls={[call('tc-2')]} verdicts={verdicts} note={null} />);
    expect(screen.getByText(/Hệ thống kiểm lại: “Lỗi có thật không\?”/)).toBeInTheDocument();
    expect(screen.getByText('Chưa có lý do kèm theo')).toBeInTheDocument();
    expect(screen.getByText('Trừ 150 là đúng')).toBeInTheDocument();
  });

  it('đoạn mã đã đối chiếu được và đoạn chưa đối chiếu được nói khác nhau', () => {
    const ok: ErrorEvidenceItem = { file: 'main.cpp', startLine: 3, endLine: 3, quote: 'int f();', verified: true };
    const bad: ErrorEvidenceItem = { file: 'main.cpp', startLine: 9, endLine: 9, quote: 'x', verified: false };
    render(<ErrorEvidence error={error()} toolCalls={[]} verdicts={noVerdicts} note={null} evidence={[ok, bad]} />);
    expect(screen.getByText('main.cpp:3')).toBeInTheDocument();
    expect(screen.getByText(/Đã đối chiếu: đoạn này đúng là có trong bài/)).toBeInTheDocument();
    expect(screen.getByText(/Chưa đối chiếu được: không tìm thấy đoạn này trong bài/)).toBeInTheDocument();
  });

  it('đoạn dài: chỉ hiện đầu và cuối, và "Hiện cả đoạn" mở ra toàn bộ', () => {
    const long: ErrorEvidenceItem = {
      file: 'main.cpp', startLine: 1, endLine: 10, quote: Array.from({ length: 10 }, (_, i) => `dòng ${i + 1}`).join('\n'), verified: true,
    };
    render(<ErrorEvidence error={error()} toolCalls={[]} verdicts={noVerdicts} note={null} evidence={[long]} />);
    expect(screen.queryByText(/dòng 5\b/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hiện cả đoạn: còn 5 dòng ẩn' }));
    expect(screen.getByText(/dòng 5\b/)).toBeInTheDocument();
  });
});
