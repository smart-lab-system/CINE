import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExtensionActivityPanel } from './ExtensionActivityPanel';
import { TeacherHubView } from './TeacherHubView';

const machine = {
  machineId: 'm1',
  hostname: 'PC-01',
  studentMssv: 'SV001',
  studentFullName: 'Nguyen Van A',
  activityAt: '2026-10-22T10:00:00.000Z',
};

describe('ExtensionActivityPanel', () => {
  it('lists install and uninstall events for the day', () => {
    const html = renderToStaticMarkup(
      createElement(ExtensionActivityPanel, {
        machines: [
          {
            ...machine,
            activityLog: [
              {
                action: 'install',
                occurredAt: '2026-10-22 17:10:48.371',
                extensionId: 'christian-kohler.npm-intellisense',
                version: '1.4.5',
                sessionFolder: '20261022T171030',
                profileLocation: null,
              },
              {
                action: 'uninstall',
                occurredAt: '2026-10-22 17:11:06.139',
                extensionId: 'firefox-devtools.vscode-firefox-debug',
                version: '2.15.0',
                sessionFolder: '20261022T171030',
                profileLocation: null,
              },
            ],
            activityWarnings: [{ path: 'C:\\locked', message: 'EPERM: access denied' }],
          },
        ],
      }),
    );

    expect(html).toContain('Log cài / gỡ hôm nay');
    expect(html).toContain('Nguyen Van A');
    expect(html).toContain('Cài');
    expect(html).toContain('christian-kohler.npm-intellisense 1.4.5');
    expect(html).toContain('Gỡ');
    expect(html).toContain('firefox-devtools.vscode-firefox-debug 2.15.0');
    expect(html).toContain('EPERM: access denied');
  });

  it('says when today has no install or uninstall', () => {
    const html = renderToStaticMarkup(
      createElement(ExtensionActivityPanel, {
        machines: [{ ...machine, activityLog: [], activityWarnings: [] }],
      }),
    );
    expect(html).toContain('Hôm nay chưa có lần cài hoặc gỡ.');
  });

  it('stays hidden until the teacher has requested the log', () => {
    const html = renderToStaticMarkup(
      createElement(ExtensionActivityPanel, {
        machines: [{ machineId: 'm1', hostname: 'PC-01' }],
      }),
    );
    expect(html).toBe('');
  });
});

describe('TeacherHubView', () => {
  it('shows the button that requests extension activity logs', () => {
    const html = renderToStaticMarkup(
      createElement(TeacherHubView, { teacherEmail: 'gv@school.edu', onLeave: () => undefined }),
    );
    expect(html).toContain('Xem log cài / gỡ extension');
    expect(html).toContain('Quét extension VS Code');
    expect(html).toContain('Tải VSIX extension vi phạm');
  });
});
