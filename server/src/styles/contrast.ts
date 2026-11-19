/**
 * WCAG contrast helpers. Used by the style pack tests now and by the Stage 4
 * character-palette acceptance check later.
 */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) throw new Error(`Invalid hex color: ${hex}`);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastRequirement {
  pair: string;
  foreground: string;
  background: string;
  min: number;
  ratio: number;
  ok: boolean;
}

export interface ContrastReport {
  ok: boolean;
  checks: ContrastRequirement[];
}

export interface PaletteLike {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  outline: string;
}

/**
 * Thresholds:
 *  - body text vs background: 4.5 (WCAG AA normal text)
 *  - outline vs background: 3.0 (must read as a drawn edge)
 *  - surface, primary, secondary, accent vs background: 1.6 (must be visible
 *    but is not carrying text, so AA text contrast would be wrong)
 */
export function checkPalette(palette: PaletteLike): ContrastReport {
  const checks: ContrastRequirement[] = [
    { pair: 'text/background', foreground: palette.text, background: palette.background, min: 4.5 },
    { pair: 'outline/background', foreground: palette.outline, background: palette.background, min: 3 },
    { pair: 'primary/background', foreground: palette.primary, background: palette.background, min: 1.6 },
    { pair: 'secondary/background', foreground: palette.secondary, background: palette.background, min: 1.6 },
    { pair: 'accent/background', foreground: palette.accent, background: palette.background, min: 1.6 },
    { pair: 'surface/background', foreground: palette.surface, background: palette.background, min: 1.05 },
  ].map((check) => {
    const ratio = Math.round(contrastRatio(check.foreground, check.background) * 100) / 100;
    return { ...check, ratio, ok: ratio >= check.min };
  });

  return { ok: checks.every((check) => check.ok), checks };
}
