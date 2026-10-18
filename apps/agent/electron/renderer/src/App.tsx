import { useEffect, useState } from 'react';
import type { AgentState } from '../../../src/session-controller';
import { JoinScreen } from './components/JoinScreen';
import { ConfirmedBadge } from './components/ConfirmedBadge';
import { DetailView } from './components/DetailView';
import { LandingScreen } from './components/LandingScreen';
import { MgmtApp } from './components/mgmt/MgmtApp';

/** How long state c's confirmation stays up before auto-minimizing —
 *  long enough to read, short enough not to feel stuck (mockup: "tự thu
 *  nhỏ sau vài giây"). */
const CONFIRMATION_DISPLAY_MS = 3000;

type AppRoute = 'landing' | 'exam' | 'mgmt';

export default function App() {
  const [route, setRoute] = useState<AppRoute>('landing');
  const [state, setState] = useState<AgentState | null>(null);
  // Sticky once true. The window is never destroyed on minimize (see
  // electron/main), so this component tree stays mounted the whole time —
  // a tray reopen after the confirmation already showed once must land on
  // DetailView, not replay the confirmation badge.
  const [confirmationShown, setConfirmationShown] = useState(false);

  // Subscribe first, then pull — in that order. main pushes `agent:state`
  // proactively (on controller construction, and again on did-finish-load),
  // but those pushes almost always land before this effect has even run
  // (React defers effects until after commit/paint, well after the module
  // script that triggers did-finish-load finishes), so `onState` alone
  // reliably misses the very first state and this component is stuck
  // rendering `null` forever — there is nothing else to ever re-trigger a
  // push. `getState()` closes that gap by pulling the current snapshot
  // directly instead of waiting on a push to have landed in time.
  useEffect(() => {
    const unsubscribe = window.agent.onState(setState);
    void window.agent.getState().then(setState);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (state?.joinPhase === 'joined') {
      void window.agent.setUiMode('exam');
      return;
    }
    void window.agent.setUiMode(route === 'mgmt' ? 'mgmt' : route === 'exam' ? 'exam' : 'landing');
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

  // Đã join phiên thi — luôn ưu tiên luồng exam (kể cả khi route còn landing
  // sau HMR), không để user "lạc" sang Quản lý giữa giờ thi.
  if (state?.joinPhase === 'joined') {
    return confirmationShown ? <DetailView state={state} /> : <ConfirmedBadge state={state} />;
  }

  if (route === 'landing') {
    // Nothing pushed yet — a few milliseconds at most.
    if (!state) {
      return null;
    }
    return (
      <LandingScreen
        onExam={() => setRoute('exam')}
        onMgmt={() => setRoute('mgmt')}
      />
    );
  }

  if (route === 'mgmt') {
    return <MgmtApp onBackToLanding={() => setRoute('landing')} />;
  }

  // route === 'exam'
  if (!state) {
    return null;
  }
  return <JoinScreen state={state} onBackToLanding={() => setRoute('landing')} />;
}
