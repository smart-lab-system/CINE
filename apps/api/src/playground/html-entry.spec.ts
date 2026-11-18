import { scanHtmlEntry } from './html-entry';

describe('scanHtmlEntry', () => {
  it('chọn html/index.html trong project kiểu sample', () => {
    const r = scanHtmlEntry([
      'css/bootstrap.min.css',
      'html/index.html',
      'js/test.js',
      'img/banner2.png',
    ]);
    expect(r.entryPath).toBe('html/index.html');
  });

  it('một file html', () => {
    const r = scanHtmlEntry(['page.html']);
    expect(r.detection).toBe('single');
    expect(r.entryPath).toBe('page.html');
  });
});
