// Words with timings -> caption lines. A word is { text, start, end } in seconds;
// a caption is { start, end, text, words }.

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

export const LANGUAGES = {
  en: { label: 'English', model: 'Xenova/whisper-base.en' },
  es: { label: 'Spanish', model: 'Xenova/whisper-base', language: 'spanish' },
  auto: { label: 'Other / detect automatically', model: 'Xenova/whisper-base' },
};

export async function decodeAudio(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    ctx.close();
  }
}

async function resample(buffer, rate) {
  const length = Math.ceil(buffer.duration * rate);
  const off = new OfflineAudioContext(1, length, rate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

function monoSamples(buffer) {
  const n = buffer.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / buffer.numberOfChannels;
  }
  return out;
}

// Rough voice-activity detection: which stretches of the recording are speech.
export function speechSegments(buffer) {
  const data = monoSamples(buffer);
  const frame = Math.round(buffer.sampleRate * 0.02);
  const rms = [];
  for (let i = 0; i + frame <= data.length; i += frame) {
    let s = 0;
    for (let j = i; j < i + frame; j++) s += data[j] * data[j];
    rms.push(Math.sqrt(s / frame));
  }
  if (!rms.length) return [];
  const sorted = [...rms].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  const peak = sorted[Math.floor(sorted.length * 0.98)];
  const thr = Math.max(floor * 2.5, floor + (peak - floor) * 0.12);
  const segs = [];
  let cur = null;
  rms.forEach((v, i) => {
    const t = i * 0.02;
    if (v >= thr) {
      if (cur && t - cur.end < 0.3) cur.end = t + 0.02;
      else { cur = { start: t, end: t + 0.02 }; segs.push(cur); }
    }
  });
  return segs.filter((s) => s.end - s.start > 0.08);
}

// Spread typed words over the parts of the recording where someone is talking.
export function syncScript(text, buffer) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  let segs = speechSegments(buffer);
  if (!segs.length) segs = [{ start: 0, end: buffer.duration }];
  const total = segs.reduce((a, s) => a + s.end - s.start, 0);
  const weights = tokens.map((t) => t.replace(/[^\p{L}\p{N}]/gu, '').length + 2);
  const sum = weights.reduce((a, b) => a + b, 0);

  // Walk a cursor along the concatenated speech time.
  const at = (speechTime) => {
    let left = speechTime;
    for (const s of segs) {
      const d = s.end - s.start;
      if (left <= d) return s.start + left;
      left -= d;
    }
    return segs[segs.length - 1].end;
  };
  let acc = 0;
  return tokens.map((t, i) => {
    const start = at((acc / sum) * total);
    acc += weights[i];
    const end = at((acc / sum) * total - 1e-6);
    return { text: t, start, end };
  });
}

let pipelines = {};

export async function transcribe(buffer, lang, onProgress) {
  const cfg = LANGUAGES[lang] || LANGUAGES.en;
  onProgress?.('Loading speech recognition…');
  const { pipeline, env } = await import(TRANSFORMERS_URL);
  env.allowLocalModels = false;
  if (!pipelines[cfg.model]) {
    const files = {};
    pipelines[cfg.model] = await pipeline('automatic-speech-recognition', cfg.model, {
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) {
          files[p.file] = [p.loaded, p.total];
          const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
          onProgress?.(`Downloading speech model (first time only)… ${Math.round((l / t) * 100)}%`);
        }
      },
    });
  }
  const asr = pipelines[cfg.model];
  onProgress?.('Listening to the recording…');
  const audio = await resample(buffer, 16000);
  const opts = { chunk_length_s: 30, stride_length_s: 5 };
  if (cfg.language) Object.assign(opts, { language: cfg.language, task: 'transcribe' });

  let words;
  try {
    const out = await asr(audio, { ...opts, return_timestamps: 'word' });
    words = (out.chunks || []).map((c) => ({ text: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] }));
  } catch (err) {
    // Some models can't do word timings; fall back to phrase timings.
    console.warn('Word timestamps unavailable, using phrases', err);
    const out = await asr(audio, { ...opts, return_timestamps: true });
    words = [];
    for (const c of out.chunks || []) {
      const [s, e] = c.timestamp;
      const parts = c.text.trim().split(/\s+/).filter(Boolean);
      const end = e ?? buffer.duration;
      parts.forEach((p, i) => words.push({ text: p, start: s + ((end - s) * i) / parts.length, end: s + ((end - s) * (i + 1)) / parts.length }));
    }
  }
  return words
    .filter((w) => w.text && !/^\[.*\]$|^\(.*\)$/.test(w.text))
    .map((w) => ({ ...w, end: w.end ?? Math.min(buffer.duration, w.start + 0.4) }));
}

export function groupWords(words, maxChars = 24) {
  const caps = [];
  let cur = null;
  const flush = () => { if (cur) caps.push(cur); cur = null; };
  words.forEach((w, i) => {
    const gap = cur ? w.start - cur.end : 0;
    const len = cur ? cur.text.length + 1 + w.text.length : w.text.length;
    if (cur && (len > maxChars || gap > 0.8)) flush();
    if (!cur) cur = { start: w.start, end: w.end, text: w.text, words: [w] };
    else { cur.text += ' ' + w.text; cur.end = w.end; cur.words.push(w); }
    const next = words[i + 1];
    if (/[.!?]$/.test(w.text) && cur.text.length > maxChars * 0.4) flush();
    else if (!next) flush();
  });
  // Keep each caption up until the next one starts if the pause is short.
  caps.forEach((c, i) => {
    const next = caps[i + 1];
    c.end = next && next.start - c.end < 0.6 ? next.start : c.end + 0.35;
  });
  return caps;
}

// Word timings for a caption, re-spread evenly if its text was edited.
export function captionWords(cap) {
  const parts = cap.text.split(/\s+/).filter(Boolean);
  if (cap.words && cap.words.length === parts.length && cap.words.every((w, i) => w.text === parts[i])) return cap.words;
  const weights = parts.map((p) => p.length + 2);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const dur = Math.max(0.1, cap.end - cap.start);
  let acc = 0;
  return parts.map((p, i) => {
    const start = cap.start + (acc / sum) * dur;
    acc += weights[i];
    return { text: p, start, end: cap.start + (acc / sum) * dur };
  });
}
