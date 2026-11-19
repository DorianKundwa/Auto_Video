import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BriefDraft,
  BusEvent,
  Health,
  JobDetail,
  JobSummary,
  Meta,
  StageMeta,
  StageStatus,
  StylePackSummary,
} from './types';
import { api } from './lib/api';
import { useEventStream } from './lib/useEventStream';
import { cx, formatTokens, formatUsd } from './lib/format';
import { Sidebar } from './components/Sidebar';
import { Stepper } from './components/Stepper';
import { StageOne } from './components/StageOne';
import { StagePlaceholder } from './components/StagePlaceholder';
import { LogDrawer } from './components/LogDrawer';
import { SettingsView } from './components/SettingsView';
import { SetupNeeded } from './components/SetupNeeded';
import { Badge, Button } from './components/ui';

type ToastTone = 'info' | 'success' | 'error';
interface Toast {
  message: string;
  tone: ToastTone;
}

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [styles, setStyles] = useState<StylePackSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [stage, setStage] = useState(1);
  const [view, setView] = useState<'pipeline' | 'settings'>('pipeline');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logText, setLogText] = useState('');
  const [logStage, setLogStage] = useState<number | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pauseAfter, setPauseAfter] = useState<number[]>([3, 5]);
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(
    () => window.localStorage.getItem('shortforge.setup.dismissed') === '1',
  );

  const openStageFor = useCallback((summary: JobSummary, stages: StageMeta[]) => {
    const current = Math.min(Math.max(summary.currentStage, 1), 10);
    const target = stages.find((entry) => entry.n === current);
    return target?.implemented ? current : 1;
  }, []);

  const toastTimer = useRef<number | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const selectedRef = useRef<string | null>(null);
  const logStageRef = useRef<number | null>(null);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    logStageRef.current = logStage;
  }, [logStage]);

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ message, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, []);

  const refreshJobs = useCallback(async () => {
    const response = await api<{ jobs: JobSummary[] }>('/api/jobs');
    setJobs(response.jobs);
  }, []);

  const refreshDetail = useCallback(async (id: string) => {
    const response = await api<JobDetail>(`/api/jobs/${id}`);
    setDetail(response);
  }, []);

  const refreshHealth = useCallback(async () => {
    const response = await api<Health>('/api/system/health');
    setHealth(response);
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      void refreshJobs().catch(() => undefined);
      const id = selectedRef.current;
      if (id) void refreshDetail(id).catch(() => undefined);
    }, 160);
  }, [refreshJobs, refreshDetail]);

  useEventStream((event: BusEvent) => {
    if (event.type === 'log') {
      const payload = event.payload as { stage?: number; line?: string } | undefined;
      if (event.jobId && event.jobId === selectedRef.current && payload?.line) {
        const filter = logStageRef.current;
        if (filter === null || filter === payload.stage) {
          setLogText((prev) => `${prev}${payload.line}\n`);
        }
      }
      return;
    }
    if (
      event.type === 'job.created' ||
      event.type === 'job.updated' ||
      event.type === 'stage.status' ||
      event.type === 'run.state'
    ) {
      scheduleRefresh();
    }
    if (event.type === 'system') {
      void refreshHealth().catch(() => undefined);
    }
  });

  // Initial load -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [metaRes, healthRes, stylesRes, jobsRes] = await Promise.all([
          api<Meta>('/api/meta'),
          api<Health>('/api/system/health'),
          api<{ styles: StylePackSummary[] }>('/api/styles'),
          api<{ jobs: JobSummary[] }>('/api/jobs'),
        ]);
        if (cancelled) return;
        setMeta(metaRes);
        setHealth(healthRes);
        setStyles(stylesRes.styles);
        setJobs(jobsRes.jobs);
        const first = jobsRes.jobs[0];
        if (first) {
          setSelectedId(first.id);
          setStage(openStageFor(first, metaRes.stages));
        }
      } catch (error) {
        if (!cancelled) notify(error instanceof Error ? error.message : 'Could not reach the server', 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify, openStageFor]);

  // Detail fetch ------------------------------------------------------------
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await api<JobDetail>(`/api/jobs/${selectedId}`);
        if (!cancelled) setDetail(response);
      } catch (error) {
        if (!cancelled) {
          notify(error instanceof Error ? error.message : 'Could not load the job', 'error');
          setDetail(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, notify]);

  // Logs -------------------------------------------------------------------
  useEffect(() => {
    if (!selectedId) {
      setLogText('');
      return undefined;
    }
    if (!logOpen) return undefined;
    let cancelled = false;
    setLogsLoading(true);
    const query = logStage === null ? '' : `?stage=${logStage}`;
    void api<{ text: string }>(`/api/jobs/${selectedId}/logs${query}`)
      .then((response) => {
        if (!cancelled) setLogText(response.text);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, logStage, logOpen]);

  // Actions ----------------------------------------------------------------
  const handleCreate = useCallback(
    async (draft: BriefDraft) => {
      setActionPending(true);
      try {
        const created = await api<JobDetail>('/api/jobs', {
          method: 'POST',
          body: JSON.stringify(draft),
        });
        setDetail(created);
        setSelectedId(created.job.id);
        setStage(1);
        setView('pipeline');
        notify('Job created — brief.json validated and Stage 1 is done.', 'success');
        await refreshJobs();
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not create the job', 'error');
      } finally {
        setActionPending(false);
      }
    },
    [notify, refreshJobs],
  );

  const handleSaveBrief = useCallback(
    async (draft: BriefDraft) => {
      if (!selectedId) return;
      setActionPending(true);
      try {
        const updated = await api<JobDetail>(`/api/jobs/${selectedId}/brief`, {
          method: 'PUT',
          body: JSON.stringify(draft),
        });
        setDetail(updated);
        notify('Brief saved. Downstream stages are marked stale.', 'success');
        await refreshJobs();
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Could not save the brief', 'error');
      } finally {
        setActionPending(false);
      }
    },
    [selectedId, notify, refreshJobs],
  );

  const runSpecificStage = useCallback(
    async (target: number) => {
      if (!selectedId) {
        notify('Create a job first — Stage 1 writes the folder every other stage reads.', 'error');
        return;
      }
      const stageMeta = meta?.stages.find((entry) => entry.n === target);
      if (stageMeta && !stageMeta.implemented) {
        notify(`Stage ${target} (${stageMeta.name}) is not implemented in this build yet.`, 'error');
        return;
      }
      setActionPending(true);
      try {
        await api(`/api/jobs/${selectedId}/stages/${target}/run`, { method: 'POST' });
      } catch (error) {
        notify(error instanceof Error ? error.message : `Stage ${target} could not start`, 'error');
      } finally {
        setActionPending(false);
      }
    },
    [selectedId, meta, notify],
  );

  const runAll = useCallback(async () => {
    if (!selectedId) {
      notify('Create a job before running the pipeline.', 'error');
      return;
    }
    setActionPending(true);
    try {
      await api(`/api/jobs/${selectedId}/run`, {
        method: 'POST',
        body: JSON.stringify({ pauseAfter }),
      });
      notify('Run started. It stops at the first unimplemented stage and pauses after 3 and 5 when enabled.', 'info');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not start the run', 'error');
    } finally {
      setActionPending(false);
      setRunMenuOpen(false);
    }
  }, [selectedId, pauseAfter, notify]);

  const cancelRun = useCallback(async () => {
    if (!selectedId) return;
    try {
      await api(`/api/jobs/${selectedId}/cancel`, { method: 'POST' });
      notify('Cancelling…', 'info');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not cancel', 'error');
    }
  }, [selectedId, notify]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setView('pipeline');
      setSidebarOpen(false);
      const summary = jobs.find((job) => job.id === id);
      if (summary && meta) setStage(openStageFor(summary, meta.stages));
    },
    [jobs, meta, openStageFor],
  );

  const handleNew = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setStage(1);
    setView('pipeline');
    setSidebarOpen(false);
    setLogText('');
  }, []);

  const handleSettings = useCallback(() => {
    setView('settings');
    setSidebarOpen(false);
  }, []);

  const togglePause = (n: number) => {
    setPauseAfter((prev) => (prev.includes(n) ? prev.filter((value) => value !== n) : [...prev, n]));
  };

  // Keyboard shortcuts ------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (view === 'pipeline') void runSpecificStage(stage);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, stage, runSpecificStage]);

  // Derived ----------------------------------------------------------------
  const stageStatuses = useMemo(() => {
    const entries = Object.entries(detail?.job.stages ?? {});
    return Object.fromEntries(entries.map(([key, state]) => [key, state.status])) as Record<
      string,
      StageStatus
    >;
  }, [detail]);

  const styleNames = useMemo(
    () => Object.fromEntries(styles.map((style) => [style.id, style.name])),
    [styles],
  );

  const voices = useMemo(() => {
    const provider = health?.config.ttsProvider ?? 'kokoro';
    return meta?.voices[provider] ?? [];
  }, [meta, health]);

  const currentStageMeta: StageMeta | undefined = meta?.stages.find((entry) => entry.n === stage);
  const runStatus = detail?.job.run.status ?? 'idle';
  const stageRunning =
    runStatus === 'running' || detail?.job.stages[String(stage)]?.status === 'running';
  const showSetup = Boolean(health && !health.ok && !setupDismissed);
  const cost = detail?.job.cost;
  const toolbarDisabled = !detail || actionPending;

  if (!meta) {
    return (
      <div className="h-screen grid place-items-center">
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--muted)' }}>
          <span className="spinner" /> Connecting to the ShortForge server…
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close project list"
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside className={cx('sidebar', sidebarOpen && 'is-open')}>
        <Sidebar
          jobs={jobs}
          styleNames={styleNames}
          selectedId={selectedId}
          health={health}
          settingsActive={view === 'settings'}
          onSelect={handleSelect}
          onNew={handleNew}
          onSettings={handleSettings}
        />
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-ghost btn-icon lg:hidden"
            aria-label="Open project list"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>

          <Stepper
            stages={meta.stages}
            statuses={stageStatuses}
            selected={stage}
            onChange={(n) => {
              setStage(n);
              setView('pipeline');
            }}
          />

          <div className="flex items-center gap-2 shrink-0">
            <span className="cost-chip" title="DeepSeek tokens and estimated cost for this job">
              <span>{cost ? formatTokens(cost.inputTokens + cost.outputTokens) : '0'} tok</span>
              <span style={{ color: 'var(--border-strong)' }}>|</span>
              <strong>{formatUsd(cost?.usd ?? 0)}</strong>
            </span>

            {runStatus === 'running' ? (
              <Button variant="danger" onClick={() => void cancelRun()} size="sm">
                Stop
              </Button>
            ) : null}

            <div className="relative">
              <Button
                variant="primary"
                onClick={() => void runAll()}
                disabled={toolbarDisabled}
                size="sm"
              >
                Run all
              </Button>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label="Run options"
                onClick={() => setRunMenuOpen((open) => !open)}
              >
                ▾
              </button>
              {runMenuOpen ? (
                <div className="run-menu">
                  <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--muted-2)' }}>
                    Pause for review
                  </div>
                  <label className="check-line">
                    <input
                      type="checkbox"
                      checked={pauseAfter.includes(3)}
                      onChange={() => togglePause(3)}
                    />
                    After Stage 3 · Script
                  </label>
                  <label className="check-line">
                    <input
                      type="checkbox"
                      checked={pauseAfter.includes(5)}
                      onChange={() => togglePause(5)}
                    />
                    After Stage 5 · Shots
                  </label>
                  <div className="divider" style={{ margin: '10px 0' }} />
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted-2)' }}>
                    The run stops at the first unimplemented stage; finished work is always kept.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => void runAll()}
                    disabled={!detail || actionPending}
                  >
                    Start run
                  </Button>
                </div>
              ) : null}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSettings}
              title="Settings"
              aria-label="Settings"
            >
              ⚙
            </Button>
          </div>
        </header>

        <main className="content thin-scroll">
          <div className="content-inner">
            {view === 'settings' ? (
              <SettingsView
                styles={styles}
                notify={notify}
                onSaved={() => {
                  void refreshHealth().catch(() => undefined);
                }}
              />
            ) : stage === 1 ? (
              <StageOne
                detail={detail}
                styles={styles}
                voices={voices}
                defaultStyle={health?.config.defaultStyle ?? 'soft-3d'}
                defaultVoice={health?.config.defaultVoice ?? voices[0]?.id ?? 'af_heart'}
                pending={actionPending}
                running={stageRunning}
                onCreate={handleCreate}
                onSave={handleSaveBrief}
                onRunStage={() => runSpecificStage(1)}
              />
            ) : currentStageMeta ? (
              <StagePlaceholder
                stage={currentStageMeta}
                detail={detail}
                onGoToStageOne={() => setStage(1)}
              />
            ) : null}

            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap text-[11px]" style={{ color: 'var(--muted-2)' }}>
              <span>
                {detail ? (
                  <>
                    Job <span className="mono">{detail.job.id}</span> · run {runStatus}
                    {detail.job.run.message ? ` · ${detail.job.run.message}` : ''}
                  </>
                ) : (
                  'New project — nothing written yet'
                )}
              </span>
              <span>
                <span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> runs the selected stage
              </span>
            </div>
          </div>
        </main>

        <LogDrawer
          stages={meta.stages}
          jobId={selectedId}
          open={logOpen}
          onToggle={() => setLogOpen((open) => !open)}
          logStage={logStage}
          onStageChange={setLogStage}
          text={logText}
          loading={logsLoading}
        />
      </div>

      {showSetup && health ? (
        <SetupNeeded
          health={health}
          checking={checkingSetup}
          onRecheck={() => {
            setCheckingSetup(true);
            void refreshHealth().finally(() => setCheckingSetup(false));
          }}
          onDismiss={() => {
            setSetupDismissed(true);
            window.localStorage.setItem('shortforge.setup.dismissed', '1');
          }}
          onOpenSettings={() => {
            setSetupDismissed(true);
            window.localStorage.setItem('shortforge.setup.dismissed', '1');
            setView('settings');
          }}
        />
      ) : null}

      {toast ? (
        <div
          className={cx('toast', toast.tone === 'error' && 'is-error', toast.tone === 'success' && 'is-success')}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}

      {health && !health.config.deepseekKeyConfigured && !health.config.mockMode ? (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40">
          <Badge tone="red">No DeepSeek key and mock mode is off</Badge>
        </div>
      ) : null}
    </div>
  );
}
