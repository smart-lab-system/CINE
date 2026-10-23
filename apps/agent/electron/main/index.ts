/**
 * The only process that touches `socket.io-client`, `fs`, or `electron`'s
 * privileged APIs (design spec §7). Owns exactly one `SessionController`
 * (this app manages one student's session on one machine, never several)
 * and one `BrowserWindow` whose size/visibility it drives from the
 * controller's own state — not two separate windows, per CLAUDE.md's
 * "a single screen... minimize to tray... passively display a checklist."
 */

import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  ipcMain,
  nativeImage,
  shell,
  type IpcMainEvent,
} from 'electron';
import { SessionController, type AgentState } from '../../src/session-controller';
import {
  IPC_CHANNELS,
  type JoinRequest,
  type SendAccessRequestRequest,
  type StartStudentNodeRequest,
  type TeacherLoginRequest,
} from '../shared/ipc';
import { LabMgmtRuntime } from './lab-mgmt-runtime';

const JOIN_WINDOW_SIZE = { width: 360, height: 560 };
// Widened from 440 — required filenames are generated (studentId + name +
// session code, see workspace-files.ts) and routinely run to 60+ chars;
// DetailView's filename span also wraps now (belt-and-suspenders: no width
// eliminates wrapping entirely, since a filename can always be longer than
// the window, but the two together mean it wraps at most once or twice
// instead of forcing a horizontal scrollbar).
const DETAIL_WINDOW_SIZE = { width: 480, height: 720 };
const MGMT_WINDOW_SIZE = { width: 1100, height: 720 };
const MGMT_MIN_SIZE = { width: 900, height: 600 };

// Precedence: an explicit BACKEND_URL env var (dev/testing override) beats
// MAIN_VITE_BACKEND_URL (baked in at build time from .env.production for the
// packaged .exe — see env.d.ts and dist:win), which beats the localhost
// fallback used by plain `pnpm dev`.
const BACKEND_URL =
  process.env.BACKEND_URL?.trim() ||
  import.meta.env.MAIN_VITE_BACKEND_URL?.trim() ||
  'http://localhost:4000';

const iconPath = join(__dirname, '../../electron/resources/icon.png');
const trayIconPath = join(__dirname, '../../electron/resources/tray-icon.png');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let controller: SessionController | null = null;
let labMgmt: LabMgmtRuntime | null = null;
let latestState: AgentState | null = null;
// Sticky once true — an exam in progress must survive the window being
// closed; only the tray's "Thoát" ends the process from that point on.
let hasEverJoined = false;

function applyUiMode(mode: 'landing' | 'exam' | 'mgmt'): void {
  if (!mainWindow) return;
  if (mode === 'mgmt') {
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(MGMT_MIN_SIZE.width, MGMT_MIN_SIZE.height);
    mainWindow.setSize(MGMT_WINDOW_SIZE.width, MGMT_WINDOW_SIZE.height);
    return;
  }
  mainWindow.setResizable(false);
  mainWindow.setMinimumSize(JOIN_WINDOW_SIZE.width, JOIN_WINDOW_SIZE.height);
  const size = mode === 'exam' && hasEverJoined ? DETAIL_WINDOW_SIZE : JOIN_WINDOW_SIZE;
  mainWindow.setSize(size.width, size.height);
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    ...JOIN_WINDOW_SIZE,
    resizable: false,
    // No menu bar, no confirm/select-file button anywhere in this app —
    // CLAUDE.md's "minimal" constraint starts at the chrome itself.
    autoHideMenuBar: true,
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Before a first join, there is nothing running in the background worth
  // preserving — closing the window is closing the app. After a join, the
  // socket/snapshot loop must keep running through the exam, so the 'X'
  // button only hides the window; the tray icon is the only way back in.
  win.on('close', (event) => {
    if (hasEverJoined && !isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function createTray(): Tray {
  const t = new Tray(nativeImage.createFromPath(trayIconPath));
  t.setToolTip('ExamCollect Agent');
  t.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Xem chi tiết', click: () => showDetailOrJoinWindow() },
      { type: 'separator' },
      { label: 'Thoát', click: () => quitApp() },
    ]),
  );
  t.on('click', () => showDetailOrJoinWindow());
  return t;
}

/** Tray click / "Xem chi tiết": reopen the one window, sized for whichever
 *  screen the current state calls for — the join form if not joined yet
 *  (e.g. it was closed via 1b's failure before ever connecting), the
 *  read-only detail view otherwise. */
function showDetailOrJoinWindow(): void {
  if (!mainWindow) {
    return;
  }
  const size = hasEverJoined ? DETAIL_WINDOW_SIZE : JOIN_WINDOW_SIZE;
  mainWindow.setSize(size.width, size.height);
  mainWindow.show();
  mainWindow.focus();
}

let isQuitting = false;

function quitApp(): void {
  isQuitting = true;
  void labMgmt?.stop();
  controller?.quit();
  tray?.destroy();
  app.quit();
}

function broadcastState(state: AgentState): void {
  latestState = state;
  if (state.joinPhase === 'joined') {
    hasEverJoined = true;
  }
  mainWindow?.webContents.send(IPC_CHANNELS.state, state);
}

function wireController(): SessionController {
  const c = new SessionController({
    backendUrl: BACKEND_URL,
    // Documents, not process.cwd() (what cli.ts used) — a packaged app's
    // cwd has no stable, student-discoverable meaning. INSTRUCTIONS.txt
    // (written into the workspace itself) tells the student the exact
    // path either way, so this only has to be *somewhere* findable.
    workspaceRoot: app.getPath('documents'),
  });

  c.on('state', broadcastState);
  c.on('notify', ({ title, body }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: nativeImage.createFromPath(iconPath) }).show();
    }
  });
  // Opens the freshly-created workspace folder in Explorer/Finder so the
  // student never has to go find it themselves (see SessionController's
  // 'open-workspace' doc comment for why this fires exactly once).
  // shell.openPath resolves to an error string on failure rather than
  // throwing — never worth interrupting the exam over, just worth a log.
  c.on('open-workspace', (workspaceDir: string) => {
    void shell.openPath(workspaceDir).then((errorMessage) => {
      if (errorMessage) {
        console.error(`Không tự mở được thư mục bài làm (${workspaceDir}): ${errorMessage}`);
      }
    });
  });

  return c;
}

function registerIpcHandlers(c: SessionController, mgmt: LabMgmtRuntime): void {
  // Request/response, not push: the renderer calls this once on mount to
  // pick up whatever state already exists, closing the gap the push-only
  // `agent:state` channel can't — see IPC_CHANNELS.getState's doc comment.
  ipcMain.handle(IPC_CHANNELS.getState, () => c.getState());
  ipcMain.on(IPC_CHANNELS.join, (_event: IpcMainEvent, payload: JoinRequest) => {
    c.join(payload);
  });
  ipcMain.on(IPC_CHANNELS.sendAccessRequest, (_event: IpcMainEvent, payload: SendAccessRequestRequest) => {
    c.sendAccessRequest(payload);
  });
  ipcMain.on(IPC_CHANNELS.minimizeToTray, () => {
    mainWindow?.hide();
  });
  ipcMain.on(IPC_CHANNELS.quit, () => {
    quitApp();
  });

  ipcMain.handle(IPC_CHANNELS.mgmtLoginTeacher, (_e, payload: TeacherLoginRequest) =>
    mgmt.loginTeacher(payload.email, payload.password),
  );
  ipcMain.handle(IPC_CHANNELS.mgmtStartStudentNode, (_e, payload: StartStudentNodeRequest) =>
    mgmt.startStudentNode(payload.mssv),
  );
  ipcMain.handle(IPC_CHANNELS.mgmtStop, () => mgmt.stop());
  ipcMain.handle(IPC_CHANNELS.mgmtGetHubState, () => mgmt.getHubState());
  ipcMain.handle(IPC_CHANNELS.mgmtGetNodeState, () => mgmt.getNodeState());
  ipcMain.handle(IPC_CHANNELS.mgmtRefreshMachines, () => {
    mgmt.refreshMachines();
  });
  ipcMain.handle(IPC_CHANNELS.mgmtScanExtensions, (_e, machineIds?: string[]) =>
    mgmt.scanExtensions(machineIds),
  );
  ipcMain.handle(IPC_CHANNELS.mgmtReadExtensionActivity, (_e, machineIds?: string[]) =>
    mgmt.readExtensionActivity(machineIds),
  );
  ipcMain.handle(IPC_CHANNELS.mgmtDownloadViolationVsix, () =>
    mgmt.downloadViolationVsix(app.getPath('downloads')),
  );
  ipcMain.handle(IPC_CHANNELS.mgmtCompareAllowlist, () => mgmt.compareAllowlist());
  ipcMain.handle(IPC_CHANNELS.mgmtAggregateRoom, () => mgmt.aggregate());
  ipcMain.handle(IPC_CHANNELS.mgmtSyncBackend, () => mgmt.syncBackend());
  ipcMain.handle(IPC_CHANNELS.mgmtSetCourseId, (_e, courseId: string | null) => {
    mgmt.setCourseId(courseId);
  });
  ipcMain.handle(IPC_CHANNELS.mgmtGetRoomProposalPreview, () => mgmt.getRoomProposalPreview());
  ipcMain.handle(IPC_CHANNELS.mgmtProposeRoom, (_e, payload) => mgmt.proposeRoom(payload));
  ipcMain.handle(IPC_CHANNELS.setUiMode, (_e, mode: 'landing' | 'exam' | 'mgmt') => {
    applyUiMode(mode);
  });
}

app.whenReady().then(() => {
  mainWindow = createWindow();
  tray = createTray();
  controller = wireController();
  labMgmt = new LabMgmtRuntime(BACKEND_URL, app.getPath('userData'), () => mainWindow);
  registerIpcHandlers(controller, labMgmt);

  // A renderer that reloads (dev-mode HMR, or reopening after being
  // hidden) has no memory of prior state — replay whatever we already
  // have so it doesn't render the initial empty form over a live session.
  mainWindow.webContents.on('did-finish-load', () => {
    if (latestState) {
      mainWindow?.webContents.send(IPC_CHANNELS.state, latestState);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    quitApp();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  void labMgmt?.stop();
  controller?.quit();
});
