import {
  COURSE_PLAYGROUND_LANGUAGE,
  detectPlaygroundLanguageFromPaths,
  resolvePlaygroundLanguage,
} from './course-playground-language';

describe('COURSE_PLAYGROUND_LANGUAGE', () => {
  it('map 4 mã môn web', () => {
    expect(COURSE_PLAYGROUND_LANGUAGE['4220002399']).toBe('static');
    expect(COURSE_PLAYGROUND_LANGUAGE['4220015436']).toBe('vite-react');
    expect(COURSE_PLAYGROUND_LANGUAGE['4220003262']).toBe('express');
    expect(COURSE_PLAYGROUND_LANGUAGE['4220003950']).toBe('spring-boot');
  });
});

describe('resolvePlaygroundLanguage', () => {
  it('ưu tiên mã môn hơn deliverable', () => {
    expect(
      resolvePlaygroundLanguage({
        courseCode: '4220002399',
        deliverableLanguage: 'java',
        filePaths: ['Main.java'],
      }),
    ).toBe('static');
  });

  it('dùng deliverable console khi không map môn', () => {
    expect(
      resolvePlaygroundLanguage({
        courseCode: '4220009999',
        deliverableLanguage: 'python',
        filePaths: [],
      }),
    ).toBe('python');
  });

  it('detect từ cây file khi node / không map', () => {
    expect(
      resolvePlaygroundLanguage({
        courseCode: null,
        deliverableLanguage: 'node',
        filePaths: ['package.json', 'vite.config.ts', 'src/App.tsx'],
      }),
    ).toBe('vite-react');
  });

  it('ném khi mơ hồ', () => {
    expect(() =>
      resolvePlaygroundLanguage({
        courseCode: null,
        deliverableLanguage: 'node',
        filePaths: ['readme.txt'],
      }),
    ).toThrow(/Không xác định được ngôn ngữ/);
  });
});

describe('detectPlaygroundLanguageFromPaths', () => {
  it('pom.xml → spring-boot', () => {
    expect(detectPlaygroundLanguageFromPaths(['proj/pom.xml', 'src/Main.java'])).toBe(
      'spring-boot',
    );
  });

  it('express vs vite', () => {
    expect(
      detectPlaygroundLanguageFromPaths(['package.json', 'app.js', 'views/index.ejs']),
    ).toBe('express');
    expect(
      detectPlaygroundLanguageFromPaths(['package.json', 'vite.config.js', 'index.html']),
    ).toBe('vite-react');
  });

  it('html/ → static', () => {
    expect(detectPlaygroundLanguageFromPaths(['html/index.html', 'css/style.css'])).toBe(
      'static',
    );
  });

  it('đuôi console chiếm đa số', () => {
    expect(detectPlaygroundLanguageFromPaths(['a.py', 'b.py', 'util.c'])).toBe('python');
  });

  it('hai ngôn ngữ bằng nhau → null', () => {
    expect(detectPlaygroundLanguageFromPaths(['a.c', 'b.cpp'])).toBeNull();
  });
});
