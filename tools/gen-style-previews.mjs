#!/usr/bin/env node
/**
 * Writes styles/<id>/preview.png (360x640) for every pack, using only the
 * theme palette and a per-style motif. No image libraries: a tiny RGB raster
 * with a hand-rolled PNG encoder, so the style picker always has real art.
 *
 * Run: npm run style:previews
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(repoRoot, 'styles');
const W = 360;
const H = 640;

// ---------------------------------------------------------------------------
// PNG encoder
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor RGB
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Colors + raster helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function shade(color, factor) {
  return color.map((value) => Math.max(0, Math.min(255, Math.round(value * factor))));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 3);
  }

  blendPixel(x, y, color, alpha) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height || alpha <= 0) return;
    const i = (py * this.width + px) * 3;
    const a = Math.min(1, alpha);
    this.data[i] = Math.round(this.data[i] * (1 - a) + color[0] * a);
    this.data[i + 1] = Math.round(this.data[i + 1] * (1 - a) + color[1] * a);
    this.data[i + 2] = Math.round(this.data[i + 2] * (1 - a) + color[2] * a);
  }

  fill(color, alpha = 1) {
    this.rect(0, 0, this.width, this.height, color, alpha);
  }

  rect(x, y, w, h, color, alpha = 1) {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) this.blendPixel(px, py, color, alpha);
    }
  }

  vgradient(top, bottom) {
    for (let y = 0; y < this.height; y += 1) {
      const color = mix(top, bottom, y / (this.height - 1));
      this.rect(0, y, this.width, 1, color, 1);
    }
  }

  circle(cx, cy, radius, color, alpha = 1) {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.blendPixel(x, y, color, alpha);
      }
    }
  }

  ring(cx, cy, outer, inner, color, alpha = 1) {
    const x0 = Math.max(0, Math.floor(cx - outer));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + outer));
    const y0 = Math.max(0, Math.floor(cy - outer));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + outer));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= outer * outer && d2 >= inner * inner) this.blendPixel(x, y, color, alpha);
      }
    }
  }

  roundedRect(x, y, w, h, radius, color, alpha = 1) {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w));
    const y1 = Math.min(this.height, Math.round(y + h));
    for (let py = y0; py < y1; py += 1) {
      for (let px = x0; px < x1; px += 1) {
        const dx = Math.max(x0 + radius - px, 0, px - (x1 - radius - 1));
        const dy = Math.max(y0 + radius - py, 0, py - (y1 - radius - 1));
        if (dx * dx + dy * dy <= radius * radius) this.blendPixel(px, py, color, alpha);
      }
    }
  }

  line(x1, y1, x2, y2, thickness, color, alpha = 1) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(length));
    const radius = Math.max(0.5, thickness / 2);
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      this.circle(x1 + dx * t, y1 + dy * t, radius, color, alpha);
    }
  }

  ellipse(cx, cy, rx, ry, color, alpha = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.blendPixel(x, y, color, alpha);
      }
    }
  }

  noise(amount, seed = 1) {
    if (amount <= 0) return;
    const random = mulberry32(seed);
    for (let i = 0; i < this.data.length; i += 3) {
      const delta = (random() - 0.5) * 255 * amount;
      this.data[i] = Math.max(0, Math.min(255, this.data[i] + delta));
      this.data[i + 1] = Math.max(0, Math.min(255, this.data[i + 1] + delta));
      this.data[i + 2] = Math.max(0, Math.min(255, this.data[i + 2] + delta));
    }
  }

  blur(radius) {
    if (radius < 1) return;
    const w = this.width;
    const h = this.height;
    const src = this.data;
    const tmp = Buffer.alloc(src.length);
    const windowSize = radius * 2 + 1;

    for (let y = 0; y < h; y += 1) {
      for (let c = 0; c < 3; c += 1) {
        let sum = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const x = Math.min(w - 1, Math.max(0, k));
          sum += src[(y * w + x) * 3 + c];
        }
        for (let x = 0; x < w; x += 1) {
          tmp[(y * w + x) * 3 + c] = Math.round(sum / windowSize);
          const removeX = Math.min(w - 1, Math.max(0, x - radius));
          const addX = Math.min(w - 1, Math.max(0, x + radius + 1));
          sum += src[(y * w + addX) * 3 + c] - src[(y * w + removeX) * 3 + c];
        }
      }
    }

    for (let x = 0; x < w; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        let sum = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const y = Math.min(h - 1, Math.max(0, k));
          sum += tmp[(y * w + x) * 3 + c];
        }
        for (let y = 0; y < h; y += 1) {
          src[(y * w + x) * 3 + c] = Math.round(sum / windowSize);
          const removeY = Math.min(h - 1, Math.max(0, y - radius));
          const addY = Math.min(h - 1, Math.max(0, y + radius + 1));
          sum += tmp[(addY * w + x) * 3 + c] - tmp[(removeY * w + x) * 3 + c];
        }
      }
    }
  }

  vignette(strength) {
    if (strength <= 0) return;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const maxDist = Math.hypot(cx, cy);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const distance = Math.hypot(x - cx, y - cy) / maxDist;
        const factor = 1 - strength * distance * distance;
        const i = (y * this.width + x) * 3;
        this.data[i] = Math.round(this.data[i] * factor);
        this.data[i + 1] = Math.round(this.data[i + 1] * factor);
        this.data[i + 2] = Math.round(this.data[i + 2] * factor);
      }
    }
  }

  glow(cx, cy, radius, color, alpha) {
    const steps = 7;
    for (let i = steps; i >= 1; i -= 1) {
      this.circle(cx, cy, (radius * i) / steps, color, alpha / (i * 1.6));
    }
  }
}

// ---------------------------------------------------------------------------
// Shared composition pieces
// ---------------------------------------------------------------------------

function drawSubtitle(canvas, palette) {
  canvas.roundedRect(42, 524, 276, 74, 18, palette.surface, 0.86);
  canvas.roundedRect(62, 544, 196, 12, 6, palette.text, 0.9);
  canvas.roundedRect(62, 566, 132, 10, 5, palette.accent, 0.92);
  canvas.circle(292, 562, 8, palette.accent, 0.9);
}

function drawFigure(canvas, palette, cx = 180, baseY = 470) {
  canvas.ellipse(cx, baseY + 12, 92, 14, palette.outline, 0.16);
  canvas.roundedRect(cx - 46, baseY - 150, 92, 150, 34, palette.primary, 1);
  canvas.circle(cx, baseY - 186, 52, shade(palette.primary, 1.08), 1);
  canvas.circle(cx - 18, baseY - 196, 7, palette.text, 0.9);
  canvas.circle(cx + 18, baseY - 196, 7, palette.text, 0.9);
  canvas.ellipse(cx, baseY - 172, 14, 7, palette.text, 0.55);
}

// ---------------------------------------------------------------------------
// Motifs
// ---------------------------------------------------------------------------

function paint(slug, canvas, palette, random) {
  switch (slug) {
    case 'soft-3d': {
      canvas.circle(180, 110, 150, shade(palette.accent, 1.06), 0.25);
      canvas.ellipse(180, 488, 118, 18, palette.outline, 0.14);
      drawFigure(canvas, palette);
      canvas.circle(264, 392, 30, palette.secondary, 0.95);
      canvas.ring(264, 392, 34, 28, palette.outline, 0.25);
      canvas.circle(96, 390, 18, palette.accent, 0.9);
      canvas.blur(2);
      canvas.roundedRect(64, 92, 54, 54, 16, palette.secondary, 0.35);
      canvas.roundedRect(250, 128, 42, 42, 14, palette.primary, 0.25);
      break;
    }
    case 'cinematic-3d': {
      canvas.rect(0, 0, W, 78, [0, 0, 0], 1);
      canvas.rect(0, H - 78, W, 78, [0, 0, 0], 1);
      for (let i = 0; i < 5; i += 1) {
        canvas.line(60, 78, 260 + i * 16, H - 78, 26 - i * 4, palette.primary, 0.035);
      }
      canvas.ellipse(180, 470, 190, 22, [0, 0, 0], 0.32);
      canvas.roundedRect(150, 330, 60, 140, 12, shade(palette.background, 1.6), 1);
      canvas.circle(180, 312, 34, shade(palette.background, 1.75), 1);
      canvas.ring(180, 312, 37, 34, palette.outline, 0.45);
      canvas.glow(270, 160, 40, palette.secondary, 0.2);
      canvas.ring(268, 172, 18, 14, palette.secondary, 0.55);
      break;
    }
    case 'chalk-doodle': {
      canvas.rect(18, 18, W - 36, H - 36, palette.outline, 0.06);
      for (const [x, y, w, h] of [
        [18, 18, W - 36, 3],
        [18, H - 21, W - 36, 3],
        [18, 18, 3, H - 36],
        [W - 21, 18, 3, H - 36],
      ]) {
        canvas.rect(x, y, w, h, palette.outline, 0.35);
      }
      let px = 50;
      let py = 360;
      for (let i = 0; i < 30; i += 1) {
        const nx = 50 + i * 9;
        const ny = 360 + Math.sin(i / 2.4) * 34;
        canvas.line(px, py, nx, ny, 3, palette.primary, 0.85);
        px = nx;
        py = ny;
      }
      canvas.circle(240, 250, 78, palette.primary, 0.1);
      canvas.ring(240, 250, 78, 73, palette.outline, 0.7);
      canvas.line(205, 250, 275, 250, 5, palette.outline, 0.8);
      canvas.line(240, 215, 240, 285, 5, palette.outline, 0.8);
      canvas.line(120, 300, 176, 262, 4, palette.accent, 0.85);
      canvas.line(176, 262, 168, 286, 4, palette.accent, 0.85);
      for (let i = 0; i < 60; i += 1) {
        canvas.circle(random() * W, random() * H, 1.4, palette.outline, 0.18);
      }
      break;
    }
    case 'golden-neon': {
      canvas.glow(180, 300, 150, palette.accent, 0.3);
      canvas.ring(180, 300, 128, 122, palette.primary, 0.8);
      canvas.ring(180, 300, 92, 88, palette.secondary, 0.65);
      canvas.ring(180, 300, 58, 55, palette.accent, 0.6);
      canvas.circle(180, 300, 40, palette.primary, 0.9);
      canvas.circle(180, 300, 22, palette.background, 0.85);
      for (let i = 0; i < 8; i += 1) {
        canvas.line(40 + i * 40, 480 - i * 6, 320 - i * 26, 520 + i * 3, 2, palette.primary, 0.35);
      }
      for (let i = 0; i < 14; i += 1) {
        canvas.circle(random() * W, 120 + random() * 300, 2, palette.accent, 0.5);
      }
      canvas.rect(0, 520, W, 120, palette.background, 0.55);
      break;
    }
    case 'pop-comic': {
      for (let y = 0; y < H; y += 13) {
        for (let x = 0; x < W; x += 13) {
          canvas.circle(x + 6, y + 6, 3.2, palette.outline, 0.16);
        }
      }
      for (let i = 0; i < 16; i += 1) {
        const angle = (i / 16) * Math.PI * 2;
        canvas.line(180, 290, 180 + Math.cos(angle) * 150, 290 + Math.sin(angle) * 150, 10, palette.accent, 0.55);
      }
      canvas.circle(180, 290, 92, palette.accent, 1);
      canvas.ring(180, 290, 96, 88, palette.outline, 1);
      canvas.circle(180, 290, 52, palette.primary, 1);
      canvas.ring(180, 290, 56, 50, palette.outline, 1);
      canvas.circle(160, 272, 8, palette.background, 0.95);
      canvas.circle(200, 272, 8, palette.background, 0.95);
      canvas.roundedRect(78, 100, 204, 54, 6, palette.background, 1);
      canvas.rect(72, 96, 216, 6, palette.outline, 1);
      canvas.rect(72, 152, 216, 6, palette.outline, 1);
      canvas.roundedRect(104, 118, 150, 14, 2, palette.primary, 0.9);
      break;
    }
    case 'flat-poster': {
      canvas.rect(0, 300, W, 200, palette.primary, 0.92);
      canvas.circle(268, 190, 108, palette.secondary, 0.9);
      canvas.rect(28, 96, 148, 20, palette.text, 0.92);
      canvas.rect(28, 128, 108, 20, palette.text, 0.55);
      canvas.roundedRect(48, 340, 220, 96, 4, palette.background, 0.96);
      canvas.rect(66, 364, 128, 14, palette.text, 0.9);
      canvas.rect(66, 392, 172, 10, palette.secondary, 0.85);
      canvas.circle(78, 470, 22, palette.accent, 1);
      canvas.rect(0, 540, W, 100, palette.text, 0.9);
      canvas.rect(42, 568, 160, 12, palette.background, 0.9);
      canvas.rect(42, 590, 96, 10, palette.accent, 0.95);
      break;
    }
    case '8-bit-quest': {
      const unit = 24;
      for (let y = 0; y < H; y += unit) {
        for (let x = 0; x < W; x += unit) {
          const tile = (Math.floor(x / unit) + Math.floor(y / unit)) % 2 === 0;
          canvas.rect(x, y, unit, unit, tile ? shade(palette.surface, 1.05) : palette.surface, 0.5);
        }
      }
      canvas.rect(96, 168, 168, 264, palette.background, 0.92);
      canvas.rect(96, 168, 168, 8, palette.outline, 1);
      canvas.rect(96, 424, 168, 8, palette.outline, 1);
      for (let y = 0; y < 6; y += 1) {
        for (let x = 0; x < 6; x += 1) {
          const filled =
            (x === 1 && y === 1) || (x === 4 && y === 1) || y === 4 || (y === 3 && x !== 0 && x !== 5);
          if (filled) canvas.rect(120 + x * 20, 216 + y * 20, 18, 18, palette.primary, 1);
        }
      }
      canvas.rect(120, 196, 18, 18, palette.accent, 1);
      canvas.rect(174, 196, 18, 18, palette.accent, 1);
      canvas.rect(36, 84, 46, 20, palette.secondary, 0.9);
      canvas.rect(48, 72, 22, 12, palette.secondary, 0.9);
      canvas.rect(264, 340, 18, 18, palette.accent, 0.9);
      break;
    }
    case 'retro-console': {
      for (let y = 0; y < H; y += 4) {
        canvas.rect(0, y, W, 1.5, [0, 0, 0], 0.4);
      }
      canvas.roundedRect(34, 128, W - 68, 316, 10, palette.surface, 0.85);
      canvas.rect(34, 128, W - 68, 34, palette.primary, 0.22);
      canvas.rect(46, 140, 86, 10, palette.primary, 0.9);
      const rows = [186, 214, 242, 270, 298, 326, 354, 382];
      rows.forEach((y, i) => {
        canvas.rect(52, y, 26, 12, palette.secondary, 0.85);
        canvas.rect(88, y, 120 + ((i * 37) % 110), 12, palette.text, 0.5);
      });
      canvas.rect(52, 414, 14, 14, palette.primary, 1);
      canvas.glow(180, 300, 120, palette.primary, 0.12);
      canvas.rect(0, 0, W, 18, palette.background, 1);
      canvas.rect(0, H - 18, W, 18, palette.background, 1);
      break;
    }
    case 'line-diagram': {
      for (let x = 0; x <= W; x += 32) canvas.line(x, 0, x, H, 1, palette.text, 0.08);
      for (let y = 0; y <= H; y += 32) canvas.line(0, y, W, y, 1, palette.text, 0.08);
      canvas.circle(136, 236, 34, palette.background, 1);
      canvas.ring(136, 236, 36, 33, palette.primary, 1);
      canvas.line(170, 236, 246, 236, 2, palette.primary, 0.9);
      canvas.line(246, 236, 238, 230, 2, palette.primary, 0.9);
      canvas.line(246, 236, 238, 242, 2, palette.primary, 0.9);
      canvas.roundedRect(64, 74, 118, 30, 4, palette.accent, 0.16);
      canvas.rect(64, 74, 118, 2, palette.accent, 0.9);
      canvas.rect(76, 86, 72, 6, palette.accent, 0.8);
      canvas.circle(252, 330, 26, palette.background, 1);
      canvas.ring(252, 330, 28, 25, palette.secondary, 1);
      canvas.line(136, 270, 252, 304, 1.6, palette.text, 0.45);
      canvas.rect(150, 400, 158, 2, palette.text, 0.5);
      canvas.rect(150, 392, 2, 18, palette.text, 0.5);
      canvas.rect(306, 392, 2, 18, palette.text, 0.5);
      canvas.rect(196, 410, 56, 6, palette.text, 0.35);
      break;
    }
    case 'toy-bricks': {
      for (let y = 0; y < H; y += 32) {
        for (let x = 0; x < W; x += 32) {
          canvas.circle(x + 10, y + 10, 5, palette.surface, 0.9);
          canvas.ring(x + 10, y + 10, 6, 4, palette.outline, 0.12);
        }
      }
      const bricks = [
        [100, 400, 160, 48, palette.primary],
        [124, 352, 112, 48, palette.secondary],
        [148, 304, 64, 48, palette.accent],
      ];
      for (const [x, y, w, h, color] of bricks) {
        canvas.rect(x, y, w, h, color, 1);
        canvas.rect(x, y, w, 4, shade(color, 1.15), 1);
        for (let sx = x + 16; sx < x + w - 8; sx += 32) {
          canvas.circle(sx, y, 9, color, 1);
          canvas.ring(sx, y, 9, 6, palette.outline, 0.25);
        }
      }
      canvas.roundedRect(88, 140, 184, 92, 10, palette.background, 0.96);
      canvas.rect(108, 164, 144, 14, palette.text, 0.9);
      canvas.rect(108, 190, 96, 12, palette.accent, 0.9);
      break;
    }
    default:
      drawFigure(canvas, palette);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const packs = fs
  .readdirSync(stylesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => fs.existsSync(path.join(stylesDir, name, 'theme.json')));

if (packs.length === 0) {
  console.error('No style packs found. Run "npm run style:packs" first.');
  process.exitCode = 1;
} else {
  for (const id of packs) {
    const theme = JSON.parse(fs.readFileSync(path.join(stylesDir, id, 'theme.json'), 'utf8'));
    const palette = {
      background: hexToRgb(theme.palette.background),
      surface: hexToRgb(theme.palette.surface),
      primary: hexToRgb(theme.palette.primary),
      secondary: hexToRgb(theme.palette.secondary),
      accent: hexToRgb(theme.palette.accent),
      text: hexToRgb(theme.palette.text),
      outline: hexToRgb(theme.palette.outline),
    };
    const canvas = new Canvas(W, H);
    const top = shade(palette.background, 1.06);
    const bottom = shade(palette.background, 0.78);
    canvas.vgradient(top, bottom);
    const random = mulberry32(
      [...id].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7),
    );
    paint(id, canvas, palette, random);
    canvas.noise(theme.grain?.intensity ?? 0.05, id.length * 97);
    drawSubtitle(canvas, palette);
    canvas.vignette(Number(theme.post?.vignette ?? 0.2) * 0.6);

    fs.writeFileSync(path.join(stylesDir, id, 'preview.png'), encodePng(W, H, canvas.data));
    console.log(`preview.png  ${id}`);
  }
  console.log(`Wrote ${packs.length} preview images (${W}x${H}).`);
}
