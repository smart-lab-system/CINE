/**
 * `contextIsolation: true`, `nodeIntegration: false` (see electron/main) —
 * this is the ONLY place the renderer's typed surface is defined, and the
 * ONLY file in `electron/renderer`'s reach that ever touches `ipcRenderer`
 * directly. Design spec §7: "renderer sends exactly one of: join,
 * resend-access-request, quit" — `minimizeToTray` is the one addition,
 * for state c's auto-minimize.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type AgentApi, type JoinRequest, type SendAccessRequestRequest } from '../shared/ipc';
import type { AgentState } from '../../src/session-controller';

const api: AgentApi = {
  join(payload: JoinRequest): void {
    ipcRenderer.send(IPC_CHANNELS.join, payload);
  },
  sendAccessRequest(payload: SendAccessRequestRequest): void {
    ipcRenderer.send(IPC_CHANNELS.sendAccessRequest, payload);
  },
  minimizeToTray(): void {
    ipcRenderer.send(IPC_CHANNELS.minimizeToTray);
  },
  quit(): void {
    ipcRenderer.send(IPC_CHANNELS.quit);
  },
  onState(callback: (state: AgentState) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, state: AgentState): void => callback(state);
    ipcRenderer.on(IPC_CHANNELS.state, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.state, listener);
  },
};

contextBridge.exposeInMainWorld('agent', api);
