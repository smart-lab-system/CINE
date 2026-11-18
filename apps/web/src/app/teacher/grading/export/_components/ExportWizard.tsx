'use client';

import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useInspectTemplate } from '@/hooks/useGradeExport';
import type { InspectResponse } from '@/lib/api/grade-export';
import { EMPTY_CHOICE, toPlanBase, type ColumnChoice } from '@/lib/grade-export-view';
import { PreviousExports } from './PreviousExports';
import { StepColumns } from './StepColumns';
import { StepPreview } from './StepPreview';
import { StepUpload } from './StepUpload';
import { WizardStepper } from './WizardStepper';

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
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <WizardStepper step={step} />

      {reinspect.error && (
        <Alert variant="destructive">
          <AlertDescription>{reinspect.error.message}</AlertDescription>
        </Alert>
      )}

      <Card className="p-5 sm:p-6">
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
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 py-2 pl-3 pr-2">
              <div className="flex min-w-0 items-center gap-3">
                <span className="icon-chip h-9 w-9 bg-success-subtle text-success-strong">
                  <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="text-caption text-muted-foreground">File đã tải lên</span>
                  <span className="truncate text-small font-semibold" title={template?.fileName}>
                    {template?.fileName}
                  </span>
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setStep(1)}>
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
      </Card>

      <PreviousExports sessionId={sessionId} />
    </div>
  );
}
