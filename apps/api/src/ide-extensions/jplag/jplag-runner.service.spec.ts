import {
  mapContributeLanguage,
  prepareSourceForJplag,
  sanitizeRelativePath,
  stageCompareRelativePath,
} from './jplag-runner.service';

describe('jplag-runner staging helpers', () => {
  it('maps contribute languages', () => {
    expect(mapContributeLanguage('jsx')).toBe('javascript');
    expect(mapContributeLanguage('tsx')).toBe('typescript');
    expect(mapContributeLanguage('py')).toBe('python3');
    expect(mapContributeLanguage('unknown')).toBeNull();
  });

  it('sanitizes relative paths and rejects zip-slip', () => {
    expect(sanitizeRelativePath('src\\a.jsx')).toBe('src/a.jsx');
    expect(sanitizeRelativePath('../secret')).toBeNull();
    expect(sanitizeRelativePath('C:\\abs')).toBeNull();
    expect(sanitizeRelativePath('/abs')).toBe('abs'); // leading slash stripped → relative
  });

  it('stages jsx→js only for swc profile', () => {
    expect(stageCompareRelativePath('x.jsx', 'javascript', 'swc')).toBe('x.js');
    expect(stageCompareRelativePath('x.jsx', 'javascript', 'text')).toBe('x.jsx');
  });

  it('SWC-prepares JSX for swc/javascript and leaves text intact', () => {
    const jsx = `const A = () => <div className="x">{'hi'}</div>;`;
    const swcOut = prepareSourceForJplag(jsx, 'javascript', 'swc', 'a.jsx');
    expect(swcOut).toContain('React.createElement');
    expect(swcOut).not.toMatch(/<div/);

    const textOut = prepareSourceForJplag(jsx, 'javascript', 'text', 'a.jsx');
    expect(textOut).toContain('<div');
  });
});
