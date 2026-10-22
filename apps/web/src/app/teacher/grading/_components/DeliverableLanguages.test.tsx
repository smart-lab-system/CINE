import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DeliverableLanguages } from './DeliverableLanguages';
import type { RequiredDeliverableResponse } from '@/lib/api/exam-session';

const mutate = vi.fn();
let state: { isPending: boolean; isError: boolean; error: Error | null };
vi.mock('@/hooks/useExamSession', () => ({ useDeclareDeliverableLanguage: () => ({ mutate, ...state }) }));

const code = (over: Partial<RequiredDeliverableResponse> = {}): RequiredDeliverableResponse => ({
  id: 'd1', requiredFilename: 'bai.zip', deliverableType: 'code_project', entries: [], language: null, pipeline: 'one_shot', ...over,
});
const doc: RequiredDeliverableResponse = { id: 'd2', requiredFilename: 'Cau1.docx', deliverableType: 'document', entries: [], language: null, pipeline: 'one_shot' };

const renderIt = (deliverables: RequiredDeliverableResponse[], hasResults = false) =>
  render(<DeliverableLanguages sessionId="s1" deliverables={deliverables} hasResults={hasResults} />);

beforeEach(() => {
  mutate.mockReset();
  state = { isPending: false, isError: false, error: null };
});

describe('DeliverableLanguages (G1 §3.5)', () => {
  it('renders nothing when the session has no code deliverable', () => {
    const { container } = renderIt([doc]);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists only the code deliverables', () => {
    renderIt([doc, code()]);
    expect(screen.getByText('bai.zip')).toBeInTheDocument();
    expect(screen.queryByText('Cau1.docx')).not.toBeInTheDocument();
  });

  it('an undeclared deliverable shows "Chưa khai", says it is graded by reading, and that nothing is guessed from the extension', () => {
    renderIt([code()]);
    expect(screen.getByRole('combobox', { name: /Ngôn ngữ của bai\.zip/ })).toHaveValue('');
    expect(screen.getByText('Chưa khai')).toBeInTheDocument();
    expect(screen.getByText(/chấm bằng đọc mã, không chạy mã/)).toBeInTheDocument();
    expect(screen.getByText(/không đoán ngôn ngữ từ đuôi file/)).toBeInTheDocument();
  });

  it('picking a language sends ONE request with the deliverable id and the language', () => {
    renderIt([code()]);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'python' } });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ deliverableId: 'd1', language: 'python' });
  });

  it('python/cpp on the investigator path say it runs in the run environment and needs a pinned bundle', () => {
    renderIt([code({ language: 'python', pipeline: 'investigator' })]);
    expect(screen.getByRole('combobox')).toHaveValue('python');
    expect(screen.getByText(/môi trường chạy bài — cần gói test đã ghim/)).toBeInTheDocument();
    expect(screen.queryByText('Chưa khai')).not.toBeInTheDocument();
  });

  it('java says the run environment only runs Python and C++', () => {
    renderIt([code({ language: 'java', pipeline: 'one_shot' })]);
    expect(screen.getByText(/Chấm bằng đọc mã, không chạy mã \(môi trường chạy bài chỉ chạy Python và C\+\+\)/)).toBeInTheDocument();
  });

  it('read-only review shows the language and the grading path without a select', () => {
    render(<DeliverableLanguages sessionId="s1" deliverables={[code({ language: 'python', pipeline: 'investigator' })]} hasResults readOnly />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText(/môi trường chạy bài — cần gói test đã ghim/)).toBeInTheDocument();
    expect(screen.queryByText(/đã có kết quả chấm nên đường chấm đã cố định/)).not.toBeInTheDocument();
  });

  it('once results exist the select is disabled and says the path is fixed', () => {
    renderIt([code({ language: 'python', pipeline: 'investigator' })], true);
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByText(/đã có kết quả chấm nên đường chấm đã cố định/)).toBeInTheDocument();
  });

  it('shows the server refusal verbatim', () => {
    state = { isPending: false, isError: true, error: new Error('Bài này đã có kết quả chấm, nên đường chấm đã cố định — không đổi ngôn ngữ được nữa.') };
    renderIt([code()]);
    expect(screen.getByRole('alert')).toHaveTextContent('nên đường chấm đã cố định');
  });

  it('is disabled while a request is in flight', () => {
    state = { isPending: true, isError: false, error: null };
    renderIt([code()]);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
