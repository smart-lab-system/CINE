import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ExamSessionLobbyPage from './page';
import { socket as mockSocket } from '@/lib/socket';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'session-123' }),
}));

// Session metadata (name/start/end/status) now comes through
// useExamSessionDetail — mocked directly (not the underlying apiClient) so
// these tests don't need a QueryClientProvider ancestor, same convention
// as admin/accounts/page.test.tsx. Defaults to "not loaded yet", which
// keeps every pre-existing test's behavior identical (no banner renders
// without session data) — only the new describe block below overrides it.
const useExamSessionDetailMock = vi.fn();
const useSubmissionsMock = vi.fn();
const finalizeMutateAsyncMock = vi.fn();
const useFinalizeExamSessionMock = vi.fn();
const useAttendanceMock = vi.fn();
const useConfirmAttendanceMock = vi.fn();
const useExamMaterialsMock = vi.fn();
const confirmMutateMock = vi.fn();
const refetchAttendanceMock = vi.fn();
vi.mock('@/hooks/useExamSession', () => ({
  useExamSessionDetail: (...args: unknown[]) => useExamSessionDetailMock(...args),
  useSubmissions: (...args: unknown[]) => useSubmissionsMock(...args),
  useFinalizeExamSession: (...args: unknown[]) => useFinalizeExamSessionMock(...args),
  useAttendance: (...args: unknown[]) => useAttendanceMock(...args),
  useConfirmAttendance: (...args: unknown[]) => useConfirmAttendanceMock(...args),
  useExamMaterials: (...args: unknown[]) => useExamMaterialsMock(...args),
  // The two mutations are inert here: nothing in these tests uploads or
  // deletes a file, and a shared no-op keeps the card from throwing while
  // the page around it is what is under test.
  useUploadExamMaterial: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useDeleteExamMaterial: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));

const useTeachingClassesMock = vi.fn();
vi.mock('@/hooks/useTeaching', () => ({
  useTeachingClasses: () => useTeachingClassesMock(),
}));

const resolveAccessRequestMock = vi.fn();
vi.mock('@/lib/access-request', async () => {
  const actual = await vi.importActual<typeof import('@/lib/access-request')>('@/lib/access-request');
  return { ...actual, resolveAccessRequest: (...args: unknown[]) => resolveAccessRequestMock(...args) };
});

// sonner needs a mounted <Toaster/> to render anything into the DOM — this
// page-level test has none (that lives in the app shell), so a real
// toast.warning() call here would silently push to sonner's own internal
// store and never appear in jsdom at all. Mocked so the CALL itself — the
// actual attention cue — is what gets verified, not a DOM node that would
// never exist in this test's tree.
const toastWarningMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    warning: (...args: unknown[]) => toastWarningMock(...args),
    // AccessRequestPanel also fires toast.success on a resolved request —
    // a real (unmocked) function here so that call doesn't throw, even
    // though these tests don't assert on it directly.
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

/**
 * Attendance comes from the server, not from the socket — the whole point
 * of moving it out of page state. Tests describe a room by building one of
 * these rather than by replaying join events.
 */
function attendanceOf(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      classId: 'class-1',
      className: 'Nhóm 01',
      rosterSize: 0,
      confirmedAt: null,
      confirmedCount: null,
      present: [],
      absent: [],
      makeup: [],
      discrepancy: null,
      ...overrides,
    },
    isLoading: false,
    error: null,
    refetch: refetchAttendanceMock,
  };
}

function student(mssv: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    mssv,
    name,
    connected: true,
    joinedLate: false,
    firstSeenAt: '2026-08-29T01:00:00.000Z',
    lastEventAt: '2026-08-29T01:00:00.000Z',
    afterHeadcount: null,
    ...extra,
  };
}

// A single fake socket.io-client `Socket`, built once so the module graph
// resolves `import { socket } from '@/lib/socket'` (in both page.tsx and
// this test file) to the exact same object. `on`/`off` register/remove
// listeners exactly like the real thing; `emit` is a spy (outgoing,
// server-bound — must NOT trigger this fake's own listeners); `__trigger`
// is a test-only helper simulating an incoming server -> client event.
vi.mock('@/lib/socket', () => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  const socket = {
    connected: false,
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), cb]);
    }),
    off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((listener) => listener !== cb),
      );
    }),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    __trigger(event: string, payload?: unknown) {
      for (const listener of listeners.get(event) ?? []) {
        listener(payload);
      }
    },
    __listenerCount(event: string): number {
      return (listeners.get(event) ?? []).length;
    },
    __reset() {
      listeners.clear();
      socket.connected = false;
      socket.on.mockClear();
      socket.off.mockClear();
      socket.emit.mockClear();
      socket.connect.mockClear();
      socket.disconnect.mockClear();
    },
  };

  return { socket };
});

// Cast once — the mock's extra `__trigger`/`__listenerCount`/`__reset`
// helpers aren't part of the real `Socket` type this module normally
// exports.
const fakeSocket = mockSocket as unknown as {
  connected: boolean;
  emit: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  __trigger(event: string, payload?: unknown): void;
  __listenerCount(event: string): number;
  __reset(): void;
};

// `__trigger` invokes the page's registered listeners synchronously and
// outside of any React event handler, which is exactly what a real
// incoming socket.io event does — wrapping it in `act()` just tells
// React Testing Library "this state update is expected", matching how the
// browser would actually batch it, and silences the act() warning.
function trigger(event: string, payload?: unknown) {
  act(() => fakeSocket.__trigger(event, payload));
}

beforeEach(() => {
  fakeSocket.__reset();
  useExamSessionDetailMock.mockReset();
  useSubmissionsMock.mockReset();
  useFinalizeExamSessionMock.mockReset();
  finalizeMutateAsyncMock.mockReset();
  finalizeMutateAsyncMock.mockResolvedValue(undefined);
  useExamSessionDetailMock.mockReturnValue({
    data: undefined,
    isLoading: true,
    refetch: vi.fn(),
  });
  useSubmissionsMock.mockReturnValue({ data: undefined, isError: false });
  useFinalizeExamSessionMock.mockReturnValue({
    mutateAsync: finalizeMutateAsyncMock,
    isPending: false,
    error: null,
  });
  useAttendanceMock.mockReset();
  useConfirmAttendanceMock.mockReset();
  confirmMutateMock.mockReset();
  refetchAttendanceMock.mockReset();
  useAttendanceMock.mockReturnValue(attendanceOf());
  useExamMaterialsMock.mockReset();
  useExamMaterialsMock.mockReturnValue({ data: [], isLoading: false, isError: false, error: null });
  useConfirmAttendanceMock.mockReturnValue({
    mutate: confirmMutateMock,
    isPending: false,
    error: null,
  });
  useTeachingClassesMock.mockReset();
  useTeachingClassesMock.mockReturnValue({ data: [] });
  resolveAccessRequestMock.mockReset();
});

afterEach(() => {
  // Unconditionally, not at the end of the one test that installs them: a
  // failed assertion there would otherwise leave fake timers in place, and
  // every later test in this file would hang in waitFor waiting for a clock
  // that never advances. One red test would read as eleven.
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ExamSessionLobbyPage', () => {
  it('connects and subscribes to the session from the URL param on mount', () => {
    render(<ExamSessionLobbyPage />);

    expect(fakeSocket.connect).toHaveBeenCalledTimes(1);

    trigger('connect');

    expect(fakeSocket.emit).toHaveBeenCalledWith('teacher:subscribe', {
      examSessionId: 'session-123',
    });
  });

  it('re-reads the room from the server when an agent joins or drops', async () => {
    vi.useFakeTimers();
    render(<ExamSessionLobbyPage />);
    trigger('connect');

    trigger('lobby:student_joined', {
      studentId: '21120001',
      fullName: 'Nguyễn Văn A',
      joinedAt: '2026-08-27T01:00:00.000Z',
    });
    trigger('agent:disconnected', {
      studentId: '21120002',
      disconnectedAt: '2026-08-27T01:05:00.000Z',
    });

    // Forty agents joining at once is forty events for one answer, so the
    // reads collapse into a single trailing one.
    expect(refetchAttendanceMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(refetchAttendanceMock).toHaveBeenCalledTimes(1);
  });

  it('splits the room into who is here, who is missing, and who is sitting a make-up', async () => {
    useAttendanceMock.mockReturnValue(
      attendanceOf({
        rosterSize: 2,
        present: [student('SV001', 'Nguyễn Văn A')],
        absent: [
          student('SV002', 'Trần Thị B', {
            connected: false,
            firstSeenAt: null,
            lastEventAt: null,
          }),
        ],
        makeup: [student('SV900', 'Phạm Thi Bù', { homeClassName: 'Nhóm 05' })],
      }),
    );

    render(<ExamSessionLobbyPage />);

    await waitFor(() => expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument());
    // A name to call out, not a name that is simply absent from a list.
    expect(screen.getByText('Trần Thị B')).toBeInTheDocument();
    // A make-up student reads as "from Nhóm 05, sitting here" rather than as
    // an unfamiliar name among familiar ones.
    expect(screen.getByText('Phạm Thi Bù')).toBeInTheDocument();
    expect(screen.getByText('Nhóm 05')).toBeInTheDocument();
  });

  it('tells a machine that came back apart from someone who appeared after the count', async () => {
    useAttendanceMock.mockReturnValue(
      attendanceOf({
        rosterSize: 2,
        confirmedAt: '2026-08-29T01:30:00.000Z',
        confirmedCount: 1,
        present: [
          student('SV001', 'Máy hỏng rồi vào lại', { afterHeadcount: 'returned' }),
          student('SV002', 'Xuất hiện sau khi chốt', { afterHeadcount: 'new' }),
        ],
      }),
    );

    render(<ExamSessionLobbyPage />);

    // One label for both would bury the case the headcount exists to catch
    // underneath the routine one.
    await waitFor(() =>
      expect(screen.getByText('Kết nối lại sau khi chốt')).toBeInTheDocument(),
    );
    expect(screen.getByText('Mới vào sau khi chốt')).toBeInTheDocument();
  });

  it('names the students behind a headcount-vs-submissions gap', async () => {
    useAttendanceMock.mockReturnValue(
      attendanceOf({
        confirmedAt: '2026-08-29T01:30:00.000Z',
        confirmedCount: 45,
        discrepancy: {
          confirmedCount: 45,
          submittedCount: 46,
          unaccounted: [student('SV999', 'Người thứ 46')],
        },
      }),
    );

    render(<ExamSessionLobbyPage />);

    await waitFor(() => expect(screen.getByText(/lệch 1/)).toBeInTheDocument());
    // Named, not just counted.
    expect(screen.getByText('SV999')).toBeInTheDocument();
  });

  it('records the headcount on demand', async () => {
    useExamSessionDetailMock.mockReturnValue(activeSessionWithDeliverables());
    render(<ExamSessionLobbyPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Chốt sĩ số/ }));

    expect(confirmMutateMock).toHaveBeenCalledTimes(1);
  });

  it('shows a visible alert (not an empty "waiting" state) on teacher:subscribe:error', async () => {
    render(<ExamSessionLobbyPage />);
    trigger('connect');

    trigger('teacher:subscribe:error', {
      code: 'FORBIDDEN',
      message: 'You do not own this exam session.',
    });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Bạn không phải là chủ của phiên thi này/,
      ),
    );
    // The normal "no students yet" copy must not also be on screen.
    expect(screen.queryByText('Chưa có sinh viên nào tham gia.')).not.toBeInTheDocument();
    expect(screen.queryByText('Điểm danh')).not.toBeInTheDocument();
  });

  it('removes every listener and disconnects on unmount, leaving nothing registered', () => {
    const { unmount } = render(<ExamSessionLobbyPage />);
    trigger('connect');

    expect(fakeSocket.__listenerCount('connect')).toBeGreaterThan(0);
    expect(fakeSocket.__listenerCount('lobby:student_joined')).toBeGreaterThan(0);
    expect(fakeSocket.__listenerCount('agent:disconnected')).toBeGreaterThan(0);
    expect(fakeSocket.__listenerCount('teacher:subscribe:error')).toBeGreaterThan(0);

    unmount();

    expect(fakeSocket.__listenerCount('connect')).toBe(0);
    expect(fakeSocket.__listenerCount('lobby:student_joined')).toBe(0);
    expect(fakeSocket.__listenerCount('agent:disconnected')).toBe(0);
    expect(fakeSocket.__listenerCount('teacher:subscribe:error')).toBe(0);
    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  // Pins the fix for a real bug reported against the live app: a session
  // whose end_time had long passed still showed as if it were a live,
  // currently-open waiting room, because ExamSessionEntity.status has no
  // real lifecycle transitions and this page never showed the session's
  // actual timing at all.
  describe('session timing banner', () => {
    it('shows an ended banner for a session past its end_time, distinct from the live waiting state', () => {
      useExamSessionDetailMock.mockReturnValue({
        refetch: vi.fn(),
        data: {
          status: 'active',
          startTime: '2026-08-27T08:22:00.000Z',
          endTime: '2026-08-27T11:27:00.000Z',
        },
        isLoading: false,
      });

      render(<ExamSessionLobbyPage />);

      expect(screen.getByText(/đã kết thúc lúc/i)).toBeInTheDocument();
    });

    it('shows an upcoming banner for a session before its start_time', () => {
      const future = new Date(Date.now() + 3_600_000).toISOString();
      useExamSessionDetailMock.mockReturnValue({
        refetch: vi.fn(),
        data: {
          status: 'active',
          startTime: future,
          endTime: new Date(Date.now() + 7_200_000).toISOString(),
        },
        isLoading: false,
      });

      render(<ExamSessionLobbyPage />);

      expect(screen.getByText(/chưa bắt đầu/i)).toBeInTheDocument();
    });

    it('shows no timing banner for a session currently within its window', () => {
      useExamSessionDetailMock.mockReturnValue({
        refetch: vi.fn(),
        data: {
          status: 'active',
          startTime: new Date(Date.now() - 60_000).toISOString(),
          endTime: new Date(Date.now() + 60_000).toISOString(),
        },
        isLoading: false,
      });

      render(<ExamSessionLobbyPage />);

      expect(screen.queryByText(/đã kết thúc lúc/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/chưa bắt đầu/i)).not.toBeInTheDocument();
    });
  });
  /** A session that is live right now, with two required deliverables. */
  function activeSessionWithDeliverables() {
    return {
      refetch: vi.fn(),
      data: {
        id: 'session-123',
        name: 'Kiểm tra giữa kỳ',
        status: 'active',
        courseId: 'course-1',
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 60_000).toISOString(),
        requiredDeliverables: [
          { id: 'deliverable-1', requiredFilename: 'Cau1.docx', deliverableType: 'document' },
          { id: 'deliverable-2', requiredFilename: 'Cau2.docx', deliverableType: 'document' },
        ],
      },
      isLoading: false,
    };
  }

  describe('submission status', () => {
    it('renders a column per required deliverable and starts every cell at "Chưa nộp"', async () => {
      useExamSessionDetailMock.mockReturnValue(activeSessionWithDeliverables());
      useAttendanceMock.mockReturnValue(
        attendanceOf({ rosterSize: 1, present: [student('SV001', 'Nguyễn Văn A')] }),
      );
      render(<ExamSessionLobbyPage />);
      trigger('connect');

      await waitFor(() => expect(screen.getByText('Cau1.docx')).toBeInTheDocument());
      expect(screen.getByText('Cau2.docx')).toBeInTheDocument();
      // A student who joined but submitted nothing still needs a row —
      // "chưa nộp" is the absence of a submission, never an event.
      expect(screen.getAllByText('Chưa nộp')).toHaveLength(2);
    });

    it('flips a cell to "Đã nộp" on lobby:submission_status, without a reload', async () => {
      useExamSessionDetailMock.mockReturnValue(activeSessionWithDeliverables());
      render(<ExamSessionLobbyPage />);
      trigger('connect');
      trigger('lobby:student_joined', {
        studentId: 'SV001',
        fullName: 'Nguyễn Văn A',
        joinedAt: '2026-08-29T01:00:00.000Z',
      });

      trigger('lobby:submission_status', {
        studentId: 'SV001',
        requiredDeliverableId: 'deliverable-1',
        status: 'collected',
        submittedAt: '2026-08-29T01:30:00.000Z',
      });

      await waitFor(() => expect(screen.getByText('Đã nộp')).toBeInTheDocument());
      // The other deliverable is untouched.
      expect(screen.getAllByText('Chưa nộp')).toHaveLength(1);
    });

    it('counts a student as fully submitted only once every deliverable is collected', async () => {
      useExamSessionDetailMock.mockReturnValue(activeSessionWithDeliverables());
      render(<ExamSessionLobbyPage />);
      trigger('connect');
      trigger('lobby:student_joined', {
        studentId: 'SV001',
        fullName: 'Nguyễn Văn A',
        joinedAt: '2026-08-29T01:00:00.000Z',
      });

      trigger('lobby:submission_status', {
        studentId: 'SV001',
        requiredDeliverableId: 'deliverable-1',
        status: 'collected',
        submittedAt: '2026-08-29T01:30:00.000Z',
      });
      await waitFor(() =>
        expect(screen.getByText('0/1')).toBeInTheDocument(),
      );

      trigger('lobby:submission_status', {
        studentId: 'SV001',
        requiredDeliverableId: 'deliverable-2',
        status: 'collected',
        submittedAt: '2026-08-29T01:31:00.000Z',
      });

      await waitFor(() => expect(screen.getByText('1/1')).toBeInTheDocument());
    });

    it('shows students already collected before the page opened', async () => {
      useExamSessionDetailMock.mockReturnValue(activeSessionWithDeliverables());
      // No lobby:student_joined for this student — they joined before this
      // page was opened, so only the REST fetch knows about them.
      useSubmissionsMock.mockReturnValue({
        data: {
          items: [
            {
              studentMssv: 'SV999',
              studentNameInput: 'Trần Thị B',
              requiredDeliverableId: 'deliverable-1',
              status: 'collected',
              submittedAt: '2026-08-29T00:10:00.000Z',
              fileSize: '120',
            },
          ],
        },
        isError: false,
      });

      render(<ExamSessionLobbyPage />);
      trigger('connect');

      await waitFor(() => expect(screen.getByText('Trần Thị B')).toBeInTheDocument());
      expect(screen.getByText('Đã nộp')).toBeInTheDocument();
    });
  });

  describe('finalize', () => {
    it('asks for confirmation before finalizing, and only finalizes on confirm', async () => {
      useExamSessionDetailMock.mockReturnValue(activeSessionWithDeliverables());
      render(<ExamSessionLobbyPage />);

      fireEvent.click(screen.getByRole('button', { name: /chốt bài ngay/i }));

      // The dialog exists precisely because this cannot be undone.
      await waitFor(() =>
        expect(screen.getByText(/không thể hoàn tác/i)).toBeInTheDocument(),
      );
      expect(finalizeMutateAsyncMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /^chốt bài$/i }));

      expect(finalizeMutateAsyncMock).toHaveBeenCalledTimes(1);
      // Closes once the request settles, not on click — see below.
      await waitFor(() =>
        expect(screen.queryByText(/không thể hoàn tác/i)).not.toBeInTheDocument(),
      );
    });

    it('keeps the dialog open and shows the reason when finalizing fails', async () => {
      useExamSessionDetailMock.mockReturnValue(activeSessionWithDeliverables());
      finalizeMutateAsyncMock.mockRejectedValue(new Error('Yêu cầu thất bại (HTTP 403)'));
      useFinalizeExamSessionMock.mockReturnValue({
        mutateAsync: finalizeMutateAsyncMock,
        isPending: false,
        error: new Error('Yêu cầu thất bại (HTTP 403)'),
      });
      render(<ExamSessionLobbyPage />);

      fireEvent.click(screen.getByRole('button', { name: /chốt bài ngay/i }));
      await waitFor(() =>
        expect(screen.getByText(/không thể hoàn tác/i)).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole('button', { name: /^chốt bài$/i }));

      // Closing on click would have hidden this, making a failed
      // finalize look exactly like a successful one.
      await waitFor(() =>
        expect(screen.getByText(/Không thể chốt bài/i)).toBeInTheDocument(),
      );
      expect(screen.getByText(/không thể hoàn tác/i)).toBeInTheDocument();
    });

    it('disables finalizing for a session that is no longer active', () => {
      const session = activeSessionWithDeliverables();
      session.data.status = 'completed';
      useExamSessionDetailMock.mockReturnValue(session);

      render(<ExamSessionLobbyPage />);

      expect(screen.getByRole('button', { name: /chốt bài ngay/i })).toBeDisabled();
    });

    it('re-reads the session when exam:finalize arrives from another source', async () => {
      const session = activeSessionWithDeliverables();
      useExamSessionDetailMock.mockReturnValue(session);
      render(<ExamSessionLobbyPage />);
      trigger('connect');

      // The scheduled sweep, or a teacher on another screen. The page must
      // not assume the new status — it asks the server.
      trigger('exam:finalize', { examSessionId: 'session-123', reason: 'scheduled' });

      await waitFor(() => expect(session.refetch).toHaveBeenCalled());
    });
  });

  // Pins the fix for a real bug reported against the live app: the
  // backend has always broadcast `lobby:access_request` when a student
  // outside the roster asks to join, but this page never listened for
  // it — the teacher was never told anything, ever, at any point.
  describe('access requests', () => {
    function accessRequest(overrides: Record<string, unknown> = {}) {
      return {
        requestId: 'req-1',
        studentId: 'SV999',
        fullName: 'Người Lạ',
        reason: 'Thi bù, chuyển từ nhóm khác',
        requestedAt: '2026-08-29T01:00:00.000Z',
        ...overrides,
      };
    }

    it('shows a request the moment it arrives, with the toast attention cue', async () => {
      useExamSessionDetailMock.mockReturnValue(activeSessionWithDeliverables());
      render(<ExamSessionLobbyPage />);
      trigger('connect');

      trigger('lobby:access_request', accessRequest());

      await waitFor(() => expect(screen.getByText('Người Lạ')).toBeInTheDocument());
      expect(screen.getByText('SV999')).toBeInTheDocument();
      expect(screen.getByText('Thi bù, chuyển từ nhóm khác')).toBeInTheDocument();
      expect(toastWarningMock).toHaveBeenCalledWith(
        expect.stringContaining('Người Lạ'),
        expect.objectContaining({ description: 'Thi bù, chuyển từ nhóm khác' }),
      );
    });

    it('never shows the same pending request twice — teacher:subscribe replays it on every reconnect', async () => {
      useExamSessionDetailMock.mockReturnValue(activeSessionWithDeliverables());
      render(<ExamSessionLobbyPage />);
      trigger('connect');

      trigger('lobby:access_request', accessRequest());
      trigger('lobby:access_request', accessRequest()); // same requestId, e.g. replayed on reconnect

      await waitFor(() => expect(screen.getAllByText('Người Lạ')).toHaveLength(1));
    });

    it('offers only classes belonging to this session\'s own course', async () => {
      useExamSessionDetailMock.mockReturnValue(activeSessionWithDeliverables());
      useTeachingClassesMock.mockReturnValue({
        data: [
          { id: 'class-mine', name: 'Nhóm 01 (đúng môn)', courseId: 'course-1', courseCode: 'CS101', courseName: 'x', studentCount: 0 },
          { id: 'class-other', name: 'Nhóm khác môn', courseId: 'course-2', courseCode: 'CS999', courseName: 'y', studentCount: 0 },
        ],
      });
      render(<ExamSessionLobbyPage />);
      trigger('connect');
      trigger('lobby:access_request', accessRequest());
      await waitFor(() => expect(screen.getByText('Người Lạ')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
      fireEvent.click(await screen.findByRole('combobox'));

      expect(await screen.findByText('Nhóm 01 (đúng môn)')).toBeInTheDocument();
      expect(screen.queryByText('Nhóm khác môn')).not.toBeInTheDocument();
    });

    it('removes the request from the panel once approved', async () => {
      useExamSessionDetailMock.mockReturnValue(activeSessionWithDeliverables());
      useTeachingClassesMock.mockReturnValue({
        data: [
          { id: 'class-mine', name: 'Nhóm 01', courseId: 'course-1', courseCode: 'CS101', courseName: 'x', studentCount: 0 },
        ],
      });
      resolveAccessRequestMock.mockResolvedValue({ ok: true });
      render(<ExamSessionLobbyPage />);
      trigger('connect');
      trigger('lobby:access_request', accessRequest());
      await waitFor(() => expect(screen.getByText('Người Lạ')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
      fireEvent.click(await screen.findByRole('combobox'));
      fireEvent.click(await screen.findByText('Nhóm 01'));
      fireEvent.click(screen.getByRole('button', { name: 'Duyệt vào thi' }));

      expect(resolveAccessRequestMock).toHaveBeenCalledWith({
        requestId: 'req-1',
        approve: true,
        homeClassId: 'class-mine',
      });
      await waitFor(() => expect(screen.queryByText('Người Lạ')).not.toBeInTheDocument());
    });

    it('removes the request from the panel once denied, without asking for a class', async () => {
      useExamSessionDetailMock.mockReturnValue(activeSessionWithDeliverables());
      resolveAccessRequestMock.mockResolvedValue({ ok: true });
      render(<ExamSessionLobbyPage />);
      trigger('connect');
      trigger('lobby:access_request', accessRequest());
      await waitFor(() => expect(screen.getByText('Người Lạ')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));

      expect(resolveAccessRequestMock).toHaveBeenCalledWith({
        requestId: 'req-1',
        approve: false,
        homeClassId: undefined,
      });
      await waitFor(() => expect(screen.queryByText('Người Lạ')).not.toBeInTheDocument());
    });

    it('removes every access-request listener on unmount', () => {
      const { unmount } = render(<ExamSessionLobbyPage />);
      trigger('connect');

      expect(fakeSocket.__listenerCount('lobby:access_request')).toBeGreaterThan(0);
      unmount();
      expect(fakeSocket.__listenerCount('lobby:access_request')).toBe(0);
    });
  });
});
