'use client';

import { useRef } from 'react';
import { gsap, useGSAP, MOTION, MOTION_OK } from '@/lib/gsap';

interface CountUpProps {
  value: number;
  className?: string;
}

function format(n: number): string {
  return n.toLocaleString('vi-VN');
}

/**
 * A dashboard number that counts up from zero on arrival.
 *
 * This is the one animation in the app that carries information rather
 * than polish: the roll conveys magnitude before you finish reading the
 * digits, and it pulls the eye to the figure that changed.
 *
 * The element renders its real value in the server HTML and GSAP only
 * rewinds it to 0 once it's running, so there's no flash of "0" on load
 * and the number is correct with JS disabled. Under reduced motion the
 * matchMedia handler never runs, so the server-rendered value simply
 * stands — no tween is created and there is nothing to interrupt.
 *
 * Only textContent is written per frame; nothing layout-affecting is
 * animated. The tween drives a plain object, not the DOM, so this is safe
 * to place in a stat grid.
 */
export function CountUp({ value, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      // Guard non-finite values (NaN/Infinity from a malformed payload)
      // before creating a tween that would paint "NaN" sixty times a
      // second.
      if (!Number.isFinite(value)) {
        el.textContent = '—';
        return;
      }

      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        const state = { n: 0 };
        gsap.to(state, {
          n: value,
          duration: MOTION.count,
          ease: MOTION.easeCount,
          onUpdate: () => {
            el.textContent = format(Math.round(state.n));
          },
          // Easing can land a hair short on the final frame; write the
          // exact value once, at the end.
          onComplete: () => {
            el.textContent = format(value);
          },
        });

        // matchMedia reverts the tween itself when the query stops
        // matching, but the tween wrote to textContent — which GSAP has no
        // record of and cannot restore. Put the true value back by hand so
        // switching on "reduce motion" mid-count can't freeze a partial
        // number on screen.
        return () => {
          el.textContent = format(value);
        };
      });

      return () => mm.revert();
    },
    { dependencies: [value], revertOnUpdate: true },
  );

  return (
    <span ref={ref} className={className}>
      {Number.isFinite(value) ? format(value) : '—'}
    </span>
  );
}
