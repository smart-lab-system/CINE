import type { HTMLAttributes } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Table, TableBody, TableCell, TableRow } from './table';

/**
 * The wrapper div this component puts around every `<table>` IS the
 * scrollport in BOTH axes, not just the horizontal one: per CSS Overflow,
 * when one of overflow-x/overflow-y is not `visible`, the `visible` one
 * computes to `auto`. So `overflow-x-auto` alone already makes that div a
 * vertical scroll container — with `height: auto`, i.e. one that can never
 * actually scroll.
 *
 * That is why a vertical height cap has to land on THAT div and nowhere
 * else. Put it on a div outside, and the inner wrapper stays the nearest
 * scrollport for a `sticky` `<thead>`, which then has no room to stick
 * against and silently scrolls away. Put it on the `<table>`, and it does
 * nothing at all. The `container` prop is the only way to reach the one
 * element that works, so these tests pin that it does.
 */
describe('Table — scroll container', () => {
  function renderTable(container?: HTMLAttributes<HTMLDivElement>) {
    render(
      <Table container={container}>
        <TableBody>
          <TableRow>
            <TableCell>Nguyễn Văn A</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    return screen.getByRole('table');
  }

  it('merges the container classes onto the wrapper without dropping its own overflow-x', () => {
    const wrapper = renderTable({ className: 'max-h-[22rem] overflow-y-auto' })
      .parentElement as HTMLElement;

    expect(wrapper.className).toContain('overflow-x-auto');
    expect(wrapper.className).toContain('max-h-[22rem]');
    expect(wrapper.className).toContain('overflow-y-auto');
  });

  it('never lets the height cap land on the <table>, which is not the scrollport', () => {
    const table = renderTable({ className: 'max-h-[22rem] overflow-y-auto' });

    expect(table.className).not.toContain('max-h-[22rem]');
    expect(table.className).not.toContain('overflow-y-auto');
  });

  it('passes attributes through, so a capped table stays scrollable by keyboard', () => {
    // A box that scrolls but cannot be focused is unreachable without a
    // mouse (WCAG 2.1.1) — the caller needs to reach the wrapper with
    // role/aria-label/tabIndex, not only with a class.
    renderTable({
      role: 'region',
      'aria-label': 'Bảng trạng thái nộp bài',
      tabIndex: 0,
      className: 'max-h-[22rem] overflow-y-auto',
    });

    const region = screen.getByRole('region', { name: 'Bảng trạng thái nộp bài' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toContainElement(screen.getByRole('table'));
  });

  it('renders the plain wrapper unchanged when no container prop is given', () => {
    // 10 other call sites pass nothing — the prop must stay additive.
    const wrapper = renderTable().parentElement as HTMLElement;

    expect(wrapper.className).toContain('w-full');
    expect(wrapper.className).toContain('overflow-x-auto');
    expect(wrapper).not.toHaveAttribute('role');
  });
});
