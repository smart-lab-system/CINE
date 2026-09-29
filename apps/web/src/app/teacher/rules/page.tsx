"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRubrics } from "@/hooks/useGrading";
import { useMissingRules, useRules } from "@/hooks/useRules";
import { activeCriteria } from "@/lib/rubric-form";
import {
  countByFilter,
  filterRules,
  type RuleFilter,
} from "@/lib/rules-filter";
import type { Rule } from "@/lib/api/rules";
import { CeilingCard } from "./_components/CeilingCard";
import { MissingRulesPanel } from "./_components/MissingRulesPanel";
import { PriceSheet } from "./_components/PriceSheet";
import { RuleSummary } from "./_components/RuleSummary";
import { RuleTable } from "./_components/RuleTable";
import { RuleToolbar } from "./_components/RuleToolbar";

/**
 * Bảng lỗi (spec UI §3.1) — nơi giảng viên nhập "kiến thức" của mình cho AI: mỗi dòng là một lỗi và
 * mức trừ của nó. Agent chỉ kết luận lỗi có mặt hay không; mức trừ luôn lấy từ đây.
 */
export default function RulesPage() {
  const rules = useRules();
  const missing = useMissingRules();
  const rubrics = useRubrics();
  const [editing, setEditing] = useState<Rule | null>(null);
  const [filter, setFilter] = useState<RuleFilter>("all");
  const [query, setQuery] = useState("");

  const all = useMemo(() => rules.data ?? [], [rules.data]);
  const visible = useMemo(
    () => filterRules(all, filter, query),
    [all, filter, query],
  );
  const counts = useMemo(() => countByFilter(all), [all]);

  // Trần của tiêu chí mà luật đang đặt giá trỏ vào — chỉ để nói cho giảng viên biết; không tìm thấy thì không nói.
  const criteria = useMemo(() => activeCriteria(rubrics.data), [rubrics.data]);
  const criterion = editing
    ? criteria.find((c) => c.key === editing.revision.criterionKey)
    : undefined;
  const ceiling = criterion
    ? { label: criterion.description, max: criterion.max }
    : undefined;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Bảng lỗi"
        description="Mỗi dòng là một lỗi và mức trừ của nó. Agent chỉ kết luận lỗi có mặt hay không — mức trừ luôn lấy từ đây. Sửa một dòng là mọi bài dính lỗi đó được tính lại."
        actions={
          <Button asChild>
            <Link href="/teacher/rules/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Thêm luật
            </Link>
          </Button>
        }
      />

      <RuleSummary rules={all} missingCount={missing.data?.length ?? 0} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section
          aria-label="Danh sách luật"
          className="flex min-w-0 flex-col gap-4"
        >
          <RuleToolbar
            filter={filter}
            onFilter={setFilter}
            counts={counts}
            query={query}
            onQuery={setQuery}
          />

          {rules.isLoading ? (
            <div className="flex flex-col gap-2">
              <p className="text-small text-muted-foreground">Đang tải…</p>
              <Skeleton className="h-40 w-full" />
            </div>
          ) : rules.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Không tải được Bảng lỗi — {rules.error?.message}. Thử tải lại
                trang.
              </AlertDescription>
            </Alert>
          ) : all.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-small text-muted-foreground">
              Chưa có luật nào trong bảng. Bấm &quot;Thêm luật&quot; để tạo luật
              đầu tiên.
            </p>
          ) : visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-small text-muted-foreground">
              Không có luật nào ở bộ lọc này. Chọn &quot;Tất cả&quot; để xem
              toàn bộ bảng.
            </p>
          ) : (
            <RuleTable rules={visible} onEditPrice={setEditing} />
          )}

          {missing.data && <MissingRulesPanel rules={missing.data} />}
        </section>

        <aside aria-label="Trần điểm" className="flex flex-col gap-4">
          <CeilingCard />
        </aside>
      </div>

      <PriceSheet
        rule={editing}
        onClose={() => setEditing(null)}
        ceiling={ceiling}
      />
    </div>
  );
}
