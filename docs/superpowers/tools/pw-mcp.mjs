// Client mỏng nói MCP (JSON-RPC, khung Content-Length) với server Playwright ở C:\Users\Admin\.mcp\playwright-local.
// Vì sao cần: server đó chưa được đăng ký làm MCP của phiên Claude này, và biến môi trường mặc định trong
// mcp-common.json trỏ tới đường dẫn của một người dùng khác (henry-le-nguyen) nên cũng không chạy được nguyên trạng.
// Ta chạy ĐÚNG server.mjs đó, chỉ trỏ PLAYWRIGHT_LOCAL_MCP_PLAYWRIGHT_PATH sang bản playwright có trong pnpm store của repo.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SERVER = 'C:/Users/Admin/.mcp/playwright-local/server.mjs';
/** Tìm bản playwright trong pnpm store của repo, đi ngược từ thư mục đang đứng (mỗi worktree có node_modules riêng). */
export function findRepoPlaywright(from = process.cwd()) {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const store = path.join(dir, 'node_modules', '.pnpm');
    if (existsSync(store)) {
      const hit = readdirSync(store).find((name) => /^playwright@[0-9]/.test(name));
      if (hit) return path.join(store, hit, 'node_modules', 'playwright', 'index.mjs');
    }
    if (path.dirname(dir) === dir) throw new Error('không thấy playwright trong node_modules/.pnpm — chạy pnpm install trước');
  }
}

export async function startPlaywrightMcp({ artifactsDir }) {
  mkdirSync(artifactsDir, { recursive: true });
  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      PLAYWRIGHT_LOCAL_MCP_ARTIFACTS_DIR: artifactsDir,
      PLAYWRIGHT_LOCAL_MCP_PLAYWRIGHT_PATH: process.env.PLAYWRIGHT_LOCAL_MCP_PLAYWRIGHT_PATH || findRepoPlaywright(),
    },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  let buf = Buffer.alloc(0);
  let nextId = 1;
  const pending = new Map();

  child.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const headerEnd = buf.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const m = /Content-Length:\s*(\d+)/i.exec(buf.slice(0, headerEnd).toString('utf8'));
      if (!m) throw new Error('khung MCP không có Content-Length');
      const len = Number(m[1]);
      if (buf.length < headerEnd + 4 + len) return;
      const body = buf.slice(headerEnd + 4, headerEnd + 4 + len).toString('utf8');
      buf = buf.slice(headerEnd + 4 + len);
      const msg = JSON.parse(body);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else resolve(msg.result);
      }
    }
  });
  child.on('exit', (code) => {
    for (const { reject } of pending.values()) reject(new Error(`server Playwright thoát (mã ${code})`));
    pending.clear();
  });

  const send = (obj) => {
    const payload = JSON.stringify(obj);
    child.stdin.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
  };
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      send({ jsonrpc: '2.0', id, method, params });
    });

  await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'cine-browser-pass', version: '1' } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  return {
    tools: async () => (await request('tools/list', {})).tools,
    /** Gọi một tool; ném lỗi nếu server báo isError. Trả phần chữ của kết quả. */
    async call(name, args = {}) {
      const result = await request('tools/call', { name, arguments: args });
      const text = (result.content ?? []).map((c) => c.text ?? '').join('\n');
      if (result.isError) throw new Error(`${name}: ${text}`);
      return text;
    },
    async close() {
      try { await request('tools/call', { name: 'close_playwright_browser', arguments: {} }); } catch { /* đã đóng */ }
      child.stdin.end();
      child.kill();
    },
  };
}
