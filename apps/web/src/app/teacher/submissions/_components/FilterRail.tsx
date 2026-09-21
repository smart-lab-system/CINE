'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { AttentionKind } from '@/lib/submission-attention';
import type { FacetOption, FilterState } from '@/lib/submission-filters';
import { EMPTY_FILTERS } from '@/lib/submission-filters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const KIND_DOT: Record<string, string> = {
  'attended-no-submission': 'bg-danger',
  partial: 'bg-warning',
  'never-attended': 'bg-warning/60',
  complete: 'bg-success',
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4 border-t border-border pt-3 first:mt-0 first:border-0 first:pt-0">
      <p className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function FacetRow({
  label, count, active, dot, onClick,
}: { label: string; count: number; active: boolean; dot?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-small transition-colors',
        // Indigo là màu primary của hệ thống. Nền đen cũ đọc như một ô bị
        // vô hiệu hoá chứ không phải một bộ lọc đang bật.
        active
          ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-strong'
          : 'hover:bg-surface-2',
      )}
    >
      {dot && <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden="true" />}
      <span className="truncate">{label}</span>
      <span className="ml-auto tabular-nums opacity-70">{count}</span>
    </button>
  );
}

interface FilterRailProps {
  facets: {
    semesters: FacetOption[];
    kinds: FacetOption[];
    examTypes: FacetOption[];
    rooms: FacetOption[];
    classes: FacetOption[];
    archivedCount: number;
    closedCount: number;
  };
  filters: FilterState;
  onChange: (next: FilterState) => void;
  attentionTotal: number;
}

/**
 * Bảng điều khiển, KHÔNG phải bản sao của danh sách bên phải. Đó là điểm khác
 * biệt so với bản trước — dải "Cần chú ý" cũ lặp lại chính những phiên nằm
 * trong nhóm bên dưới, và giảng viên đọc thành "đếm hai lần". Spec §5.1.
 */
export function FilterRail({ facets, filters, onChange, attentionTotal }: FilterRailProps) {
  const hasActive =
    filters.kinds.length > 0 || filters.complete ||
    filters.examTypes.length > 0 || filters.rooms.length > 0 ||
    filters.classIds.length > 0 ||
    filters.showArchived || !filters.showClosed;

  return (
    <aside className="flex flex-col gap-1 rounded-xl border border-border bg-surface-1 p-3 lg:sticky lg:top-4">
      {/* Ngưỡng là > 0, KHÔNG phải > 1 như `rooms`/`examTypes`. Quy tắc
          "một lựa chọn là nhiễu" đúng cho một thuộc tính của phiên, nhưng
          học kỳ là chiều THỜI GIAN mà giảng viên đang đứng trong đó: ẩn ô
          này khi họ mới dạy một kỳ khiến họ đọc thành "chức năng lọc theo
          học kỳ đã bị gỡ" — chính phản hồi đã dẫn tới thay đổi này
          (2026-09-15). Ô cũng là chỗ duy nhất nói ra rằng trang đang bị
          hẹp về một kỳ, vì học kỳ cố ý không tính vào `hasActive` bên
          dưới và nút "Xoá tất cả bộ lọc" cố ý giữ nó lại. */}
      {facets.semesters.length > 0 && (
        <Section title="Học kỳ">
          <Select
            value={filters.semesterName ?? 'all'}
            onValueChange={(v) => onChange({ ...filters, semesterName: v === 'all' ? null : v })}
          >
            <SelectTrigger aria-label="Lọc theo học kỳ"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả học kỳ</SelectItem>
              {facets.semesters.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Section>
      )}

      <Section title="Cần chú ý">
        <p className="mb-2 flex items-baseline gap-2">
          <span className="text-h2 font-bold text-danger-strong tabular-nums">{attentionTotal}</span>
          <span className="text-caption text-muted-foreground">phiên cần chú ý</span>
        </p>
        {facets.kinds.map((k) => (
          <FacetRow
            key={k.value}
            label={k.label}
            count={k.count}
            dot={KIND_DOT[k.value]}
            active={
              k.value === 'complete'
                ? filters.complete
                : filters.kinds.includes(k.value as AttentionKind)
            }
            onClick={() =>
              k.value === 'complete'
                ? onChange({ ...filters, complete: !filters.complete })
                : onChange({ ...filters, kinds: toggle(filters.kinds, k.value as AttentionKind) })
            }
          />
        ))}
      </Section>

      {facets.classes.length > 0 && (
        <Section title="Lớp">
          {facets.classes.map((k) => (
            <FacetRow
              key={k.value}
              label={k.label}
              count={k.count}
              active={filters.classIds.includes(k.value)}
              onClick={() => onChange({ ...filters, classIds: toggle(filters.classIds, k.value) })}
            />
          ))}
        </Section>
      )}

      {facets.examTypes.length > 0 && (
        <Section title="Loại kỳ thi">
          {facets.examTypes.map((t) => (
            <FacetRow
              key={t.value}
              label={t.label}
              count={t.count}
              active={filters.examTypes.includes(t.value)}
              onClick={() => onChange({ ...filters, examTypes: toggle(filters.examTypes, t.value) })}
            />
          ))}
        </Section>
      )}

      {facets.rooms.length > 0 && (
        <Section title="Phòng thi">
          {facets.rooms.map((r) => (
            <FacetRow
              key={r.value}
              label={r.label}
              count={r.count}
              active={filters.rooms.includes(r.value)}
              onClick={() => onChange({ ...filters, rooms: toggle(filters.rooms, r.value) })}
            />
          ))}
        </Section>
      )}

      <Section title="Trạng thái">
        <FacetRow
          label="Hiện phiên đã khép"
          count={facets.closedCount}
          active={filters.showClosed}
          onClick={() => onChange({ ...filters, showClosed: !filters.showClosed })}
        />
        <FacetRow
          label="Hiện phiên đã lưu trữ"
          count={facets.archivedCount}
          active={filters.showArchived}
          onClick={() => onChange({ ...filters, showArchived: !filters.showArchived })}
        />
      </Section>

      {hasActive && (
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_FILTERS, semesterName: filters.semesterName })}
          className="mt-3 flex items-center gap-1 text-caption text-primary hover:underline"
        >
          <X className="h-3 w-3" aria-hidden="true" />
          Xoá tất cả bộ lọc
        </button>
      )}
    </aside>
  );
}
