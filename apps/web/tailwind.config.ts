import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

/**
 * Every value here points at a CSS variable declared in src/app/globals.css —
 * nothing is a literal colour, radius or shadow. That's what makes the token
 * system enforceable: a component can only reach a colour by naming a token,
 * so there is no "one page uses a slightly different grey" drift, and dark
 * mode is a variable swap rather than a per-component rewrite.
 *
 * See globals.css for why each hue has DEFAULT / strong / subtle: DEFAULT is
 * the brief's exact value (non-text UI at 3:1), `strong` is the same hue
 * darkened until white-on-it and it-on-light both clear WCAG AA 4.5:1.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          2: 'hsl(var(--surface-2))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          strong: 'hsl(var(--primary-strong))',
          subtle: 'hsl(var(--primary-subtle))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
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
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
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
        xl: 'var(--shadow-lg)',
      },
      fontSize: {
        // The type scale from the design spec, as named steps. Using
        // `text-h1` instead of `text-2xl` keeps weight and tracking bound
        // to the size, so a heading can't drift to the wrong weight.
        display: ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em', fontWeight: '700' }],
        h1: ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.018em', fontWeight: '700' }],
        h2: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.012em', fontWeight: '600' }],
        h3: ['1rem', { lineHeight: '1.5rem', letterSpacing: '-0.006em', fontWeight: '600' }],
        body: ['0.875rem', { lineHeight: '1.5' }],
        small: ['0.8125rem', { lineHeight: '1.5' }],
        caption: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.01em', fontWeight: '500' }],
        // Projector-scale — the exam session code read from across a room.
        beacon: ['4.5rem', { lineHeight: '1', letterSpacing: '0.28em', fontWeight: '700' }],
      },
      fontFamily: {
        // One family throughout, per the design spec. Inter covers
        // Vietnamese diacritics well at small sizes, which matters more
        // here than a second display face would: this UI is mostly dense
        // tables and forms. `font-display` is kept as an alias (rather
        // than deleted) so existing markup keeps compiling — it now means
        // "heading treatment", carried by weight and tracking, not by a
        // second font download.
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 220ms cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionTimingFunction: {
        // The single easing curve for UI motion (matches GSAP power3.out
        // closely enough that CSS-driven and GSAP-driven motion in the same
        // view read as one system).
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  // Utility classes only (animate-in/fade-in/zoom-in etc.) — plain CSS
  // keyframes, not a JS animation runtime. Dialog/Sheet/DropdownMenu
  // open+close stay on CSS; GSAP is reserved for the sequenced page-enter,
  // the sliding sidebar rail, and stat count-ups (see src/lib/gsap.ts).
  plugins: [tailwindcssAnimate],
};

export default config;
