'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { stepIndex, SETUP_STEPS } from './setup-steps';
import type { SetupStepId } from './setup-draft';

/**
 * Ghim thanh bước vào đáy cột nội dung. `sticky` không kéo được thanh từ cuối
 * trang lên khi nội dung còn dài; đo `main` để thanh không đè thanh điều hướng
 * khi thu gọn hay mở rộng.
 */
export function SetupFooter({
  step,
  mutable,
  pending,
  onBack,
  onNext,
  onFinish,
}: {
  step: SetupStepId;
  mutable: boolean;
  pending: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const index = stepIndex(step);
  const last = index === SETUP_STEPS.length - 1;
  const barRef = useRef<HTMLElement>(null);
  const [frame, setFrame] = useState<{ left: number; width: number } | null>(null);
  const [barHeight, setBarHeight] = useState(0);

  useEffect(() => {
    const bar = barRef.current;
    const main = bar?.closest('main');
    if (!bar || !main) return;

    const update = () => {
      const rect = main.getBoundingClientRect();
      setFrame({ left: rect.left, width: rect.width });
      setBarHeight(bar.offsetHeight);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(main);
    observer.observe(bar);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <>
      <div aria-hidden="true" className="shrink-0" style={{ height: barHeight }} />
      <footer
        ref={barRef}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface px-4 py-3 md:px-8"
        style={frame ? { left: frame.left, width: frame.width, right: 'auto' } : undefined}
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" size="lg" disabled={index <= 0 || pending} onClick={onBack}>
            Quay lại
          </Button>
          {!last && (
            <Button type="button" size="lg" disabled={pending} onClick={onNext}>
              Tiếp tục
            </Button>
          )}
          {last && mutable && (
            <Button type="button" size="lg" disabled={pending} onClick={onFinish}>
              Hoàn tất
            </Button>
          )}
        </div>
      </footer>
    </>
  );
}
