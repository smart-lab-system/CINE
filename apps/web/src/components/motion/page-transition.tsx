'use client';

import { useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { gsap, useGSAP, MOTION, MOTION_OK } from '@/lib/gsap';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Fades page content up on arrival, staggering any element marked
 * `data-animate` so a dashboard's cards land one after another instead of
 * all at once.
 *
 * A single staggered tween rather than a timeline of separate tweens:
 * every element plays the identical animation, and GSAP's own performance
 * guidance is to use stagger instead of many tweens with manual delays.
 * (The login screen, where the steps genuinely differ, uses a timeline.)
 *
 * Three deliberate constraints:
 *
 * 1. `gsap.from()`, never a CSS `opacity: 0` default. The server-rendered
 *    HTML is fully visible; GSAP only hides the element at the moment the
 *    tween starts, after hydration. If JS never runs, the page is still
 *    readable rather than permanently invisible.
 *
 * 2. `autoAlpha`, not `opacity` — at 0 it also sets `visibility: hidden`,
 *    so a card that hasn't faded in yet can't swallow a click aimed at
 *    whatever is beneath it.
 *
 * 3. Pages opt in per element. A page that marks nothing gets its whole
 *    container faded as one unit, so a table page can animate its header
 *    and card without also animating twenty rows.
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  const scope = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;

      const mm = gsap.matchMedia();

      mm.add(
        MOTION_OK,
        () => {
          // `root` explicitly as toArray's second argument: useGSAP's
          // `scope` only constrains GSAP's own selector-string targets,
          // NOT gsap.utils.toArray — without this it would match every
          // [data-animate] in the document, including any left mounted by
          // the layout outside this container.
          const marked = gsap.utils.toArray<HTMLElement>('[data-animate]', root);
          const targets: HTMLElement[] = marked.length > 0 ? marked : [root];

          gsap.from(targets, {
            autoAlpha: 0,
            y: 12,
            duration: MOTION.enter,
            ease: MOTION.easeOut,
            stagger: targets.length > 1 ? MOTION.stagger : 0,
            // Transform + opacity only — both composite on the GPU, and
            // neither forces layout. Cleared afterwards so a leftover
            // matrix doesn't create a stacking context that traps a
            // dropdown or breaks a sticky header.
            clearProps: 'opacity,visibility,transform',
          });
        },
        root,
      );

      return () => mm.revert();
    },
    // revertOnUpdate: useGSAP otherwise reverts only on unmount, so a
    // route change would stack a second enter tween on top of a running
    // one — a fast back-and-forth could strand a half-faded page.
    { scope, dependencies: [pathname], revertOnUpdate: true },
  );

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}
