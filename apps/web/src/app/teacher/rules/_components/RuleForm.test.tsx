import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RuleForm } from './RuleForm';
import { rule } from './fixtures';

const h = vi.hoisted(() => ({
  create: vi.fn(),
  revise: vi.fn(),
  setState: vi.fn(),
  setPrice: vi.fn(),
  previewCalls: [] as unknown[],
  nextPreview: { data: undefined as unknown, error: null as Error | null },
  rubrics: [] as unknown[],
}));

vi.mock('@/hooks/useRules', async () => {
  const React = await import('react');
  return {
    useCreateRule: () => ({ mutateAsync: h.create }),
    useReviseRule: () => ({ mutateAsync: h.revise }),
    useSetRuleState: () => ({ mutateAsync: h.setState }),
    useSetPrice: () => ({ mutateAsync: h.setPrice }),
    // A stateful stand-in for the real mutation so "the server answered" re-renders the form.
    usePreviewRule: () => {
      const [s, set] = React.useState<{ variables?: unknown; data?: unknown; error?: Error }>({});
      return {
        mutate: (input: unknown) => {
          h.previewCalls.push(input);
          set(h.nextPreview.error ? { variables: input, error: h.nextPreview.error } : { variables: input, data: h.nextPreview.data });
        },
        reset: () => set({}),
        variables: s.variables,
        data: s.data,
        isError: Boolean(s.error),
        error: s.error ?? null,
        isPending: false,
      };
    },
  };
});
vi.mock('@/hooks/useGrading', () => ({ useRubrics: () => ({ data: h.rubrics, isLoading: false }) }));

const activeRubric = {
  id: 'ru-1', teacherId: 't', name: 'CTDL', version: 2, isActive: true, totalPoints: 10,
  criteria: [
    { id: 'c1', key: 'tinh_dung', description: 'Tính đúng', maxPoints: 6 },
    { id: 'c2', key: 'trinh_bay', description: 'Trình bày', maxPoints: 4 },
  ],
};
const retiredRubric = {
  id: 'ru-0', teacherId: 't', name: 'CTDL', version: 1, isActive: false, totalPoints: 5,
  criteria: [{ id: 'c9', key: 'cu_ky', description: 'Tiêu chí cũ', maxPoints: 5 }],
};

const RECOMPUTE = { recomputed: 3, promoted: 1, demoted: 0, belowFloor: 0 };
const DEBOUNCE = 600; // ≥ PREVIEW_DEBOUNCE_MS

beforeEach(() => {
  vi.useFakeTimers();
  h.create.mockReset().mockResolvedValue({ ruleId: 'new-1', revisionId: 'rv-1', recompute: null });
  h.revise.mockReset().mockResolvedValue({ revisionId: 'rv-2', recompute: RECOMPUTE });
  h.setState.mockReset().mockResolvedValue({ recompute: RECOMPUTE });
  h.setPrice.mockReset().mockResolvedValue({ versionId: 'pv-1', recompute: RECOMPUTE });
  h.previewCalls.length = 0;
  h.nextPreview = { data: { tier: 4, sessions: [] }, error: null };
  h.rubrics = [activeRubric, retiredRubric];
});
afterEach(() => vi.useRealTimers());

const name = () => screen.getByLabelText('Tên lỗi');
const description = () => screen.getByLabelText('Mô tả lỗi');
const price = () => screen.getByLabelText('Mức trừ (điểm)');
const saveButton = () => screen.getByRole('button', { name: /^Lưu/ });

function fillBasics() {
  fireEvent.change(name(), { target: { value: 'Sập ở mảng rỗng' } });
  fireEvent.change(description(), { target: { value: 'Chương trình dừng khi mảng rỗng' } });
  fireEvent.click(screen.getByRole('button', { name: /tinh_dung/ }));
}
const chooseMachine = () => fireEvent.click(screen.getByRole('button', { name: /^Máy kiểm được/ }));
const chooseTemplate = (label: RegExp) => fireEvent.click(screen.getByRole('radio', { name: label }));
const settle = async () => act(async () => void vi.advanceTimersByTime(DEBOUNCE));
const clickSave = async () => act(async () => void fireEvent.click(saveButton()));

describe('RuleForm — the four blocks (spec §3.2)', () => {
  it('follows the order the teacher thinks in, and links back to Bảng lỗi', () => {
    render(<RuleForm />);
    const legends = screen.getAllByRole('group').map((g) => within(g).queryByText(/^\d\. /)?.textContent);
    expect(legends.filter(Boolean)).toEqual([
      '1. Lỗi là gì',
      '2. Thuộc tiêu chí nào',
      '3. Hệ thống nhận ra lỗi này bằng cách nào',
      '4. Mức trừ',
    ]);
    expect(screen.getByRole('link', { name: 'Bảng lỗi' })).toHaveAttribute('href', '/teacher/rules');
  });

  it('offers only criteria of ACTIVE rubric versions, once per key, as toggle pills', () => {
    render(<RuleForm />);
    expect(screen.getByRole('button', { name: /tinh_dung/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /trinh_bay/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cu_ky/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tinh_dung/ }));
    expect(screen.getByRole('button', { name: /tinh_dung/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /trinh_bay/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows each criterion ceiling next to its key', () => {
    render(<RuleForm />);
    expect(screen.getByRole('button', { name: /tinh_dung.*trần 6,0/ })).toBeInTheDocument();
  });

  it('says there is nothing to pick when the teacher has no rubric yet', () => {
    h.rubrics = [];
    render(<RuleForm />);
    expect(screen.getByText(/Chưa có tiêu chí nào/)).toBeInTheDocument();
  });
});

describe('RuleForm — how the system recognises the error (Review Focus 4)', () => {
  it('defaults to a rule in words and says what that means', () => {
    render(<RuleForm />);
    expect(screen.getByRole('button', { name: /^Mô tả bằng lời/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/độ tin tối đa 0,85/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('machine mode offers the four templates; only the three the machine cannot measure carry "Máy chưa đo được"', () => {
    render(<RuleForm />);
    chooseMachine();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getAllByText('Máy chưa đo được')).toHaveLength(3);
    const tests = screen.getByRole('radio', { name: /Một nhóm test bị trượt/ }).closest('label')!;
    expect(within(tests).queryByText('Máy chưa đo được')).not.toBeInTheDocument();
  });

  it('a measurable template promises the machine decides it', () => {
    render(<RuleForm />);
    chooseMachine();
    expect(screen.getByText(/nguồn gốc Máy quyết, độ tin tới 1,0/)).toBeInTheDocument();
  });

  it('an unmeasured template says its real consequence and NEVER promises "Máy quyết"', () => {
    const { container } = render(<RuleForm />);
    chooseMachine();
    chooseTemplate(/Mã có gọi một hàm/);
    expect(screen.getByText(/chưa được kiểm tới/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Máy quyết|độ tin tới 1,0/);
  });

  it('shows the parameter input for the chosen template, labelled for what it is', () => {
    render(<RuleForm />);
    chooseMachine();
    expect(screen.getByLabelText('Tên nhóm test')).toBeInTheDocument();
    chooseTemplate(/Mã có gọi một hàm/);
    expect(screen.getByLabelText('Tên hàm')).toBeInTheDocument();
    chooseTemplate(/Độ phức tạp vượt yêu cầu/);
    expect(screen.queryByLabelText(/Tên hàm|Tên nhóm/)).not.toBeInTheDocument();
    chooseTemplate(/Không được dùng đệ quy/);
    expect(screen.getByLabelText('Tên hàm (tuỳ chọn)')).toBeInTheDocument();
  });
});

describe('RuleForm — validation sits beside the field, and Lưu waits for a valid form', () => {
  it('Lưu is disabled on an empty form', () => {
    render(<RuleForm />);
    expect(saveButton()).toBeDisabled();
  });

  it('shows the name message on blur, beside the field', () => {
    render(<RuleForm />);
    fireEvent.blur(name());
    expect(screen.getByText('Đặt tên cho lỗi này.')).toBeInTheDocument();
  });

  it('is enabled once name, description and criterion are set', () => {
    render(<RuleForm />);
    fillBasics();
    expect(saveButton()).toBeEnabled();
  });

  it('a machine rule also needs its parameter', () => {
    render(<RuleForm />);
    fillBasics();
    chooseMachine();
    expect(saveButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Tên nhóm test'), { target: { value: 'bien' } });
    expect(saveButton()).toBeEnabled();
  });

  it('blocks garbage prices on blur with the message beside the field, and sends nothing', async () => {
    render(<RuleForm />);
    fillBasics();
    fireEvent.change(price(), { target: { value: 'abc' } });
    fireEvent.blur(price());
    expect(screen.getByText('Mức trừ: số không âm, tối đa hai chữ số lẻ.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    await clickSave();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('says what a blank price means', () => {
    render(<RuleForm />);
    expect(screen.getByText(/chưa có giá/)).toBeInTheDocument();
  });
});

describe('RuleForm — creating a rule', () => {
  it('sends the whole rule, with a key made from the name, then reads the outcome in words', async () => {
    render(<RuleForm />);
    fillBasics();
    await clickSave();
    expect(h.create).toHaveBeenCalledWith({
      ruleKey: 'sap_o_mang_rong',
      name: 'Sập ở mảng rỗng',
      description: 'Chương trình dừng khi mảng rỗng',
      criterionKey: 'tinh_dung',
      predicate: null,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Luật này không tính lại bài nào đã chấm');
    expect(screen.getByRole('link', { name: 'Về Bảng lỗi' })).toHaveAttribute('href', '/teacher/rules');
  });

  it('a new rule starts unpriced: no price typed ⇒ setPrice is never called', async () => {
    render(<RuleForm />);
    fillBasics();
    await clickSave();
    expect(h.setPrice).not.toHaveBeenCalled();
  });

  it('a typed price goes to setPrice AFTER the rule exists, as a decimal STRING with a dot (Review Focus 2)', async () => {
    render(<RuleForm />);
    fillBasics();
    fireEvent.change(price(), { target: { value: '1,5' } });
    await clickSave();
    expect(h.setPrice).toHaveBeenCalledWith({ ruleId: 'new-1', deduction: '1.5' });
    expect(h.create.mock.invocationCallOrder[0]).toBeLessThan(h.setPrice.mock.invocationCallOrder[0]);
  });

  it('sends a machine predicate for the chosen template', async () => {
    render(<RuleForm />);
    fillBasics();
    chooseMachine();
    fireEvent.change(screen.getByLabelText('Tên nhóm test'), { target: { value: 'mang_rong' } });
    await clickSave();
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ predicate: { kind: 'test_group_failed', group: 'mang_rong' } }),
    );
  });

  it('shows the server message verbatim (409: key already exists) and lets the teacher try again', async () => {
    h.create.mockRejectedValueOnce(new Error('Đã có luật với khoá này'));
    render(<RuleForm />);
    fillBasics();
    await clickSave();
    expect(screen.getByRole('alert')).toHaveTextContent('Đã có luật với khoá này');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('does not create the rule twice when only the price step failed — the retry resumes at the price', async () => {
    h.setPrice.mockRejectedValueOnce(new Error('Không lưu được giá'));
    render(<RuleForm />);
    fillBasics();
    fireEvent.change(price(), { target: { value: '1' } });
    await clickSave();
    expect(screen.getByRole('alert')).toHaveTextContent('Không lưu được giá');
    expect(screen.getByText(/Luật đã được lưu/)).toBeInTheDocument();
    await clickSave();
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.setPrice).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('RuleForm — editing an existing rule', () => {
  const existing = rule({
    id: 'r1', ruleKey: 'sai_bien', deduction: '1.50',
    revision: { name: 'Sai ca biên', description: 'Nhóm biên không đạt', criterionKey: 'tinh_dung', predicate: { kind: 'test_group_failed', group: 'bien' } },
  });

  it('prefills every field from the rule, including the machine template and the price as typed in Vietnamese', () => {
    render(<RuleForm rule={existing} />);
    expect(name()).toHaveValue('Sai ca biên');
    expect(description()).toHaveValue('Nhóm biên không đạt');
    expect(screen.getByRole('button', { name: /tinh_dung/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Máy kiểm được/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Tên nhóm test')).toHaveValue('bien');
    expect(price()).toHaveValue('1,5');
  });

  it('keeps the rule key visible and unchangeable', () => {
    render(<RuleForm rule={existing} />);
    expect(screen.getByText('sai_bien')).toHaveClass('font-mono');
  });

  it('offers nothing to save until something changed', () => {
    render(<RuleForm rule={existing} />);
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Chưa đổi gì.')).toBeInTheDocument();
  });

  it('a changed description writes a new revision (no key in the body) and NOT the price', async () => {
    render(<RuleForm rule={existing} />);
    fireEvent.change(description(), { target: { value: 'Nhóm biên không đạt — kể cả mảng một phần tử' } });
    await clickSave();
    expect(h.revise).toHaveBeenCalledWith({
      ruleId: 'r1',
      changes: {
        name: 'Sai ca biên',
        description: 'Nhóm biên không đạt — kể cả mảng một phần tử',
        criterionKey: 'tinh_dung',
        predicate: { kind: 'test_group_failed', group: 'bien' },
      },
    });
    expect(h.setPrice).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Đã tính lại 3 bài: 1 bài đủ điều kiện tự quyết.');
  });

  it('a price-only change does not create a revision', async () => {
    render(<RuleForm rule={existing} />);
    fireEvent.change(price(), { target: { value: '2' } });
    await clickSave();
    expect(h.revise).not.toHaveBeenCalled();
    expect(h.setPrice).toHaveBeenCalledWith({ ruleId: 'r1', deduction: '2' });
  });

  it('typing the same price in another spelling is not a change', () => {
    render(<RuleForm rule={existing} />);
    fireEvent.change(price(), { target: { value: '1,50' } });
    expect(saveButton()).toBeDisabled();
  });

  it('clearing the price sends an explicit null (back to unpriced), not nothing', async () => {
    render(<RuleForm rule={existing} />);
    fireEvent.change(price(), { target: { value: '' } });
    await clickSave();
    expect(h.setPrice).toHaveBeenCalledWith({ ruleId: 'r1', deduction: null });
  });

  it('shows an orphan criterion key instead of hiding it, so the teacher can see why rules mismatch', () => {
    render(<RuleForm rule={rule({ revision: { criterionKey: 'khong_con' } })} />);
    const pill = screen.getByRole('button', { name: /khong_con/ });
    expect(pill).toHaveAttribute('aria-pressed', 'true');
    expect(pill).toHaveTextContent('không còn trong rubric');
  });
});

describe('RuleForm — promoting a rule the agent reported (from Luật còn thiếu)', () => {
  const proposed = rule({
    id: 'p1', ruleKey: 'de_xuat_p1', state: 'proposed', origin: 'agent_reported', deduction: null, checkedBy: 'model',
    revision: { name: 'Trả về mảng mới thay vì sắp xếp tại chỗ', description: 'Trả về mảng mới thay vì sắp xếp tại chỗ', criterionKey: 'chua_gan', predicate: null },
  });

  it('prefills what the agent observed, but leaves the criterion for the teacher (the agent never assigns one)', () => {
    render(<RuleForm rule={proposed} />);
    expect(description()).toHaveValue('Trả về mảng mới thay vì sắp xếp tại chỗ');
    expect(screen.getByRole('button', { name: /tinh_dung/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /chua_gan/ })).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('saving = revise, then activate, then price — in that order — and nothing is created', async () => {
    render(<RuleForm rule={proposed} />);
    fireEvent.click(screen.getByRole('button', { name: /tinh_dung/ }));
    fireEvent.change(price(), { target: { value: '1' } });
    await clickSave();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.revise).toHaveBeenCalledWith({ ruleId: 'p1', changes: expect.objectContaining({ criterionKey: 'tinh_dung', predicate: null }) });
    expect(h.setState).toHaveBeenCalledWith({ ruleId: 'p1', state: 'active' });
    expect(h.setPrice).toHaveBeenCalledWith({ ruleId: 'p1', deduction: '1' });
    const order = [h.revise, h.setState, h.setPrice].map((f) => f.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('a failure after the revision resumes at activation — it does not revise twice', async () => {
    h.setState.mockRejectedValueOnce(new Error('Không kích hoạt được'));
    render(<RuleForm rule={proposed} />);
    fireEvent.click(screen.getByRole('button', { name: /tinh_dung/ }));
    await clickSave();
    expect(screen.getByRole('alert')).toHaveTextContent('Không kích hoạt được');
    await clickSave();
    expect(h.revise).toHaveBeenCalledTimes(1);
    expect(h.setState).toHaveBeenCalledTimes(2);
  });
});

describe('RuleForm — where saving applies (preview + tier)', () => {
  it('asks for a preview only once the form is valid, and only after the teacher stops typing', async () => {
    render(<RuleForm />);
    await settle();
    expect(h.previewCalls).toHaveLength(0);
    fillBasics();
    expect(h.previewCalls).toHaveLength(0);
    await settle();
    expect(h.previewCalls).toHaveLength(1);
  });

  it('the preview body is the FULL rule the server needs, key included', async () => {
    render(<RuleForm />);
    fillBasics();
    await settle();
    expect(h.previewCalls[0]).toEqual({
      ruleKey: 'sap_o_mang_rong',
      name: 'Sập ở mảng rỗng',
      description: 'Chương trình dừng khi mảng rỗng',
      criterionKey: 'tinh_dung',
      predicate: null,
      deduction: null,
    });
  });

  it('a rule in words sits on tier 4 and the button says it applies from ungraded sessions', async () => {
    render(<RuleForm />);
    fillBasics();
    await settle();
    const current = within(screen.getByRole('list', { name: 'Bốn bậc áp luật' })).getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'true');
    expect(current).toHaveTextContent('Luật bằng lời');
    expect(saveButton()).toHaveTextContent('Lưu luật — áp từ phiên chưa chấm');
  });

  it('changing the template moves the highlighted tier and the button label', async () => {
    h.nextPreview.data = { tier: 3, reason: 'cần công cụ đọc cấu trúc mã' };
    render(<RuleForm />);
    fillBasics();
    chooseMachine();
    chooseTemplate(/Mã có gọi một hàm/);
    fireEvent.change(screen.getByLabelText('Tên hàm'), { target: { value: 'sort' } });
    await settle();
    const current = () => within(screen.getByRole('list', { name: 'Bốn bậc áp luật' })).getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'true');
    expect(current()).toHaveTextContent('cần chạy lại công cụ');
    expect(screen.getByText('cần công cụ đọc cấu trúc mã')).toBeInTheDocument();
    expect(saveButton()).toHaveTextContent('Lưu luật — áp từ phiên chưa chấm');

    h.nextPreview.data = { tier: 2, results: [] };
    chooseTemplate(/Một nhóm test bị trượt/);
    fireEvent.change(screen.getByLabelText('Tên nhóm test'), { target: { value: 'bien' } });
    await settle();
    expect(current()).toHaveTextContent('đo trên dữ liệu đã thu');
  });

  it('a tier-2 preview puts the number of matching results into the save button', async () => {
    h.nextPreview.data = {
      tier: 2,
      results: [1, 2, 3].map((n) => ({ resultId: `res-000${n}`, sessionId: 's1', before: '9.00', after: 800, capped: false })),
    };
    render(<RuleForm />);
    fillBasics();
    chooseMachine();
    fireEvent.change(screen.getByLabelText('Tên nhóm test'), { target: { value: 'bien' } });
    await settle();
    expect(saveButton()).toHaveTextContent('Lưu và áp cho 3 bài');
  });

  it('the SERVER decides which templates are measurable: tier 2 for "call" drops its "Máy chưa đo được" label (spec §3.2)', async () => {
    h.nextPreview.data = { tier: 2, results: [] };
    render(<RuleForm />);
    fillBasics();
    chooseMachine();
    chooseTemplate(/Mã có gọi một hàm/);
    fireEvent.change(screen.getByLabelText('Tên hàm'), { target: { value: 'sort' } });
    expect(screen.getAllByText('Máy chưa đo được')).toHaveLength(3);
    await settle();
    expect(screen.getAllByText('Máy chưa đo được')).toHaveLength(2);
    expect(screen.queryByText(/chưa được kiểm tới/)).not.toBeInTheDocument();
  });

  it('shows the server message when the preview fails, and keeps the form usable', async () => {
    h.nextPreview = { data: undefined, error: new Error('Điều kiện: có trường lạ') };
    render(<RuleForm />);
    fillBasics();
    await settle();
    expect(screen.getByText('Điều kiện: có trường lạ')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('for an existing rule the preview carries ruleId and the original key', async () => {
    render(<RuleForm rule={rule({ id: 'r1', ruleKey: 'sai_bien' })} />);
    fireEvent.change(description(), { target: { value: 'mô tả mới' } });
    await settle();
    expect(h.previewCalls[0]).toMatchObject({ ruleId: 'r1', ruleKey: 'sai_bien', description: 'mô tả mới' });
  });
});
