'use client';

import { useState } from 'react';
import { useMissingRules, useRules } from '@/hooks/useRules';
import { RuleTable } from './_components/RuleTable';
import { PriceEditDialog } from './_components/PriceEditDialog';
import { MissingRulesPanel } from './_components/MissingRulesPanel';
import type { Rule } from '@/lib/api/rules';

export default function RulesPage() {
  const rules = useRules();
  const missing = useMissingRules();
  const [editing, setEditing] = useState<Rule | null>(null);

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-large font-semibold">Trang kiến thức</h1>
      {missing.data && <MissingRulesPanel rules={missing.data} />}
      {rules.isLoading ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : (
        <RuleTable rules={rules.data ?? []} onEditPrice={setEditing} />
      )}
      <PriceEditDialog rule={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
