import type { Health } from '../types';
import { Badge, Button, StatusDot } from './ui';

interface SetupNeededProps {
  health: Health;
  checking: boolean;
  onRecheck: () => void;
  onDismiss: () => void;
  onOpenSettings: () => void;
}

export function SetupNeeded({
  health,
  checking,
  onRecheck,
  onDismiss,
  onOpenSettings,
}: SetupNeededProps) {
  const missing = health.checks.filter((check) => check.status === 'missing');
  return (
    <div className="setup-screen">
      <div className="panel" style={{ width: 'min(620px, 100%)' }}>
        <div className="panel-head">
          <div>
            <Badge tone="red">Setup needed</Badge>
            <h2 className="panel-title mt-2">ShortForge is missing {missing.length === 1 ? 'a tool' : `${missing.length} tools`}</h2>
            <p className="panel-sub">
              Fix the items marked <span style={{ color: 'var(--red)' }}>missing</span>, then re-check.
              Rendering is local, so ffmpeg, disk space and (for local TTS) Python are required.
            </p>
          </div>
          <StatusDot status="failed" className="mt-2" />
        </div>
        <div className="panel-body">
          <div>
            {health.checks.map((check) => (
              <div key={check.id} className="check-row">
                <StatusDot
                  status={check.status === 'ok' ? 'done' : check.status === 'warn' ? 'stale' : 'failed'}
                  className="mt-1.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold">{check.label}</span>
                    {check.required ? <Badge tone="neutral">required</Badge> : <Badge tone="teal">optional</Badge>}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    {check.detail}
                  </div>
                  {check.hint ? (
                    <div className="text-xs mt-1" style={{ color: 'var(--muted-2)' }}>
                      {check.hint}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <Button variant="primary" onClick={onRecheck} loading={checking}>
              Re-check
            </Button>
            <Button onClick={onOpenSettings}>Settings</Button>
            <Button variant="ghost" onClick={onDismiss}>
              Continue anyway
            </Button>
          </div>
          <p className="hint">
            The setup check runs again on every server restart. Required: Node 20+, ffmpeg, 3 GB free disk.
          </p>
        </div>
      </div>
    </div>
  );
}
