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
  type IpcMainEvent,
} from 'electron';
import { SessionController, type AgentState } from '../../src/session-controller';
import { IPC_CHANNELS, type JoinRequest, type SendAccessRequestRequest } from '../shared/ipc';

const JOIN_WINDOW_SIZE = { width: 360, height: 560 };
const DETAIL_WINDOW_SIZE = { width: 440, height: 700 };

const BACKEND_URL = process.env.BACKEND_URL?.trim() || 'http://localhost:4000';

const iconPath = join(__dirname, '../../electron/resources/icon.png');
const trayIconPath = join(__dirname, '../../electron/resources/tray-icon.png');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let controller: SessionController | null = null;
let latestState: AgentState | null = null;
// Sticky once true — an exam in progress must survive the window being
// closed; only the tray's "Thoát" ends the process from that point on.
let hasEverJoined = false;

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

  return c;
}

function registerIpcHandlers(c: SessionController): void {
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
}

app.whenReady().then(() => {
  mainWindow = createWindow();
  tray = createTray();
  controller = wireController();
  registerIpcHandlers(controller);

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
  controller?.quit();
});
