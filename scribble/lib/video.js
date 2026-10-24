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

// style: { bg, color, highlight, highlightOn, family, size (0.5–1.6), position: 'middle' | 'lower', still }
// `still` skips the pop-in animation (for a paused preview).
export function drawFrame(ctx, W, H, t, captions, style) {
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, W, H);
  const cap = activeCaption(captions, t);
  if (!cap) return;

  const words = captionWords(cap);
  const maxWidth = W * 0.86;
  let size = Math.min(W, H) * 0.12 * style.size;
  const fontFor = (s) => `${s}px "${style.family}", "Fredoka", "Comic Sans MS", sans-serif`;
  ctx.font = fontFor(size);
  let lay = layout(ctx, words, maxWidth);
  // Shrink rather than run off the screen.
  while ((lay.lines.length > 3 || lay.lines.some((l) => l.width > maxWidth)) && size > 20) {
    size *= 0.92;
    ctx.font = fontFor(size);
    lay = layout(ctx, words, maxWidth);
  }

  const lineH = size * 1.25;
  const blockH = lay.lines.length * lineH;
  const centerY = style.position === 'lower' ? H * 0.78 : H * 0.5;
  const age = t - cap.start;
  const k = style.still ? 1 : Math.min(1, age / POP);
  const ease = 1 - (1 - k) ** 3;

  ctx.save();
  ctx.globalAlpha = ease;
  ctx.translate(W / 2, centerY);
  const scale = 0.9 + 0.1 * ease;
  ctx.scale(scale, scale);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  // Baseline of each line, with the block vertically centred on centerY.
  lay.lines.forEach((line, li) => {
    let x = -line.width / 2;
    const y = -blockH / 2 + li * lineH + size * 0.92;
    for (const w of line.words) {
      const on = style.highlightOn && t >= w.start && t < w.end;
      ctx.fillStyle = on ? style.highlight : style.color;
      ctx.fillText(w.text, x, y);
      x += w.width + lay.space;
    }
  });
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

// Plays an AudioBuffer and reports the current position; used for both preview and export.
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
  async play(buffer, from = 0, extraDestination = null, { toSpeakers = true } = {}) {
    this.stop();
    const ctx = this.ensure();
    if (ctx.state === 'suspended') await ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (toSpeakers) src.connect(ctx.destination);
    if (extraDestination) src.connect(extraDestination);
    src.onended = () => { if (this.src === src) { this.playing = false; this.offset = buffer.duration; this.onended?.(); } };
    this.offset = from;
    this.startedAt = ctx.currentTime;
    src.start(0, from);
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

    const tail = 0.6;
    const total = buffer.duration + tail;
    // A timer rather than requestAnimationFrame, so the export still finishes
    // (if choppily) when the tab is in the background.
    let timer = 0;
    let ended = false;
    const tick = () => {
      const t = ended ? buffer.duration + (performance.now() - endWall) / 1000 : player.time;
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
    let endWall = 0;
    player.onended = () => { ended = true; endWall = performance.now(); };

    rec.start(250);
    player.play(buffer, 0, dest, { toSpeakers: false }).then(tick, reject);
  });
}
