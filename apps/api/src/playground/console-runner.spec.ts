import { buildShellScript } from './console-runner';

describe('buildShellScript', () => {
  it('python gọi file entry', () => {
    const s = buildShellScript('python', 'main.py', 'print(1)');
    expect(s).toContain("python3 'main.py'");
  });

  it('java dùng class có package + UTF-8', () => {
    const s = buildShellScript('java', 'App.java', 'package demo;\npublic class App {}');
    expect(s).toContain('javac -encoding UTF-8');
    expect(s).toContain("-Dfile.encoding=UTF-8");
    expect(s).toContain("java -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8 -cp /tmp/classes 'demo.App'");
  });

  it('cpp biên dịch bằng g++ UTF-8', () => {
    const s = buildShellScript('cpp', 'main.cpp', 'int main(){}');
    expect(s).toContain('g++');
    expect(s).toContain('-finput-charset=UTF-8');
    expect(s).toContain('LANG=C.UTF-8');
  });
});
