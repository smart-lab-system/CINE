import { describe, expect, it } from 'vitest';
import type { TestRunResult } from '@/lib/api/test-bundle';
import { applyRun, caseVerdict, summarizeRun, type RunsState } from './bundle-runs';

const result = (over: Partial<TestRunResult> = {}): TestRunResult => ({
  runId: 'r1',
  status: 'fail',
  cases: [
    { name: 'ca1', status: 'pass', ms: 3, diff: null },
    { name: 'ca2', status: 'fail', ms: 4, diff: 'dòng 1: mong đợi 0, nhận 1' },
  ],
  ...over,
});

describe('kết quả chạy thử theo phiên bản gói (G2b-R)', () => {
  it('chạy cả gói: ghi kết quả từng ca theo tên và trạng thái của cả lượt', () => {
    const state = applyRun({}, 'b1', null, result());
    expect(state.b1.status).toBe('fail');
    expect(Object.keys(state.b1.cases)).toEqual(['ca1', 'ca2']);
    expect(state.b1.cases.ca2.diff).toMatch(/mong đợi 0/);
  });

  it('chạy cả gói lần hai thay hẳn kết quả cũ (ca không còn trong lượt mới không giữ lại)', () => {
    const first = applyRun({}, 'b1', null, result());
    const second = applyRun(first, 'b1', null, result({ status: 'pass', cases: [{ name: 'ca1', status: 'pass', ms: 2, diff: null }] }));
    expect(Object.keys(second.b1.cases)).toEqual(['ca1']);
    expect(second.b1.status).toBe('pass');
  });

  it('chạy MỘT ca chỉ cập nhật ca đó, giữ nguyên các ca khác và trạng thái cả lượt', () => {
    const full = applyRun({}, 'b1', null, result());
    const one = applyRun(full, 'b1', 'ca2', result({ status: 'pass', cases: [{ name: 'ca2', status: 'pass', ms: 5, diff: null }] }));
    expect(one.b1.cases.ca2.status).toBe('pass');
    expect(one.b1.cases.ca1.status).toBe('pass');
    expect(one.b1.status).toBe('fail');
  });

  // Lượt cả gói báo biên dịch hỏng; giảng viên sửa mã rồi chạy MỘT ca và ca đó chạy được. Mã đã biên dịch được, nên thông báo
  // "không biên dịch được" và log cũ phải biến mất, không ở lại cạnh kết quả "Khớp" mới.
  it('lượt chạy một ca SAU khi biên dịch hỏng → gỡ trạng thái biên dịch hỏng và log cũ', () => {
    const broken = applyRun({}, 'b1', null, result({ status: 'compile_error', cases: [], compileLog: 'main.cpp:1: lỗi' }));
    const fixed = applyRun(broken, 'b1', 'ca1', result({ status: 'pass', cases: [{ name: 'ca1', status: 'pass', ms: 1, diff: null }] }));
    expect(fixed.b1.status).toBeNull();
    expect(fixed.b1.compileLog).toBeNull();
    expect(fixed.b1.cases.ca1.status).toBe('pass');
  });

  it('chạy một ca khi chưa có lượt cả gói → có kết quả ca đó, trạng thái cả lượt chưa biết', () => {
    const one = applyRun({}, 'b1', 'ca1', result({ status: 'pass', cases: [{ name: 'ca1', status: 'pass', ms: 1, diff: null }] }));
    expect(one.b1.status).toBeNull();
    expect(Object.keys(one.b1.cases)).toEqual(['ca1']);
  });

  it('biên dịch hỏng: xoá kết quả từng ca cũ (chúng đo bằng mã khác) và giữ log', () => {
    const full = applyRun({}, 'b1', null, result());
    const broken = applyRun(full, 'b1', null, result({ status: 'compile_error', cases: [], compileLog: 'main.cpp:1: error' }));
    expect(broken.b1).toEqual({ status: 'compile_error', cases: {}, compileLog: 'main.cpp:1: error' });
  });

  it('mỗi phiên bản gói có kết quả riêng; hàm không sửa state đầu vào', () => {
    const before: RunsState = applyRun({}, 'b1', null, result());
    const snapshot = JSON.stringify(before);
    const after = applyRun(before, 'b2', null, result({ status: 'pass', cases: [{ name: 'ca1', status: 'pass', ms: 1, diff: null }] }));
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(Object.keys(after)).toEqual(['b1', 'b2']);
  });

  it('tóm tắt đếm khớp và lệch; ca lỗi chạy tính là lệch', () => {
    const entry = applyRun({}, 'b1', null, result({ cases: [
      { name: 'a', status: 'pass', ms: 1, diff: null },
      { name: 'b', status: 'fail', ms: 1, diff: 'x' },
      { name: 'c', status: 'timeout', ms: 1000, diff: null },
    ] })).b1;
    expect(summarizeRun(entry)).toEqual({ matched: 1, mismatched: 2, total: 3 });
  });

  it('nhãn của từng trạng thái ca: pass là Khớp, fail là Lệch, các trạng thái khác nêu nguyên văn', () => {
    expect(caseVerdict('pass')).toEqual({ label: 'Khớp', tone: 'ok' });
    expect(caseVerdict('fail')).toEqual({ label: 'Lệch', tone: 'bad' });
    expect(caseVerdict('timeout')).toEqual({ label: 'Lỗi chạy: timeout', tone: 'bad' });
  });
});
