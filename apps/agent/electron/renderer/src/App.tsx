import { useEffect, useState } from 'react';
import type { AgentState } from '../../../src/session-controller';
import { JoinScreen } from './components/JoinScreen';
import { ConfirmedBadge } from './components/ConfirmedBadge';
import { DetailView } from './components/DetailView';

/** How long state c's confirmation stays up before auto-minimizing —
 *  long enough to read, short enough not to feel stuck (mockup: "tự thu
 *  nhỏ sau vài giây"). */
const CONFIRMATION_DISPLAY_MS = 3000;

export default function App() {
  const [state, setState] = useState<AgentState | null>(null);
  // Sticky once true. The window is never destroyed on minimize (see
  // electron/main), so this component tree stays mounted the whole time —
  // a tray reopen after the confirmation already showed once must land on
  // DetailView, not replay the confirmation badge.
  const [confirmationShown, setConfirmationShown] = useState(false);

  useEffect(() => window.agent.onState(setState), []);

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

  // Nothing pushed yet — a few milliseconds at most, before main's first
  // `agent:state`. Rendering nothing here is correct, not a loading bug:
  // there is no meaningful "loading" state of a form that has no data to
  // wait on in the first place.
  if (!state) {
    return null;
  }

  if (state.joinPhase === 'joined') {
    return confirmationShown ? <DetailView state={state} /> : <ConfirmedBadge state={state} />;
  }
  return <JoinScreen state={state} />;
}
