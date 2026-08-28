'use client';

import type { ComponentProps } from 'react';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = ComponentProps<typeof Sonner>;

// Themed onto this app's own CSS variable tokens (not sonner's default
// palette) so a toast looks like part of this product, not a bolted-on
// library default. Sonner's own slide-in from the right edge is kept —
// it's already the motion the design spec calls for, and re-implementing
// it in GSAP would mean owning the enter/exit/stack choreography by hand
// for no visible gain.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:rounded-lg group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:shadow-lg group-[.toaster]:text-body',
          title: 'group-[.toast]:font-semibold',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:rounded-md group-[.toast]:bg-accent-strong group-[.toast]:text-accent-foreground',
          cancelButton:
            'group-[.toast]:rounded-md group-[.toast]:bg-surface-2 group-[.toast]:text-muted-foreground',
          // Only the icon takes the semantic colour — a fully tinted toast
          // body would compete with whatever the page is showing behind it.
          success: 'group-[.toast]:[&>[data-icon]]:text-success',
          error: 'group-[.toast]:[&>[data-icon]]:text-danger',
          warning: 'group-[.toast]:[&>[data-icon]]:text-warning',
          info: 'group-[.toast]:[&>[data-icon]]:text-info',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
