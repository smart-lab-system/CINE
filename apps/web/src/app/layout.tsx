import './globals.css';
import type { ReactNode } from 'react';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';

export const metadata = {
  title: 'ExamCollect',
};

// next/font self-hosts at build time — no runtime request to Google Fonts,
// so this doesn't cost the app a third-party network dependency in
// production. Inter for body/UI text (matches the existing shadcn "slate"
// baseline), Plus Jakarta Sans for headings only (see tailwind.config.ts's
// `font-display`) — a deliberate, restrained pairing so the two dashboards
// read as a considered product rather than default browser sans
// everywhere, without hurting legibility in dense tables/forms.
const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-sans' });
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-display',
  weight: ['600', '700'],
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${inter.variable} ${plusJakarta.variable}`}>
      <body>{children}</body>
    </html>
  );
}
