import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';
import type { StyleSceneProps } from '../../styles/shared/types';
import { Scene as Soft3D } from '../../styles/soft-3d/components/Scene';
import { Scene as Cinematic3D } from '../../styles/cinematic-3d/components/Scene';
import { Scene as ChalkDoodle } from '../../styles/chalk-doodle/components/Scene';
import { Scene as GoldenNeon } from '../../styles/golden-neon/components/Scene';
import { Scene as PopComic } from '../../styles/pop-comic/components/Scene';
import { Scene as FlatPoster } from '../../styles/flat-poster/components/Scene';
import { Scene as EightBitQuest } from '../../styles/8-bit-quest/components/Scene';
import { Scene as RetroConsole } from '../../styles/retro-console/components/Scene';
import { Scene as LineDiagram } from '../../styles/line-diagram/components/Scene';
import { Scene as ToyBricks } from '../../styles/toy-bricks/components/Scene';

export interface StyleFrameProps {
  styleId: string;
  title?: string;
  subtitle?: string;
  expression?: string;
  pose?: string;
}

/**
 * Every pack implements the same StyleSceneProps contract, so switching a style
 * is a lookup — never a different code path. Stage 8 passes real shot data in.
 */
const SCENES: Record<string, FC<StyleSceneProps>> = {
  'soft-3d': Soft3D,
  'cinematic-3d': Cinematic3D,
  'chalk-doodle': ChalkDoodle,
  'golden-neon': GoldenNeon,
  'pop-comic': PopComic,
  'flat-poster': FlatPoster,
  '8-bit-quest': EightBitQuest,
  'retro-console': RetroConsole,
  'line-diagram': LineDiagram,
  'toy-bricks': ToyBricks,
};

export const STYLE_IDS = Object.keys(SCENES);

/**
 * Declared as FC<Record<string, unknown>> because Remotion's Composition wants
 * a loose component; the fields are still validated here before use.
 */
export const StyleFrame: FC<Record<string, unknown>> = (raw) => {
  const props = raw as unknown as StyleFrameProps;
  const Scene = SCENES[props.styleId] ?? (SCENES['soft-3d'] as FC<StyleSceneProps>);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Scene
        title={props.title}
        subtitle={props.subtitle}
        expression={props.expression}
        pose={props.pose}
      />
    </AbsoluteFill>
  );
};
