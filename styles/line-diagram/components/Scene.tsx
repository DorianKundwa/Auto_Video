/**
 * Line Diagram — style pack scene.
 *
 * Implements the shared StyleSceneProps contract. This is the stub:
 * it paints the pack's palette, typography, outline and post-processing mood.
 * Stage 8 composes it with shot data (background, characters, props, camera,
 * subtitles); the props never change.
 */
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { CSSProperties, FC } from 'react';
import type { StyleSceneProps } from '../../shared/types';
import theme from '../theme.json';

const OVERLAY: CSSProperties = {
  "background": "linear-gradient(rgba(233,241,250,0.06) 1px, rgba(0,0,0,0) 1px), linear-gradient(90deg, rgba(233,241,250,0.06) 1px, rgba(0,0,0,0) 1px)",
  "backgroundSize": "32px 32px"
};

export const Scene: FC<StyleSceneProps> = ({ title = 'ShortForge', subtitle, children }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' });
  const drift = interpolate(frame, [0, 90], [0, 10], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      data-style="line-diagram"
      style={{
        backgroundColor: theme.palette.background,
        color: theme.palette.text,
        fontFamily: theme.fonts.body,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 80% at 50% 18%, ${theme.palette.surface}, ${theme.palette.background})`,
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
          transform: `translateY(${drift}px)`,
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
                : `0 0 ${theme.outline.widthPx * 1.6}px ${theme.palette.outline}`,
            opacity: enter,
            transform: `translateY(${(1 - enter) * 26}px) scale(${0.96 + enter * 0.04})`,
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
