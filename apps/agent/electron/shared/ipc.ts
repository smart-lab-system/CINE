/**
 * The IPC contract between `electron/main` and `electron/renderer`,
 * declared once so both sides (and `electron/preload`, which is the only
 * place actually allowed to touch `ipcRenderer`/`ipcMain`) agree on
 * channel names and payload shapes. Pure types + string constants — no
 * Node or DOM API used here, so this file is safe to import from all
 * three processes.
 */

import type { AgentState } from '../../src/session-controller';

export const IPC_CHANNELS = {
  /** Renderer -> main: submit the join form (state a, and every
   *  "Thử lại"/"Quay lại"/manual-retry action across states d/d2/e/1b). */
  join: 'agent:join',
  /** Renderer -> main: state f's "Gửi yêu cầu". */
  sendAccessRequest: 'agent:send-access-request',
  /** Renderer -> main: state c's auto-minimize, timed by the renderer. */
  minimizeToTray: 'agent:minimize-to-tray',
  /** Renderer -> main: the tray menu's "Thoát" also reaches here from the
   *  renderer side in case a future screen ever adds its own exit action;
   *  today only the tray menu uses it directly. */
  quit: 'agent:quit',
  /** Main -> renderer: the whole picture, pushed on every change. */
  state: 'agent:state',
  /** Renderer -> main (request/response): the current snapshot, pulled once
   *  on mount. The push channel above alone races the renderer's own
   *  `useEffect` registration — main can (and typically does) send the
   *  first `agent:state` before `ipcRenderer.on` is wired up, and that
   *  message is simply dropped, not queued. This is the renderer's
   *  guaranteed way to catch up regardless of timing. */
  getState: 'agent:get-state',
} as const;

export interface JoinRequest {
  studentId: string;
  sessionCode: string;
}

export interface SendAccessRequestRequest {
  fullName: string;
  reason: string;
}

/** The typed surface `electron/preload` exposes as `window.agent`. */
export interface AgentApi {
  join(payload: JoinRequest): void;
  sendAccessRequest(payload: SendAccessRequestRequest): void;
  minimizeToTray(): void;
  quit(): void;
  /** Returns an unsubscribe function, same convention React effects expect. */
  onState(callback: (state: AgentState) => void): () => void;
  /** One-shot pull of whatever state exists right now — call on mount,
   *  before/alongside subscribing via `onState`, so a state pushed before
   *  this component was listening is never permanently lost. */
  getState(): Promise<AgentState>;
}
