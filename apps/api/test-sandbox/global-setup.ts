import { execFileSync } from 'node:child_process';

/** Nổ, không bỏ qua: một bộ test an ninh xanh vì không chạy là tệ hơn không có. */
export default async function globalSetup(): Promise<void> {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'pipe' });
  } catch {
    throw new Error('test:sandbox cần Docker đang chạy — bộ này KHÔNG tự bỏ qua. Bật Docker rồi chạy lại.');
  }
  for (const image of ['cine-sandbox-cpp:1', 'cine-sandbox-python:1']) {
    try {
      execFileSync('docker', ['image', 'inspect', image], { stdio: 'pipe' });
    } catch {
      throw new Error(`thiếu image ${image} — chạy: pnpm --filter api sandbox:images`);
    }
  }
  if (process.env.SANDBOX_RUNTIME === 'runsc') {
    const runtimes = execFileSync('docker', ['info', '--format', '{{json .Runtimes}}'], { encoding: 'utf8' });
    if (!runtimes.includes('"runsc"')) throw new Error('SANDBOX_RUNTIME=runsc nhưng Docker chưa đăng ký runsc');
  }
}
