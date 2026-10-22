import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VsixDownloadPanel } from './VsixDownloadPanel';

describe('VsixDownloadPanel', () => {
  it('shows which packages were just downloaded and which were already on disk', () => {
    const html = renderToStaticMarkup(
      createElement(VsixDownloadPanel, {
        folder: 'C:\\Users\\oeb\\Downloads\\cine-vsix',
        entries: [
          {
            extensionId: 'evil.tool',
            version: '1.0.0',
            machines: ['SV1', 'SV2'],
            fileName: 'evil.tool-1.0.0.vsix',
            status: 'already',
          },
          {
            extensionId: 'evil.tool',
            version: '1.2.0',
            machines: ['SV2'],
            fileName: 'evil.tool-1.2.0.vsix',
            status: 'downloaded',
          },
          {
            extensionId: 'missing.ext',
            version: '0.1.0',
            machines: ['SV1'],
            fileName: 'missing.ext-0.1.0.vsix',
            status: 'failed',
            error: 'Marketplace trả HTTP 404.',
          },
        ],
      }),
    );

    expect(html).toContain('VSIX extension vi phạm');
    expect(html).toContain('Downloads\\cine-vsix');
    expect(html).toContain('Đã tải');
    expect(html).toContain('evil.tool 1.0.0');
    expect(html).toContain('Trên máy: SV1, SV2');
    expect(html).toContain('Vừa tải');
    expect(html).toContain('evil.tool 1.2.0');
    expect(html).toContain('Lỗi');
    expect(html).toContain('Marketplace trả HTTP 404.');
    expect(html).toContain('vừa tải 1 · đã tải 1 · lỗi 1');
  });
});
