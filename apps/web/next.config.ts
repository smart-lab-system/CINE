import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * `standalone` là để ĐÓNG GÓI DOCKER: apps/web/Dockerfile copy
   * .next/standalone và chạy `node apps/web/server.js`. Nó gom các
   * dependency cần thiết vào một cây riêng, thứ mà một image không có
   * node_modules của pnpm workspace thì bắt buộc phải có.
   *
   * Vercel KHÔNG cần nó — nó tự dựng output riêng từ `.next`. Tắt ở đó thay
   * vì để mặc kệ: build ra hai dạng output cùng lúc là một ẩn số không ai
   * kiểm, và ẩn số trong bước deploy là thứ chỉ lộ ra khi đã lên production.
   * `VERCEL` do chính Vercel đặt trong mọi môi trường build của nó.
   */
  output: process.env.VERCEL ? undefined : 'standalone',
};

export default nextConfig;
