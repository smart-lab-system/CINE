import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RequiredFilenamesInput } from './RequiredFilenamesInput';
import {
  DEFAULT_ARCHIVE_DELIVERABLE,
  replaceRequiredDeliverablesSchema,
  type ReplaceRequiredDeliverablesFormValues,
} from '../schema';

/**
 * Form một gói nộp: cảnh báo WinRAR khi `.rar`; luôn hiện kiểm file bên trong.
 */
function Harness({
  initial = DEFAULT_ARCHIVE_DELIVERABLE,
}: {
  initial?: string;
}) {
  const form = useForm<ReplaceRequiredDeliverablesFormValues>({
    resolver: zodResolver(replaceRequiredDeliverablesSchema),
    defaultValues: { requiredFilenames: [{ value: initial, deliverableType: 'document' }] },
  });
  return (
    <FormProvider {...form}>
      <RequiredFilenamesInput />
    </FormProvider>
  );
}

function typeFilename(value: string) {
  fireEvent.change(screen.getByPlaceholderText(/SOMAY.*MSSV.*HOTEN.*\.zip/i), {
    target: { value },
  });
}

describe('RequiredFilenamesInput - một gói + WinRAR', () => {
  it('không có nút Thêm file', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: /thêm file$/i })).not.toBeInTheDocument();
  });

  it('luôn hiện Kiểm file bên trong', () => {
    render(<Harness />);
    expect(screen.getByText(/kiểm file bên trong/i)).toBeInTheDocument();
  });

  it('tên file .zip thì không có cảnh báo WinRAR', () => {
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

  it('sửa từ .rar sang .zip thì cảnh báo biến mất', () => {
    render(<Harness />);
    typeFilename('BaiThi.rar');
    expect(screen.getByText(/winrar/i)).toBeInTheDocument();

    typeFilename('BaiThi.zip');
    expect(screen.queryByText(/winrar/i)).not.toBeInTheDocument();
  });
});

describe('RequiredFilenamesInput - deliverableType/language', () => {
  it('mặc định là "Tài liệu", không hiện ô chọn ngôn ngữ', () => {
    render(<Harness />);
    expect(screen.getByLabelText(/loại bài nộp/i)).toHaveValue('document');
    expect(screen.queryByLabelText(/loại mã nguồn/i)).not.toBeInTheDocument();
  });

  it('chọn "Mã nguồn" thì hiện thêm ô chọn loại', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/loại bài nộp/i), {
      target: { value: 'code_project' },
    });
    expect(screen.getByLabelText(/loại mã nguồn/i)).toBeInTheDocument();
  });

  it('đổi lại về "Tài liệu" thì ô loại mã nguồn biến mất', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/loại bài nộp/i), {
      target: { value: 'code_project' },
    });
    fireEvent.change(screen.getByLabelText(/loại bài nộp/i), {
      target: { value: 'document' },
    });
    expect(screen.queryByLabelText(/loại mã nguồn/i)).not.toBeInTheDocument();
  });

  it('có Python, C++, C, Java, Jupyter và JSON', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/loại bài nộp/i), {
      target: { value: 'code_project' },
    });
    const options = screen.getByLabelText(/loại mã nguồn/i).querySelectorAll('option');
    const values = Array.from(options).map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['', 'python', 'cpp', 'c', 'java', 'ipynb', 'json']);
  });

  it('chọn loại mã nguồn không đổi đuôi gói .zip', () => {
    render(<Harness initial="BaiThi.zip" />);
    fireEvent.change(screen.getByLabelText(/loại bài nộp/i), {
      target: { value: 'code_project' },
    });
    fireEvent.change(screen.getByLabelText(/loại mã nguồn/i), { target: { value: 'cpp' } });
    expect(screen.getByPlaceholderText(/SOMAY.*MSSV.*HOTEN.*\.zip/i)).toHaveValue('BaiThi.zip');
  });
});
