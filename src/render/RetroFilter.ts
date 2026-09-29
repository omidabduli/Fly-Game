/**
 * Turns a painted layer into 90s-anime cel art: richer colour with violet
 * shadows and warm highlights, a limited palette with ordered dithering,
 * and bold ink outlines where two colours meet (or where a shape meets
 * empty space). Runs once per repaint on a small buffer, so it is cheap.
 */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export interface RetroOptions {
  /** colour steps per channel */
  levels: number;
  saturation: number;
  contrast: number;
  /** colour distance (sum of channels) that counts as an outline edge */
  edge: number;
  ink: [number, number, number];
}

export const RETRO_DEFAULTS: RetroOptions = {
  levels: 8,
  saturation: 1.38,
  contrast: 1.1,
  edge: 78,
  ink: [36, 24, 52],
};

export function retroFilter(canvas: HTMLCanvasElement | OffscreenCanvas, o: RetroOptions = RETRO_DEFAULTS): void {
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;
  // pass 1: grade (colour first, before quantising, so edges are found on the real image)
  const g = new Float32Array(n * 3);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (d[j + 3] < 8) continue;
    let r = d[j];
    let gg = d[j + 1];
    let b = d[j + 2];
    const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
    r = lum + (r - lum) * o.saturation;
    gg = lum + (gg - lum) * o.saturation;
    b = lum + (b - lum) * o.saturation;
    r = (r - 128) * o.contrast + 128;
    gg = (gg - 128) * o.contrast + 128;
    b = (b - 128) * o.contrast + 128;
    const t = lum / 255;
    // shadows lean violet, highlights lean warm
    const sh = (1 - t) * (1 - t) * 0.2;
    const hi = t * t * t * 0.12;
    r = r + (48 - r) * sh + (255 - r) * hi;
    gg = gg + (30 - gg) * sh + (238 - gg) * hi;
    b = b + (104 - b) * sh + (206 - b) * hi;
    g[i * 3] = r;
    g[i * 3 + 1] = gg;
    g[i * 3 + 2] = b;
  }
  // pass 2: outlines from the graded image (gradients change slowly, real edges jump)
  const edge = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = d[i * 4 + 3];
      if (a < 8) continue;
      const cmp = (k: number): number => {
        if (d[k * 4 + 3] < 8) return 2; // silhouette against empty space: soft outline
        const dr = Math.abs(g[i * 3] - g[k * 3]);
        const dg = Math.abs(g[i * 3 + 1] - g[k * 3 + 1]);
        const db = Math.abs(g[i * 3 + 2] - g[k * 3 + 2]);
        return dr + dg + db > o.edge ? 1 : 0;
      };
      let e = 0;
      if (x + 1 < w) e = Math.max(e, cmp(i + 1));
      if (y + 1 < h) e = Math.max(e, cmp(i + w));
      if (e === 0) continue;
      // draw the line on the darker of the two pixels so it is one pixel thick
      const k1 = x + 1 < w ? i + 1 : -1;
      const k2 = y + 1 < h ? i + w : -1;
      const lumI = g[i * 3] + g[i * 3 + 1] + g[i * 3 + 2];
      let darker = true;
      for (const k of [k1, k2]) {
        if (k < 0 || d[k * 4 + 3] < 8) continue;
        if (g[k * 3] + g[k * 3 + 1] + g[k * 3 + 2] < lumI - 6) darker = false;
      }
      if (darker) edge[i] = e;
    }
  }
  // pass 3: dither + quantise, then ink
  const step = 255 / (o.levels - 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const j = i * 4;
      if (d[j + 3] < 8) continue;
      const th = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * step * 0.7;
      let r = Math.round((g[i * 3] + th) / step) * step;
      let gg = Math.round((g[i * 3 + 1] + th) / step) * step;
      let b = Math.round((g[i * 3 + 2] + th) / step) * step;
      if (edge[i]) {
        const m = edge[i] === 2 ? 0.55 : 0.82;
        r += (o.ink[0] - r) * m;
        gg += (o.ink[1] - gg) * m;
        b += (o.ink[2] - b) * m;
      }
      d[j] = r < 0 ? 0 : r > 255 ? 255 : r;
      d[j + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg;
      d[j + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Film-like overlay for the whole picture: soft vignette and faint scanlines. */
export function makeRetroOverlay(w: number, h: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.45, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
  g.addColorStop(0, 'rgba(30,14,50,0)');
  g.addColorStop(1, 'rgba(30,14,50,0.42)');
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = 'rgba(20,10,35,0.07)';
  const period = Math.max(3, Math.round(3 * dpr));
  for (let y = 0; y < c.height; y += period) x.fillRect(0, y, c.width, Math.max(1, Math.round(dpr)));
  return c;
}
