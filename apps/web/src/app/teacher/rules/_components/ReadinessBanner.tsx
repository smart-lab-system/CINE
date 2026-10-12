'use client';

import { Check, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RubricErrorItem, RubricOverview } from '@/lib/api/rubric-errors';
import { capNames, copySources, shorten, statusOf, type BoardTask } from '@/lib/rubric-board';
import { CopyFromRubric } from './CopyFromRubric';

const TONE = {
  new: { box: 'border-primary/20 bg-primary-subtle text-primary', icon: 'bg-primary text-primary-foreground', Icon: Info },
  ready: { box: 'border-success/30 bg-success-subtle text-success-strong', icon: 'bg-success text-white', Icon: Check },
  todo: { box: 'border-warning/40 bg-warning-subtle text-warning-strong', icon: 'bg-warning text-foreground', Icon: TriangleAlert },
} as const;

/**
 * Dải trạng thái của rubric đang mở (spec mục 5.3): thay bốn thẻ số cũ. Mỗi dòng việc là MỘT NÚT làm đúng việc đó —
 * kể cả "lỗi AI thấy mà chưa tính điểm", thứ trước đây nằm chôn dưới cuối trang.
 */
export function ReadinessBanner({
  overview,
  overviews,
  errors,
  onAddManually,
  onGoToCriterion,
  onOpenProposals,
  onOpenDangling,
}: {
  overview: RubricOverview;
  overviews: RubricOverview[];
  /** Danh sách lỗi của rubric; chưa tải xong thì `undefined`. */
  errors: RubricErrorItem[] | undefined;
  onAddManually: () => void;
  onGoToCriterion: (criterionKey: string) => void;
  onOpenProposals: () => void;
  onOpenDangling: () => void;
}) {
  const { status, tasks } = statusOf(overview);
  const tone = TONE[status];
  const heading =
    status === 'new' ? 'Rubric mới — chưa có lỗi nào' : status === 'ready' ? 'Sẵn sàng chấm tự động' : `Chưa sẵn sàng chấm tự động — còn ${tasks.length} việc`;

  const row = (task: BoardTask) => {
    switch (task.kind) {
      case 'empty_criteria':
        return (
          <>
            <span>
              <b>{capNames(task.criteria.map((c) => shorten(c.description)), 2, 'tiêu chí')}</b> chưa có lỗi nào.
            </span>
            <button type="button" onClick={() => onGoToCriterion(task.criteria[0].key)}>
              Thêm lỗi
            </button>
          </>
        );
      case 'unpriced': {
        // Cuộn tới tiêu chí có lỗi chưa có điểm trừ đầu tiên; danh sách lỗi chưa về thì tới nhóm đầu tiên.
        const first = errors?.find((e) => e.deduction === null)?.criterionKey ?? overview.criteria[0]?.key;
        return (
          <>
            <span>
              <b>{task.count} lỗi</b> chưa có điểm trừ.
            </span>
            <button type="button" onClick={() => first && onGoToCriterion(first)}>
              Đặt điểm trừ
            </button>
          </>
        );
      }
      case 'proposals':
        return (
          <>
            <span>
              <b>{task.count} lỗi AI thấy</b> khi chấm nhưng chưa có trong bảng — đang bị bỏ ra khỏi điểm.
            </span>
            <button type="button" onClick={onOpenProposals}>
              Xem lỗi AI đề xuất
            </button>
          </>
        );
      case 'dangling':
        return (
          <>
            <span>
              <b>{task.count} lỗi</b> đang gắn vào tiêu chí không còn trong rubric.
            </span>
            <button type="button" onClick={onOpenDangling}>
              Chuyển sang tiêu chí khác
            </button>
          </>
        );
    }
  };

  return (
    <div role="status" className={cn('mt-[18px] flex gap-3.5 rounded-lg border px-4 py-3.5', tone.box)}>
      <div className={cn('grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full', tone.icon)}>
        <tone.Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <h2 className="text-body font-bold">{heading}</h2>
        {status === 'new' && (
          <>
            <p className="mt-0.5 text-small">Khi chưa có lỗi, mọi bài chấm theo rubric này sẽ chuyển sang “Cần bạn xem” thay vì tự duyệt.</p>
            <CopyFromRubric target={overview} sources={copySources(overviews, overview.rubricName)} onAddManually={onAddManually} />
          </>
        )}
        {status === 'ready' && <p className="mt-0.5 text-small">Mọi tiêu chí đều có lỗi và điểm trừ, và AI chưa báo lỗi nào ngoài bảng.</p>}
        {status === 'todo' && (
          <>
            <p className="mt-0.5 text-small">Cho tới khi xong, bài chấm theo rubric này sẽ chuyển sang “Cần bạn xem” thay vì tự duyệt.</p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {tasks.map((task) => (
                <li key={task.kind} className="flex items-center gap-2.5 text-small [&_button]:font-semibold [&_button]:underline [&_button]:underline-offset-2">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                  {row(task)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
