import { useEffect, useRef } from 'react';
import type { StageMeta } from '../types';
import { cx } from '../lib/format';

interface LogDrawerProps {
  stages: StageMeta[];
  jobId: string | null;
  open: boolean;
  onToggle: () => void;
  logStage: number | null;
  onStageChange: (stage: number | null) => void;
  text: string;
  loading: boolean;
}

export function LogDrawer({
  stages,
  jobId,
  open,
  onToggle,
  logStage,
  onStageChange,
  text,
  loading,
}: LogDrawerProps) {
  const pre = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const element = pre.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [text, open, logStage]);

  return (
    <section className="log-drawer">
      <div className="log-bar" onClick={onToggle} role="button" tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onToggle();
        }}
      >
        <span style={{ color: 'var(--muted-2)' }}>{open ? '▾' : '▸'}</span>
        <span className="log-title">Logs</span>
        <div className="flex gap-1 overflow-x-auto" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className={cx('step', logStage === null && 'is-active')}
            onClick={() => onStageChange(null)}
          >
            All
          </button>
          {stages.map((stage) => (
            <button
              key={stage.n}
              type="button"
              className={cx(
                'step',
                logStage === stage.n && 'is-active',
                'max-sm:!px-1.5',
              )}
              onClick={() => onStageChange(stage.n)}
              title={stage.name}
            >
              <span className="step-num">{String(stage.n).padStart(2, '0')}</span>
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11px] mono" style={{ color: 'var(--muted-2)' }}>
          {jobId ? (loading ? 'loading…' : `${text.split('\n').filter(Boolean).length} lines`) : 'no job selected'}
        </span>
        <span className="text-[10px] kbd hidden sm:inline">Ctrl+Enter</span>
      </div>

      {open ? (
        <div className="log-body thin-scroll">
          {jobId ? (
            text.trim() ? (
              <pre ref={pre} className="log-pre">
                {text}
              </pre>
            ) : (
              <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
                No log output yet for {logStage === null ? 'this job' : `Stage ${logStage}`}. Run a stage to
                see prompts, validation retries and cost lines here.
              </p>
            )
          ) : (
            <p className="text-xs" style={{ color: 'var(--muted-2)' }}>
              Select a project to inspect its logs. Every stage writes to jobs/&lt;id&gt;/logs/.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
