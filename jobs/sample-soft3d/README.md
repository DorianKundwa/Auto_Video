# Sample job — no API key needed

This folder is a Stage 1 job that ships with the repo so you can open ShortForge
and see the sidebar, stepper and brief immediately.

- `brief.json` — validated Stage 1 output.
- `job.json` — stage statuses (Stage 1 done, 2-10 pending), token cost, run state.

With no `DEEPSEEK_API_KEY`, the server runs in **mock mode** and answers model
calls from `server/src/mock/fixtures.ts` (canned JSON, still validated by the
same zod schema). That is what makes the pipeline runnable offline.

This job is committed to git; your own jobs under `jobs/` are ignored.
