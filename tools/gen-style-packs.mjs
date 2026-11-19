#!/usr/bin/env node
/**
 * Generates the ten style packs under /styles.
 *
 * Each pack gets the same interface:
 *   theme.json                 palette, fonts, outline, grain, post FX, subtitle
 *   vocab.json                 closed enums for the shot planner (Stage 5)
 *   components/Scene.tsx       Remotion scene implementing StyleSceneProps
 *   components/index.ts        pack entry point
 *   preview.png                written by tools/gen-style-previews.mjs
 *
 * Soft 3D is the reference implementation; the other nine are functional stubs
 * with the same contract (Stage 8 deepens each component).
 *
 * Run: npm run style:packs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(repoRoot, 'styles');

const BASE_VOCAB = {
  cameraTypes: ['static', 'push-in', 'pull-out', 'pan', 'tilt', 'orbit', 'tracking', 'handheld'],
  cameraMoves: ['slow-dolly', 'crash-zoom', 'parallax-slide', 'rise', 'fall', 'whip-pan', 'dutch-tilt', 'rack-focus'],
  easings: ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'spring-soft', 'step-hold'],
  poses: ['idle', 'walk', 'talk', 'react', 'point', 'shrug'],
  expressions: ['neutral', 'happy', 'concerned', 'surprised', 'smirk', 'sad'],
  transitions: ['cut', 'cross-fade', 'whip-pan', 'dip-to-black', 'iris'],
  lightingPresets: ['warm-key', 'cool-rim', 'high-noon', 'rain-window', 'neon-rim', 'soft-top'],
  actions: ['enter', 'exit', 'gesture', 'lean-in', 'pace', 'look-at-camera', 'sit', 'hold-prop'],
  sfxCues: ['whoosh', 'pop', 'rain-loop', 'click', 'thud', 'chime'],
};

const PACKS = [
  {
    id: 'soft-3d',
    name: 'Soft 3D',
    description: 'Rounded clay characters, soft shadows, shallow depth of field and warm window light.',
    palette: {
      background: '#F3E7DA',
      surface: '#E8D8C6',
      primary: '#B5613A',
      secondary: '#5E8C7C',
      accent: '#D9A13B',
      text: '#2E2620',
      outline: '#3A2F28',
    },
    fonts: {
      heading: '"Trebuchet MS", "Segoe UI", sans-serif',
      body: '"Trebuchet MS", "Segoe UI", sans-serif',
      subtitle: '"Trebuchet MS", "Segoe UI", sans-serif',
    },
    outline: { color: '#3A2F28', widthPx: 8, style: 'ink' },
    grain: { enabled: true, intensity: 0.05 },
    post: {
      bloom: 0.16,
      bloomRadius: 14,
      vignette: 0.2,
      grain: 0.05,
      outline: 8,
      dof: true,
      ambientOcclusion: true,
      saturate: 1.04,
      particle: 'rain',
    },
    subtitle: { style: 'clean', safeAreaPct: 0.12, karaokeHighlight: true },
    render: { fps: 30, letterbox: false, dof: true },
    overlay: {
      background:
        'radial-gradient(80% 55% at 50% 8%, rgba(255,255,255,0.35), rgba(255,255,255,0) 70%)',
    },
    vocab: {
      cameraMoves: [...BASE_VOCAB.cameraMoves, 'clay-orbit'],
      transitions: [...BASE_VOCAB.transitions, 'soft-dissolve'],
      lightingPresets: [...BASE_VOCAB.lightingPresets, 'window-rain'],
      actions: [...BASE_VOCAB.actions, 'tilt-head'],
    },
  },
  {
    id: 'cinematic-3d',
    name: 'Cinematic 3D',
    description: 'Stylized low-poly 3D, volumetric shafts, slow dolly moves, film grain and letterbox.',
    palette: {
      background: '#0B0F14',
      surface: '#161E27',
      primary: '#7FB3C8',
      secondary: '#C9A26B',
      accent: '#E2543F',
      text: '#F2F4F7',
      outline: '#9FB4C7',
    },
    fonts: {
      heading: '"Georgia", "Times New Roman", serif',
      body: '"Segoe UI", "Helvetica Neue", sans-serif',
      subtitle: '"Georgia", "Times New Roman", serif',
    },
    outline: { color: '#9FB4C7', widthPx: 3, style: 'ink' },
    grain: { enabled: true, intensity: 0.12 },
    post: {
      bloom: 0.22,
      bloomRadius: 22,
      vignette: 0.38,
      grain: 0.12,
      outline: 3,
      dof: true,
      volumetric: true,
      letterbox: 0.1,
      saturate: 0.95,
      contrast: 1.12,
    },
    subtitle: { style: 'cinematic', safeAreaPct: 0.1, karaokeHighlight: false },
    render: { fps: 30, letterbox: true, dof: true },
    overlay: {
      background:
        'linear-gradient(to bottom, #000 0%, rgba(0,0,0,0) 9%, rgba(0,0,0,0) 91%, #000 100%)',
    },
    vocab: {
      cameraMoves: [...BASE_VOCAB.cameraMoves, 'crane-up', 'dolly-zoom'],
      transitions: [...BASE_VOCAB.transitions, 'film-dissolve', 'letterbox-wipe'],
      lightingPresets: [...BASE_VOCAB.lightingPresets, 'volumetric-shaft', 'backlit-dusk'],
      sfxCues: [...BASE_VOCAB.sfxCues, 'low-rumble'],
    },
  },
  {
    id: 'chalk-doodle',
    name: 'Chalk Doodle',
    description: 'Chalkboard world with stroke-reveal line art, chalk dust and hand-lettered subtitles.',
    palette: {
      background: '#23342B',
      surface: '#2C4034',
      primary: '#A8D5BA',
      secondary: '#D9C27A',
      accent: '#F2D06B',
      text: '#F4F1E4',
      outline: '#F4F1E4',
    },
    fonts: {
      heading: '"Comic Sans MS", "Chalkboard SE", cursive',
      body: '"Comic Sans MS", "Chalkboard SE", cursive',
      subtitle: '"Comic Sans MS", "Chalkboard SE", cursive',
    },
    outline: { color: '#F4F1E4', widthPx: 6, style: 'chalk' },
    grain: { enabled: true, intensity: 0.18 },
    post: {
      bloom: 0.08,
      bloomRadius: 8,
      vignette: 0.3,
      grain: 0.18,
      outline: 6,
      dof: false,
      chalkDust: true,
      strokeReveal: true,
    },
    subtitle: { style: 'hand', safeAreaPct: 0.12, karaokeHighlight: true },
    render: { fps: 30, letterbox: false, dof: false },
    overlay: {
      background:
        'radial-gradient(90% 70% at 28% 18%, rgba(255,255,255,0.08), rgba(255,255,255,0) 72%)',
    },
    vocab: {
      cameraMoves: ['slow-dolly', 'rise', 'fall', 'truck-left', 'truck-right'],
      transitions: [...BASE_VOCAB.transitions, 'chalk-wipe'],
      lightingPresets: [...BASE_VOCAB.lightingPresets, 'chalk-flat'],
      actions: [...BASE_VOCAB.actions, 'draw', 'underline'],
      sfxCues: [...BASE_VOCAB.sfxCues, 'chalk-scratch'],
    },
  },
  {
    id: 'golden-neon',
    name: 'Golden Neon',
    description: 'Dark scene, glowing gold outlines, bloom and light trails. Night-city energy.',
    palette: {
      background: '#07070B',
      surface: '#111018',
      primary: '#FFC940',
      secondary: '#FF8A3D',
      accent: '#FF5F9E',
      text: '#FFF3C4',
      outline: '#FFD166',
    },
    fonts: {
      heading: '"Bahnschrift", "Segoe UI", sans-serif',
      body: '"Bahnschrift", "Segoe UI", sans-serif',
      subtitle: '"Bahnschrift", "Segoe UI", sans-serif',
    },
    outline: { color: '#FFD166', widthPx: 5, style: 'neon' },
    grain: { enabled: true, intensity: 0.09 },
    post: {
      bloom: 0.62,
      bloomRadius: 26,
      vignette: 0.45,
      grain: 0.09,
      outline: 5,
      dof: true,
      lightTrails: true,
      chromaticAberration: 0.12,
    },
    subtitle: { style: 'karaoke', safeAreaPct: 0.12, karaokeHighlight: true },
    render: { fps: 30, letterbox: false, dof: true },
    overlay: {
      background:
        'radial-gradient(65% 45% at 50% 38%, rgba(255,201,64,0.22), rgba(255,201,64,0) 75%)',
    },
    vocab: {
      cameraMoves: [...BASE_VOCAB.cameraMoves, 'neon-orbit', 'glide'],
      transitions: [...BASE_VOCAB.transitions, 'light-trail-wipe', 'bloom-cut'],
      lightingPresets: [...BASE_VOCAB.lightingPresets, 'golden-rim'],
      sfxCues: [...BASE_VOCAB.sfxCues, 'neon-hum'],
    },
  },
  {
    id: 'pop-comic',
    name: 'Pop Comic',
    description: 'Halftone dots, thick ink outlines, comic panels and onomatopoeia pops.',
    palette: {
      background: '#FFF8E7',
      surface: '#FFEFC9',
      primary: '#E63946',
      secondary: '#F4A261',
      accent: '#2A9D8F',
      text: '#16130F',
      outline: '#100D0A',
    },
    fonts: {
      heading: '"Impact", "Haettenschweiler", "Arial Black", sans-serif',
      body: '"Arial", "Helvetica Neue", sans-serif',
      subtitle: '"Impact", "Haettenschweiler", "Arial Black", sans-serif',
    },
    outline: { color: '#100D0A', widthPx: 12, style: 'ink' },
    grain: { enabled: true, intensity: 0.04 },
    post: {
      bloom: 0,
      vignette: 0.08,
      grain: 0.04,
      outline: 12,
      dof: false,
      halftone: 0.35,
      panelEdges: 10,
      saturate: 1.15,
    },
    subtitle: { style: 'comic', safeAreaPct: 0.12, karaokeHighlight: true },
    render: { fps: 30, letterbox: false, dof: false },
    overlay: {
      background: 'radial-gradient(#100d0a22 1.4px, rgba(0,0,0,0) 1.6px)',
      backgroundSize: '13px 13px',
    },
    vocab: {
      cameraMoves: ['crash-zoom', 'whip-pan', 'static-push', 'parallax-slide'],
      transitions: [...BASE_VOCAB.transitions, 'panel-swipe', 'ink-splatter', 'comic-burst'],
      actions: [...BASE_VOCAB.actions, 'hero-pose', 'double-take'],
      sfxCues: [...BASE_VOCAB.sfxCues, 'pow', 'zap'],
    },
  },
  {
    id: 'flat-poster',
    name: 'Flat Poster',
    description: 'Flat vector shapes, a limited palette, bold typography and slide/scale motion.',
    palette: {
      background: '#F4EDE4',
      surface: '#E7DCCB',
      primary: '#D94837',
      secondary: '#2C6E9B',
      accent: '#F2B134',
      text: '#1B2430',
      outline: '#1B2430',
    },
    fonts: {
      heading: '"Arial Black", "Helvetica Neue", sans-serif',
      body: '"Helvetica Neue", "Segoe UI", sans-serif',
      subtitle: '"Arial Black", "Helvetica Neue", sans-serif',
    },
    outline: { color: '#1B2430', widthPx: 4, style: 'ink' },
    grain: { enabled: false, intensity: 0 },
    post: {
      bloom: 0,
      vignette: 0,
      grain: 0,
      outline: 4,
      dof: false,
      flatShading: true,
      saturate: 1.02,
    },
    subtitle: { style: 'poster', safeAreaPct: 0.12, karaokeHighlight: false },
    render: { fps: 30, letterbox: false, dof: false },
    overlay: {
      background: 'linear-gradient(135deg, rgba(44,110,155,0.07) 0%, rgba(0,0,0,0) 60%)',
    },
    vocab: {
      cameraTypes: ['static', 'push-in', 'pull-out', 'pan'],
      cameraMoves: ['slide', 'scale-pop', 'static-push', 'parallax-slide'],
      easings: [...BASE_VOCAB.easings, 'snap-in'],
      transitions: [...BASE_VOCAB.transitions, 'slide-wipe', 'shape-wipe'],
      lightingPresets: [...BASE_VOCAB.lightingPresets, 'flat-key'],
      actions: [...BASE_VOCAB.actions, 'present'],
      sfxCues: [...BASE_VOCAB.sfxCues, 'swish'],
    },
  },
  {
    id: '8-bit-quest',
    name: '8-Bit Quest',
    description: 'Pixel art at low internal resolution, nearest-neighbour upscaling and dialogue boxes.',
    palette: {
      background: '#10121F',
      surface: '#1A1D2E',
      primary: '#58C470',
      secondary: '#6A8CFF',
      accent: '#F2C14E',
      text: '#E8F1FF',
      outline: '#8896C8',
    },
    fonts: {
      heading: '"Consolas", "Courier New", monospace',
      body: '"Consolas", "Courier New", monospace',
      subtitle: '"Consolas", "Courier New", monospace',
    },
    outline: { color: '#8896C8', widthPx: 4, style: 'ink' },
    grain: { enabled: false, intensity: 0 },
    post: {
      bloom: 0.1,
      bloomRadius: 4,
      vignette: 0.2,
      grain: 0,
      outline: 4,
      dof: false,
      pixelate: 0.25,
      nearestNeighbour: true,
    },
    subtitle: { style: 'pixel', safeAreaPct: 0.14, karaokeHighlight: false },
    render: { fps: 30, letterbox: false, dof: false, internalScale: 0.25 },
    overlay: {
      background: 'linear-gradient(to bottom, rgba(106,140,255,0.08), rgba(0,0,0,0) 55%)',
    },
    vocab: {
      cameraTypes: ['static', 'push-in'],
      cameraMoves: ['pixel-pan', 'step-push', 'static-push'],
      easings: ['step-hold', 'linear', 'ease-out'],
      transitions: ['cut', 'pixel-wipe'],
      lightingPresets: ['flat-tiles', 'cave-glow'],
      actions: [...BASE_VOCAB.actions, 'hop'],
      sfxCues: ['beep', 'coin', 'blip', 'click'],
    },
  },
  {
    id: 'retro-console',
    name: 'Retro Console',
    description: 'CRT scanlines, chromatic aberration, 4:3 framing and a terminal UI aesthetic.',
    palette: {
      background: '#05060A',
      surface: '#16202A',
      primary: '#45E0C6',
      secondary: '#7CF7A0',
      accent: '#FF6FA5',
      text: '#B9FFDA',
      outline: '#45E0C6',
    },
    fonts: {
      heading: '"Cascadia Mono", "Consolas", monospace',
      body: '"Cascadia Mono", "Consolas", monospace',
      subtitle: '"Cascadia Mono", "Consolas", monospace',
    },
    outline: { color: '#45E0C6', widthPx: 2, style: 'neon' },
    grain: { enabled: true, intensity: 0.1 },
    post: {
      bloom: 0.4,
      bloomRadius: 12,
      vignette: 0.5,
      grain: 0.1,
      outline: 2,
      dof: false,
      scanlines: 0.35,
      chromaticAberration: 0.4,
      crtCurve: 0.12,
      letterbox43: true,
    },
    subtitle: { style: 'terminal', safeAreaPct: 0.1, karaokeHighlight: false },
    render: { fps: 30, letterbox: true, dof: false },
    overlay: {
      background: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0.35) 0px, rgba(0,0,0,0.35) 2px, rgba(0,0,0,0) 3px, rgba(0,0,0,0) 5px)',
    },
    vocab: {
      cameraTypes: ['static', 'push-in', 'pan'],
      cameraMoves: ['terminal-scroll', 'scan-wipe', 'static-push'],
      transitions: ['cut', 'crt-glitch', 'scanline-wipe'],
      lightingPresets: ['crt-glow', 'terminal-flat'],
      actions: [...BASE_VOCAB.actions, 'type'],
      sfxCues: ['modem', 'keypress', 'error-buzz', 'click'],
    },
  },
  {
    id: 'line-diagram',
    name: 'Line Diagram',
    description: 'Blueprint line art with animated labels, arrows and measured callouts for explainers.',
    palette: {
      background: '#0B2545',
      surface: '#123258',
      primary: '#6FA8FF',
      secondary: '#8FE3C0',
      accent: '#FFD166',
      text: '#E9F1FA',
      outline: '#E9F1FA',
    },
    fonts: {
      heading: '"Segoe UI", "Helvetica Neue", sans-serif',
      body: '"Segoe UI", "Helvetica Neue", sans-serif',
      subtitle: '"Segoe UI", "Helvetica Neue", sans-serif',
    },
    outline: { color: '#E9F1FA', widthPx: 2, style: 'ink' },
    grain: { enabled: false, intensity: 0 },
    post: {
      bloom: 0.12,
      bloomRadius: 8,
      vignette: 0.22,
      grain: 0,
      outline: 2,
      dof: false,
      gridOverlay: 0.14,
      strokeReveal: true,
    },
    subtitle: { style: 'blueprint', safeAreaPct: 0.12, karaokeHighlight: false },
    render: { fps: 30, letterbox: false, dof: false },
    overlay: {
      background: 'linear-gradient(rgba(233,241,250,0.06) 1px, rgba(0,0,0,0) 1px), linear-gradient(90deg, rgba(233,241,250,0.06) 1px, rgba(0,0,0,0) 1px)',
      backgroundSize: '32px 32px',
    },
    vocab: {
      cameraMoves: ['slow-dolly', 'pan', 'static-push', 'rise'],
      transitions: ['cut', 'blueprint-fade', 'cross-fade'],
      lightingPresets: ['blueprint-flat', 'cool-rim'],
      actions: [...BASE_VOCAB.actions, 'label', 'arrow-in', 'zoom-detail'],
      sfxCues: ['pencil-scratch', 'click', 'chime'],
    },
  },
  {
    id: 'toy-bricks',
    name: 'Toy Bricks',
    description: 'Blocky voxel characters, studded surfaces and stop-motion step timing.',
    palette: {
      background: '#F0F4F8',
      surface: '#DDE6EF',
      primary: '#D63A2F',
      secondary: '#E0A21F',
      accent: '#2A7DE1',
      text: '#2B2B33',
      outline: '#1F1F26',
    },
    fonts: {
      heading: '"Verdana", "Segoe UI", sans-serif',
      body: '"Verdana", "Segoe UI", sans-serif',
      subtitle: '"Verdana", "Segoe UI", sans-serif',
    },
    outline: { color: '#1F1F26', widthPx: 7, style: 'ink' },
    grain: { enabled: false, intensity: 0 },
    post: {
      bloom: 0,
      vignette: 0.14,
      grain: 0,
      outline: 7,
      dof: false,
      studs: true,
      stepTiming: 6,
      saturate: 1.05,
    },
    subtitle: { style: 'blocky', safeAreaPct: 0.12, karaokeHighlight: true },
    render: { fps: 24, letterbox: false, dof: false },
    overlay: {
      background: 'radial-gradient(70% 50% at 50% 10%, rgba(255,255,255,0.7), rgba(255,255,255,0) 70%)',
    },
    vocab: {
      cameraMoves: ['stop-motion-push', 'brick-orbit', 'step-pan', 'rise'],
      easings: ['step-hold', 'ease-out', 'linear'],
      transitions: ['cut', 'brick-wipe', 'snap-cut'],
      lightingPresets: [...BASE_VOCAB.lightingPresets, 'studio-softbox'],
      actions: [...BASE_VOCAB.actions, 'stomp', 'build'],
      sfxCues: ['brick-clack', 'click', 'thud'],
    },
  },
];

function sceneComponent(pack) {
  const overlay = {
    ...pack.overlay,
  };
  return `/**
 * ${pack.name} — style pack scene.
 *
 * Implements the shared StyleSceneProps contract. This is the ${pack.id === 'soft-3d' ? 'reference implementation' : 'stub'}:
 * it paints the pack's palette, typography, outline and post-processing mood.
 * Stage 8 composes it with shot data (background, characters, props, camera,
 * subtitles); the props never change.
 */
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { CSSProperties, FC } from 'react';
import type { StyleSceneProps } from '../../shared/types';
import theme from '../theme.json';

const OVERLAY: CSSProperties = ${JSON.stringify(overlay, null, 2)};

export const Scene: FC<StyleSceneProps> = ({ title = 'ShortForge', subtitle, children }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' });
  const drift = interpolate(frame, [0, 90], [0, 10], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      data-style="${pack.id}"
      style={{
        backgroundColor: theme.palette.background,
        color: theme.palette.text,
        fontFamily: theme.fonts.body,
      }}
    >
      <AbsoluteFill
        style={{
          background: \`radial-gradient(120% 80% at 50% 18%, \${theme.palette.surface}, \${theme.palette.background})\`,
        }}
      />
      <AbsoluteFill style={{ ...OVERLAY, pointerEvents: 'none' }} />
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          padding: '14% 10% 26%',
          textAlign: 'center',
          transform: \`translateY(\${drift}px)\`,
        }}
      >
        <div
          style={{
            fontFamily: theme.fonts.heading,
            fontSize: 104,
            lineHeight: 1.02,
            fontWeight: 800,
            letterSpacing: -1,
            color: theme.palette.text,
            textShadow:
              theme.outline.style === 'none'
                ? undefined
                : \`0 0 \${theme.outline.widthPx * 1.6}px \${theme.palette.outline}\`,
            opacity: enter,
            transform: \`translateY(\${(1 - enter) * 26}px) scale(\${0.96 + enter * 0.04})\`,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              fontFamily: theme.fonts.subtitle,
              fontSize: 46,
              fontWeight: 600,
              color: theme.palette.accent,
              maxWidth: 780,
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </AbsoluteFill>
      {children}
    </AbsoluteFill>
  );
};

export default Scene;
`;
}

function componentIndex() {
  return `export { Scene } from './Scene';
export { default } from './Scene';
`;
}

let written = 0;
for (const pack of PACKS) {
  const dir = path.join(stylesDir, pack.id);
  fs.mkdirSync(path.join(dir, 'components'), { recursive: true });

  const vocab = { ...BASE_VOCAB, ...pack.vocab };
  // Deduplicate while preserving order (overrides append style-specific values).
  for (const key of Object.keys(vocab)) {
    const value = vocab[key];
    if (Array.isArray(value)) vocab[key] = [...new Set(value)];
  }
  if (pack.vocab.cameraTypes) vocab.cameraTypes = [...new Set(pack.vocab.cameraTypes)];
  if (pack.vocab.easings) vocab.easings = [...new Set(pack.vocab.easings)];
  if (pack.vocab.transitions) vocab.transitions = [...new Set(pack.vocab.transitions)];
  if (pack.vocab.lightingPresets) {
    vocab.lightingPresets = [...new Set(pack.vocab.lightingPresets)];
  }
  if (pack.vocab.sfxCues) vocab.sfxCues = [...new Set(pack.vocab.sfxCues)];

  const theme = {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    palette: pack.palette,
    fonts: pack.fonts,
    outline: pack.outline,
    grain: pack.grain,
    post: pack.post,
    subtitle: pack.subtitle,
    render: pack.render,
  };

  fs.writeFileSync(path.join(dir, 'theme.json'), `${JSON.stringify(theme, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'vocab.json'), `${JSON.stringify(vocab, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'components', 'Scene.tsx'), sceneComponent(pack));
  fs.writeFileSync(path.join(dir, 'components', 'index.ts'), componentIndex());
  written += 1;
}

console.log(`Wrote ${written} style packs to ${path.relative(repoRoot, stylesDir)}/`);
console.log('Next: npm run style:previews (writes preview.png per pack).');
