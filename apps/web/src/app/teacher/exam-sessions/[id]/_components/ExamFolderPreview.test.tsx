import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ExamFolderPreview } from './ExamFolderPreview';

describe('ExamFolderPreview', () => {
  it('0 material → placeholder phát', () => {
    render(
      <ExamFolderPreview
        materialFilenames={[]}
        requiredFiles={[{ pattern: 'bai.docx', deliverableType: 'document', entries: [] }]}
      />,
    );
    expect(screen.getByText(/chưa upload đề\/tài liệu/i)).toBeInTheDocument();
    expect(screen.getByText('bai.docx')).toBeInTheDocument();
  });

  it('có material → liệt kê tên', () => {
    render(
      <ExamFolderPreview
        materialFilenames={['De_thi.pdf', 'Huong_dan.docx']}
        requiredFiles={[{ pattern: 'bai.docx', deliverableType: 'document', entries: [] }]}
      />,
    );
    expect(screen.getByText('De_thi.pdf')).toBeInTheDocument();
    expect(screen.getByText('Huong_dan.docx')).toBeInTheDocument();
    expect(screen.queryByText(/chưa upload đề/i)).not.toBeInTheDocument();
  });

  it('pattern có {MSSV} → hiện → + sample', () => {
    render(
      <ExamFolderPreview
        materialFilenames={[]}
        requiredFiles={[
          {
            pattern: '{MSSV}_BaiLam.docx',
            deliverableType: 'document',
            entries: [],
          },
        ]}
      />,
    );
    expect(screen.getByText('{MSSV}_BaiLam.docx')).toBeInTheDocument();
    expect(screen.getByText('SV20120001_BaiLam.docx')).toBeInTheDocument();
  });

  it('entries → dòng trong nén', () => {
    render(
      <ExamFolderPreview
        materialFilenames={[]}
        requiredFiles={[
          {
            pattern: 'Bai.zip',
            deliverableType: 'code_project',
            language: 'python',
            entries: ['main.py', 'readme.txt'],
          },
        ]}
      />,
    );
    expect(screen.getByText(/trong nén: main\.py, readme\.txt/i)).toBeInTheDocument();
    expect(screen.getByText(/ngôn ngữ: python/i)).toBeInTheDocument();
    expect(screen.getByText(/loại: Mã nguồn/i)).toBeInTheDocument();
  });

  it('0 required non-empty → placeholder nộp', () => {
    render(
      <ExamFolderPreview
        materialFilenames={['de.pdf']}
        requiredFiles={[{ pattern: '   ', deliverableType: 'document', entries: [] }]}
      />,
    );
    expect(screen.getByText(/chưa khai file phải nộp/i)).toBeInTheDocument();
  });

  it('region có aria-label preview', () => {
    render(<ExamFolderPreview materialFilenames={[]} requiredFiles={[]} />);
    expect(
      screen.getByRole('region', { name: /preview thư mục bài thi/i }),
    ).toBeInTheDocument();
  });
});
