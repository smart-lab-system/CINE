import './globals.css';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';

export const metadata = {
  title: 'ExamCollect — Thu bài & Chấm điểm thông minh',
  description:
    'Thu bài thi tự động từ phòng máy và chấm điểm có AI hỗ trợ, cho giảng viên và quản trị viên.',
};

// One family for the whole product (see tailwind.config.ts's fontFamily
// comment). next/font self-hosts at build time — no runtime request to
// Google Fonts, so this costs no third-party network dependency in
// production. `vietnamese` is in the subset list deliberately: without it
// every diacritic falls back to a system font mid-sentence.
const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-sans',
  display: 'swap',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
