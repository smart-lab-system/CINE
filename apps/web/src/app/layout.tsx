import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Lab Management — Web Portal',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
