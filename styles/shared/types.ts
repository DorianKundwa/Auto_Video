import type { ReactNode } from 'react';

/**
 * The contract every style pack scene implements. Stage 8 composes these with
 * real shot data; the stub scenes use the same props so swapping a stub for a
 * finished scene never changes the renderer.
 */
export interface StyleSceneProps {
  /** Working title / on-screen headline. */
  title?: string;
  /** One-line subtitle preview. */
  subtitle?: string;
  /** Character id from bible.json, when a shot features one. */
  characterId?: string;
  /** Expression enum from the pack vocab. */
  expression?: string;
  /** Pose enum from the pack vocab. */
  pose?: string;
  /** Extra layers (props, particles) injected by the renderer. */
  children?: ReactNode;
}
