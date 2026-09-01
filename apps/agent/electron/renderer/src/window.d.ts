import type { AgentApi } from '../../shared/ipc';

/** Exposed by electron/preload/index.ts via contextBridge. This file
 *  declares it for the renderer's own type-checking; it does not run. */
declare global {
  interface Window {
    agent: AgentApi;
  }
}

export {};
