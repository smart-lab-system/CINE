import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AuditReview } from './AuditReview';
import type { AuditReveal as AuditRevealData } from '@/lib/api/audit';
import type { Rule } from '@/lib/api/rules';

const record = vi.fn();
const refreshDossier = vi.fn();
let recordState: { isPending: boolean; isError: boolean; error: Error | null };
let downloadState: { data?: { downloadUrl: string; fileName: string }; isLoading: boolean; isError: boolean; error: Error | null };
let rulesState: { data?: Rule[]; isLoading: boolean; isError: boolean; error: Error | null };

vi.mock('@/hooks/useAudit', () => ({
  useRecordAuditReview: () => ({ mutate: record, ...recordState }),
  useSubmissionDownload: () => downloadState,
  useOpenDossierAfterAudit: () => refreshDossier,
}));
vi.mock('@/hooks/useRules', () => ({ useRules: () => rulesState }));

const rule = (id: string, key: string, name: string, description: string): Rule =>
  ({
    id, ruleKey: key, state: 'active', origin: 'teacher',
    revision: { id: `rev-${id}`, revision: 1, name, description, criterionKey: 'tinh_dung', predicate: null },
    checkedBy: 'machine', deduction: '1.50', appliedTo: { results: 0, sessions: 0 }, mismatchedIn: 0,
  }) as unknown as Rule;

const revealed: AuditRevealData = {
  status: 'teacher_reviewed', currentScore: 8.5, currentScoreSource: 'computation',
  systemErrors: [{ ruleId: 'r1', ruleKey: 'sai_bien', ruleName: 'Sai biên', counted: 'counted' }],
  perRule: [{ ruleId: 'r1', ruleKey: 'sai_bien', ruleName: 'Sai biên', verdict: 'both' }],
  extraErrors: [],
  summary: { both: 1, teacherOnly: 0, systemOnly: 0, neither: 1, extra: 0, agreement: 'partial' },
};

const onRecorded = vi.fn();
const onOpenDossier = vi.fn();
const renderIt = () =>
  render(
    <AuditReview resultId="res1" sessionId="s1" studentMssv="20120001" studentName="Nguyễn Văn A"
      onRecorded={onRecorded} onOpenDossier={onOpenDossier} />,
  );
const submit = () => screen.getByRole('button', { name: /^Ghi nhận xét/ });
/** Nút mở hộp xác nhận, rồi nút xác nhận trong hộp — nhãn khoá thì phải qua cả hai. */
const confirmAndSend = () => {
  fireEvent.click(submit());
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ghi và khoá' }));
};
const extraBox = () => screen.getByLabelText(/Lỗi khác/);

beforeEach(() => {
  record.mockReset();
  refreshDossier.mockReset();
  onRecorded.mockReset();
  onOpenDossier.mockReset();
  recordState = { isPending: false, isError: false, error: null };
  downloadState = { data: { downloadUrl: 'https://storage.local/x', fileName: 'Cau1.docx' }, isLoading: false, isError: false, error: null };
  rulesState = {
    data: [rule('r1', 'sai_bien', 'Sai biên', 'Test nhóm biên thất bại'), rule('r2', 'ten_bien', 'Đặt tên biến', 'Tên biến vô nghĩa')],
    isLoading: false, isError: false, error: null,
  };
});

describe('AuditReview — before the label is written', () => {
  it('names the student, links their own submission, and says the system\'s score and errors are hidden until the teacher writes their own', () => {
    renderIt();
    expect(screen.getByRole('heading', { name: 'Nguyễn Văn A' })).toBeInTheDocument();
    expect(screen.getByText('20120001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tải bài nộp/ })).toHaveAttribute('href', 'https://storage.local/x');
    expect(screen.getByText(/đang được ẩn cho tới khi bạn ghi nhận xét/)).toBeInTheDocument();
    // Nói thẳng ba điều (spec §4.5): chọn ngẫu nhiên không theo điểm, điểm đang ẩn, và bước này tốn công.
    expect(screen.getByText('Kiểm mẫu')).toBeInTheDocument();
    expect(screen.getByText(/không dựa vào điểm/)).toBeInTheDocument();
    expect(screen.getByText(/tốn công hơn một bài cần xem/)).toBeInTheDocument();
  });

  it('lists the teacher\'s active rules as checkboxes with name and description — and no price (a price would bias the pick)', () => {
    renderIt();
    expect(screen.getByRole('checkbox', { name: /Sai biên/ })).not.toBeChecked();
    expect(screen.getByText('Test nhóm biên thất bại')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Đặt tên biến/ })).toBeInTheDocument();
    expect(screen.queryByText(/1,50|1\.50/)).not.toBeInTheDocument();
  });

  it('sends the ticked rules and the non-blank "other" lines, trimmed', () => {
    renderIt();
    fireEvent.click(screen.getByRole('checkbox', { name: /Sai biên/ }));
    fireEvent.change(extraBox(), { target: { value: '  Thiếu chú thích \n\n Sai chính tả  \n   ' } });
    confirmAndSend();
    expect(record).toHaveBeenCalledWith(
      { pickedRuleIds: ['r1'], extraErrors: ['Thiếu chú thích', 'Sai chính tả'] },
      expect.any(Object),
    );
  });

  it('an empty label must be deliberate: disabled until "không có lỗi nào" is ticked, then sends two empty lists', () => {
    renderIt();
    expect(submit()).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /bài này không có lỗi nào/ }));
    expect(submit()).toBeEnabled();
    confirmAndSend();
    expect(record).toHaveBeenCalledWith({ pickedRuleIds: [], extraErrors: [] }, expect.any(Object));
  });

  it('the "no errors" tick disappears once anything is picked, and does not survive picking and un-picking', () => {
    renderIt();
    fireEvent.click(screen.getByRole('checkbox', { name: /bài này không có lỗi nào/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Sai biên/ }));
    expect(screen.queryByRole('checkbox', { name: /bài này không có lỗi nào/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Sai biên/ }));
    expect(screen.getByRole('checkbox', { name: /bài này không có lỗi nào/ })).not.toBeChecked();
    expect(submit()).toBeDisabled();
  });

  it('refuses more than 20 "other" lines or a line over 500 characters, saying why', () => {
    renderIt();
    fireEvent.change(extraBox(), { target: { value: Array.from({ length: 21 }, (_, i) => `lỗi ${i}`).join('\n') } });
    expect(submit()).toBeDisabled();
    expect(screen.getByText(/Tối đa 20 lỗi khác/)).toBeInTheDocument();
    fireEvent.change(extraBox(), { target: { value: 'x'.repeat(501) } });
    expect(submit()).toBeDisabled();
    expect(screen.getByText(/mỗi lỗi tối đa 500 ký tự/i)).toBeInTheDocument();
  });

  it('says BEFORE the click that the label locks', () => {
    renderIt();
    expect(screen.getByText(/Ghi xong là khoá/)).toBeInTheDocument();
  });

  it('the button only opens a confirmation that says the label locks; nothing is sent until "Ghi và khoá"', () => {
    renderIt();
    fireEvent.click(screen.getByRole('checkbox', { name: /bài này không có lỗi nào/ }));
    fireEvent.click(submit());
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Nhận xét ghi rồi thì khoá, không sửa được');
    expect(record).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ghi và khoá' }));
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('"Xem lại" closes the confirmation and sends nothing', () => {
    renderIt();
    fireEvent.click(screen.getByRole('checkbox', { name: /bài này không có lỗi nào/ }));
    fireEvent.click(submit());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xem lại' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
  });

  it('shows the server refusal verbatim and keeps the form on screen', () => {
    recordState = { isPending: false, isError: true, error: new Error('Nhận xét kiểm mẫu của bài này đã ghi — khoá, không ghi lại được.') };
    renderIt();
    expect(screen.getByText('Nhận xét kiểm mẫu của bài này đã ghi — khoá, không ghi lại được.')).toBeInTheDocument();
    expect(extraBox()).toBeInTheDocument();
  });

  it('a submission that cannot be linked says why, and the form is still there', () => {
    downloadState = { isLoading: false, isError: true, error: new Error('Bài này chưa có file trên kho lưu trữ.') };
    renderIt();
    expect(screen.getByText('Bài này chưa có file trên kho lưu trữ.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tải bài nộp/ })).not.toBeInTheDocument();
    expect(extraBox()).toBeInTheDocument();
  });

  it('cannot submit a label when the rule table failed to load — a blind label without the picks would be wrong data', () => {
    rulesState = { data: undefined, isLoading: false, isError: true, error: new Error('Không tải được bảng lỗi') };
    renderIt();
    expect(screen.getByText(/Không tải được bảng lỗi/)).toBeInTheDocument();
    fireEvent.change(extraBox(), { target: { value: 'Thiếu chú thích' } });
    expect(submit()).toBeDisabled();
  });

  it('a teacher with no active rules is told so, and can still label with "other" lines', () => {
    rulesState = { data: [], isLoading: false, isError: false, error: null };
    renderIt();
    expect(screen.getByText(/chưa có luật nào đang dùng/)).toBeInTheDocument();
    fireEvent.change(extraBox(), { target: { value: 'Thiếu chú thích' } });
    expect(submit()).toBeEnabled();
  });
});

describe('AuditReview — after the label is written', () => {
  it('replaces the form with the reveal, tells the page, and refreshes only when the teacher opens the dossier', () => {
    record.mockImplementation((_body: unknown, opts: { onSuccess: (d: AuditRevealData) => void }) => opts.onSuccess(revealed));
    renderIt();
    fireEvent.click(screen.getByRole('checkbox', { name: /Sai biên/ }));
    confirmAndSend();

    expect(onRecorded).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(/Lỗi khác/)).not.toBeInTheDocument();
    expect(screen.getByText('Trùng một phần')).toBeInTheDocument();
    expect(refreshDossier).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Mở hồ sơ' }));
    expect(refreshDossier).toHaveBeenCalledTimes(1);
    expect(onOpenDossier).toHaveBeenCalledTimes(1);
  });
});
