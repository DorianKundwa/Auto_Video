/**
 * Shared constants: enumerations used by both the API schemas and the GUI.
 * Keep this file dependency-free so it can be imported anywhere server-side.
 */

export const TONES = ['deadpan', 'dramatic', 'funny', 'educational'] as const;

export const LENGTHS = [30, 60, 90] as const;

export const ASPECTS = ['9:16', '16:9'] as const;

export const TTS_PROVIDERS = ['kokoro', 'piper', 'elevenlabs'] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];

/** Narration is budgeted at ~2.5 spoken words per second. */
export const WORDS_PER_SECOND = 2.5;

/** Style packs shipped in /styles. Order matters for the picker. */
export const STYLE_ORDER = [
  'soft-3d',
  'cinematic-3d',
  'chalk-doodle',
  'golden-neon',
  'pop-comic',
  'flat-poster',
  '8-bit-quest',
  'retro-console',
  'line-diagram',
  'toy-bricks',
] as const;

/** Packs with a real (non-stub) scene implementation. */
export const IMPLEMENTED_PACKS: readonly string[] = ['soft-3d'];

export interface VoiceOption {
  id: string;
  label: string;
  language: string;
}

/** Minimal static catalog used by the picker until Stage 6 queries providers. */
export const VOICE_CATALOG: Record<TtsProvider, VoiceOption[]> = {
  kokoro: [
    { id: 'af_heart', label: 'Heart — warm US narrator', language: 'en-US' },
    { id: 'af_bella', label: 'Bella — bright US narrator', language: 'en-US' },
    { id: 'am_michael', label: 'Michael — calm US narrator', language: 'en-US' },
    { id: 'am_puck', label: 'Puck — playful US narrator', language: 'en-US' },
    { id: 'bf_emma', label: 'Emma — British narrator', language: 'en-GB' },
  ],
  piper: [
    { id: 'en_US-amy-medium', label: 'Amy — US female', language: 'en-US' },
    { id: 'en_US-ryan-high', label: 'Ryan — US male', language: 'en-US' },
    { id: 'en_GB-alan-medium', label: 'Alan — British male', language: 'en-GB' },
  ],
  elevenlabs: [
    { id: 'rachel', label: 'Rachel — warm', language: 'en-US' },
    { id: 'adam', label: 'Adam — deep', language: 'en-US' },
    { id: 'bella', label: 'Bella — expressive', language: 'en-US' },
  ],
};

export const DEFAULT_VOICE: Record<TtsProvider, string> = {
  kokoro: 'af_heart',
  piper: 'en_US-amy-medium',
  elevenlabs: 'rachel',
};
