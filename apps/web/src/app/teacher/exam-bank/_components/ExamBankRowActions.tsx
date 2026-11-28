'use client';

import { useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  downloadCourseExamDocx,
  ExamBankHttpError,
} from '@/lib/api/exam-bank';

function IconAction({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Eye;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border
                     text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground
                     disabled:pointer-events-none disabled:opacity-50"
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ExamBankRowActions({
  examId,
  onPreview,
}: {
  examId: string;
  onPreview: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  return (
    <span className="inline-flex gap-1">
      <IconAction label="Xem preview" icon={Eye} onClick={onPreview} />
      <IconAction
        label="Tải Word"
        icon={Download}
        disabled={downloading}
        onClick={async () => {
          setDownloading(true);
          try {
            await downloadCourseExamDocx(examId);
          } catch (err) {
            toast.error(
              err instanceof ExamBankHttpError
                ? err.message
                : 'Không tải được file Word.',
            );
          } finally {
            setDownloading(false);
          }
        }}
      />
    </span>
  );
}
