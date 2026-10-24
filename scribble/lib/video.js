// Draws caption frames onto a canvas and records them, with the voice track, to a video file.

import { captionWords } from './captions.js';

export const ASPECTS = {
  '16:9': { w: 1920, h: 1080, label: 'Landscape 16:9', hint: 'YouTube, TV' },
  '9:16': { w: 1080, h: 1920, label: 'Vertical 9:16', hint: 'Reels, TikTok, Stories' },
  '1:1': { w: 1080, h: 1080, label: 'Square 1:1', hint: 'Instagram feed' },
  '4:5': { w: 1080, h: 1350, label: 'Portrait 4:5', hint: 'Instagram, Facebook' },
};

const POP = 0.14;

function activeCaption(captions, t) {
  for (const c of captions) if (t >= c.start && t < c.end) return c;
  return null;
}

function layout(ctx, words, maxWidth) {
  const space = ctx.measureText(' ').width;
  const lines = [];
  let line = { words: [], width: 0 };
  for (const w of words) {
    const width = ctx.measureText(w.text).width;
    const next = line.words.length ? line.width + space + width : width;
    if (line.words.length && next > maxWidth) {
      lines.push(line);
      line = { words: [], width: 0 };
    }
    line.words.push({ ...w, width });
    line.width = line.words.length > 1 ? line.width + space + width : width;
  }
  if (line.words.length) lines.push(line);
  return { lines, space };
}

const fontFor = (style, s) => `${s}px "${style.family}", "Fredoka", "Comic Sans MS", sans-serif`;

// Lays out words at the largest size (up to `size`) that fits in maxLines.
function fit(ctx, words, style, size, maxWidth, maxLines) {
  ctx.font = fontFor(style, size);
  let lay = layout(ctx, words, maxWidth);
  while ((lay.lines.length > maxLines || lay.lines.some((l) => l.width > maxWidth)) && size > 16) {
    size *= 0.92;
    ctx.font = fontFor(style, size);
    lay = layout(ctx, words, maxWidth);
  }
  return { ...lay, size };
}

function drawLines(ctx, lay, cx, cy, colorFor) {
  const lineH = lay.size * 1.25;
  const blockH = lay.lines.length * lineH;
  lay.lines.forEach((line, li) => {
    let x = cx - line.width / 2;
    const y = cy - blockH / 2 + li * lineH + lay.size * 0.92;
    for (const w of line.words) {
      ctx.fillStyle = colorFor(w);
      ctx.fillText(w.text, x, y);
      x += w.width + lay.space;
    }
  });
}

function drawBackground(ctx, W, H, style) {
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, W, H);
  const img = style.bgImage;
  if (!img) return;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.max(W / iw, H / ih);
  ctx.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
  if (style.bgFade) {
    // Wash the picture with the background colour so the words stand out.
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

const toWords = (text) => text.split(/\s+/).filter(Boolean).map((t) => ({ text: t }));

function drawTitleCard(ctx, W, H, t, style) {
  const fadeIn = style.still ? 1 : Math.min(1, t / 0.4);
  const fadeOut = style.still ? 1 : Math.min(1, (style.intro - t) / 0.3);
  const k = Math.max(0, Math.min(fadeIn, fadeOut));
  const m = Math.min(W, H);
  const maxWidth = W * 0.84;
  const title = style.title ? fit(ctx, toWords(style.title), style, m * 0.16 * style.size, maxWidth, 3) : null;
  const sub = style.subtitle ? fit(ctx, toWords(style.subtitle), style, m * 0.075 * style.size, maxWidth, 2) : null;
  const titleH = title ? title.lines.length * title.size * 1.25 : 0;
  const subH = sub ? sub.lines.length * sub.size * 1.25 : 0;
  const gap = title && sub ? m * 0.04 : 0;
  const top = H / 2 - (titleH + gap + subH) / 2;
  ctx.save();
  ctx.globalAlpha = k;
  if (title) {
    ctx.font = fontFor(style, title.size);
    drawLines(ctx, title, W / 2, top + titleH / 2, () => style.color);
  }
  if (sub) {
    ctx.font = fontFor(style, sub.size);
    drawLines(ctx, sub, W / 2, top + titleH + gap + subH / 2, () => style.highlight);
  }
  ctx.restore();
}

function drawNameTag(ctx, W, H, style) {
  const m = Math.min(W, H);
  const size = m * 0.06 * Math.sqrt(style.size);
  ctx.font = fontFor(style, size);
  ctx.textAlign = 'left';
  ctx.fillStyle = style.color;
  ctx.globalAlpha = 0.9;
  ctx.fillText(style.name, m * 0.06, m * 0.06 + size * 0.9);
  ctx.globalAlpha = 1;
}

// t is video time in seconds. The title card (style.intro seconds long, 0 for
// none) plays first; captions are timed against the audio, which starts after it.
// style: { bg, bgImage, bgFade, color, highlight, highlightOn, family, size (0.5–1.6),
//          position: 'middle' | 'lower', intro, title, subtitle, name, still }
// `still` skips animations (for a paused preview).
export function drawFrame(ctx, W, H, t, captions, style) {
  drawBackground(ctx, W, H, style);
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (style.bgImage) {
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = Math.min(W, H) * 0.012;
  }
  const intro = style.intro || 0;
  if (t < intro) drawTitleCard(ctx, W, H, t, style);
  else {
    if (style.name) drawNameTag(ctx, W, H, style);
    drawCaption(ctx, W, H, t - intro, captions, style);
  }
  ctx.restore();
}

function drawCaption(ctx, W, H, t, captions, style) {
  const cap = activeCaption(captions, t);
  if (!cap) return;
  const lay = fit(ctx, captionWords(cap), style, Math.min(W, H) * 0.12 * style.size, W * 0.86, 3);
  const centerY = style.position === 'lower' ? H * 0.78 : H * 0.5;
  const k = style.still ? 1 : Math.min(1, (t - cap.start) / POP);
  const ease = 1 - (1 - k) ** 3;

  ctx.save();
  ctx.globalAlpha = ease;
  ctx.translate(W / 2, centerY);
  const scale = 0.9 + 0.1 * ease;
  ctx.scale(scale, scale);
  ctx.font = fontFor(style, lay.size);
  drawLines(ctx, lay, 0, 0, (w) => (style.highlightOn && t >= w.start && t < w.end ? style.highlight : style.color));
  ctx.restore();
}

export function pickMime() {
  const options = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return options.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

// Plays an AudioBuffer on a video timeline: the audio starts `intro` seconds in.
// Used for both preview and export.
export class Player {
  constructor() {
    this.ctx = null;
    this.src = null;
    this.offset = 0;
    this.startedAt = 0;
    this.playing = false;
  }
  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this.ctx;
  }
  async play(buffer, from = 0, { intro = 0, extraDestination = null, toSpeakers = true } = {}) {
    this.stop();
    const ctx = this.ensure();
    if (ctx.state === 'suspended') await ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (toSpeakers) src.connect(ctx.destination);
    if (extraDestination) src.connect(extraDestination);
    src.onended = () => { if (this.src === src) { this.playing = false; this.offset = intro + buffer.duration; this.onended?.(); } };
    this.offset = from;
    this.startedAt = ctx.currentTime;
    src.start(ctx.currentTime + Math.max(0, intro - from), Math.max(0, from - intro));
    this.src = src;
    this.playing = true;
  }
  stop() {
    if (this.src) {
      this.offset = this.time;
      const s = this.src;
      this.src = null;
      try { s.stop(); } catch {}
    }
    this.playing = false;
  }
  get time() {
    if (!this.playing || !this.ctx) return this.offset;
    return this.offset + (this.ctx.currentTime - this.startedAt);
  }
}

// Renders in real time (the browser records what it plays). Returns a Blob.
export function exportVideo({ buffer, captions, style, aspect, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const { w, h } = ASPECTS[aspect];
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    drawFrame(ctx, w, h, 0, captions, style);

    const player = new Player();
    const actx = player.ensure();
    const dest = actx.createMediaStreamDestination();
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mimeType = pickMime();
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      actx.close();
      if (signal?.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
      resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'video/webm' }));
    };
    rec.onerror = (e) => reject(e.error || new Error('Recording failed'));

    const intro = style.intro || 0;
    const total = intro + buffer.duration + 0.6;
    // The audio clock keeps running after the voice ends, so it times the whole video.
    // A timer rather than requestAnimationFrame, so the export still finishes
    // (if choppily) when the tab is in the background.
    let timer = 0;
    const tick = () => {
      const t = actx.currentTime - player.startedAt;
      drawFrame(ctx, w, h, t, captions, style);
      onProgress?.(Math.min(1, t / total));
      if (signal?.aborted || t >= total) {
        clearTimeout(timer);
        player.stop();
        rec.stop();
        return;
      }
      timer = setTimeout(tick, 1000 / 30);
    };

    rec.start(250);
    player.play(buffer, 0, { intro, extraDestination: dest, toSpeakers: false }).then(tick, reject);
  });
}
