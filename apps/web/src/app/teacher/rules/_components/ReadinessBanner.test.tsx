import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReadinessBanner } from './ReadinessBanner';
import { criterion, errorItem, mutation, overview } from './fixtures';

vi.mock('@/hooks/useRubricErrors', () => ({ useCopyErrors: () => mutation() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const handlers = () => ({ onAddManually: vi.fn(), onGoToCriterion: vi.fn(), onOpenProposals: vi.fn(), onOpenDangling: vi.fn() });
const mount = (o = overview(), errors: React.ComponentProps<typeof ReadinessBanner>['errors'] = [], overviews = [o]) => {
  const h = handlers();
  render(<ReadinessBanner overview={o} errors={errors} overviews={overviews} {...h} />);
  return h;
};

beforeEach(() => vi.clearAllMocks());

describe('ReadinessBanner (T-RBE-UI-3)', () => {
  it('sẵn sàng: nói rõ và không có việc nào', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Sẵn sàng chấm tự động' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('rubric mới: tiêu đề, câu hậu quả, ô chọn nguồn KHÔNG chọn sẵn', () => {
    const fresh = overview({ criteria: [criterion({ errorCount: 0 })] });
    const other = overview({ rubricName: 'Cũ' });
    mount(fresh, [], [fresh, other]);
    expect(screen.getByRole('heading', { name: 'Rubric mới — chưa có lỗi nào' })).toBeInTheDocument();
    expect(screen.getByText(/Khi chưa có lỗi, mọi bài chấm theo rubric này sẽ chuyển sang “Cần bạn xem” thay vì tự duyệt/)).toBeInTheDocument();
    expect(screen.getByLabelText('Sao chép lỗi và điểm trừ từ')).toHaveValue('');
  });

  it('còn việc: tiêu đề đếm số LOẠI việc; mỗi dòng việc là một nút làm đúng việc', () => {
    const o = overview({
      criteria: [criterion({ key: 'a', description: 'Tính đúng', errorCount: 1 }), criterion({ key: 'b', description: 'Trình bày', errorCount: 0 })],
      unpricedCount: 2,
      proposalCount: 3,
      danglingCount: 1,
    });
    const errors = [errorItem({ id: 'e1', criterionKey: 'a', deduction: '1.00' }), errorItem({ id: 'e2', criterionKey: 'a', deduction: null })];
    const h = mount(o, errors);
    expect(screen.getByRole('heading', { name: 'Chưa sẵn sàng chấm tự động — còn 4 việc' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm lỗi' }));
    expect(h.onGoToCriterion).toHaveBeenLastCalledWith('b');
    fireEvent.click(screen.getByRole('button', { name: 'Đặt điểm trừ' }));
    expect(h.onGoToCriterion).toHaveBeenLastCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: 'Xem lỗi AI đề xuất' }));
    expect(h.onOpenProposals).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang tiêu chí khác' }));
    expect(h.onOpenDangling).toHaveBeenCalled();
    expect(screen.getByText(/3 lỗi AI thấy/)).toBeInTheDocument();
    expect(screen.getByText(/đang bị bỏ ra khỏi điểm/)).toBeInTheDocument();
  });

  it('danh sách lỗi chưa tải xong (undefined) thì "Đặt điểm trừ" nhảy tới nhóm đầu tiên thay vì hỏng', () => {
    const o = overview({ unpricedCount: 1 });
    const h = handlers();
    render(<ReadinessBanner overview={o} overviews={[o]} errors={undefined} {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt điểm trừ' }));
    expect(h.onGoToCriterion).toHaveBeenCalledWith('tinh_dung');
  });
});
