import type { FC } from 'react';
import { Composition } from 'remotion';
import { StyleFrame } from './StyleFrame';

/**
 * Stage 8 will add the real shot compositions here (and render them in chunks).
 * For now this registers one 1080x1920 style frame so the style packs and the
 * three.js/post-processing pipeline can be previewed locally.
 */
export const RemotionRoot: FC = () => {
  const defaultProps: Record<string, unknown> = {
    styleId: 'soft-3d',
    title: 'ShortForge',
    subtitle: 'Style pack scene',
  };

  return (
    <>
      <Composition
        id="StyleFrame"
        component={StyleFrame}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
      />
      <Composition
        id="StyleFrameLandscape"
        component={StyleFrame}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultProps}
      />
    </>
  );
};
