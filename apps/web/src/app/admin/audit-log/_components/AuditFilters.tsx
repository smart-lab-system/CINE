'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AUDIT_GROUP_LABELS,
  hasActiveFilters,
  type AuditFilterState,
  type AuditGroup,
} from '@/lib/audit-filters';

export interface ActorOption {
  id: string;
  name: string;
  role: string;
}

interface AuditFiltersProps {
  value: AuditFilterState;
  onChange: (next: AuditFilterState) => void;
  onClear: () => void;
  actors: ActorOption[];
}

const ALL_ACTORS = 'all';

/**
 * Thanh lọc của trang audit log. Điều khiển được (controlled): trang giữ trạng
 * thái để đổi bộ lọc luôn kéo trang về 1 ở đúng một chỗ.
 */
export function AuditFilters({ value, onChange, onClear, actors }: AuditFiltersProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <Select
        value={value.group}
        onValueChange={(next) => onChange({ ...value, group: next as AuditGroup })}
      >
        <SelectTrigger className="lg:w-52" aria-label="Lọc theo nhóm hành động">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(AUDIT_GROUP_LABELS) as AuditGroup[]).map((group) => (
            <SelectItem key={group} value={group}>
              {AUDIT_GROUP_LABELS[group]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.actorId ?? ALL_ACTORS}
        onValueChange={(next) => onChange({ ...value, actorId: next === ALL_ACTORS ? null : next })}
      >
        <SelectTrigger className="lg:w-64" aria-label="Lọc theo người thực hiện">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_ACTORS}>Tất cả người thực hiện</SelectItem>
          {actors.map((actor) => (
            <SelectItem key={actor.id} value={actor.id}>
              {actor.name} · {actor.role === 'admin' ? 'Quản trị viên' : 'Giảng viên'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex flex-col gap-1 text-small text-muted-foreground">
        Từ ngày
        <Input
          type="date"
          aria-label="Từ ngày"
          value={value.fromDay}
          max={value.toDay || undefined}
          onChange={(event) => onChange({ ...value, fromDay: event.target.value })}
          className="lg:w-44"
        />
      </label>
      <label className="flex flex-col gap-1 text-small text-muted-foreground">
        Đến ngày
        <Input
          type="date"
          aria-label="Đến ngày"
          value={value.toDay}
          min={value.fromDay || undefined}
          onChange={(event) => onChange({ ...value, toDay: event.target.value })}
          className="lg:w-44"
        />
      </label>

      {hasActiveFilters(value) && (
        <Button type="button" variant="ghost" onClick={onClear}>
          Xoá bộ lọc
        </Button>
      )}
    </div>
  );
}
