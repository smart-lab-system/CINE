import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  extensionActivityFromPayload,
  parseSharedProcessLog,
  readVscodeExtensionActivity,
} from './vscode-extension-activity';

const PROFILE = 'vscode-userdata:/c%3A/Users/oeb/.vscode/extensions/extensions.json';
const SESSION = '20261022T171030';
/** 22 Oct 2026, local — month is 0-based so this is not UTC. */
const NOW = new Date(2026, 9, 22, 17, 30, 0);

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cine-ext-activity-'));
  roots.push(root);
  return root;
}

function writeLog(root: string, folder: string, body: string): string {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'sharedprocess.log');
  writeFileSync(file, body, 'utf8');
  return file;
}

describe('parseSharedProcessLog', () => {
  it('reads the install and uninstall sample, including lines that are not events', () => {
    const text = [
      '2026-10-22 17:10:47.000 [error] [/c:/Users/oeb/.vscode/extensions/tienphan090.aws-snippets-0.0.7]: Version specified in engines.vscode',
      '2026-10-22 17:10:47.937 [info] Installing extension: christian-kohler.npm-intellisense {"isMachineScoped":false}',
      '2026-10-22 17:10:48.290 [info] Extracted extension to file:///c%3A/Users/oeb/.vscode/extensions/christian-kohler.npm-intellisense-1.4.5: christian-kohler.npm-intellisense',
      '2026-10-22 17:10:48.308 [info] Renamed to c:\\Users\\oeb\\.vscode\\extensions\\christian-kohler.npm-intellisense-1.4.5',
      '2026-10-22 17:10:48.371 [info] Extension installed successfully: christian-kohler.npm-intellisense vscode-userdata:/c%3A/Users/oeb/.vscode/extensions/extensions.json',
      '2026-10-22 17:10:48.947 [info] Installing extension: firefox-devtools.vscode-firefox-debug {"isMachineScoped":false}',
      '2026-10-22 17:10:49.335 [info] Extracted extension to file:///c%3A/Users/oeb/.vscode/extensions/firefox-devtools.vscode-firefox-debug-2.15.0: firefox-devtools.vscode-firefox-debug',
      '2026-10-22 17:10:49.348 [info] Renamed to c:\\Users\\oeb\\.vscode\\extensions\\firefox-devtools.vscode-firefox-debug-2.15.0',
      '2026-10-22 17:10:49.413 [info] Extension installed successfully: firefox-devtools.vscode-firefox-debug vscode-userdata:/c%3A/Users/oeb/.vscode/extensions/extensions.json',
      '2026-10-22 17:11:05.740 [info] Uninstalling extension from the profile: firefox-devtools.vscode-firefox-debug@2.15.0 vscode-userdata:/c%3A/Users/oeb/.vscode/extensions/extensions.json',
      '2026-10-22 17:11:05.822 [info] Marked extension as removed firefox-devtools.vscode-firefox-debug-2.15.0',
      '2026-10-22 17:11:06.139 [info] Successfully uninstalled extension from the profile firefox-devtools.vscode-firefox-debug@2.15.0 vscode-userdata:/c%3A/Users/oeb/.vscode/extensions/extensions.json',
      '2026-10-22 17:11:07.778 [info] Uninstalling extension from the profile: christian-kohler.npm-intellisense@1.4.5 vscode-userdata:/c%3A/Users/oeb/.vscode/extensions/extensions.json',
      '2026-10-22 17:11:07.819 [info] Marked extension as removed christian-kohler.npm-intellisense-1.4.5',
      '2026-10-22 17:11:08.045 [info] Successfully uninstalled extension from the profile christian-kohler.npm-intellisense@1.4.5 vscode-userdata:/c%3A/Users/oeb/.vscode/extensions/extensions.json',
    ].join('\r\n');

    expect(parseSharedProcessLog(text, SESSION)).toEqual([
      {
        action: 'install',
        occurredAt: '2026-10-22 17:10:48.371',
        extensionId: 'christian-kohler.npm-intellisense',
        version: '1.4.5',
        sessionFolder: SESSION,
        profileLocation: PROFILE,
      },
      {
        action: 'install',
        occurredAt: '2026-10-22 17:10:49.413',
        extensionId: 'firefox-devtools.vscode-firefox-debug',
        version: '2.15.0',
        sessionFolder: SESSION,
        profileLocation: PROFILE,
      },
      {
        action: 'uninstall',
        occurredAt: '2026-10-22 17:11:06.139',
        extensionId: 'firefox-devtools.vscode-firefox-debug',
        version: '2.15.0',
        sessionFolder: SESSION,
        profileLocation: PROFILE,
      },
      {
        action: 'uninstall',
        occurredAt: '2026-10-22 17:11:08.045',
        extensionId: 'christian-kohler.npm-intellisense',
        version: '1.4.5',
        sessionFolder: SESSION,
        profileLocation: PROFILE,
      },
    ]);
  });

  it('records an update as one install of the new version', () => {
    const text = [
      '2026-10-22 17:01:21.546 [info] Installing extension: usernamehw.errorlens {"operation":3}',
      '2026-10-22 17:01:23.914 [info] Extracted extension to file:///c%3A/Users/oeb/.vscode/extensions/usernamehw.errorlens-3.30.0: usernamehw.errorlens',
      '2026-10-22 17:01:23.935 [info] Renamed to c:\\Users\\oeb\\.vscode\\extensions\\usernamehw.errorlens-3.30.0',
      '2026-10-22 17:01:24.115 [info] Marked extension as removed usernamehw.errorlens-3.29.0',
      '2026-10-22 17:01:24.117 [info] Extension installed successfully: usernamehw.errorlens vscode-userdata:/c%3A/Users/oeb/.vscode/extensions/extensions.json',
    ].join('\n');

    expect(parseSharedProcessLog(text, '20261022T170114')).toEqual([
      {
        action: 'install',
        occurredAt: '2026-10-22 17:01:24.117',
        extensionId: 'usernamehw.errorlens',
        version: '3.30.0',
        sessionFolder: '20261022T170114',
        profileLocation: PROFILE,
      },
    ]);
  });

  it('ignores disk cleanup of an extension already marked removed', () => {
    const text = [
      '2026-10-22 17:03:27.674 [info] Marked extension as removed amazonwebservices.aws-toolkit-vscode-4.17.0',
      '2026-10-22 17:03:28.076 [info] Deleted marked for removal extension from disk amazonwebservices.aws-toolkit-vscode c:\\Users\\oeb\\.vscode\\extensions\\amazonwebservices.aws-toolkit-vscode-4.17.0',
    ].join('\n');

    expect(parseSharedProcessLog(text, '20261022T170325')).toEqual([]);
  });

  it('pairs interleaved installs by extension id, and lets Renamed overwrite Extracted', () => {
    const text = [
      '2026-10-22 17:01:21.546 [info] Installing extension: usernamehw.errorlens {"operation":3}',
      '2026-10-22 17:01:21.564 [info] Installing extension: ms-azuretools.vscode-containers {"operation":3}',
      '2026-10-22 17:01:23.800 [info] Extracted extension to file:///c%3A/Users/oeb/.vscode/extensions/usernamehw.errorlens-0.0.1: usernamehw.errorlens',
      '2026-10-22 17:01:23.914 [info] Renamed to c:\\Users\\oeb\\.vscode\\extensions\\usernamehw.errorlens-3.30.0',
      '2026-10-22 17:01:24.200 [info] Renamed to c:\\Users\\oeb\\.vscode\\extensions\\ms-azuretools.vscode-containers-2.5.3',
      '2026-10-22 17:01:24.300 [info] Extracted extension to file:///c%3A/Users/oeb/.vscode/extensions/ms-azuretools.vscode-containers-9.9.9: ms-azuretools.vscode-containers',
      '2026-10-22 17:01:24.117 [info] Extension installed successfully: usernamehw.errorlens vscode-userdata:/a',
      '2026-10-22 17:01:24.864 [info] Extension installed successfully: ms-azuretools.vscode-containers vscode-userdata:/b',
    ].join('\n');

    const events = parseSharedProcessLog(text, '20261022T170114');
    expect(events.map((event) => [event.extensionId, event.version])).toEqual([
      ['usernamehw.errorlens', '3.30.0'],
      ['ms-azuretools.vscode-containers', '2.5.3'],
    ]);
  });

  it('emits an install with a null version when no Renamed or Extracted line precedes it', () => {
    const text =
      '2026-10-22 17:10:48.371 [info] Extension installed successfully: christian-kohler.npm-intellisense vscode-userdata:/c%3A/Users/oeb/.vscode/extensions/extensions.json';

    expect(parseSharedProcessLog(text, SESSION)).toEqual([
      {
        action: 'install',
        occurredAt: '2026-10-22 17:10:48.371',
        extensionId: 'christian-kohler.npm-intellisense',
        version: null,
        sessionFolder: SESSION,
        profileLocation: PROFILE,
      },
    ]);
  });

  it('does not drop events from another calendar day', () => {
    const text = [
      '2026-10-22 23:59:00.000 [info] Extension installed successfully: a.keep vscode-userdata:/keep',
      '2026-10-23 00:01:00.000 [info] Extension installed successfully: b.next vscode-userdata:/next',
    ].join('\n');

    expect(parseSharedProcessLog(text, SESSION).map((event) => event.extensionId)).toEqual([
      'a.keep',
      'b.next',
    ]);
  });
});

describe('readVscodeExtensionActivity', () => {
  it('reads only session folders whose name is the local day of now', () => {
    const root = tempRoot();
    writeLog(
      root,
      '20261021T235959',
      '2026-10-21 23:59:59.000 [info] Successfully uninstalled extension from the profile old.ext@1.0.0 vscode-userdata:/old\n',
    );
    const todayFile = writeLog(
      root,
      '20261022T171030',
      '2026-10-22 17:10:48.371 [info] Extension installed successfully: christian-kohler.npm-intellisense vscode-userdata:/today\n',
    );
    mkdirSync(join(root, 'exthost1'), { recursive: true });

    const result = readVscodeExtensionActivity({ logsRoot: root, now: NOW });

    expect(result.ok).toBe(true);
    expect(result.filesRead).toEqual([todayFile]);
    expect(result.warnings).toEqual([]);
    expect(result.events.map((event) => event.extensionId)).toEqual(['christian-kohler.npm-intellisense']);
  });

  it('drops log lines whose timestamp is not that local day', () => {
    const root = tempRoot();
    writeLog(
      root,
      '20261022T235000',
      [
        '2026-10-22 23:50:00.000 [info] Extension installed successfully: a.keep vscode-userdata:/keep',
        '2026-10-23 00:10:00.000 [info] Extension installed successfully: b.drop vscode-userdata:/drop',
      ].join('\n'),
    );

    const result = readVscodeExtensionActivity({ logsRoot: root, now: NOW });

    expect(result.events.map((event) => event.extensionId)).toEqual(['a.keep']);
  });

  it('returns an empty success when the logs root does not exist', () => {
    const missing = join(tmpdir(), `cine-ext-activity-missing-${Date.now()}`);
    const result = readVscodeExtensionActivity({ logsRoot: missing, now: NOW });

    expect(result).toEqual({ ok: true, events: [], filesRead: [], warnings: [] });
  });

  it('keeps events from a readable file when another log path cannot be read', () => {
    const root = tempRoot();
    const good = writeLog(
      root,
      '20261022T100000',
      '2026-10-22 10:00:00.000 [info] Extension installed successfully: good.ext vscode-userdata:/good\n',
    );
    const bad = join(root, '20261022T110000', 'sharedprocess.log');
    mkdirSync(bad, { recursive: true });

    const result = readVscodeExtensionActivity({ logsRoot: root, now: NOW });

    expect(result.filesRead).toEqual([good]);
    expect(result.events.map((event) => event.extensionId)).toEqual(['good.ext']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.path).toBe(bad);
    expect(result.warnings[0]?.message.length).toBeGreaterThan(0);
  });

  it('sorts by timestamp, then session folder, and keeps line order for ties', () => {
    const root = tempRoot();
    writeLog(
      root,
      '20261022T180000',
      '2026-10-22 11:00:00.000 [info] Extension installed successfully: early.time vscode-userdata:/early\n',
    );
    writeLog(
      root,
      '20261022T100000',
      [
        '2026-10-22 12:00:00.000 [info] Extension installed successfully: a.first vscode-userdata:/a',
        '2026-10-22 12:00:00.000 [info] Extension installed successfully: b.second vscode-userdata:/b',
      ].join('\n'),
    );
    writeLog(
      root,
      '20261022T090000',
      '2026-10-22 12:00:00.000 [info] Successfully uninstalled extension from the profile c.third@1.0.0 vscode-userdata:/c\n',
    );

    const result = readVscodeExtensionActivity({ logsRoot: root, now: NOW });

    expect(result.events.map((event) => event.extensionId)).toEqual([
      'early.time',
      'c.third',
      'a.first',
      'b.second',
    ]);
  });
});

describe('extensionActivityFromPayload', () => {
  const event = {
    action: 'install' as const,
    occurredAt: '2026-10-22 17:10:48.371',
    extensionId: 'christian-kohler.npm-intellisense',
    version: '1.4.5',
    sessionFolder: '20261022T171030',
    profileLocation: null,
  };

  it('accepts events and warnings from the student command', () => {
    expect(
      extensionActivityFromPayload({
        events: [event],
        warnings: [{ path: 'C:\\log', message: 'EPERM' }],
      }),
    ).toEqual({
      events: [event],
      warnings: [{ path: 'C:\\log', message: 'EPERM' }],
    });
  });

  it('rejects a payload that is not a list of events', () => {
    expect(extensionActivityFromPayload({ events: [{ action: 'install' }] })).toBeNull();
    expect(extensionActivityFromPayload(null)).toBeNull();
  });
});
