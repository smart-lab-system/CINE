'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { gsap, useGSAP, MOTION, MOTION_OK } from '@/lib/gsap';
import type { NavItem } from '@/lib/nav-config';

interface SidebarNavProps {
  items: NavItem[];
  /** Section heading above the list — omitted in the mobile sheet, where
   *  the sheet title already says where you are. */
  label?: string;
  onNavigate?: () => void;
}

/** Height of the teal rail, in px. Fixed so only `y` ever animates: height
 *  is a layout property and would force a reflow on every frame. */
const RAIL_HEIGHT = 20;

/**
 * The nav item list, shared between the persistent desktop sidebar and the
 * mobile Sheet (see app-shell.tsx) — same markup, two containers.
 *
 * The active item is marked three ways at once: a tinted indigo ground, an
 * indigo semibold label, and a teal rail down its left edge that slides
 * from the previous item to the new one on navigation. One cue alone reads
 * as a hover artifact at a glance; the rail is the piece that makes the
 * change legible as movement rather than a redraw.
 */
export function SidebarNav({ items, label, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  // First positioning must be instant — otherwise the rail slides down
  // from the top of the sidebar on every full page load, which reads as a
  // loading glitch rather than a transition.
  const hasPositioned = useRef(false);

  // Exactly one nav item is ever active, even when several hrefs match the
  // current path (e.g. at /teacher/exam-sessions/new, both
  // "/teacher/exam-sessions" and "/teacher/exam-sessions/new" match) — the
  // longest/most-specific href wins, so only one item highlights.
  const activeHref = items.reduce<string | null>((best, item) => {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (!matches) return best;
    return best === null || item.href.length > best.length ? item.href : best;
  }, null);

  useGSAP(
    () => {
      const list = listRef.current;
      const rail = railRef.current;
      if (!list || !rail) return;

      const active = list.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) {
        // No item matches this route (a nested page outside the menu) —
        // hide the rail rather than parking it on an unrelated item.
        gsap.set(rail, { autoAlpha: 0 });
        hasPositioned.current = false;
        return;
      }

      // One layout read, then hand the write to GSAP — never read offsets
      // inside an onUpdate, which would thrash layout every frame.
      const y = active.offsetTop + (active.offsetHeight - RAIL_HEIGHT) / 2;

      const mm = gsap.matchMedia();

      // Both conditions are listed so the handler still runs (and still
      // positions the rail) for someone who asked for reduced motion — it
      // just runs at duration 0, which is GSAP's documented way to honour
      // the preference without branching the logic in two.
      mm.add(
        { motionOk: MOTION_OK, reduced: '(prefers-reduced-motion: reduce)' },
        (context) => {
          const motionOk = Boolean(context.conditions?.motionOk);
          const instant = motionOk === false || hasPositioned.current === false;
          hasPositioned.current = true;

          gsap.to(rail, {
            y,
            autoAlpha: 1,
            duration: instant ? 0 : MOTION.indicator,
            ease: MOTION.easeOut,
            // A fast click-through of three menu items must not queue three
            // tweens fighting over `y`.
            overwrite: 'auto',
          });
        },
      );

      return () => mm.revert();
    },
    // Deliberately NOT revertOnUpdate: reverting would snap the rail back
    // to y=0 before each new tween, so every navigation would flash the
    // indicator to the top of the list first. `overwrite: 'auto'` above is
    // what supersedes the previous tween instead.
    { dependencies: [activeHref] },
  );

  return (
    <nav className="flex flex-col gap-2 px-3 py-2" aria-label="Điều hướng chính">
      {label && <p className="section-label px-3 pt-2">{label}</p>}

      <div ref={listRef} className="relative flex flex-col gap-1">
        <span
          ref={railRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 w-[3px] rounded-r-full bg-accent opacity-0"
          style={{ height: RAIL_HEIGHT, willChange: 'transform' }}
        />

        {items.map((item) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              data-active={isActive}
              aria-current={isActive ? 'page' : undefined}
              className="sidebar-item"
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
