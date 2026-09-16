import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CollectionPhaseActions } from './CollectionPhaseActions';
import type { RecollectResult } from '@/lib/api/exam-session';

/**
 * Giai đoạn "Đang thu bài" — spec
 * docs/superpowers/specs/2026-09-11-exam-collection-phase-design.md §7.
 *
 * Component thuần props, không gọi API: mọi mutation đi vào từ ngoài,
 * đúng khuôn AttendancePanel. Nhờ vậy test không cần QueryClient và
 * kiểm được thẳng thứ đáng kiểm — cái gì hiện ra trên màn hình.
 */
describe('CollectionPhaseActions', () => {
  const NOW = new Date('2026-09-11T10:30:00Z').getTime();

  function props(overrides: Partial<React.ComponentProps<typeof CollectionPhaseActions>> = {}) {
    return {
      status: 'collecting',
      missingCount: 3,
      countedAt: NOW,
      endTime: '2026-09-11T10:00:00.000Z',
      recollecting: false,
      recollectError: null,
      onRecollect: vi.fn<() => Promise<RecollectResult>>().mockResolvedValue({
        missing: 3,
        acknowledged: 3,
        unreachable: 0,
        unreachableNames: [],
      }),
      confirming: false,
      confirmError: null,
      onConfirmEnd: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('chỉ hiện khi phiên đang thu bài', () => {
    const { container } = render(<CollectionPhaseActions {...props({ status: 'active' })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('nút Thu lại mang số máy sẽ nhận lệnh', () => {
    render(<CollectionPhaseActions {...props({ missingCount: 5 })} />);
    expect(screen.getByRole('button', { name: /thu lại \(5\)/i })).toBeEnabled();
  });

  it('không ai thiếu thì disabled kèm giải thích, KHÔNG ẩn', () => {
    // Ẩn nút đi làm giảng viên tưởng tính năng hỏng, rồi đi tìm nó.
    render(<CollectionPhaseActions {...props({ missingCount: 0 })} />);

    expect(screen.getByRole('button', { name: /thu lại/i })).toBeDisabled();
    expect(screen.getByText(/tất cả đã nộp đủ/i)).toBeInTheDocument();
  });

  it('hiện mốc thời gian của con số, không chỉ con số', () => {
    // `collecting` là giai đoạn file đang bay về, nên `3` là ảnh chụp
    // của một dữ liệu đang chạy. Khi socket rớt, mốc đứng yên và giảng
    // viên NHÌN THẤY nó đứng, thay vì tin vào một con số chết.
    render(<CollectionPhaseActions {...props()} />);
    expect(screen.getByText(/tính đến/i)).toBeInTheDocument();
  });

  it('sau khi thu lại, hiện TÊN những máy không phản hồi', async () => {
    // Danh sách tên là phần giảng viên hành động dựa vào — họ cầm nó rồi
    // đi tới từng bàn. Con số một mình không nói đi đâu.
    const onRecollect = vi.fn<() => Promise<RecollectResult>>().mockResolvedValue({
      missing: 3,
      acknowledged: 1,
      unreachable: 2,
      unreachableNames: ['Nguyễn Văn A', 'Trần Thị B'],
    });
    render(<CollectionPhaseActions {...props({ onRecollect })} />);

    fireEvent.click(screen.getByRole('button', { name: /thu lại/i }));

    expect(await screen.findByText(/Nguyễn Văn A/)).toBeInTheDocument();
    expect(screen.getByText(/Trần Thị B/)).toBeInTheDocument();
    expect(screen.getByText(/1\/3 máy đã nhận yêu cầu/i)).toBeInTheDocument();
  });

  it('mọi máy đều trả lời thì không bịa ra danh sách trống', async () => {
    render(<CollectionPhaseActions {...props()} />);

    fireEvent.click(screen.getByRole('button', { name: /thu lại/i }));

    expect(await screen.findByText(/3\/3 máy đã nhận yêu cầu/i)).toBeInTheDocument();
    expect(screen.queryByText(/không phản hồi/i)).not.toBeInTheDocument();
  });

  it('thu lại lỗi thì nói ra, không im lặng', async () => {
    render(
      <CollectionPhaseActions
        {...props({ recollectError: new Error('Mất kết nối tới máy chủ') })}
      />,
    );

    expect(await screen.findByText(/Mất kết nối tới máy chủ/)).toBeInTheDocument();
  });

  it('hộp xác nhận nói rõ là KHÔNG chặn bài đang về', async () => {
    // Chống đúng cách hiểu sai mà lựa chọn "không chặn upload" tạo ra:
    // giảng viên bấm xong sẽ tưởng con số đã đóng băng.
    render(<CollectionPhaseActions {...props()} />);

    fireEvent.click(screen.getByRole('button', { name: /xác nhận kết thúc/i }));

    expect(await screen.findByText(/không chặn bài đang về/i)).toBeInTheDocument();
  });

  it('hộp xác nhận nói rõ bài còn được nhận tới lúc nào', async () => {
    // endTime 10:00Z + 30 phút = 10:30Z. Giờ hiển thị theo múi giờ của
    // máy đang xem, nên test chỉ kiểm là có một mốc giờ, không kiểm
    // chuỗi cứng — kiểm chuỗi cứng sẽ đỏ trên máy CI ở múi giờ khác.
    render(<CollectionPhaseActions {...props()} />);

    fireEvent.click(screen.getByRole('button', { name: /xác nhận kết thúc/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/30 phút sau giờ thi/i);
    expect(dialog).toHaveTextContent(/\d{2}:\d{2}/);
  });

  it('chỉ đóng hộp xác nhận khi request đã thành công', async () => {
    // Đóng ngay lúc bấm sẽ giấu mất chỗ báo lỗi, và một lần xác nhận
    // thất bại sẽ trông hệt như một lần thành công.
    const onConfirmEnd = vi.fn().mockRejectedValue(new Error('409'));
    render(<CollectionPhaseActions {...props({ onConfirmEnd })} />);
    fireEvent.click(screen.getByRole('button', { name: /xác nhận kết thúc/i }));

    fireEvent.click(await screen.findByRole('button', { name: /^xác nhận$/i }));

    await waitFor(() => expect(onConfirmEnd).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /^xác nhận$/i })).toBeInTheDocument();
  });
});
