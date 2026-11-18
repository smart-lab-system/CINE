import { pickExpressEntry } from './workspace';

describe('pickExpressEntry', () => {
  it('ưu tiên app.js', () => {
    expect(pickExpressEntry(['package.json', 'views/index.ejs', 'app.js'])).toBe('app.js');
  });

  it('fallback server.js', () => {
    expect(pickExpressEntry(['package.json', 'server.js'])).toBe('server.js');
  });
});
