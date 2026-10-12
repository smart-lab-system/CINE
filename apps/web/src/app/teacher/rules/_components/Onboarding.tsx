import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STEPS = [
  { title: 'Tạo rubric', text: 'Đặt tên, ghi các tiêu chí và điểm tối đa của từng tiêu chí.' },
  { title: 'Thêm lỗi cho từng tiêu chí', text: 'Mỗi lỗi có điểm trừ riêng; chọn cách phát hiện: chạy test hay để AI đọc bài.' },
  { title: 'Gắn rubric vào phiên thi', text: 'Ở bước Tạo phiên thi, hoặc trong trang Chấm điểm.' },
];

const TREE = [
  'Rubric — một kỳ thi, 10,0 điểm',
  '  └ Tiêu chí — Tính đúng đắn, tối đa 6,0',
  '      └ Lỗi — Sai trường hợp biên, trừ 1,5',
  '      └ Lỗi — Sai trường hợp cơ bản, trừ 1,5',
  '  └ Tiêu chí — Quản lý bộ nhớ, tối đa 2,0',
  '      └ Lỗi — Rò rỉ bộ nhớ, trừ 1,0',
];

/** Màn hình lần đầu (chưa có rubric nào): dạy cây Rubric → Tiêu chí → Lỗi và thứ tự việc, thay cho ngõ cụt cũ. */
export function Onboarding({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-1.5 grid gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-h2">Bắt đầu với một rubric</h2>
        <p className="mt-1.5 text-muted-foreground">Bạn chưa có rubric nào. Rubric là bảng thang điểm của một kỳ thi. Làm lần lượt ba việc:</p>
        <ol className="my-[18px] flex flex-col gap-3.5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3.5">
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-small font-bold',
                  i === 0 ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground',
                )}
              >
                {i + 1}
              </span>
              <div>
                <b className="block">{s.title}</b>
                <span className="text-small text-muted-foreground">{s.text}</span>
              </div>
            </li>
          ))}
        </ol>
        <Button type="button" variant="primary" onClick={onCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tạo rubric đầu tiên
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h3 className="text-h3">Cách các phần ghép lại</h3>
        <p className="mt-1 text-muted-foreground">Bài chấm được trừ điểm theo cây này, từ trên xuống.</p>
        <div className="mt-3.5 whitespace-pre rounded-lg bg-surface-2 p-4 font-mono text-small leading-8" aria-label="Ví dụ cây rubric" role="img">
          {TREE.join('\n')}
        </div>
        <p className="mt-3 text-small text-muted-foreground">Một lỗi có thể dùng ở nhiều rubric, mỗi rubric có điểm trừ riêng.</p>
      </div>
    </div>
  );
}
