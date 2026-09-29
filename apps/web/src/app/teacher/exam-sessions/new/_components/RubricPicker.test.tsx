import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FormProvider, useForm } from 'react-hook-form';
import { RubricPicker } from './RubricPicker';
import type { CreateExamSessionFormValues } from '../schema';

let rubrics: { data?: unknown[]; isLoading: boolean } = { data: [], isLoading: false };
vi.mock('@/hooks/useGrading', () => ({ useRubrics: () => rubrics }));

function Form({ children }: { children: ReactNode }) {
  const form = useForm<CreateExamSessionFormValues>({ defaultValues: {} as CreateExamSessionFormValues });
  return <FormProvider {...form}>{children}</FormProvider>;
}

describe('RubricPicker', () => {
  // The Rubric page is gone (ceilings live on Bảng lỗi now); /teacher/rubrics only redirects, so a link
  // straight to the destination saves a hop and a flash of an empty page.
  it('sends a teacher with no rubric to Bảng lỗi, where rubrics are made now', () => {
    rubrics = { data: [], isLoading: false };
    render(
      <Form>
        <RubricPicker />
      </Form>,
    );
    const link = screen.getByRole('link', { name: 'Soạn rubric ở Bảng lỗi' });
    expect(link).toHaveAttribute('href', '/teacher/rules');
  });

  it('says nothing about "no rubric" while rubrics are still loading', () => {
    rubrics = { data: undefined, isLoading: true };
    render(
      <Form>
        <RubricPicker />
      </Form>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
