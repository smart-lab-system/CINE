import type { Config } from 'tailwindcss';

/**
 * The same token system as apps/web/tailwind.config.ts, copied rather than
 * shared as a package: this app is a separate Vite/Electron build with no
 * Next.js dependency, and the two teams' colours/radius/shadow values are
 * a design decision meant to move together deliberately, not automatically
 * — see docs/superpowers/specs/2026-09-01-student-agent-electron-design.md
 * §7. Every value here still points at a CSS variable declared in
 * electron/renderer/src/globals.css, never a literal.
 */
const config: Config = {
  darkMode: 'media',
  content: ['./electron/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          2: 'hsl(var(--surface-2))',
        },
        // No DEFAULT — nothing in this app uses bg-muted/text-muted, only
        // text-muted-foreground (every secondary/helper line in the UI).
        muted: {
          foreground: 'hsl(var(--muted-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          strong: 'hsl(var(--primary-strong))',
          subtle: 'hsl(var(--primary-subtle))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          strong: 'hsl(var(--accent-strong))',
          stronger: 'hsl(var(--accent-stronger))',
          subtle: 'hsl(var(--accent-subtle))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          strong: 'hsl(var(--success-strong))',
          subtle: 'hsl(var(--success-subtle))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          strong: 'hsl(var(--warning-strong))',
          subtle: 'hsl(var(--warning-subtle))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          foreground: 'hsl(var(--danger-foreground))',
          strong: 'hsl(var(--danger-strong))',
          subtle: 'hsl(var(--danger-subtle))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          strong: 'hsl(var(--info-strong))',
          subtle: 'hsl(var(--info-subtle))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      // Only the steps this app's components actually use — apps/web's
      // `display`/`h1`/`beacon` steps have no screen here that needs them.
      fontSize: {
        h2: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.012em', fontWeight: '600' }],
        h3: ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.006em', fontWeight: '600' }],
        body: ['0.875rem', { lineHeight: '1.5' }],
        small: ['0.8125rem', { lineHeight: '1.5' }],
        caption: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.01em', fontWeight: '500' }],
      },
      fontFamily: {
        // System UI stack, not apps/web's Google-Fonts-loaded Inter: a
        // desktop app that must "just work" on a lab machine should not
        // have its typography depend on a CDN reaching the internet at
        // startup. Segoe UI (Windows' own default — the real deployment
        // target, per CLAUDE.md) is close enough to Inter's proportions
        // that the two apps still read as one family at a glance.
        sans: ['ui-sans-serif', '-apple-system', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'Cascadia Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
