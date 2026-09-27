import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RequiredFilenamesInput } from './RequiredFilenamesInput';
import { createExamSessionSchema, type CreateExamSessionFormValues } from '../schema';

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
  const form = useForm<CreateExamSessionFormValues>({
    resolver: zodResolver(createExamSessionSchema),
    defaultValues: { requiredFilenames: [{ value: '' }] },
  });
  return (
    <FormProvider {...form}>
      <RequiredFilenamesInput />
    </FormProvider>
  );
}

function typeFilename(value: string) {
  // `getByLabelText(/file bắt buộc số 1/i)` also matches the row's delete
  // button (`aria-label="Xoá file bắt buộc số 1"`, a substring match) — the
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

  it('chọn "Mã nguồn" thì hiện thêm ô chọn ngôn ngữ', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/loại bài nộp số 1/i), {
      target: { value: 'code_project' },
    });
    expect(screen.getByLabelText(/ngôn ngữ số 1/i)).toBeInTheDocument();
  });

  it('đổi lại về "Tài liệu" thì ô ngôn ngữ biến mất', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/loại bài nộp số 1/i), {
      target: { value: 'code_project' },
    });
    fireEvent.change(screen.getByLabelText(/loại bài nộp số 1/i), {
      target: { value: 'document' },
    });
    expect(screen.queryByLabelText(/ngôn ngữ số 1/i)).not.toBeInTheDocument();
  });

  it('chỉ hiện C++ và Python — không hiện Java/Node dù backend chấp nhận', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/loại bài nộp số 1/i), {
      target: { value: 'code_project' },
    });
    const options = screen.getByLabelText(/ngôn ngữ số 1/i).querySelectorAll('option');
    const values = Array.from(options).map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['cpp', 'python']);
  });
});
