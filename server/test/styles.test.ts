import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { repoRoot } from '../src/config.js';
import { STYLE_ORDER } from '../src/constants.js';
import { StyleRegistry, type StylePack } from '../src/styles/registry.js';
import {
  REQUIRED_EXPRESSIONS,
  REQUIRED_POSES,
  REQUIRED_TRANSITIONS,
} from '../src/styles/schemas.js';

const stylesDir = path.join(repoRoot, 'styles');
let packs: StylePack[];

beforeAll(async () => {
  packs = await new StyleRegistry(stylesDir).load();
});

describe('style packs', () => {
  it('ships all ten packs in the documented order', () => {
    expect(packs.map((pack) => pack.id)).toEqual([...STYLE_ORDER]);
  });

  it('has a full theme for every pack', () => {
    for (const pack of packs) {
      expect(pack.theme.palette.text).toMatch(/^#[0-9a-f]{6}$/i);
      expect(pack.theme.fonts.subtitle.length).toBeGreaterThan(0);
      expect(pack.theme.outline.widthPx).toBeGreaterThan(0);
      expect(Object.keys(pack.theme.post).length).toBeGreaterThan(1);
      expect(pack.theme.render.fps).toBeGreaterThanOrEqual(24);
    }
  });

  it('passes the palette contrast check', () => {
    for (const pack of packs) {
      const failing = pack.contrast.checks.filter((check) => !check.ok);
      expect(failing, `${pack.id} failing pairs: ${JSON.stringify(failing)}`).toEqual([]);
    }
  });

  it('offers the poses and expressions the turnaround needs', () => {
    for (const pack of packs) {
      for (const pose of REQUIRED_POSES) expect(pack.vocab.poses).toContain(pose);
      for (const expression of REQUIRED_EXPRESSIONS) {
        expect(pack.vocab.expressions).toContain(expression);
      }
      for (const transition of REQUIRED_TRANSITIONS) {
        expect(pack.vocab.transitions).toContain(transition);
      }
      expect(pack.vocab.cameraMoves.length).toBeGreaterThanOrEqual(2);
      expect(pack.vocab.sfxCues.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('ships a PNG preview for every pack', async () => {
    for (const pack of packs) {
      expect(pack.previewPath).toBeTruthy();
      const bytes = await fs.readFile(pack.previewPath as string);
      expect(bytes.byteLength).toBeGreaterThan(1000);
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
  });

  it('marks only the implemented pack as stage-ready', () => {
    const ready = packs.filter((pack) => pack.stageReady).map((pack) => pack.id);
    expect(ready).toEqual(['soft-3d']);
  });

  it('returns undefined for unknown packs', async () => {
    const registry = new StyleRegistry(stylesDir);
    expect(await registry.get('nope')).toBeUndefined();
  });
});
