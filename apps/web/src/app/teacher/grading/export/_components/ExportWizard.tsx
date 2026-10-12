'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useInspectTemplate } from '@/hooks/useGradeExport';
import type { InspectResponse } from '@/lib/api/grade-export';
import { EMPTY_CHOICE, toPlanBase, type ColumnChoice } from '@/lib/grade-export-view';
import { PreviousExports } from './PreviousExports';
import { StepColumns } from './StepColumns';
import { StepPreview } from './StepPreview';
import { StepUpload } from './StepUpload';

const STEPS = ['Tải file', 'Chọn cột', 'Xem trước và ghi'] as const;

/**
 * Ba bước ghi điểm vào sổ điểm (spec §3.6) và trạng thái chung của chúng. Đổi trang tính thì XOÁ lựa chọn cột (chữ
 * cột nghĩa khác ở trang khác); quay lại từ bước 3 thì GIỮ nguyên. Các lượt xuất trước luôn hiện ở dưới.
 */
export function ExportWizard({ sessionId, sessionName, sessionCode }: { sessionId: string; sessionName: string; sessionCode: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [template, setTemplate] = useState<{ templateId: string; fileName: string } | null>(null);
  const [inspect, setInspect] = useState<InspectResponse | null>(null);
  const [choice, setChoice] = useState<ColumnChoice>(EMPTY_CHOICE);
  const reinspect = useInspectTemplate(sessionId);

  const load = (body: { sheetName: string; fromRow?: number }) =>
    reinspect.mutate({ templateId: template!.templateId, ...body }, { onSuccess: (result) => setInspect(result) });

  return (
    <div className="flex flex-col gap-8">
      <ol aria-label="Các bước" className="flex flex-wrap gap-x-6 gap-y-2 text-small">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={step === i + 1 ? 'step' : undefined} className={step === i + 1 ? 'font-semibold' : 'text-muted-foreground'}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {reinspect.error && (
        <Alert variant="destructive">
          <AlertDescription>{reinspect.error.message}</AlertDescription>
        </Alert>
      )}

      {step === 1 && (
        <StepUpload
          sessionId={sessionId}
          onInspected={(r) => {
            setTemplate({ templateId: r.templateId, fileName: r.fileName });
            setInspect(r.inspect);
            // Chỉ khi file có ĐÚNG MỘT trang tính (server đã trả lưới) thì trang đó được chọn; cột thì không bao giờ.
            setChoice({ ...EMPTY_CHOICE, sheetName: r.inspect.sheet?.name ?? '' });
            setStep(2);
          }}
        />
      )}

      {step === 2 && inspect && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-caption text-muted-foreground">File: {template?.fileName}</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>
              Chọn file khác
            </Button>
          </div>
          <StepColumns
            inspect={inspect}
            choice={choice}
            busy={reinspect.isPending}
            onChange={(patch) => setChoice((current) => ({ ...current, ...patch }))}
            onSelectSheet={(name) => {
              setChoice({ ...EMPTY_CHOICE, sheetName: name });
              if (name) load({ sheetName: name });
            }}
            onLoadRows={(fromRow) => load({ sheetName: choice.sheetName, fromRow })}
            onNext={() => setStep(3)}
          />
        </div>
      )}

      {step === 3 && template && (
        <StepPreview
          sessionId={sessionId}
          sessionName={sessionName}
          sessionCode={sessionCode}
          templateFileName={template.fileName}
          request={toPlanBase(template.templateId, choice)}
          onBack={() => setStep(2)}
        />
      )}

      <PreviousExports sessionId={sessionId} />
    </div>
  );
}
