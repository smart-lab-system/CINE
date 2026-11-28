import { useEffect, useState } from 'react';
import type { AgentState } from '../../../src/session-controller';
import { ConfirmedBadge } from './components/ConfirmedBadge';
import { DetailView } from './components/DetailView';
import { JoinScreen } from './components/JoinScreen';
import { MgmtApp } from './components/mgmt/MgmtApp';
import { WaitForHubView } from './components/mgmt/WaitForHubView';
import { AppButton, BrandMark, Spinner, StatusLine } from './components/ui';

/** How long state c's confirmation stays up before auto-minimizing -
 *  long enough to read, short enough not to feel stuck (mockup: "tự thu
 *  nhỏ sau vài giây"). */
const CONFIRMATION_DISPLAY_MS = 3000;

type AppRoute =
  | { kind: 'resolving' }
  | { kind: 'teacher' }
  | { kind: 'student' }
  | { kind: 'unknown'; error: string };

export default function App() {
  const [route, setRoute] = useState<AppRoute>({ kind: 'resolving' });
  const [state, setState] = useState<AgentState | null>(null);
  // Sticky once true. The window is never destroyed on minimize (see
  // electron/main), so this component tree stays mounted the whole time -
  // a tray reopen after the confirmation already showed once must land on
  // DetailView, not replay the confirmation badge.
  const [confirmationShown, setConfirmationShown] = useState(false);

  // Subscribe first, then pull - in that order. main pushes `agent:state`
  // prophylactically; getState closes the race with the first paint.
  useEffect(() => {
    const unsubscribe = window.agent.onState(setState);
    void window.agent.getState().then(setState);
    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await window.agent.mgmtResolveMachineRole();
      if (cancelled) return;
      if (!res.ok || res.role === 'unknown' || !res.role) {
        setRoute({
          kind: 'unknown',
          error:
            res.error ??
            'Máy này chưa có trong danh mục phòng máy. Admin cần thêm máy vào phòng trước.',
        });
        return;
      }
      if (res.role === 'teacher') {
        setRoute({ kind: 'teacher' });
        return;
      }
      setRoute({ kind: 'student' });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state?.joinPhase === 'joined') {
      void window.agent.setUiMode('exam');
      return;
    }
    if (route.kind === 'teacher' || route.kind === 'student') {
      void window.agent.setUiMode('mgmt');
      return;
    }
    void window.agent.setUiMode('landing');
  }, [route, state?.joinPhase]);

  useEffect(() => {
    if (state?.joinPhase !== 'joined' || confirmationShown) {
      return;
    }
    const timer = setTimeout(() => {
      setConfirmationShown(true);
      window.agent.minimizeToTray();
    }, CONFIRMATION_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [state?.joinPhase, confirmationShown]);

  // Đã join phiên thi - luôn ưu tiên luồng exam.
  if (state?.joinPhase === 'joined') {
    return confirmationShown ? <DetailView state={state} /> : <ConfirmedBadge state={state} />;
  }

  // Đang join / lỗi join / access-request (sau lệnh Hub ép MSSV).
  if (state && state.joinPhase !== 'form') {
    return <JoinScreen state={state} />;
  }

  if (route.kind === 'resolving') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-5">
        <Spinner />
        <p className="text-small font-semibold">Đang nhận diện máy…</p>
      </div>
    );
  }

  if (route.kind === 'unknown') {
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <BrandMark />
        <h1 className="-mb-1 text-h2 font-bold">ExamCollect Agent</h1>
        <StatusLine tone="danger">{route.error}</StatusLine>
        <AppButton
          type="button"
          variant="ghost"
          onClick={() => {
            setRoute({ kind: 'resolving' });
            void window.agent.mgmtResolveMachineRole().then((res) => {
              if (!res.ok || res.role === 'unknown' || !res.role) {
                setRoute({
                  kind: 'unknown',
                  error:
                    res.error ??
                    'Máy này chưa có trong danh mục phòng máy. Admin cần thêm máy vào phòng trước.',
                });
                return;
              }
              setRoute({ kind: res.role === 'teacher' ? 'teacher' : 'student' });
            });
          }}
        >
          Thử lại
        </AppButton>
      </div>
    );
  }

  if (route.kind === 'teacher') {
    return (
      <MgmtApp
        onBackToLanding={() => {
          void window.agent.mgmtLeaveSession();
          setRoute({ kind: 'resolving' });
          void window.agent.mgmtResolveMachineRole().then((res) => {
            if (!res.ok || res.role === 'unknown' || !res.role) {
              setRoute({
                kind: 'unknown',
                error: res.error ?? 'Không xác định được loại máy.',
              });
              return;
            }
            setRoute({ kind: res.role === 'teacher' ? 'teacher' : 'student' });
          });
        }}
      />
    );
  }

  return <WaitForHubView />;
}
