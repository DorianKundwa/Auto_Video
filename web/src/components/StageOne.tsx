import { useRef, useState } from 'react';
import type {
  BriefDraft,
  JobDetail,
  StylePackSummary,
  Tone,
  VoiceOption,
} from '../types';
import { cx } from '../lib/format';
import { StylePicker } from './StylePicker';
import {
  Badge,
  Button,
  Field,
  SectionTitle,
  SelectInput,
  StatusDot,
  TextArea,
  TextInput,
} from './ui';

const TONES: Tone[] = ['deadpan', 'dramatic', 'funny', 'educational'];
const LENGTHS = [30, 60, 90] as const;
const ASPECTS = ['9:16', '16:9'] as const;
const MAX_REFS = 6;

interface RefUpload {
  name: string;
  mimeType: string;
  dataBase64: string;
  preview: string;
}

interface DraftForm {
  topic: string;
  audience: string;
  tone: Tone;
  lengthSeconds: 30 | 60 | 90;
  language: string;
  styleId: string;
  voice: string;
  aspect: '9:16' | '16:9';
  ownStory: string;
  refs: RefUpload[];
}

interface StageOneProps {
  detail: JobDetail | null;
  styles: StylePackSummary[];
  voices: VoiceOption[];
  defaultStyle: string;
  defaultVoice: string;
  pending: boolean;
  onCreate: (draft: BriefDraft) => Promise<void>;
  onSave: (draft: BriefDraft) => Promise<void>;
  onRunStage: () => Promise<void>;
  running: boolean;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function emptyForm(defaultStyle: string, defaultVoice: string): DraftForm {
  return {
    topic: '',
    audience: '',
    tone: 'educational',
    lengthSeconds: 60,
    language: 'English',
    styleId: defaultStyle,
    voice: defaultVoice,
    aspect: '9:16',
    ownStory: '',
    refs: [],
  };
}

function formFromBrief(detail: JobDetail, defaultStyle: string, defaultVoice: string): DraftForm {
  const brief = detail.job.brief;
  if (!brief) return emptyForm(defaultStyle, defaultVoice);
  return {
    topic: brief.topic,
    audience: brief.audience,
    tone: brief.tone,
    lengthSeconds: brief.lengthSeconds,
    language: brief.language,
    styleId: brief.styleId,
    voice: brief.voice,
    aspect: brief.aspect,
    ownStory: brief.ownStory ?? '',
    refs: [],
  };
}

export function StageOne({
  detail,
  styles,
  voices,
  defaultStyle,
  defaultVoice,
  pending,
  onCreate,
  onSave,
  onRunStage,
  running,
}: StageOneProps) {
  const [form, setForm] = useState<DraftForm>(() => emptyForm(defaultStyle, defaultVoice));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const detailKey = detail?.job.id ?? 'new';
  const [formKey, setFormKey] = useState(detailKey);

  // A fresh form session starts only when the job changes. Default style/voice
  // may arrive after mount (health or settings load), so they are read here but
  // are not part of the condition: a late default must never reset typed input.
  if (formKey !== detailKey) {
    setFormKey(detailKey);
    setEditing(false);
    setError(null);
    setForm(
      detail ? formFromBrief(detail, defaultStyle, defaultVoice) : emptyForm(defaultStyle, defaultVoice),
    );
  }

  const update = (patch: Partial<DraftForm>) => setForm((prev) => ({ ...prev, ...patch }));

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const remaining = MAX_REFS - form.refs.length;
    const picked = Array.from(files).slice(0, remaining);
    const uploads: RefUpload[] = [];
    for (const file of picked) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        setError(`${file.name}: use PNG, JPEG or WebP.`);
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        setError(`${file.name}: images must be under 8 MB.`);
        continue;
      }
      const dataUrl = await readAsDataUrl(file);
      uploads.push({
        name: file.name,
        mimeType: file.type,
        dataBase64: dataUrl.split(',')[1] ?? '',
        preview: dataUrl,
      });
    }
    update({ refs: [...form.refs, ...uploads] });
    if (fileInput.current) fileInput.current.value = '';
  }

  function buildDraft(): BriefDraft | null {
    const topic = form.topic.trim();
    if (topic.length < 3 || form.audience.trim().length < 2 || form.language.trim().length < 2) {
      setError('Topic needs 3+ characters, plus a short audience and a language.');
      return null;
    }
    if (!form.styleId) {
      setError('Choose a visual style.');
      return null;
    }
    if (!form.voice) {
      setError('Choose a voice.');
      return null;
    }

    return {
      topic,
      audience: form.audience.trim(),
      tone: form.tone,
      lengthSeconds: form.lengthSeconds,
      language: form.language.trim(),
      styleId: form.styleId,
      voice: form.voice,
      aspect: form.aspect,
      ownStory: form.ownStory.trim() ? form.ownStory.trim() : undefined,
      referenceImages: form.refs.map(({ name, mimeType, dataBase64 }) => ({
        name,
        mimeType,
        dataBase64,
      })),
    };
  }

  async function submit() {
    const draft = buildDraft();
    if (!draft) return;
    setError(null);
    if (detail) {
      await onSave(draft);
      setEditing(false);
    } else {
      await onCreate(draft);
    }
  }

  const budgetWords = Math.round(form.lengthSeconds * 2.5);
  const brief = detail?.job.brief ?? null;
  const styleName = (id: string) => styles.find((style) => style.id === id)?.name ?? id;

  // ------------------------------------------------------------------ summary
  if (detail && brief && !editing) {
    const stageState = detail.job.stages['1'];
    const savedStyle = styles.find((style) => style.id === brief.styleId);
    return (
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <Badge tone="accent">Stage 1</Badge>
              <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>
                <StatusDot status={stageState?.status} /> {stageState?.artifact ?? 'brief.json'}
              </span>
            </div>
            <h2 className="panel-title">{brief.topic}</h2>
            <p className="panel-sub">
              Saved brief. {budgetSummary(detail)} Editing this brief marks downstream stages stale so you
              can re-run them deliberately.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={() => setEditing(true)} disabled={pending}>
              Edit brief
            </Button>
            <Button variant="primary" onClick={() => void onRunStage()} loading={running} disabled={pending}>
              Re-run Stage 1
            </Button>
          </div>
        </div>

        <div className="panel-body">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryField label="Audience" value={brief.audience} />
            <SummaryField label="Tone" value={brief.tone} />
            <SummaryField label="Length" value={`${brief.lengthSeconds}s`} />
            <SummaryField label="Language" value={brief.language} />
            <SummaryField label="Aspect" value={brief.aspect} />
            <SummaryField
              label="Voice"
              value={voices.find((voice) => voice.id === brief.voice)?.label ?? brief.voice}
            />
            <SummaryField label="Style" value={styleName(brief.styleId)} />
            <SummaryField label="Narration budget" value={`${brief.targetWords} words`} />
          </div>

          {savedStyle ? (
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              {savedStyle.previewUrl ? (
                <img
                  src={savedStyle.previewUrl}
                  alt=""
                  style={{ width: 44, height: 78, borderRadius: 6, objectFit: 'cover' }}
                />
              ) : null}
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                {savedStyle.name} · {savedStyle.description}
              </div>
              {savedStyle.stageReady ? (
                <Badge tone="green">Renderer ready</Badge>
              ) : (
                <Badge tone="neutral">Renderer stub</Badge>
              )}
            </div>
          ) : null}

          {(brief.ownStory || brief.referenceImages.length > 0) ? (
            <>
              <div className="divider" />
              <div className="grid md:grid-cols-2 gap-4">
                {brief.ownStory ? (
                  <div>
                    <SectionTitle>Your story notes</SectionTitle>
                    <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--muted)' }}>
                      {brief.ownStory}
                    </p>
                  </div>
                ) : null}
                {brief.referenceImages.length > 0 ? (
                  <div>
                    <SectionTitle>Reference images</SectionTitle>
                    <div className="flex gap-2 flex-wrap">
                      {brief.referenceImages.map((name) => (
                        <img
                          key={name}
                          className="ref-thumb"
                          src={`/api/jobs/${detail.job.id}/refs/${name}`}
                          alt={name}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="divider" />
          <div className="flex items-center justify-between gap-3 flex-wrap text-xs" style={{ color: 'var(--muted-2)' }}>
            <span>
              Job folder <span className="mono">jobs/{detail.job.id}/</span> · files:{' '}
              <span className="mono">{detail.files.length > 0 ? detail.files.join(', ') : 'none'}</span>
            </span>
            <span>
              Stage 1 done · next: Research + fact check <span className="kbd">Ctrl</span>{' '}
              <span className="kbd">Enter</span> runs the selected stage
            </span>
          </div>
        </div>
      </section>
    );
  }

  // --------------------------------------------------------------------- form
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <Badge tone="accent">Stage 1</Badge>
            <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
              brief.json
            </span>
          </div>
          <h2 className="panel-title">{detail ? 'Edit brief' : 'Turn a topic into a short'}</h2>
          <p className="panel-sub">
            This is the only stage that runs without a model: the brief is validated and written to a
            resumable job folder. Everything downstream reads from it.
          </p>
        </div>
        {detail ? (
          <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>

      <div className="panel-body">
        <SectionTitle>The idea</SectionTitle>
        <div className="stack grid gap-3.5">
          <Field
            label="Topic"
            hint="One specific idea beats a broad subject — e.g. 'Why honeybees dance to give directions'."
          >
            <TextInput
              value={form.topic}
              onChange={(event) => update({ topic: event.target.value })}
              placeholder="What is this short about?"
              maxLength={200}
            />
          </Field>

          <div className="field-grid">
            <Field label="Audience" hint="Who should understand it?">
              <TextInput
                value={form.audience}
                onChange={(event) => update({ audience: event.target.value })}
                placeholder="curious adults, no science background"
                maxLength={120}
              />
            </Field>
            <Field label="Language">
              <TextInput
                value={form.language}
                onChange={(event) => update({ language: event.target.value })}
                placeholder="English"
                maxLength={40}
              />
            </Field>
          </div>
        </div>

        <div className="divider" />
        <SectionTitle>Shape</SectionTitle>
        <div className="grid gap-4">
          <div>
            <span className="label">Tone</span>
            <div className="pill-row">
              {TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  className={cx('pill', form.tone === tone && 'is-active')}
                  onClick={() => update({ tone })}
                >
                  {tone}
                </button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <span className="label">Length</span>
              <div className="pill-row">
                {LENGTHS.map((length) => (
                  <button
                    key={length}
                    type="button"
                    className={cx('pill', form.lengthSeconds === length && 'is-active')}
                    onClick={() => update({ lengthSeconds: length })}
                  >
                    {length}s
                  </button>
                ))}
              </div>
              <span className="hint">≈ {budgetWords} spoken words at 2.5 words/sec</span>
            </div>
            <div>
              <span className="label">Aspect</span>
              <div className="pill-row">
                {ASPECTS.map((aspect) => (
                  <button
                    key={aspect}
                    type="button"
                    className={cx('pill', form.aspect === aspect && 'is-active')}
                    onClick={() => update({ aspect })}
                  >
                    {aspect}
                  </button>
                ))}
              </div>
              <span className="hint">9:16 for Shorts/Reels, 16:9 for landscape</span>
            </div>
          </div>
        </div>

        <div className="divider" />
        <SectionTitle
          right={
            <span className="text-[11px]" style={{ color: 'var(--muted-2)' }}>
              Soft 3D is fully implemented; other packs are interface stubs
            </span>
          }
        >
          Visual style
        </SectionTitle>
        <StylePicker styles={styles} value={form.styleId} onChange={(styleId) => update({ styleId })} />

        <div className="divider" />
        <div className="field-grid">
          <Field
            label="Voice"
            hint="Samples and per-beat re-recording arrive with Stage 6."
          >
            <SelectInput value={form.voice} onChange={(event) => update({ voice: event.target.value })}>
              {voices.some((voice) => voice.id === form.voice) ? null : (
                <option value={form.voice}>{form.voice}</option>
              )}
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label} ({voice.language})
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>

        <div className="divider" />
        <SectionTitle>Optional</SectionTitle>
        <div className="grid gap-3.5">
          <Field
            label="Your own story"
            hint="Leave blank to let Stage 3 write from the topic. If provided, the script must follow your beats."
          >
            <TextArea
              value={form.ownStory}
              onChange={(event) => update({ ownStory: event.target.value })}
              placeholder="Optional: paste a story, a script, or the beats you already have."
              maxLength={8000}
              rows={4}
            />
          </Field>

          <div>
            <span className="label">Reference images</span>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(event) => void handleFiles(event.target.files)}
              />
              <Button
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={form.refs.length >= MAX_REFS}
              >
                Add image
              </Button>
              <span className="hint" style={{ marginTop: 0 }}>
                {form.refs.length}/{MAX_REFS} · PNG/JPEG/WebP up to 8 MB
              </span>
            </div>
            {form.refs.length > 0 ? (
              <div className="flex gap-2 flex-wrap mt-3">
                {form.refs.map((ref, index) => (
                  <div key={`${ref.name}-${index}`} className="relative">
                    <img className="ref-thumb" src={ref.preview} alt={ref.name} />
                    <button
                      type="button"
                      className="absolute -top-1.5 -right-1.5 rounded-full w-4 h-4 text-[10px] font-bold"
                      style={{ background: '#2b3c52', color: '#fff' }}
                      onClick={() => update({ refs: form.refs.filter((_, i) => i !== index) })}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mt-4 text-xs" style={{ color: 'var(--red)' }}>
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
          <span className="hint" style={{ marginTop: 0 }}>
            Writes <span className="mono">jobs/&lt;id&gt;/brief.json</span> · no API key needed for this stage
          </span>
          <Button variant="primary" onClick={() => void submit()} loading={pending}>
            {detail ? 'Save brief changes' : 'Create job →'}
          </Button>
        </div>
      </div>
    </section>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted-2)' }}>
        {label}
      </div>
      <div className="text-[13px] mt-0.5">{value}</div>
    </div>
  );
}

function budgetSummary(detail: JobDetail): string {
  if (!detail.budget) return '';
  const { targetSeconds, minSeconds, maxSeconds, targetWords } = detail.budget;
  return `Target ${targetSeconds}s (±10%: ${minSeconds}–${maxSeconds}s), about ${targetWords} spoken words.`;
}
