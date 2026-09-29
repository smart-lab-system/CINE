import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RuleTable } from './RuleTable';
import { rule } from './fixtures';

function show(rules = [rule()], onEditPrice = vi.fn()) {
  render(<RuleTable rules={rules} onEditPrice={onEditPrice} />);
  return onEditPrice;
}

describe('RuleTable', () => {
  it('cột đúng thứ tự spec §3.1', () => {
    show();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.slice(0, 5)).toEqual(['Lỗi', 'Tiêu chí', 'Cách khớp', 'Mức trừ', 'Đang áp vào']);
  });

  it('dòng luật: tên, khoá + nguồn, tiêu chí, số bài · số phiên', () => {
    show([rule({ origin: 'seed' })]);
    expect(screen.getByText('Sai ca biên')).toBeInTheDocument();
    expect(screen.getByText('sai_bien · luật mồi')).toBeInTheDocument();
    expect(screen.getByText('tinh_dung')).toBeInTheDocument();
    expect(screen.getByText('5 bài · 2 phiên')).toBeInTheDocument();
  });

  it('mức trừ hiện "−1,5" (dấu trừ thật, dấu phẩy) khi đã có giá', () => {
    show();
    expect(screen.getByText('−1,5')).toBeInTheDocument();
  });

  it('chưa có giá → nhãn "Chưa có giá" + nút "Đặt giá"; đã có giá → "Sửa giá"', () => {
    show([rule({ id: 'a', deduction: null }), rule({ id: 'b', ruleKey: 'co_gia' })]);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Chưa có giá')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: 'Đặt giá' })).toBeInTheDocument();
    expect(within(rows[1]).getByRole('button', { name: 'Sửa giá' })).toBeInTheDocument();
  });

  it('bấm nút giá gọi onEditPrice với đúng luật', () => {
    const target = rule({ id: 'zzz', deduction: null });
    const onEditPrice = show([target]);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt giá' }));
    expect(onEditPrice).toHaveBeenCalledWith(target);
  });

  it('ba kiểu khớp có nhãn chữ riêng, kể cả "Máy chưa đo được" (không được hiện như Máy kiểm)', () => {
    show([
      rule({ id: 'a' }),
      rule({ id: 'b', checkedBy: 'model', revision: { predicate: { kind: 'no_recursion' } } }),
      rule({ id: 'c', checkedBy: 'model', revision: { predicate: null } }),
    ]);
    expect(screen.getByText('Máy kiểm')).toBeInTheDocument();
    expect(screen.getByText('Máy chưa đo được')).toBeInTheDocument();
    expect(screen.getByText('Bằng lời')).toBeInTheDocument();
  });

  it('có lối sang trang sửa luật', () => {
    show([rule({ id: 'r-42' })]);
    expect(screen.getByRole('link', { name: 'Sửa luật' })).toHaveAttribute('href', '/teacher/rules/r-42');
  });

  it('cảnh báo lệch tiêu chí kèm lối gỡ "Sửa luật này"', () => {
    show([rule({ id: 'r-7', mismatchedIn: 3 })]);
    expect(screen.getByText('3 bài lệch tiêu chí')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sửa luật này' })).toHaveAttribute('href', '/teacher/rules/r-7');
  });

  it('không lệch thì không có cảnh báo', () => {
    show([rule({ mismatchedIn: 0 })]);
    expect(screen.queryByText(/lệch tiêu chí/)).not.toBeInTheDocument();
  });
});
