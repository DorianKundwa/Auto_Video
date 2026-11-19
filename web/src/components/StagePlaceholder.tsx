import type { JobDetail, StageMeta } from '../types';
import { Badge, Button, StatusDot } from './ui';

interface StagePlaceholderProps {
  stage: StageMeta;
  detail: JobDetail | null;
  onGoToStageOne: () => void;
}

export function StagePlaceholder({ stage, detail, onGoToStageOne }: StagePlaceholderProps) {
  const state = detail?.job.stages[String(stage.n)];
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <Badge tone="neutral">Stage {stage.n}</Badge>
            <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>
              <StatusDot status={state?.status ?? 'pending'} />
              {state?.artifact ?? stage.output}
            </span>
          </div>
          <h2 className="panel-title">{stage.name}</h2>
          <p className="panel-sub">{stage.description}</p>
        </div>
        <Badge tone="amber">Not in this build yet</Badge>
      </div>

      <div className="panel-body">
        <div
          className="rounded-xl p-4 text-sm"
          style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border-strong)' }}
        >
          <p style={{ color: 'var(--muted)' }}>
            Stage {stage.n} is scaffolded but its pipeline handler has not been built. Running it returns a
            clear <span className="mono">not_implemented</span> response rather than a half-finished result.
            Earlier stages stay intact, so the job resumes exactly here once this stage lands.
          </p>
          <div className="mt-3 text-xs" style={{ color: 'var(--muted-2)' }}>
            Output file: <span className="mono">jobs/{detail?.job.id ?? '<id>'}/{stage.output}</span>
          </div>
        </div>

        {!detail ? (
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Button variant="primary" onClick={onGoToStageOne}>
              Start with a brief
            </Button>
            <span className="hint" style={{ marginTop: 0 }}>
              Stage 1 creates the job folder every later stage writes into.
            </span>
          </div>
        ) : (
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Button onClick={onGoToStageOne}>Back to brief</Button>
            <span className="hint" style={{ marginTop: 0 }}>
              Current job: <span className="mono">{detail.job.id}</span> · Stage 1{' '}
              {detail.job.stages['1']?.status ?? 'pending'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
