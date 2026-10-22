import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RequiredFilenamesInput } from './RequiredFilenamesInput';
import {
  replaceRequiredDeliverablesSchema,
  type ReplaceRequiredDeliverablesFormValues,
} from '../schema';

/**
 * This component had no test coverage of its own before this file — only
 * indirect exercise through the parent page. New coverage here is for the
 * WinRAR warning specifically (spec follow-up to the 2026-09-25
 * archive/RAR student-facing fix, apps/agent commit 18b8bd7): a teacher who
 * declares a `.rar` required file has no way to know, at declaration time,
 * that a student without WinRAR installed cannot produce one — the earlier
 * fix only reached the student's instructions sheet, not this form.
 */
function Harness() {
  const form = useForm<ReplaceRequiredDeliverablesFormValues>({
    resolver: zodResolver(replaceRequiredDeliverablesSchema),
    defaultValues: { requiredFilenames: [{ value: '' }] },
  });
  return (
    <FormProvider {...form}>
      <RequiredFilenamesInput />
    </FormProvider>
  );
}

function typeFilename(value: string) {
  // `getByLabelText(/file phải nộp số 1/i)` also matches the row's delete
  // button (`aria-label="Xoá file phải nộp số 1"`, a substring match) — the
  // placeholder is unique to the input itself.
  fireEvent.change(screen.getByPlaceholderText(/bai_lam\.docx/i), { target: { value } });
}

describe('RequiredFilenamesInput — cảnh báo .rar cần WinRAR', () => {
  it('tên file thường thì không có cảnh báo WinRAR', () => {
    render(<Harness />);
    typeFilename('bai_lam.docx');
    expect(screen.queryByText(/winrar/i)).not.toBeInTheDocument();
  });

  it('tên file .zip thì không có cảnh báo — .zip máy nào cũng nén được', () => {
    render(<Harness />);
    typeFilename('BaiThi_{MSSV}.zip');
    expect(screen.queryByText(/winrar/i)).not.toBeInTheDocument();
  });

  it('tên file .rar thì hiện cảnh báo WinRAR', () => {
    render(<Harness />);
    typeFilename('BaiThi_{MSSV}.rar');
    expect(screen.getByText(/winrar/i)).toBeInTheDocument();
  });

  it('không phân biệt hoa/thường đuôi .RAR', () => {
    render(<Harness />);
    typeFilename('BaiThi.RAR');
    expect(screen.getByText(/winrar/i)).toBeInTheDocument();
  });

  it('sửa từ .rar sang tên khác thì cảnh báo biến mất', () => {
    render(<Harness />);
    typeFilename('BaiThi.rar');
    expect(screen.getByText(/winrar/i)).toBeInTheDocument();

    typeFilename('BaiThi.zip');
    expect(screen.queryByText(/winrar/i)).not.toBeInTheDocument();
  });
});

describe('RequiredFilenamesInput — deliverableType/language (3d2, khai qua form)', () => {
  it('mặc định là "Tài liệu", không hiện ô chọn ngôn ngữ', () => {
    render(<Harness />);
    expect(screen.getByLabelText(/loại bài nộp số 1/i)).toHaveValue('document');
    expect(screen.queryByLabelText(/ngôn ngữ số 1/i)).not.toBeInTheDocument();
  });

  it('chọn "Mã nguồn" thì hiện thêm ô chọn loại', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/loại bài nộp số 1/i), {
      target: { value: 'code_project' },
    });
    expect(screen.getByLabelText(/loại mã nguồn số 1/i)).toBeInTheDocument();
  });

  it('đổi lại về "Tài liệu" thì ô loại mã nguồn biến mất', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/loại bài nộp số 1/i), {
      target: { value: 'code_project' },
    });
    fireEvent.change(screen.getByLabelText(/loại bài nộp số 1/i), {
      target: { value: 'document' },
    });
    expect(screen.queryByLabelText(/loại mã nguồn số 1/i)).not.toBeInTheDocument();
  });

  it('có Python, C++, C, Java, Jupyter và JSON', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/loại bài nộp số 1/i), {
      target: { value: 'code_project' },
    });
    const options = screen.getByLabelText(/loại mã nguồn số 1/i).querySelectorAll('option');
    const values = Array.from(options).map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['', 'python', 'cpp', 'c', 'java', 'ipynb', 'json']);
  });

  it('chọn loại thì đổi đuôi file, giữ nguyên file nén', () => {
    render(<Harness />);
    typeFilename('bai_lam.docx');
    fireEvent.change(screen.getByLabelText(/loại bài nộp số 1/i), {
      target: { value: 'code_project' },
    });
    fireEvent.change(screen.getByLabelText(/loại mã nguồn số 1/i), { target: { value: 'python' } });
    expect(screen.getByPlaceholderText(/bai_lam\.docx/i)).toHaveValue('bai_lam.py');

    fireEvent.change(screen.getByLabelText(/loại mã nguồn số 1/i), { target: { value: 'ipynb' } });
    expect(screen.getByPlaceholderText(/bai_lam\.docx/i)).toHaveValue('bai_lam.ipynb');

    fireEvent.change(screen.getByLabelText(/loại mã nguồn số 1/i), { target: { value: 'c' } });
    expect(screen.getByPlaceholderText(/bai_lam\.docx/i)).toHaveValue('bai_lam.c');

    fireEvent.change(screen.getByLabelText(/loại mã nguồn số 1/i), { target: { value: 'java' } });
    expect(screen.getByPlaceholderText(/bai_lam\.docx/i)).toHaveValue('bai_lam.java');

    fireEvent.change(screen.getByLabelText(/loại mã nguồn số 1/i), { target: { value: 'json' } });
    expect(screen.getByPlaceholderText(/bai_lam\.docx/i)).toHaveValue('bai_lam.json');

    typeFilename('BaiThi.zip');
    fireEvent.change(screen.getByLabelText(/loại mã nguồn số 1/i), { target: { value: 'cpp' } });
    expect(screen.getByPlaceholderText(/bai_lam\.docx/i)).toHaveValue('BaiThi.zip');
  });
});
