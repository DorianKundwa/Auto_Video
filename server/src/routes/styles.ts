/**
 * Style pack routes. The GUI picker reads summaries + preview images; Stage 4/5
 * read the full theme/vocab.
 */
import fs from 'node:fs/promises';
import type { FastifyPluginAsync } from 'fastify';
import type { AppDeps } from './deps.js';

export const styleRoutes: FastifyPluginAsync<AppDeps> = async (app, deps) => {
  app.get('/api/styles', async () => {
    const packs = await deps.styles.load();
    const styles = await Promise.all(
      packs.map(async (pack) => {
        let previewUrl: string | null = null;
        if (pack.previewPath) {
          let version = '1';
          try {
            version = String(Math.round((await fs.stat(pack.previewPath)).mtimeMs));
          } catch {
            version = '1';
          }
          previewUrl = `/api/styles/${pack.id}/preview.png?v=${version}`;
        }
        return {
          id: pack.id,
          name: pack.name,
          description: pack.description,
          palette: pack.theme.palette,
          fonts: pack.theme.fonts,
          outline: pack.theme.outline,
          grain: pack.theme.grain,
          subtitle: pack.theme.subtitle,
          render: pack.theme.render,
          post: pack.theme.post,
          previewUrl,
          stageReady: pack.stageReady,
          contrast: pack.contrast,
          vocab: pack.vocab,
        };
      }),
    );
    return { styles };
  });

  app.get<{ Params: { id: string } }>('/api/styles/:id', async (request, reply) => {
    const pack = await deps.styles.get(request.params.id);
    if (!pack) return reply.code(404).send({ error: `Unknown style "${request.params.id}"` });
    return {
      id: pack.id,
      name: pack.name,
      description: pack.description,
      theme: pack.theme,
      vocab: pack.vocab,
      stageReady: pack.stageReady,
      contrast: pack.contrast,
      previewUrl: pack.previewPath ? `/api/styles/${pack.id}/preview.png` : null,
    };
  });

  app.get<{ Params: { id: string } }>('/api/styles/:id/preview.png', async (request, reply) => {
    const pack = await deps.styles.get(request.params.id);
    if (!pack?.previewPath) return reply.code(404).send({ error: 'No preview for this style' });
    const buffer = await fs.readFile(pack.previewPath);
    return reply
      .type('image/png')
      .header('Cache-Control', 'public, max-age=60')
      .send(buffer);
  });
};
