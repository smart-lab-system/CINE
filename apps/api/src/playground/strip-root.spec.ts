import { stripSingleRootDir } from './workspace';

describe('stripSingleRootDir', () => {
  it('bỏ folder bọc M18_... giữ html/css', () => {
    const r = stripSingleRootDir([
      'M18_NguyenThanhHuy_22699781/html/index.html',
      'M18_NguyenThanhHuy_22699781/css/bootstrap.min.css',
      'M18_NguyenThanhHuy_22699781/js/test.js',
    ]);
    expect(r.stripped).toBe(true);
    expect(r.paths).toEqual([
      'html/index.html',
      'css/bootstrap.min.css',
      'js/test.js',
    ]);
  });

  it('không đụng cấu trúc html/css sẵn đúng', () => {
    const r = stripSingleRootDir(['html/index.html', 'css/a.css']);
    expect(r.stripped).toBe(false);
  });

  it('bỏ folder bọc Spring giữ pom.xml + src/', () => {
    const r = stripSingleRootDir([
      '22681861_NguyenGiaBao_Shopping/pom.xml',
      '22681861_NguyenGiaBao_Shopping/src/main/java/App.java',
    ]);
    expect(r.stripped).toBe(true);
    expect(r.paths).toEqual(['pom.xml', 'src/main/java/App.java']);
  });

  it('không strip khi pom.xml + src/ đã ở root', () => {
    const r = stripSingleRootDir(['pom.xml', 'src/main/java/App.java']);
    expect(r.stripped).toBe(false);
  });
});
