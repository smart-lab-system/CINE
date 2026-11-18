import { javaMainClass, scanEntry } from './entry-scanner';

describe('scanEntry', () => {
  it('một file → single', () => {
    const r = scanEntry('python', [{ path: 'hello.py', content: 'print(1)' }]);
    expect(r.detection).toBe('single');
    expect(r.entryPath).toBe('hello.py');
  });

  it('nhiều file: tên main.py thắng', () => {
    const r = scanEntry('python', [
      { path: 'util.py', content: 'def f(): pass' },
      { path: 'main.py', content: 'print("hi")' },
    ]);
    expect(r.detection).toBe('auto');
    expect(r.entryPath).toBe('main.py');
  });

  it('cpp: quét int main', () => {
    const r = scanEntry('cpp', [
      { path: 'lib.cpp', content: 'int add(int a,int b){return a+b;}' },
      { path: 'app.cpp', content: 'int main(){ return 0; }' },
    ]);
    expect(r.detection).toBe('auto');
    expect(r.entryPath).toBe('app.cpp');
  });

  it('hai main điểm gần → pending', () => {
    const r = scanEntry('c', [
      { path: 'a.c', content: 'int main(){return 0;}' },
      { path: 'b.c', content: 'int main(){return 1;}' },
    ]);
    expect(r.detection).toBe('pending');
    expect(r.entryPath).toBeNull();
    expect(r.candidates.length).toBe(2);
  });

  it('java Main.java quy ước', () => {
    const r = scanEntry('java', [
      { path: 'Util.java', content: 'class Util {}' },
      { path: 'Main.java', content: 'public class Main { public static void main(String[] a){} }' },
    ]);
    expect(r.entryPath).toBe('Main.java');
  });

  it('bỏ path test/', () => {
    const r = scanEntry('python', [
      { path: 'test/main.py', content: 'if __name__ == "__main__": pass' },
      { path: 'app.py', content: 'if __name__ == "__main__": print(1)' },
    ]);
    expect(r.entryPath).toBe('app.py');
  });
});

describe('javaMainClass', () => {
  it('không package', () => {
    expect(javaMainClass('Main.java', 'public class Main {}')).toBe('Main');
  });

  it('có package', () => {
    expect(javaMainClass('src/App.java', 'package com.demo;\npublic class App {}')).toBe(
      'com.demo.App',
    );
  });
});
