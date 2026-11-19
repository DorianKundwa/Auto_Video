import type { Health, JobSummary } from '../types';
import { cx, formatUsd, timeAgo } from '../lib/format';
import { Badge, StatusDot } from './ui';

interface SidebarProps {
  jobs: JobSummary[];
  styleNames: Record<string, string>;
  selectedId: string | null;
  health: Health | null;
  settingsActive: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSettings: () => void;
}

function stageCount(job: JobSummary): number {
  return Object.values(job.stageStatuses).filter((status) => status === 'done').length;
}

export function Sidebar({
  jobs,
  styleNames,
  selectedId,
  health,
  settingsActive,
  onSelect,
  onNew,
  onSettings,
}: SidebarProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="sidebar-head">
        <div className="brand-mark">SF</div>
        <div className="flex-1 min-w-0">
          <div className="brand-name">ShortForge</div>
          <div className="brand-sub">Local animation studio</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onNew} title="New project (Stage 1)">
          + New
        </button>
      </div>

      <div className="sidebar-scroll thin-scroll">
        <div className="sidebar-section-label">
          <span>Projects</span>
          <span className="mono">{jobs.length}</span>
        </div>

        {jobs.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--muted-2)' }}>
            No projects yet. Fill in the brief to create your first short.
          </div>
        ) : (
          jobs.map((job) => {
            const done = stageCount(job);
            const failed = Object.values(job.stageStatuses).some((status) => status === 'failed');
            const running = job.run.status === 'running';
            const status = running
              ? 'running'
              : job.run.status === 'paused'
                ? 'stale'
                : failed
                  ? 'failed'
                  : undefined;
            return (
              <button
                key={job.id}
                type="button"
                className={cx('job-card', selectedId === job.id && 'is-selected')}
                onClick={() => onSelect(job.id)}
              >
                <div className="job-card-top">
                  <StatusDot status={status ?? (done === 10 ? 'done' : 'pending')} className="mt-1.5" />
                  <div className="flex-1 min-w-0">
                    <div className="job-topic">{job.topic}</div>
                    <div className="job-meta">
                      <span>{job.lengthSeconds}s</span>
                      <span>·</span>
                      <span>{job.aspect}</span>
                      <span>·</span>
                      <span>{styleNames[job.styleId] ?? job.styleId}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10.5px] mono" style={{ color: 'var(--muted-2)' }}>
                    {done}/10 stages · {timeAgo(job.updatedAt)}
                  </span>
                  <span className="text-[10.5px] mono" style={{ color: 'var(--muted-2)' }}>
                    {formatUsd(job.cost.usd)}
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${(done / 10) * 100}%` }} />
                </div>
                {job.run.status === 'paused' && job.run.message ? (
                  <div className="mt-2">
                    <Badge tone="amber">Paused</Badge>
                  </div>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      <div className="sidebar-foot">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={health ? (health.ok ? 'done' : 'failed') : 'pending'} />
          <span className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>
            {health ? (health.ok ? 'Setup ready' : 'Setup needed') : 'Checking setup…'}
          </span>
          {health?.config.mockMode ? <Badge tone="teal">mock</Badge> : null}
        </div>
        <button
          className={cx('btn btn-ghost btn-sm', settingsActive && 'text-[var(--accent)]')}
          onClick={onSettings}
          title="Settings"
        >
          Settings
        </button>
      </div>
    </div>
  );
}
