import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RubricRow } from './RubricRow';
import type { Rubric } from '@/lib/api/grading';
import { rulesHref } from '@/lib/rules-links';

const mutate = vi.fn();
let rubrics: { data?: Rubric[]; isLoading: boolean };
let setState: { isPending: boolean; isError: boolean; error: Error | null };

vi.mock('@/hooks/useGrading', () => ({
  useRubrics: () => rubrics,
  useSetSessionRubric: () => ({ mutate, ...setState }),
}));

const ctdl: Rubric = {
  id: 'ru-1', teacherId: 't', name: 'CTDL', version: 2, isActive: true, totalPoints: 10,
  criteria: [
    { id: 'c1', key: 'tinh_dung', description: 'Tính đúng', maxPoints: 6 },
    { id: 'c2', key: 'trinh_bay', description: 'Trình bày', maxPoints: 4 },
  ],
};
const ctdlOld: Rubric = { ...ctdl, id: 'ru-0', version: 1, isActive: false };
const toan: Rubric = { ...ctdl, id: 'ru-b', name: 'Toán rời rạc', version: 1, totalPoints: 8, criteria: [ctdl.criteria[0]] };

beforeEach(() => {
  mutate.mockReset();
  rubrics = { data: [ctdl, ctdlOld, toan], isLoading: false };
  setState = { isPending: false, isError: false, error: null };
});

/**
 * Replaces SessionRubricCard. RubricPicker (create-session) promises "cứ tạo phiên thi và gắn sau", so this is
 * where "later" happens — deleting the card without it would break that promise (Review Focus 7).
 */
describe('RubricRow', () => {
  it('shows the pinned rubric: name, version, total and number of criteria', () => {
    render(<RubricRow sessionId="s1" rubricId="ru-1" />);
    expect(screen.getByText('CTDL — phiên bản 2')).toBeInTheDocument();
    expect(screen.getByText(/10,0 điểm, 2 tiêu chí/)).toBeInTheDocument();
  });

  it('shows the PINNED version, not the newest one of the same rubric', () => {
    render(<RubricRow sessionId="s1" rubricId="ru-0" />);
    expect(screen.getByText('CTDL — phiên bản 1')).toBeInTheDocument();
  });

  it('links to edit the pinned rubric', () => {
    render(<RubricRow sessionId="s1" rubricId="ru-1" />);
    expect(screen.getByRole('link', { name: 'Sửa Rubric' })).toHaveAttribute('href', rulesHref('CTDL'));
  });

  it('read-only review keeps the pinned rubric and links to the error board without a swap control', () => {
    render(<RubricRow sessionId="s1" rubricId="ru-1" readOnly />);
    expect(screen.getByText('CTDL — phiên bản 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem bảng lỗi' })).toHaveAttribute('href', rulesHref('CTDL'));
    expect(screen.queryByLabelText('Chọn rubric')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đổi rubric' })).not.toBeInTheDocument();
  });

  it('draft: lựa chọn trong nháp được hiện như rubric của phiên, không báo chưa gắn', () => {
    render(
      <RubricRow
        sessionId="s1"
        rubricId={null}
        persist="draft"
        choice="ru-1"
        onChoiceChange={() => undefined}
      />,
    );
    expect(screen.getByText('CTDL — phiên bản 2')).toBeInTheDocument();
    expect(screen.queryByText(/chưa gắn rubric/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gắn rubric' })).not.toBeInTheDocument();
  });

  it('draft: rubric đã ghim trên phiên vẫn hiện khi chưa chọn lại', () => {
    render(<RubricRow sessionId="s1" rubricId="ru-1" persist="draft" choice="" />);
    expect(screen.getByText('CTDL — phiên bản 2')).toBeInTheDocument();
    expect(screen.queryByText(/chưa gắn rubric/i)).not.toBeInTheDocument();
  });

  it('with no rubric pinned: says so, and only ACTIVE versions can be attached', () => {
    render(<RubricRow sessionId="s1" rubricId={null} />);
    expect(screen.getByText(/chưa gắn rubric/i)).toBeInTheDocument();
    const select = screen.getByLabelText('Chọn rubric') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value).filter(Boolean)).toEqual(['ru-1', 'ru-b']);
  });

  it('"Gắn rubric" stays disabled until one is chosen, then sends that id', () => {
    render(<RubricRow sessionId="s1" rubricId={null} />);
    const attach = screen.getByRole('button', { name: 'Gắn rubric' });
    expect(attach).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Chọn rubric'), { target: { value: 'ru-b' } });
    fireEvent.click(attach);
    expect(mutate).toHaveBeenCalledWith('ru-b', expect.anything());
  });

  it('a pinned rubric can be swapped while the session is unlocked', () => {
    render(<RubricRow sessionId="s1" rubricId="ru-1" />);
    fireEvent.change(screen.getByLabelText('Chọn rubric'), { target: { value: 'ru-b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đổi rubric' }));
    expect(mutate).toHaveBeenCalledWith('ru-b', expect.anything());
  });

  it('shows the server message verbatim when the swap is refused (session already has results)', () => {
    setState = { isPending: false, isError: true, error: new Error('Phiên thi đã có kết quả chấm — không đổi được rubric') };
    render(<RubricRow sessionId="s1" rubricId="ru-1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('không đổi được rubric');
  });

  it('with no rubric at all, points to Bảng lỗi to create one', () => {
    rubrics = { data: [], isLoading: false };
    render(<RubricRow sessionId="s1" rubricId={null} />);
    expect(screen.getByText(/Bạn chưa có rubric nào/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo rubric ở Bảng lỗi' })).toHaveAttribute('href', '/teacher/rules');
  });

  it('says it is loading rather than "no rubric"', () => {
    rubrics = { data: undefined, isLoading: true };
    render(<RubricRow sessionId="s1" rubricId={null} />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    expect(screen.queryByText(/Bạn chưa có rubric nào/)).not.toBeInTheDocument();
  });
});
