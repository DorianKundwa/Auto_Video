# ShortForge

Turn a topic into a finished animated short (30–90 s, 1080×1920 by default) with
**no AI video model**. Reasoning runs on the DeepSeek API; the animation is
rendered locally with Remotion + three.js.

This repository is being built stage by stage. **Stage 1 is complete** — the repo
scaffold, the single DeepSeek module (`server/llm.ts`), the 10 style-pack
interfaces, and the project-input GUI + API. Stages 2–10 are scaffolded in the
stepper and API surface, but their pipeline handlers intentionally return
`not_implemented` rather than producing half-finished work.

| Stage | Name | Status |
| --- | --- | --- |
| 1 | Project input | ✅ done |
| 2 | Research + fact check | planned |
| 3 | Script | planned |
| 4 | Characters + world bible | planned |
| 5 | Shot plan | planned |
| 6 | Voice + timing | planned |
| 7 | Music + SFX mix | planned |
| 8 | Render | scaffolded (Remotion + three.js) |
| 9 | Automated QA | planned |
| 10 | Export | planned |

---

## Requirements

| Tool | Why | Check |
| --- | --- | --- |
| Node.js **20+** | server, web, render | `node -v` |
| ffmpeg | audio muxing, loudness, proxies | `ffmpeg -version` |
| Python **3.9+** | local Kokoro/Piper TTS (Stage 6) | `python --version` |
| ≥ 3 GB free disk | render output | app setup screen |

The server checks all of these at startup and the GUI shows a **setup needed**
screen when something required is missing. `DEEPSEEK_API_KEY` is optional: with
no key the app automatically runs in **mock mode** using canned responses.

### Windows

```powershell
winget install OpenJS.NodeJS.LTS Gyan.FFmpeg Python.Python.3.12
# reopen the terminal so PATH is refreshed
node -v; ffmpeg -version; python --version
git clone <your-repo> ShortForge && cd ShortForge
npm install
copy .env.example .env
npm run dev
```

### macOS

```bash
brew install node ffmpeg python
git clone <your-repo> ShortForge && cd ShortForge
npm install
cp .env.example .env
npm run dev
```

### Linux (Debian/Ubuntu)

```bash
sudo apt install nodejs npm ffmpeg python3
git clone <your-repo> ShortForge && cd ShortForge
npm install
cp .env.example .env
npm run dev
```

Open **http://127.0.0.1:5173**. The Vite dev server proxies `/api` to Fastify on
`127.0.0.1:8787`.

---

## Configuration (`.env`)

Everything is read server-side; keys never reach the browser.

```ini
DEEPSEEK_API_KEY=            # empty → mock mode
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_VISION=off          # on → Stage 9 sends frames to a vision model
SEARCH_API_KEY=              # Tavily, Stage 2
TTS_PROVIDER=kokoro          # kokoro | piper | elevenlabs
PORT=8787
MOCK_MODE=auto               # auto | on | off
```

`MOCK_MODE=auto` uses canned responses only when there is no key. `on` always
mocks (good for demos and CI), `off` always calls the network.

The Settings page writes non-secret preferences and (optionally) keys to
`settings.json`, which is gitignored and merged over `.env`. Keys in the API are
**write-only** — the GUI only reports whether one is set and where it came from.

### Mock mode / sample job

`jobs/sample-soft3d/` is a committed job with Stage 1 already done, so the app
has content on first launch. Canned model responses live in
`server/src/mock/fixtures.ts`, keyed by task name; they are validated by the same
zod schema as real responses, so mock runs exercise the real code path.

---

## Commands

```bash
npm run dev          # Fastify (8787) + Vite (5173), one command
npm run dev:server   # API only
npm run dev:web      # GUI only
npm run build        # server tsc + web production build
npm start            # serve API + built GUI from one process
npm test             # Vitest (server logic + acceptance)
npm run typecheck    # strict TS across server, web, render
npm run lint         # ESLint
npm run style:all    # regenerate style packs + preview PNGs
```

`npm start` serves `web/dist` from Fastify, so a single process gives you the
whole app at http://127.0.0.1:8787.

---

## Repository layout

```
server/              Fastify + TypeScript API
  src/llm.ts         the ONLY DeepSeek caller (JSON mode, zod, retries, cost)
  src/jobs/          job store, stage runner, stage metadata
  src/styles/        style-pack loader, schema, contrast checks
  src/routes/        jobs, styles, settings, system, SSE
  src/schemas/       brief + job zod schemas
  test/              Vitest suites incl. Stage 1 acceptance
web/                 React + Vite + Tailwind GUI
render/              Remotion + three.js compositions (Stage 8 fills these in)
styles/<slug>/       theme.json, vocab.json, components/Scene.tsx, preview.png
jobs/<id>/           brief.json, job.json, logs/, refs/, audio/, tmp/
assets/audio/        local royalty-free music/SFX library (Stage 7)
tools/               style pack + PNG preview generators
```

### Job folders are resumable

```
jobs/20261119-140233-bees-4f2a/
  job.json        stage statuses, run state, token/cost totals
  brief.json      Stage 1 payload
  logs/stage-1.log
  llm-log.jsonl   every request/response, keys redacted
  refs/           uploaded reference images
  audio/          voice + mix (later stages)
  tmp/            render scratch (cleanup target)
```

Every stage is independently re-runnable. Editing the brief marks completed
downstream stages **stale** without deleting their files, so work is never lost.

---

## The LLM module

All model calls go through `server/llm.ts`:

- JSON-mode chat completions against the OpenAI-compatible DeepSeek endpoint.
- Every reply is validated by a **zod schema**. On failure the validation errors
  are fed back to the model and retried, up to **3 attempts total**.
- Retries cover network errors and 429/5xx with backoff; 401/402 fail fast with
  the provider message.
- Each attempt is logged (redacted) to `jobs/<id>/llm-log.jsonl` and
  `jobs/<id>/logs/stage-<n>.log`. `sk-…`, `tvly-…` and bearer tokens are
  scrubbed, and long payloads are truncated.
- Token usage and estimated USD are added to the job's running cost, shown in
  the top bar.
- Calls are tagged with a `task`, a `stage`, and optionally `images` for vision
  (refused unless `DEEPSEEK_VISION=on`).

Tests cover retry/feedback, the 3-attempt ceiling, redaction, fast-fail auth,
5xx retry, mock fixtures and vision gating.

---

## Style packs

Ten packs share one contract:

```
styles/<slug>/
  theme.json          palette (hex), fonts, outline, grain, post FX, subtitle, fps
  vocab.json          closed enums: camera types/moves, easings, poses,
                      expressions, transitions, lighting presets, actions, SFX
  components/Scene.tsx  Remotion scene implementing StyleSceneProps
  preview.png         generated thumbnail shown in the picker
```

Soft 3D is the reference implementation; the other nine are functional stubs
with the same interface (Stage 8 deepens them). Vocabularies always include the
turnaround poses (`idle`, `walk`, `talk`, `react`) and expressions (`neutral`,
`happy`, `concerned`, `surprised`) that Stage 4 requires. Palettes are validated
for contrast (AA for text, ≥3 for outlines, visibility for accents).

Regenerate after changing generator inputs:

```bash
npm run style:packs     # theme.json, vocab.json, Scene.tsx
npm run style:previews  # preview.png (dependency-free PNG encoder)
```

---

## Stage 1 acceptance test

Automated:

```bash
npm test
```

`server/test/stage1.acceptance.test.ts` verifies:

- a valid brief creates `jobs/<id>/` with `brief.json` + `job.json`, both
  schema-valid;
- the job appears in `GET /api/jobs` with per-stage statuses (sidebar data);
- invalid tone/style returns 400 with field-level errors;
- all 10 style packs expose preview images and passing contrast;
- editing the brief marks downstream stages stale while keeping their artifacts;
- Stage 1 can be re-run, and Stage 2 returns `not_implemented`;
- `Run all` pauses and explains where it stopped;
- `/api/system/health` returns the setup checklist.

Manual (GUI):

1. `npm run dev`, open http://127.0.0.1:5173
2. Fill the brief (topic, audience, tone, length, language, style, voice, aspect),
   optionally add a story and reference images.
3. **Create job** → the job appears in the left sidebar, the stepper shows Stage 1
   done, and `<job>/brief.json` exists.
4. Edit the brief → Stage 2+ turns amber (stale).
5. Open the log drawer → see Stage 1 validation lines.
6. Click **Run all** → it runs Stage 1 and stops with "Stage 2 … not implemented".

---

## Troubleshooting

**The GUI says "setup needed" / ffmpeg missing.**
Install ffmpeg and make sure `ffmpeg -version` works in the *same* terminal you
start the server from. Windows: `winget install Gyan.FFmpeg`, then reopen the
terminal. The check is cached for 15 s; press **Re-check**.

**Port 8787 or 5173 is busy.**
Change `PORT` in `.env` and set `SHORTFORGE_API` before `npm run dev:web` (e.g.
`SHORTFORGE_API=http://127.0.0.1:8790 npm run dev:web`), or edit
`web/vite.config.ts`.

**Browser shows "Connecting to the ShortForge server…" forever.**
The API isn't up or the proxy target is wrong. Check the server terminal; try
http://127.0.0.1:8787/api/ping. Vite proxies `/api` only.

**"DEEPSEEK_API_KEY is not set" while trying to run a stage.**
Set the key in `.env` (restart the server) or in Settings. Without it, leave
`MOCK_MODE=auto` so canned responses are used.

**Mock mode error: "no canned response for task …".**
That stage's fixture hasn't been added to `server/src/mock/fixtures.ts` yet, or
you set `MOCK_MODE=off` without a key. Use a real key or add the fixture.

**`npm install` fails on the render workspace.**
The workspace uses React 19 because `@remotion/three` requires
`@react-three/fiber` 9. Keep both React workspaces on React 19 and run
`npm install` from the repo root (not inside a workspace).

**Windows: `EPERM`/`EBUSY` when writing job files.**
Close any editor holding `job.json` open; the store writes atomically and retries
a rename after deleting the old file.

**Style previews are missing.**
Run `npm run style:all`. The picker falls back to an empty thumbnail, and
`GET /api/styles/<id>/preview.png` returns 404 until generated.

**Python version too old for Kokoro.**
Use Python 3.10–3.12 for Kokoro. Piper ships standalone binaries; ElevenLabs
needs no local Python (add its key when Stage 6 lands).

**Logs look truncated.**
Long payloads are capped (20k chars in logs, 40k in the JSONL) on purpose. The
full prompt is always reconstructable from the stage code + job artifacts.

---

## Privacy / safety notes

- Keys are only read by the server, are never included in API responses, and are
  redacted from logs.
- The server binds `127.0.0.1` by default; change `HOST` only if you understand
  the exposure.
- Job files may contain your reference images and generated scripts. They stay in
  `jobs/` on this machine; only prompts/responses go to the model provider.
