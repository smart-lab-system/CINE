/**
 * Nhãn "cần backend" đặt cạnh một nút/dòng mà giao diện đã vẽ nhưng route chưa có — spec §2.1: chỗ nào backend
 * chưa làm thì nói ra, không vẽ một nút trông như chạy được. Luôn đi cùng `disabled` trên chính control đó.
 *
 * Dạng nội tuyến (trong nút, trong dòng). Thẻ góc của ô tổng kết có kiểu riêng (`RuleSummary`).
 */
export function NeedsBackend({ className = '' }: { className?: string }) {
  return (
    <span
      className={`rounded-md border border-dashed border-muted-foreground px-1.5 py-px text-caption font-semibold text-muted-foreground ${className}`}
    >
      cần backend
    </span>
  );
}
