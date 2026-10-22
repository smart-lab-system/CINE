'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { SETUP_STEPS } from './setup-steps';
import type { SetupStepId } from './setup-draft';

export function SetupStepper({
  step,
  onStepChange,
  isDirty,
  errorStep,
}: {
  step: SetupStepId;
  onStepChange: (step: SetupStepId) => void;
  isDirty: (step: SetupStepId) => boolean;
  errorStep: SetupStepId | null;
}) {
  const currentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [step]);

  return (
    <nav aria-label="Các bước thiết lập" className="sticky top-0 z-10 overflow-x-auto bg-background/95 py-1 backdrop-blur">
      <ol className="flex w-max min-w-full gap-1">
        {SETUP_STEPS.map((item) => {
          const current = item.id === step;
          const error = errorStep === item.id;
          const dirty = isDirty(item.id);
          const Icon = item.icon;
          return (
            <li key={item.id} className="min-w-max flex-1">
              <button
                type="button"
                aria-current={current ? 'step' : undefined}
                ref={current ? currentRef : undefined}
                onClick={() => onStepChange(item.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border-b-2 px-3 py-3 text-base font-medium transition-[background-color,color,transform] duration-200 ease-smooth active:translate-y-px',
                  error
                    ? 'border-danger text-danger-strong'
                    : current
                      ? 'border-primary bg-primary-subtle text-primary'
                      : 'border-transparent text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'relative grid h-10 w-10 place-items-center rounded-full',
                    error ? 'bg-danger-subtle text-danger-strong' : current ? 'bg-primary-subtle text-primary' : 'bg-surface-2',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {error ? (
                    <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-danger" />
                  ) : dirty ? (
                    <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-warning" />
                  ) : null}
                </span>
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
