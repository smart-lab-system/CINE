'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { gsap, useGSAP, MOTION, MOTION_OK } from '@/lib/gsap';
import {
  isNavGroup,
  type NavEntry,
  type NavGroup,
  type NavItem,
} from '@/lib/nav-config';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SidebarNavProps {
  items: NavEntry[];
  /** Section heading above the list - omitted in the mobile sheet, where
   *  the sheet title already says where you are. */
  label?: string;
  onNavigate?: () => void;
  /** Icon-only rail. The labels stay in the DOM as sr-only text - hiding
   *  them with `display: none` would leave each link with no accessible
   *  name at all, and `title` alone is a weak substitute. */
  collapsed?: boolean;
}

/** Height of the teal rail, in px. Fixed so only `y` ever animates: height
 *  is a layout property and would force a reflow on every frame. */
const RAIL_HEIGHT = 20;

function pathMatches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function collectLeaves(entries: NavEntry[]): NavItem[] {
  return entries.flatMap((entry) => (isNavGroup(entry) ? entry.children : [entry]));
}

function groupContainsActive(group: NavGroup, activeHref: string | null): boolean {
  return activeHref !== null && group.children.some((c) => c.href === activeHref);
}

/**
 * The nav item list, shared between the persistent desktop sidebar and the
 * mobile Sheet (see app-shell.tsx) - same markup, two containers.
 *
 * The active item is marked three ways at once: a tinted indigo ground, an
 * indigo semibold label, and a teal rail down its left edge that slides
 * from the previous item to the new one on navigation. One cue alone reads
 * as a hover artifact at a glance; the rail is the piece that makes the
 * change legible as movement rather than a redraw.
 *
 * Admin groups (NavGroup) accordion when expanded; collapsed rail opens a
 * DropdownMenu of children instead.
 */
export function SidebarNav({ items, label, onNavigate, collapsed = false }: SidebarNavProps) {
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLSpanElement>(null);
  // First positioning must be instant - otherwise the rail slides down
  // from the top of the sidebar on every full page load, which reads as a
  // loading glitch rather than a transition.
  const hasPositioned = useRef(false);

  const leaves = collectLeaves(items);

  // Exactly one nav item is ever active, even when several hrefs match the
  // current path (e.g. at /teacher/exam-sessions/new, both
  // "/teacher/exam-sessions" and "/teacher/exam-sessions/new" match) - the
  // longest/most-specific href wins, so only one item highlights.
  const activeHref = leaves.reduce<string | null>((best, item) => {
    if (!pathMatches(pathname, item.href)) return best;
    return best === null || item.href.length > best.length ? item.href : best;
  }, null);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const entry of items) {
      if (isNavGroup(entry)) {
        initial[entry.label] = entry.children.some((c) => pathMatches(pathname, c.href));
      }
    }
    return initial;
  });

  // Keep the group that owns the active route open after client navigations.
  useEffect(() => {
    setOpenGroups((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const entry of items) {
        if (!isNavGroup(entry)) continue;
        if (groupContainsActive(entry, activeHref) && !next[entry.label]) {
          next[entry.label] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeHref, items]);

  const toggleGroup = (groupLabel: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupLabel]: !prev[groupLabel] }));
  };

  useGSAP(
    () => {
      const list = listRef.current;
      const rail = railRef.current;
      if (!list || !rail) return;

      const active = list.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) {
        // No item matches this route (a nested page outside the menu) -
        // hide the rail rather than parking it on an unrelated item.
        gsap.set(rail, { autoAlpha: 0 });
        hasPositioned.current = false;
        return;
      }

      // One layout read, then hand the write to GSAP - never read offsets
      // inside an onUpdate, which would thrash layout every frame.
      const y = active.offsetTop + (active.offsetHeight - RAIL_HEIGHT) / 2;

      const mm = gsap.matchMedia();

      // Both conditions are listed so the handler still runs (and still
      // positions the rail) for someone who asked for reduced motion - it
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
    // `collapsed` + openGroups: rail y comes from offsetTop; expand/collapse
    // re-lays-out the list.
    { dependencies: [activeHref, collapsed, openGroups] },
  );

  return (
    <nav
      className={cn('flex flex-col gap-2 py-2', collapsed ? 'px-2' : 'px-3')}
      aria-label="Điều hướng chính"
    >
      {label && (
        <p className={cn('section-label px-3 pt-2', collapsed && 'sr-only')}>{label}</p>
      )}

      <div ref={listRef} className="relative flex flex-col gap-1">
        <span
          ref={railRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 w-[3px] rounded-r-full bg-accent opacity-0"
          style={{ height: RAIL_HEIGHT, willChange: 'transform' }}
        />

        {items.map((entry) =>
          isNavGroup(entry) ? (
            <NavGroupBlock
              key={entry.label}
              group={entry}
              open={Boolean(openGroups[entry.label])}
              onToggle={() => toggleGroup(entry.label)}
              activeHref={activeHref}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ) : (
            <NavLeafLink
              key={entry.href}
              item={entry}
              isActive={entry.href === activeHref}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ),
        )}
      </div>
    </nav>
  );
}

function NavLeafLink({
  item,
  isActive,
  collapsed,
  onNavigate,
  indented,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  indented?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      data-active={isActive}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'sidebar-item',
        collapsed && 'justify-center px-0',
        indented && !collapsed && 'pl-9',
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
    </Link>
  );
}

function NavGroupBlock({
  group,
  open,
  onToggle,
  activeHref,
  collapsed,
  onNavigate,
}: {
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
  activeHref: string | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = group.icon;
  const childActive = groupContainsActive(group, activeHref);

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          data-active={childActive}
          className={cn(
            'sidebar-item w-full justify-center px-0',
            childActive && 'text-primary',
          )}
          title={group.label}
          aria-label={group.label}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <span className="sr-only">{group.label}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="min-w-[12rem]">
          <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
          {group.children.map((child) => {
            const ChildIcon = child.icon;
            const isActive = child.href === activeHref;
            return (
              <DropdownMenuItem key={child.href} asChild>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  className={cn(isActive && 'font-semibold text-primary')}
                >
                  <ChildIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                  {child.label}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'sidebar-item w-full',
          childActive && !open && 'text-primary',
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-left">{group.label}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-150',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      {open &&
        group.children.map((child) => (
          <NavLeafLink
            key={child.href}
            item={child}
            isActive={child.href === activeHref}
            collapsed={false}
            onNavigate={onNavigate}
            indented
          />
        ))}
    </div>
  );
}
