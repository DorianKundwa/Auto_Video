import type { StageMeta, StageStatus } from '../types';
import { cx, STATUS_LABEL, statusClass } from '../lib/format';

interface StepperProps {
  stages: StageMeta[];
  statuses: Record<string, StageStatus>;
  selected: number;
  onChange: (stage: number) => void;
}

export function Stepper({ stages, statuses, selected, onChange }: StepperProps) {
  return (
    <nav className="stepper" aria-label="Pipeline stages">
      {stages.map((stage) => {
        const status = statuses[String(stage.n)] ?? 'pending';
        return (
          <button
            key={stage.n}
            type="button"
            className={cx(
              'step',
              `is-${status}`,
              selected === stage.n && 'is-active',
            )}
            onClick={() => onChange(stage.n)}
            title={`${stage.name} — ${STATUS_LABEL[status] ?? status}${
              stage.implemented ? '' : ' (not built yet)'
            }`}
          >
            <span className={cx('status-dot', statusClass(status))} aria-hidden />
            <span className="step-num">{String(stage.n).padStart(2, '0')}</span>
            <span className="step-name">{stage.short}</span>
          </button>
        );
      })}
    </nav>
  );
}
