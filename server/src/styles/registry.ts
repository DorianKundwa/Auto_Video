/**
 * Loads /styles/<name>/ packs: theme.json + vocab.json + preview.png and a
 * component module the renderer can import. Invalid packs fail loudly here
 * rather than producing broken renders later.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { IMPLEMENTED_PACKS, STYLE_ORDER } from '../constants.js';
import {
  REQUIRED_EXPRESSIONS,
  REQUIRED_POSES,
  REQUIRED_TRANSITIONS,
  themeSchema,
  vocabSchema,
  type StyleTheme,
  type StyleVocab,
} from './schemas.js';
import { checkPalette, type ContrastReport } from './contrast.js';

export interface StylePack {
  id: string;
  name: string;
  description: string;
  theme: StyleTheme;
  vocab: StyleVocab;
  previewPath: string | null;
  /** True for packs whose scene components are fully implemented (Soft 3D). */
  stageReady: boolean;
  contrast: ContrastReport;
}

export class StylePackError extends Error {
  constructor(id: string, message: string) {
    super(`Style pack "${id}" is invalid: ${message}`);
    this.name = 'StylePackError';
  }
}

export class StyleRegistry {
  private cache: StylePack[] | null = null;

  constructor(private readonly stylesDir: string) {}

  async load(): Promise<StylePack[]> {
    if (this.cache) return this.cache;
    const entries = await fs.readdir(this.stylesDir, { withFileTypes: true }).catch(() => []);
    const packs: StylePack[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      const dir = path.join(this.stylesDir, id);

      let themeRaw: unknown;
      let vocabRaw: unknown;
      try {
        themeRaw = JSON.parse(await fs.readFile(path.join(dir, 'theme.json'), 'utf8'));
        vocabRaw = JSON.parse(await fs.readFile(path.join(dir, 'vocab.json'), 'utf8'));
      } catch {
        continue; // A folder that is not a pack (e.g. shared/) is skipped.
      }

      const theme = themeSchema.safeParse(themeRaw);
      if (!theme.success) throw new StylePackError(id, `theme.json → ${theme.error.message}`);
      const vocab = vocabSchema.safeParse(vocabRaw);
      if (!vocab.success) throw new StylePackError(id, `vocab.json → ${vocab.error.message}`);
      if (theme.data.id !== id) {
        throw new StylePackError(id, `theme.id "${theme.data.id}" does not match folder name`);
      }

      for (const pose of REQUIRED_POSES) {
        if (!vocab.data.poses.includes(pose)) {
          throw new StylePackError(id, `vocab.poses must include "${pose}" (character turnaround)`);
        }
      }
      for (const expression of REQUIRED_EXPRESSIONS) {
        if (!vocab.data.expressions.includes(expression)) {
          throw new StylePackError(id, `vocab.expressions must include "${expression}"`);
        }
      }
      if (!REQUIRED_TRANSITIONS.every((transition) => vocab.data.transitions.includes(transition))) {
        throw new StylePackError(id, `vocab.transitions must include "cut"`);
      }
      const scenePath = path.join(dir, 'components', 'Scene.tsx');
      if (!(await fileExists(scenePath))) {
        throw new StylePackError(id, 'missing components/Scene.tsx');
      }

      const previewCandidate = path.join(dir, 'preview.png');
      const previewPath = (await fileExists(previewCandidate)) ? previewCandidate : null;

      packs.push({
        id,
        name: theme.data.name,
        description: theme.data.description,
        theme: theme.data,
        vocab: vocab.data,
        previewPath,
        stageReady: IMPLEMENTED_PACKS.includes(id),
        contrast: checkPalette(theme.data.palette),
      });
    }

    packs.sort((a, b) => {
      const ai = STYLE_ORDER.indexOf(a.id as (typeof STYLE_ORDER)[number]);
      const bi = STYLE_ORDER.indexOf(b.id as (typeof STYLE_ORDER)[number]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    this.cache = packs;
    return packs;
  }

  async get(id: string): Promise<StylePack | undefined> {
    const packs = await this.load();
    return packs.find((pack) => pack.id === id);
  }

  async has(id: string): Promise<boolean> {
    return Boolean(await this.get(id));
  }

  async ids(): Promise<string[]> {
    return (await this.load()).map((pack) => pack.id);
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
