import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ExamPublishPanel } from './exam-publish-panel';
import { examPublishChecklist } from './publish-checklist';

describe('ExamPublishPanel', () => {
  it('disables publish until the checklist is complete', () => {
    const onPublish = vi.fn();
    const checklist = examPublishChecklist({
      sections: [],
      sessions: [],
      files: [],
    });
    render(
      <ExamPublishPanel
        checklist={checklist}
        onPublish={onPublish}
      />,
    );

    expect(
      screen.getByRole('button', { name: /công bố lịch/i }),
    ).toBeDisabled();
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('enables publish when the checklist is complete', () => {
    const onPublish = vi.fn();
    const checklist = examPublishChecklist({
      sections: [{ id: 's' }],
      sessions: [{ id: 'c', status: 'draft', hasLead: true }],
      files: [{ fileRole: 'question' }],
    });
    render(
      <ExamPublishPanel checklist={checklist} onPublish={onPublish} />,
    );

    const button = screen.getByRole('button', { name: /công bố lịch/i });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onPublish).toHaveBeenCalledTimes(1);
  });
});
