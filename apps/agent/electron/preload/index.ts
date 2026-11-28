/**
 * `contextIsolation: true`, `nodeIntegration: false` - only place the
 * renderer's typed surface is defined.
 */

import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type AgentApi,
  type JoinRequest,
  type SendAccessRequestRequest,
  type TeacherLoginRequest,
  type StartStudentNodeRequest,
  type ProposeRoomRequest,
  type UiMode,
} from '../shared/ipc';
import type { AgentState } from '../../src/session-controller';
import type { TeacherHubState } from '../../src/lab-mgmt/teacher-hub';
import type { StudentNodeState } from '../../src/lab-mgmt/student-node';

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
  getState(): Promise<AgentState> {
    return ipcRenderer.invoke(IPC_CHANNELS.getState) as Promise<AgentState>;
  },

  mgmtResolveMachineRole() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtResolveMachineRole);
  },
  mgmtLoginTeacher(payload: TeacherLoginRequest) {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtLoginTeacher, payload);
  },
  mgmtListTodayExams() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtListTodayExams);
  },
  mgmtStartTeacherHub(payload?: import('../shared/ipc').MgmtStartTeacherHubRequest) {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtStartTeacherHub, payload);
  },
  mgmtGetContext() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtGetContext);
  },
  mgmtStartStudentNode(payload: StartStudentNodeRequest) {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtStartStudentNode, payload);
  },
  mgmtLeaveSession() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtLeaveSession);
  },
  mgmtStop() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtStop);
  },
  mgmtGetHubState() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtGetHubState);
  },
  mgmtGetNodeState() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtGetNodeState);
  },
  onHubState(callback: (state: TeacherHubState) => void): () => void {
    const listener = (_e: Electron.IpcRendererEvent, state: TeacherHubState): void => callback(state);
    ipcRenderer.on(IPC_CHANNELS.mgmtHubState, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.mgmtHubState, listener);
  },
  onNodeState(callback: (state: StudentNodeState) => void): () => void {
    const listener = (_e: Electron.IpcRendererEvent, state: StudentNodeState): void => callback(state);
    ipcRenderer.on(IPC_CHANNELS.mgmtNodeState, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.mgmtNodeState, listener);
  },
  mgmtPromptIdentify(machineIds?: string[]) {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtPromptIdentify, machineIds);
  },
  mgmtCancelIdentify(machineIds?: string[]) {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtCancelIdentify, machineIds);
  },
  mgmtSubmitIdentifyAndJoin(payload: import('../shared/ipc').MgmtSubmitIdentifyAndJoinRequest) {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtSubmitIdentifyAndJoin, payload);
  },
  onIdentifyRequired(callback: (payload: import('../shared/ipc').MgmtIdentifyRequiredPayload) => void): () => void {
    const listener = (
      _e: Electron.IpcRendererEvent,
      payload: import('../shared/ipc').MgmtIdentifyRequiredPayload,
    ): void => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.mgmtIdentifyRequired, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.mgmtIdentifyRequired, listener);
  },
  onIdentifyCancelled(callback: () => void): () => void {
    const listener = (): void => callback();
    ipcRenderer.on(IPC_CHANNELS.mgmtIdentifyCancelled, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.mgmtIdentifyCancelled, listener);
  },
  mgmtSetExamAutoMonitor(enabled: boolean) {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtSetExamAutoMonitor, enabled);
  },
  mgmtGetExamAutoMonitorState() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtGetExamAutoMonitorState);
  },
  onExamAutoMonitorState(
    callback: (state: import('../../src/lab-mgmt/exam-auto-monitor').ExamAutoMonitorState) => void,
  ): () => void {
    const listener = (
      _e: Electron.IpcRendererEvent,
      state: import('../../src/lab-mgmt/exam-auto-monitor').ExamAutoMonitorState,
    ): void => callback(state);
    ipcRenderer.on(IPC_CHANNELS.mgmtExamAutoMonitorState, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.mgmtExamAutoMonitorState, listener);
  },
  mgmtRefreshMachines() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtRefreshMachines);
  },
  mgmtScanExtensions(machineIds?: string[]) {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtScanExtensions, machineIds);
  },
  mgmtReadExtensionActivity(machineIds?: string[]) {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtReadExtensionActivity, machineIds);
  },
  mgmtDownloadViolationVsix() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtDownloadViolationVsix);
  },
  mgmtCompareAllowlist() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtCompareAllowlist);
  },
  mgmtAggregateRoom() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtAggregateRoom);
  },
  mgmtSyncBackend() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtSyncBackend);
  },
  mgmtSetCourseId(courseId: string | null) {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtSetCourseId, courseId);
  },
  mgmtGetRoomProposalPreview() {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtGetRoomProposalPreview);
  },
  mgmtProposeRoom(payload: ProposeRoomRequest) {
    return ipcRenderer.invoke(IPC_CHANNELS.mgmtProposeRoom, payload);
  },
  setUiMode(mode: UiMode) {
    return ipcRenderer.invoke(IPC_CHANNELS.setUiMode, mode);
  },
};

contextBridge.exposeInMainWorld('agent', api);
