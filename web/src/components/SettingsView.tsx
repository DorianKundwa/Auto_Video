import { useEffect, useState } from 'react';
import type { SettingsResponse, StylePackSummary } from '../types';
import { api } from '../lib/api';
import { formatBytes } from '../lib/format';
import { Badge, Button, Field, SectionTitle, SelectInput, TextInput } from './ui';

interface SettingsViewProps {
  styles: StylePackSummary[];
  onSaved: () => void;
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

interface FormState {
  model: string;
  ttsProvider: string;
  vision: 'on' | 'off';
  defaultStyle: string;
  concurrency: number;
  deepseekApiKey: string;
  searchApiKey: string;
}

const TTS_PROVIDERS = ['kokoro', 'piper', 'elevenlabs'];

export function SettingsView({ styles, onSaved, notify }: SettingsViewProps) {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  async function load() {
    try {
      const response = await api<SettingsResponse>('/api/settings');
      setData(response);
      setForm({
        model: response.settings.model,
        ttsProvider: response.settings.ttsProvider,
        vision: response.settings.vision,
        defaultStyle: response.settings.defaultStyle,
        concurrency: response.settings.concurrency,
        deepseekApiKey: '',
        searchApiKey: '',
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not load settings', 'error');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        model: form.model,
        ttsProvider: form.ttsProvider,
        vision: form.vision,
        defaultStyle: form.defaultStyle,
        concurrency: form.concurrency,
      };
      if (form.deepseekApiKey.trim()) payload.deepseekApiKey = form.deepseekApiKey.trim();
      if (form.searchApiKey.trim()) payload.searchApiKey = form.searchApiKey.trim();

      const response = await api<SettingsResponse & { ok: boolean }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setData(response);
      setForm({
        model: response.settings.model,
        ttsProvider: response.settings.ttsProvider,
        vision: response.settings.vision,
        defaultStyle: response.settings.defaultStyle,
        concurrency: response.settings.concurrency,
        deepseekApiKey: '',
        searchApiKey: '',
      });
      notify('Settings saved. Keys stay on this machine and never reach the browser.', 'success');
      onSaved();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save settings', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function clearSecret(key: 'deepseekApiKey' | 'searchApiKey') {
    setSaving(true);
    try {
      const response = await api<SettingsResponse & { ok: boolean }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ [key]: null }),
      });
      setData(response);
      notify(`${key === 'deepseekApiKey' ? 'DeepSeek' : 'Search'} key cleared from settings.`, 'success');
      onSaved();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not clear key', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function cleanup() {
    setCleaning(true);
    setCleanupResult(null);
    try {
      const result = await api<{ freedBytes: number; removedFiles: number; scannedDirs: string[] }>(
        '/api/system/cleanup',
        { method: 'POST' },
      );
      setCleanupResult(
        result.scannedDirs.length === 0
          ? 'Nothing to clean — no temp folders exist yet.'
          : `Freed ${formatBytes(result.freedBytes)} from ${result.scannedDirs.length} temp folder(s).`,
      );
      notify('Disk cleanup finished.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Cleanup failed', 'error');
    } finally {
      setCleaning(false);
    }
  }

  if (!form || !data) {
    return (
      <section className="panel">
        <div className="panel-body py-10 text-center text-sm" style={{ color: 'var(--muted)' }}>
          Loading settings…
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <Badge tone="neutral">Settings</Badge>
          <h2 className="panel-title mt-2">Models, voice and house defaults</h2>
          <p className="panel-sub">
            Secrets are write-only: the server reports whether a key is set, never its value. Saved to{' '}
            <span className="mono">settings.json</span> (gitignored) and merged over <span className="mono">.env</span>.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {data.config.mockMode ? <Badge tone="teal">mock mode</Badge> : <Badge tone="green">live API</Badge>}
          <Badge tone="neutral">concurrency {data.settings.concurrency}</Badge>
        </div>
      </div>

      <div className="panel-body">
        <SectionTitle>Reasoning (DeepSeek)</SectionTitle>
        <div className="field-grid">
          <Field label="Model" hint="Used for every stage through server/llm.ts.">
            <TextInput
              value={form.model}
              onChange={(event) => setForm({ ...form, model: event.target.value })}
              placeholder="deepseek-chat"
            />
          </Field>
          <Field label="Vision QA" hint="Stage 9 sends frames to the vision model when on.">
            <SelectInput
              value={form.vision}
              onChange={(event) => setForm({ ...form, vision: event.target.value as 'on' | 'off' })}
            >
              <option value="off">off</option>
              <option value="on">on</option>
            </SelectInput>
          </Field>
          <Field
            label="DeepSeek API key"
            hint={
              data.secrets.deepseekApiKey
                ? `A key is set (${data.sources.deepseekApiKey ?? 'unknown source'}). Type to replace it.`
                : 'Not set — mock mode supplies canned responses.'
            }
          >
            <TextInput
              type="password"
              value={form.deepseekApiKey}
              onChange={(event) => setForm({ ...form, deepseekApiKey: event.target.value })}
              placeholder={data.secrets.deepseekApiKey ? '••••••••••••' : 'sk-…'}
              autoComplete="off"
            />
          </Field>
          <Field
            label="Tavily search key"
            hint={
              data.secrets.searchApiKey
                ? `A key is set (${data.sources.searchApiKey ?? 'unknown source'}).`
                : 'Stage 2 research falls back to canned snippets without it.'
            }
          >
            <TextInput
              type="password"
              value={form.searchApiKey}
              onChange={(event) => setForm({ ...form, searchApiKey: event.target.value })}
              placeholder={data.secrets.searchApiKey ? '••••••••••••' : 'tvly-…'}
              autoComplete="off"
            />
          </Field>
        </div>

        {data.secrets.deepseekApiKey || data.secrets.searchApiKey ? (
          <div className="mt-2 flex gap-2 flex-wrap">
            {data.secrets.deepseekApiKey ? (
              <Button size="sm" variant="danger" onClick={() => void clearSecret('deepseekApiKey')}>
                Clear DeepSeek key
              </Button>
            ) : null}
            {data.secrets.searchApiKey ? (
              <Button size="sm" variant="danger" onClick={() => void clearSecret('searchApiKey')}>
                Clear search key
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="divider" />
        <SectionTitle>Production defaults</SectionTitle>
        <div className="field-grid">
          <Field label="TTS provider" hint="Kokoro and Piper run locally (Python required).">
            <SelectInput
              value={form.ttsProvider}
              onChange={(event) => setForm({ ...form, ttsProvider: event.target.value })}
            >
              {TTS_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Default style" hint="Pre-selected in the Stage 1 form.">
            <SelectInput
              value={form.defaultStyle}
              onChange={(event) => setForm({ ...form, defaultStyle: event.target.value })}
            >
              {styles.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Concurrency" hint="Parallel render chunks / TTS workers (1-8).">
            <TextInput
              type="number"
              min={1}
              max={8}
              value={form.concurrency}
              onChange={(event) =>
                setForm({ ...form, concurrency: Number(event.target.value) || 1 })
              }
            />
          </Field>
        </div>

        <div className="divider" />
        <SectionTitle>Disk</SectionTitle>
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={() => void cleanup()} loading={cleaning}>
            Clean temp files
          </Button>
          <span className="hint" style={{ marginTop: 0 }}>
            Removes jobs/*/tmp, frames, render-tmp and chunks only. Job JSON, audio and renders are kept.
          </span>
        </div>
        {cleanupResult ? (
          <div className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
            {cleanupResult}
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[11px] mono" style={{ color: 'var(--muted-2)' }}>
            {data.config.repoRoot}
          </span>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Save settings
          </Button>
        </div>
      </div>
    </section>
  );
}
