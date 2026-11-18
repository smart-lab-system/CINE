import { approachOrdinalLabel } from '@/lib/qs-rubric-form';
import { formatVnPoints } from '@/lib/format';

export interface QsStructureStep {
  key: string;
  description: string;
  maxPoints: number;
}

export interface QsStructureApproach {
  key: string;
  name: string;
  maxPoints: number;
  steps: QsStructureStep[];
}

/** Cấu trúc cách giải → bước (dùng chung Bảng lỗi QS và trang chi tiết). */
export function QsStructurePanels({ approaches }: { approaches: QsStructureApproach[] }) {
  if (approaches.length === 0) {
    return (
      <p className="text-small text-muted-foreground">Chưa có cách giải nào trong rubric này.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {approaches.map((ap, ai) => {
        const ordinal = approachOrdinalLabel(ai);
        const subtitle =
          ap.name.trim() && ap.name.trim() !== ordinal ? ` - ${ap.name.trim()}` : '';
        return (
          <section
            key={ap.key}
            aria-label={`${ordinal}${subtitle}`}
            className="rounded-lg border border-border bg-surface/50 p-3 sm:p-4"
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 px-0.5">
              <h2 className="text-h3 text-foreground">
                {ordinal}
                {subtitle}
              </h2>
              <span className="text-small text-muted-foreground">
                {ap.steps.length} bước · tối đa{' '}
                <b className="text-foreground">{formatVnPoints(ap.maxPoints)}</b> điểm
              </span>
            </div>
            <ol className="flex list-none flex-col gap-2">
              {ap.steps.map((step, si) => (
                <li
                  key={step.key}
                  className="flex gap-3 rounded-md bg-muted/40 px-3 py-2.5"
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-small font-semibold text-primary"
                    aria-hidden
                  >
                    {si + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-caption font-medium text-muted-foreground">
                      Bước {si + 1}
                    </p>
                    <p className="text-body text-foreground">{step.description}</p>
                  </div>
                  <span className="shrink-0 self-center text-small text-muted-foreground">
                    {formatVnPoints(step.maxPoints)} điểm
                  </span>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
