import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CeilingCard } from './CeilingCard';
import { rule } from './fixtures';
import type { Rubric } from '@/lib/api/grading';
import type { CriterionWaiver } from '@/lib/api/rules';

const h = vi.hoisted(() => ({
  saveMutate: vi.fn(),
  setWaiver: vi.fn(),
  revokeWaiver: vi.fn(),
  waiverQueries: [] as (string | undefined)[],
  rubrics: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null },
  rules: { data: [] as unknown[] },
  waivers: { data: [] as unknown[] },
  setState: { isPending: false, isError: false, error: null as Error | null },
  revokeState: { isPending: false, isError: false, error: null as Error | null },
}));

vi.mock('@/hooks/useGrading', () => ({
  useRubrics: () => h.rubrics,
  useSaveRubric: () => ({ mutate: h.saveMutate, isPending: false, isError: false, error: null }),
}));
vi.mock('@/hooks/useRules', () => ({
  useRules: () => h.rules,
  useWaivers: (id?: string) => {
    h.waiverQueries.push(id);
    return h.waivers;
  },
  useSetWaiver: () => ({ mutate: h.setWaiver, ...h.setState }),
  useRevokeWaiver: () => ({ mutate: h.revokeWaiver, ...h.revokeState }),
}));

const ctdl: Rubric = {
  id: 'ru-1', teacherId: 't', name: 'CTDL', version: 2, isActive: true, totalPoints: 8.5,
  criteria: [
    { id: 'c1', key: 'tinh_dung', description: 'Tính đúng', maxPoints: 6 },
    { id: 'c2', key: 'trinh_bay', description: 'Trình bày', maxPoints: 2.5 },
  ],
};
const ctdlOld: Rubric = { ...ctdl, id: 'ru-0', version: 1, isActive: false };
const toan: Rubric = {
  id: 'ru-b', teacherId: 't', name: 'Toán rời rạc', version: 1, isActive: true, totalPoints: 10,
  criteria: [{ id: 'd1', key: 'chung_minh', description: 'Chứng minh', maxPoints: 10 }],
};

const waiver = (over: Partial<CriterionWaiver> = {}): CriterionWaiver => ({
  id: 'w1', criterionKey: 'trinh_bay', setAt: '2026-09-29T00:00:00Z', revokedAt: null, ...over,
});
/** A rule pointing at `tinh_dung`, so only `trinh_bay` is left without one. */
const ruleOnTinhDung = rule({ id: 'r1', revision: { criterionKey: 'tinh_dung' } });

beforeEach(() => {
  h.saveMutate.mockReset();
  h.setWaiver.mockReset();
  h.revokeWaiver.mockReset();
  h.waiverQueries.length = 0;
  h.rubrics = { data: [ctdl, ctdlOld], isLoading: false, isError: false, error: null };
  h.rules = { data: [ruleOnTinhDung] };
  h.waivers = { data: [] };
  h.setState = { isPending: false, isError: false, error: null };
  h.revokeState = { isPending: false, isError: false, error: null };
});

describe('CeilingCard — the ceilings', () => {
  it('lists each criterion with its ceiling, the total, and the version in use', () => {
    render(<CeilingCard />);
    expect(screen.getByRole('heading', { name: 'Trần điểm theo tiêu chí' })).toBeInTheDocument();
    expect(screen.getByText('tinh_dung')).toHaveClass('font-mono');
    expect(screen.getByText('6,0')).toBeInTheDocument();
    expect(screen.getByText('Trình bày')).toBeInTheDocument();
    expect(screen.getByText('Điểm tối đa')).toBeInTheDocument();
    expect(screen.getByText('8,5')).toBeInTheDocument();
    expect(screen.getByText(/phiên bản 2/)).toBeInTheDocument();
  });

  it('shows the ACTIVE version, never an older one of the same rubric', () => {
    render(<CeilingCard />);
    expect(screen.getAllByText('tinh_dung')).toHaveLength(1);
  });

  it('says nothing is set up yet, and offers to create the first rubric', () => {
    h.rubrics = { data: [], isLoading: false, isError: false, error: null };
    render(<CeilingCard />);
    expect(screen.getByText(/Bạn chưa có rubric nào/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo rubric' }));
    expect(screen.getByRole('heading', { name: 'Rubric mới' })).toBeInTheDocument();
  });

  it('shows the load error, not "no rubric"', () => {
    h.rubrics = { data: undefined, isLoading: false, isError: true, error: new Error('Mất kết nối') };
    render(<CeilingCard />);
    expect(screen.getByRole('alert')).toHaveTextContent('Mất kết nối');
    expect(screen.queryByText(/Bạn chưa có rubric nào/)).not.toBeInTheDocument();
  });

  it('shows a loading state', () => {
    h.rubrics = { data: undefined, isLoading: true, isError: false, error: null };
    render(<CeilingCard />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
  });

  describe('more than one rubric', () => {
    beforeEach(() => {
      h.rubrics = { data: [ctdl, ctdlOld, toan], isLoading: false, isError: false, error: null };
    });

    it('offers a choice by name (each name once), defaulting to the first with an active version', () => {
      render(<CeilingCard />);
      const select = screen.getByLabelText('Rubric') as HTMLSelectElement;
      expect([...select.options].map((o) => o.text)).toEqual(['CTDL', 'Toán rời rạc']);
      expect(select.value).toBe('CTDL');
      expect(screen.getByText('tinh_dung')).toBeInTheDocument();
    });

    it('switching shows the other rubric, and waivers are looked up by that VERSION id', () => {
      render(<CeilingCard />);
      expect(h.waiverQueries.at(-1)).toBe('ru-1');
      fireEvent.change(screen.getByLabelText('Rubric'), { target: { value: 'Toán rời rạc' } });
      expect(screen.getByText('chung_minh')).toBeInTheDocument();
      expect(screen.queryByText('tinh_dung')).not.toBeInTheDocument();
      expect(h.waiverQueries.at(-1)).toBe('ru-b');
    });
  });

  it('a single rubric gets no picker', () => {
    render(<CeilingCard />);
    expect(screen.queryByLabelText('Rubric')).not.toBeInTheDocument();
  });

  it('"Sửa trần" opens the editor on the rubric in use', () => {
    render(<CeilingCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa trần' }));
    expect(screen.getByRole('heading', { name: /Sửa trần điểm — CTDL/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('Tính đúng');
  });

  it('warns the editor about the rules that point at each criterion', () => {
    render(<CeilingCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa trần' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tiêu chí 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/1 luật đang trỏ vào tiêu chí tinh_dung/);
  });

  it('after saving a new version, says it — and that the "no deduction rule" marks belong to the OLD version', () => {
    h.waivers = { data: [waiver()] };
    const saved: Rubric = { ...ctdl, id: 'ru-3', version: 3, totalPoints: 9 };
    h.saveMutate.mockImplementation((_input: unknown, opts: { onSuccess: (r: Rubric) => void }) => opts.onSuccess(saved));
    render(<CeilingCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa trần' }));
    fireEvent.change(screen.getByLabelText('Trần điểm 1'), { target: { value: '6,5' } });
    fireEvent.click(screen.getByRole('button', { name: /^Lưu/ }));
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Đã lưu "CTDL" — phiên bản 3');
    expect(notice).toHaveTextContent(/đánh dấu .*không có luật trừ.* gắn với từng phiên bản/);
  });

  it('says nothing about marks when there were none to lose', () => {
    const saved: Rubric = { ...ctdl, id: 'ru-3', version: 3 };
    h.saveMutate.mockImplementation((_input: unknown, opts: { onSuccess: (r: Rubric) => void }) => opts.onSuccess(saved));
    render(<CeilingCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa trần' }));
    fireEvent.change(screen.getByLabelText('Trần điểm 1'), { target: { value: '6,5' } });
    fireEvent.click(screen.getByRole('button', { name: /^Lưu/ }));
    expect(screen.getByRole('status')).not.toHaveTextContent(/gắn với từng phiên bản/);
  });
});

describe('CeilingCard — "Tiêu chí này không có luật trừ" (Review Focus 5)', () => {
  const checkboxes = () => screen.queryAllByRole('checkbox');

  it('is offered only for a criterion that no active rule points at', () => {
    render(<CeilingCard />);
    expect(checkboxes()).toHaveLength(1);
    expect(checkboxes()[0]).toHaveAccessibleName(/trinh_bay/);
    expect(screen.getByText('chưa có luật nào')).toBeInTheDocument();
  });

  it('is not offered when every criterion has a rule', () => {
    h.rules = { data: [ruleOnTinhDung, rule({ id: 'r2', revision: { criterionKey: 'trinh_bay' } })] };
    render(<CeilingCard />);
    expect(checkboxes()).toHaveLength(0);
    expect(screen.queryByText('chưa có luật nào')).not.toBeInTheDocument();
  });

  it('ticking it asks first, states the consequence in words, and sends nothing yet', () => {
    render(<CeilingCard />);
    fireEvent.click(checkboxes()[0]);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('luôn trọn điểm cho mọi bài chấm theo rubric này');
    expect(dialog).toHaveTextContent('phiên chưa chốt được tính lại');
    expect(h.setWaiver).not.toHaveBeenCalled();
  });

  it('labels the missing impact preview "cần backend" instead of inventing a number', () => {
    render(<CeilingCard />);
    fireEvent.click(checkboxes()[0]);
    expect(within(screen.getByRole('dialog')).getByText('cần backend')).toBeInTheDocument();
  });

  it('confirming marks the criterion and reads the recompute in words', () => {
    h.setWaiver.mockImplementation((_key: string, opts: { onSuccess: (d: unknown) => void }) =>
      opts.onSuccess({ waiverId: 'w9', recompute: { recomputed: 4, promoted: 3, demoted: 0, belowFloor: 0 } }),
    );
    render(<CeilingCard />);
    fireEvent.click(checkboxes()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu không có luật trừ' }));
    expect(h.setWaiver).toHaveBeenCalledWith('trinh_bay', expect.anything());
    expect(screen.getByRole('status')).toHaveTextContent('Đã tính lại 4 bài: 3 bài đủ điều kiện tự quyết.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a mark that already existed says so instead of claiming a recompute', () => {
    h.setWaiver.mockImplementation((_key: string, opts: { onSuccess: (d: unknown) => void }) =>
      opts.onSuccess({ waiverId: 'w9', recompute: null }),
    );
    render(<CeilingCard />);
    fireEvent.click(checkboxes()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu không có luật trừ' }));
    expect(screen.getByRole('status')).toHaveTextContent('Đánh dấu này đã có từ trước');
  });

  it('cancelling sends nothing and closes the dialog', () => {
    render(<CeilingCard />);
    fireEvent.click(checkboxes()[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(h.setWaiver).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('the server message shows verbatim inside the dialog', () => {
    h.setState = { isPending: false, isError: true, error: new Error('Tiêu chí "trinh_bay" không có trong rubric này') };
    render(<CeilingCard />);
    fireEvent.click(checkboxes()[0]);
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('không có trong rubric này');
  });

  describe('a criterion already marked', () => {
    beforeEach(() => {
      h.waivers = { data: [waiver()] };
    });

    it('shows the box ticked — and keeps it even if a rule has appeared since, so the mark can still be lifted', () => {
      h.rules = { data: [ruleOnTinhDung, rule({ id: 'r2', revision: { criterionKey: 'trinh_bay' } })] };
      render(<CeilingCard />);
      expect(checkboxes()).toHaveLength(1);
      expect(checkboxes()[0]).toBeChecked();
    });

    it('unticking asks first and explains what lifting it does', () => {
      render(<CeilingCard />);
      fireEvent.click(checkboxes()[0]);
      expect(screen.getByRole('dialog')).toHaveTextContent(/lại đòi có luật trừ/);
      expect(h.revokeWaiver).not.toHaveBeenCalled();
    });

    it('confirming lifts THAT mark (by its id) and reads the recompute in words', () => {
      h.revokeWaiver.mockImplementation((_id: string, opts: { onSuccess: (d: unknown) => void }) =>
        opts.onSuccess({ recompute: { recomputed: 2, promoted: 0, demoted: 2, belowFloor: 0 } }),
      );
      render(<CeilingCard />);
      fireEvent.click(checkboxes()[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Bỏ đánh dấu' }));
      expect(h.revokeWaiver).toHaveBeenCalledWith('w1', expect.anything());
      expect(screen.getByRole('status')).toHaveTextContent('Đã tính lại 2 bài: 2 bài chuyển về "Cần bạn xem".');
    });
  });
});
