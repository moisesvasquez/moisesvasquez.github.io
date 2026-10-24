import { PAGES, PAPERS, pageSVG } from './lib/template.js';
import { loadPhoto, detectPage, readPageCode, readSheet, cellPreview } from './lib/scan.js';
import { buildFont, registerFont, fontNameFromBuffer } from './lib/font.js';
import { LANGUAGES, decodeAudio, syncScript, transcribe, groupWords } from './lib/captions.js';
import { ASPECTS, drawFrame, exportVideo, Player, pickMime } from './lib/video.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...kids);
  return n;
};
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const state = {
  photos: [], // { id, photo, corners, page, found, pageLocked }
  results: new Map(), // page index -> readSheet output
  excluded: new Set(),
  font: null, // { buffer, family, name }
  audio: null, // { blob, buffer, url }
  words: [],
  captions: [],
  style: {
    aspect: '9:16', bg: '#fff4d6', color: '#2b2a33', highlight: '#ff6b4a', highlightOn: true, size: 1, position: 'middle',
    bgFade: true, titleOn: false, title: '', subtitle: '', introLen: 3, nameOn: false, name: '',
  },
  bgImage: null, // HTMLImageElement; not saved between visits
};
try { Object.assign(state.style, JSON.parse(store.get('scribble.style') || '{}')); } catch {}
const saveStyle = () => store.set('scribble.style', JSON.stringify(state.style));

// ---------- navigation ----------

function go(step) {
  document.querySelectorAll('.step').forEach((s) => s.classList.toggle('active', s.id === `step-${step}`));
  document.querySelectorAll('.steps button').forEach((b) => b.classList.toggle('active', b.dataset.step === step));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (step === 'video') enterVideo();
  if (step === 'captions') $('#capNeedsAudio').hidden = !!state.audio;
}
document.querySelectorAll('.steps button').forEach((b) => b.addEventListener('click', () => go(b.dataset.step)));
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-goto]');
  if (t) { e.preventDefault(); go(t.dataset.goto); }
});
function markDone() {
  const done = {
    print: state.photos.length > 0 || !!state.font,
    scan: state.results.size > 0,
    font: !!state.font,
    record: !!state.audio,
    captions: state.captions.length > 0,
  };
  document.querySelectorAll('.steps button').forEach((b) => b.classList.toggle('done', !!done[b.dataset.step]));
}

// ---------- 1. print ----------

const previews = $('#sheetPreviews');
const printSheets = $('#printSheets');
const pageStyle = el('style');
document.head.append(pageStyle);
const paperInputs = [...document.querySelectorAll('input[name=paper]')];
const includeAccents = $('#includeAccents');
const savedPaper = store.get('scribble.paper');
if (PAPERS[savedPaper]) paperInputs.forEach((r) => { r.checked = r.value === savedPaper; });
includeAccents.checked = store.get('scribble.accents') !== '0';

function renderSheets() {
  const paper = paperInputs.find((r) => r.checked)?.value || 'a4';
  const pages = PAGES.map((_, i) => i).filter((i) => !PAGES[i].optional || includeAccents.checked);
  previews.replaceChildren();
  printSheets.replaceChildren();
  for (const i of pages) {
    const fig = el('figure');
    fig.innerHTML = pageSVG(i, paper, pages.length);
    fig.append(el('figcaption', {}, `Page ${i + 1}: ${PAGES[i].title}`));
    previews.append(fig);
    printSheets.insertAdjacentHTML('beforeend', pageSVG(i, paper, pages.length));
  }
  pageStyle.textContent = `@page { size: ${PAPERS[paper].css}; margin: 0; }`;
  store.set('scribble.paper', paper);
  store.set('scribble.accents', includeAccents.checked ? '1' : '0');
}
[...paperInputs, includeAccents].forEach((i) => i.addEventListener('change', renderSheets));
renderSheets();
$('#printBtn').addEventListener('click', () => window.print());

// ---------- 2. scan ----------

const photoInput = $('#photoInput');
const drop = $('#drop');
photoInput.addEventListener('change', () => { addPhotos([...photoInput.files]); photoInput.value = ''; });
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  addPhotos([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')));
});

let photoId = 0;
async function addPhotos(files) {
  for (const file of files) {
    const card = el('div', { class: 'photo' }, el('div', { class: 'photo-msg' }, `Reading ${file.name}…`));
    $('#photos').append(card);
    try {
      const photo = await loadPhoto(file);
      const det = detectPage(photo);
      const entry = { id: ++photoId, photo, corners: det.corners, page: det.page, found: det.found, pageLocked: false, card };
      state.photos.push(entry);
      renderPhoto(entry);
    } catch (err) {
      console.error(err);
      card.replaceChildren(el('div', { class: 'photo-msg bad' }, `Couldn't open ${file.name}. Try a JPEG or PNG photo.`));
    }
  }
  readAll();
  markDone();
}

function renderPhoto(entry) {
  const { photo } = entry;
  const scale = Math.min(1, 900 / Math.max(photo.w, photo.h));
  const thumb = el('canvas');
  thumb.width = Math.round(photo.w * scale);
  thumb.height = Math.round(photo.h * scale);
  thumb.getContext('2d').drawImage(photo.canvas, 0, 0, thumb.width, thumb.height);

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${photo.w} ${photo.h}`);
  const r = Math.max(photo.w, photo.h) * 0.022;
  const poly = document.createElementNS(NS, 'polygon');
  poly.setAttribute('fill', 'rgba(255,107,74,.12)');
  poly.setAttribute('stroke', '#ff6b4a');
  poly.setAttribute('stroke-width', r * 0.18);
  svg.append(poly);
  const labels = ['↖', '↗', '↘', '↙'];
  const handles = entry.corners.map((_, i) => {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'handle');
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', r);
    c.setAttribute('fill', i === 0 ? 'rgba(31,158,143,.85)' : 'rgba(255,107,74,.8)');
    c.setAttribute('stroke', '#fff');
    c.setAttribute('stroke-width', r * 0.15);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'central');
    t.setAttribute('font-size', r * 1.1);
    t.setAttribute('fill', '#fff');
    t.textContent = labels[i];
    g.append(c, t);
    svg.append(g);
    return g;
  });
  const place = () => {
    poly.setAttribute('points', entry.corners.map((p) => p.join(',')).join(' '));
    entry.corners.forEach(([x, y], i) => handles[i].setAttribute('transform', `translate(${x},${y})`));
  };
  place();

  const frame = el('div', { class: 'photo-frame' }, thumb, svg);
  let dragging = -1;
  const toImage = (e) => {
    const rect = svg.getBoundingClientRect();
    return [
      Math.max(0, Math.min(photo.w, ((e.clientX - rect.left) / rect.width) * photo.w)),
      Math.max(0, Math.min(photo.h, ((e.clientY - rect.top) / rect.height) * photo.h)),
    ];
  };
  svg.addEventListener('pointerdown', (e) => {
    const [x, y] = toImage(e);
    let best = -1, bd = Infinity;
    entry.corners.forEach(([cx, cy], i) => {
      const d = Math.hypot(cx - x, cy - y);
      if (d < bd) { bd = d; best = i; }
    });
    if (bd > r * 3.5) return;
    dragging = best;
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (dragging < 0) return;
    entry.corners[dragging] = toImage(e);
    place();
  });
  const end = () => {
    if (dragging < 0) return;
    dragging = -1;
    entry.found = true;
    if (!entry.pageLocked) entry.page = readPageCode(photo, entry.corners);
    updateMeta();
    readAll();
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  const select = el('select', { 'aria-label': 'Which page is this?' },
    el('option', { value: '-1' }, 'Which page is this?'),
    ...PAGES.map((p, i) => el('option', { value: String(i) }, `Page ${i + 1} · ${p.title}`)));
  select.addEventListener('change', () => {
    entry.page = Number(select.value);
    entry.pageLocked = true;
    updateMeta();
    readAll();
  });
  const msg = el('div', { class: 'photo-msg' });
  const remove = el('button', { class: 'x', title: 'Remove photo', 'aria-label': 'Remove photo' }, '×');
  remove.addEventListener('click', () => {
    state.photos = state.photos.filter((p) => p !== entry);
    entry.card.remove();
    readAll();
  });
  function updateMeta() {
    select.value = String(entry.page);
    if (!entry.found) {
      msg.className = 'photo-msg bad';
      msg.textContent = "Couldn't spot the black corner squares. Drag the four dots onto them (green ↖ = top-left).";
    } else if (entry.page < 0) {
      msg.className = 'photo-msg bad';
      msg.textContent = 'Found the corners — pick which page this is.';
    } else {
      msg.className = 'photo-msg ok';
      msg.textContent = `✓ Page ${entry.page + 1} found. Nudge the dots if they're not on the corner squares.`;
    }
  }
  updateMeta();
  entry.card.replaceChildren(frame, el('div', { class: 'photo-meta' }, select, remove), msg);
}

const sens = $('#sensitivity');
const weight = $('#weight');
let readTimer = 0;
[sens, weight].forEach((s) => s.addEventListener('input', () => { clearTimeout(readTimer); readTimer = setTimeout(readAll, 150); }));

function readAll() {
  state.results.clear();
  const opts = { sensitivity: Number(sens.value), weight: Number(weight.value) };
  for (const entry of state.photos) {
    if (entry.page < 0 || !entry.found) continue;
    state.results.set(entry.page, readSheet(entry.photo, entry.corners, entry.page, opts));
  }
  renderGlyphs();
  markDone();
}

function renderGlyphs() {
  const grid = $('#glyphGrid');
  grid.replaceChildren();
  $('#readPanel').hidden = state.photos.length === 0;
  let count = 0;
  PAGES.forEach((p, pi) => {
    const res = state.results.get(pi);
    p.chars.forEach((ch, i) => {
      const r = res?.[i];
      const tile = el('div', { class: 'glyph', title: ch }, el('span', {}, ch));
      if (!r || !r.glyph) {
        tile.classList.add('missing');
      } else {
        tile.append(cellPreview(r.cell));
        if (state.excluded.has(ch)) tile.classList.add('off');
        else count++;
        tile.addEventListener('click', () => {
          state.excluded.has(ch) ? state.excluded.delete(ch) : state.excluded.add(ch);
          renderGlyphs();
        });
      }
      grid.append(tile);
    });
  });
  $('#buildBtn').disabled = count === 0;
  const total = PAGES.reduce((a, p) => a + p.chars.length, 0);
  const missingPages = PAGES.map((_, i) => i).filter((i) => !state.results.has(i) && !PAGES[i].optional).map((i) => i + 1);
  $('#readStatus').textContent = `${count} of ${total} characters ready.` +
    (missingPages.length && count ? ` Page ${missingPages.join(' & ')} not scanned yet — you can still build the font.` : '');
}

function currentGlyphs() {
  const glyphs = new Map();
  for (const res of state.results.values()) {
    for (const { char, glyph } of res) if (glyph && !state.excluded.has(char)) glyphs.set(char, glyph);
  }
  return glyphs;
}

async function rebuildFont(name) {
  const built = buildFont(currentGlyphs(), name, { spacing: Number($('#spacing').value) });
  await useFont(built.buffer, built.name);
}

$('#buildBtn').addEventListener('click', async () => {
  const btn = $('#buildBtn');
  btn.disabled = true;
  try {
    await rebuildFont($('#fontName').value || state.font?.name || 'My Handwriting');
    go('font');
  } catch (err) {
    console.error(err);
    $('#readStatus').textContent = `Something went wrong building the font: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});

// ---------- 3. font ----------

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

async function useFont(buffer, name, { persist = true } = {}) {
  const family = await registerFont(buffer.slice(0));
  state.font = { buffer, family, name };
  $('#fontName').value = name;
  $('#specimen').style.fontFamily = `"${family}", "Fredoka", sans-serif`;
  $('#fontEmpty').hidden = true;
  $('#fontReady').hidden = false;
  $('#spacingRow').hidden = currentGlyphs().size === 0;
  if (persist) {
    store.set('scribble.font', toBase64(buffer));
    store.set('scribble.fontName', name);
  }
  markDone();
}

$('#fontName').addEventListener('change', async () => {
  const name = $('#fontName').value.trim();
  if (!name || !state.font || name === state.font.name) return;
  // Rebuild so the name inside the file matches.
  if (currentGlyphs().size) await rebuildFont(name);
  else {
    state.font.name = name;
    store.set('scribble.fontName', name);
  }
});

let spacingTimer = 0;
$('#spacing').addEventListener('input', () => {
  clearTimeout(spacingTimer);
  spacingTimer = setTimeout(() => state.font && rebuildFont(state.font.name), 120);
});

$('#downloadFont').addEventListener('click', () => {
  if (!state.font) return;
  const blob = new Blob([state.font.buffer], { type: 'font/otf' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `${state.font.name.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'handwriting'}.otf` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

for (const input of [$('#fontInput'), $('#fontInput2')]) {
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const name = fontNameFromBuffer(buffer) || file.name.replace(/\.\w+$/, '');
      await useFont(buffer, name);
      go('font');
    } catch (err) {
      console.error(err);
      alert("That file doesn't look like a font we can read.");
    }
  });
}

(async () => {
  const saved = store.get('scribble.font');
  if (!saved) return;
  try { await useFont(fromBase64(saved), store.get('scribble.fontName') || 'My Handwriting', { persist: false }); } catch (err) { console.warn(err); }
})();

// ---------- 4. record ----------

const recBtn = $('#recBtn');
let recorder = null;
let recStream = null;
let recStart = 0;
let recTick = 0;
let meterCtx = null;
const MAX_SECONDS = 300;

recBtn.addEventListener('click', () => (recorder ? stopRecording() : startRecording()));

async function startRecording() {
  const status = $('#recStatus');
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    status.textContent = "This browser can't record audio. Try uploading a recording instead.";
    return;
  }
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    status.textContent = 'Microphone access was blocked. Allow it in your browser settings, or upload a recording.';
    return;
  }
  const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(recStream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => setAudio(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }));
  rec.start(200);
  recorder = rec;

  meterCtx = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = meterCtx.createAnalyser();
  analyser.fftSize = 512;
  meterCtx.createMediaStreamSource(recStream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  recStart = performance.now();
  recBtn.classList.add('on');
  recBtn.setAttribute('aria-label', 'Stop recording');
  status.textContent = 'Recording… tap again to stop.';
  const tick = () => {
    const t = (performance.now() - recStart) / 1000;
    $('#recTime').textContent = fmt(t);
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    $('#meterFill').style.width = `${Math.min(100, (peak / 128) * 160)}%`;
    if (t >= MAX_SECONDS) return stopRecording();
    recTick = requestAnimationFrame(tick);
  };
  tick();
}

function stopRecording() {
  cancelAnimationFrame(recTick);
  recorder?.stop();
  recStream?.getTracks().forEach((t) => t.stop());
  meterCtx?.close();
  recorder = null;
  recBtn.classList.remove('on');
  recBtn.setAttribute('aria-label', 'Start recording');
  $('#meterFill').style.width = '0';
  $('#recStatus').textContent = 'Got it! Listen back below, or tap the button to record again.';
}

$('#audioInput').addEventListener('change', () => {
  const f = $('#audioInput').files[0];
  $('#audioInput').value = '';
  if (f) setAudio(f);
});

async function setAudio(blob) {
  const status = $('#recStatus');
  try {
    const buffer = await decodeAudio(blob);
    if (state.audio) URL.revokeObjectURL(state.audio.url);
    const url = URL.createObjectURL(blob);
    state.audio = { blob, buffer, url };
    $('#audioEl').src = url;
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mpeg') ? 'mp3' : blob.type.includes('wav') ? 'wav' : 'webm';
    $('#audioDownload').href = url;
    $('#audioDownload').download = `recording.${ext}`;
    $('#audioPanel').hidden = false;
    $('#recTime').textContent = fmt(buffer.duration);
    state.words = [];
    state.captions = [];
    renderCaptions();
    markDone();
  } catch (err) {
    console.error(err);
    status.textContent = "Couldn't read that audio. Try an MP3, M4A or WAV file.";
  }
}

// ---------- 5. captions ----------

const lang = $('#lang');
for (const [k, v] of Object.entries(LANGUAGES)) lang.append(el('option', { value: k }, v.label));
lang.value = store.get('scribble.lang') || 'en';
lang.addEventListener('change', () => store.set('scribble.lang', lang.value));
const capStatus = $('#capStatus');
const setCapStatus = (msg, error = false) => { capStatus.textContent = msg; capStatus.classList.toggle('error', error); };

$('#autoBtn').addEventListener('click', async () => {
  if (!state.audio) return setCapStatus('Record or upload audio first (step 4).', true);
  const btn = $('#autoBtn');
  btn.disabled = true;
  try {
    const words = await transcribe(state.audio.buffer, lang.value, (m) => setCapStatus(m));
    if (!words.length) return setCapStatus("Didn't catch any words. Try typing them instead.", true);
    setWords(words);
    $('#script').value = words.map((w) => w.text).join(' ');
    setCapStatus(`Heard ${words.length} words. Check them below.`);
  } catch (err) {
    console.error(err);
    setCapStatus("Speech recognition couldn't run here (it needs a recent Chrome, Edge, Safari or Firefox and an internet connection the first time). You can type the words instead.", true);
  } finally {
    btn.disabled = false;
  }
});

$('#syncBtn').addEventListener('click', () => {
  if (!state.audio) return setCapStatus('Record or upload audio first (step 4).', true);
  const text = $('#script').value.trim();
  if (!text) return setCapStatus('Type the words that were said first.', true);
  setWords(syncScript(text, state.audio.buffer));
  setCapStatus('Matched the words to the recording. Adjust any timings below.');
});

function setWords(words) {
  state.words = words;
  state.captions = groupWords(words, Number($('#capLen').value));
  renderCaptions();
}

$('#capLen').addEventListener('input', () => {
  if (!state.words.length) return;
  state.captions = groupWords(state.words, Number($('#capLen').value));
  renderCaptions();
});

$('#addCap').addEventListener('click', () => {
  const last = state.captions[state.captions.length - 1];
  const start = last ? last.end : 0;
  state.captions.push({ start, end: start + 2, text: 'New caption', words: null });
  renderCaptions();
});

const capPlayer = new Player();
let capStopTimer = 0;

function renderCaptions() {
  const list = $('#capList');
  list.replaceChildren();
  $('#capPanel').hidden = state.captions.length === 0;
  state.captions.forEach((c, i) => {
    const num = (key) => {
      const input = el('input', { type: 'number', step: '0.1', min: '0', value: c[key].toFixed(2), 'aria-label': key });
      input.addEventListener('change', () => {
        c[key] = Math.max(0, Number(input.value) || 0);
        c.words = null;
        if (c.end <= c.start) c.end = c.start + 0.3;
        state.captions.sort((a, b) => a.start - b.start);
        renderCaptions();
      });
      return input;
    };
    const text = el('input', { type: 'text', class: 'txt', value: c.text, 'aria-label': 'Caption text' });
    text.addEventListener('input', () => { c.text = text.value; });
    const play = el('button', { class: 'play', title: 'Play this caption', 'aria-label': 'Play this caption' }, '▶');
    play.addEventListener('click', async () => {
      if (!state.audio) return;
      clearTimeout(capStopTimer);
      await capPlayer.play(state.audio.buffer, c.start);
      capStopTimer = setTimeout(() => capPlayer.stop(), (c.end - c.start) * 1000);
    });
    const del = el('button', { class: 'x', title: 'Delete caption', 'aria-label': 'Delete caption' }, '×');
    del.addEventListener('click', () => { state.captions.splice(i, 1); renderCaptions(); });
    list.append(el('div', { class: 'cap' }, play, num('start'), num('end'), text, del));
  });
  markDone();
}

// ---------- 6. video ----------

const SWATCHES = {
  bg: ['#ffffff', '#fff4d6', '#ffe0e6', '#dff3ff', '#e3f7e8', '#ece4ff', '#2b2a33', '#1b3a5c', '#000000'],
  color: ['#2b2a33', '#ffffff', '#ff6b4a', '#1f9e8f', '#3d6bd8', '#8e44ad', '#e84393', '#f4b400'],
  highlight: ['#ff6b4a', '#ffc93c', '#1f9e8f', '#3d6bd8', '#e84393', '#ffffff', '#2b2a33'],
};

function swatchRow(container, key) {
  const render = () => {
    container.replaceChildren();
    for (const c of SWATCHES[key]) {
      const b = el('button', { class: `swatch${state.style[key] === c ? ' on' : ''}`, style: `background:${c}`, title: c, 'aria-label': c });
      b.addEventListener('click', () => { state.style[key] = c; render(); styleChanged(); });
      container.append(b);
    }
    const custom = el('input', { type: 'color', value: state.style[key], title: 'Pick any colour', 'aria-label': 'Custom colour' });
    custom.addEventListener('input', () => { state.style[key] = custom.value; styleChanged(); });
    custom.addEventListener('change', render);
    container.append(custom);
  };
  render();
}
swatchRow($('#bgSwatches'), 'bg');
swatchRow($('#fgSwatches'), 'color');
swatchRow($('#hlSwatches'), 'highlight');

const aspects = $('#aspects');
function renderAspects() {
  aspects.replaceChildren();
  for (const [k, a] of Object.entries(ASPECTS)) {
    const scale = 26 / Math.max(a.w, a.h);
    const b = el('button', { class: state.style.aspect === k ? 'on' : '' },
      el('i', { style: `width:${Math.round(a.w * scale)}px;height:${Math.round(a.h * scale)}px` }),
      el('span', {}, a.label, el('small', {}, a.hint)));
    b.addEventListener('click', () => { state.style.aspect = k; renderAspects(); styleChanged(); });
    aspects.append(b);
  }
}
renderAspects();

const hlOn = $('#hlOn');
const textSize = $('#textSize');
const textPos = $('#textPos');
hlOn.checked = state.style.highlightOn;
textSize.value = state.style.size;
textPos.value = state.style.position;
hlOn.addEventListener('change', () => { state.style.highlightOn = hlOn.checked; styleChanged(); });

// Background picture
const bgInput = $('#bgInput');
bgInput.addEventListener('change', async () => {
  const file = bgInput.files[0];
  bgInput.value = '';
  if (!file) return;
  const img = new Image();
  img.src = URL.createObjectURL(file);
  try {
    await img.decode();
  } catch {
    $('#exportStatus').textContent = "Couldn't open that picture. Try a JPEG or PNG.";
    return;
  }
  if (state.bgImage) URL.revokeObjectURL(state.bgImage.src);
  state.bgImage = img;
  $('#bgThumb').src = img.src;
  $('#bgImageInfo').hidden = false;
  styleChanged();
});
$('#bgRemove').addEventListener('click', () => {
  if (state.bgImage) URL.revokeObjectURL(state.bgImage.src);
  state.bgImage = null;
  $('#bgImageInfo').hidden = true;
  styleChanged();
});
const bgFade = $('#bgFade');
bgFade.checked = state.style.bgFade;
bgFade.addEventListener('change', () => { state.style.bgFade = bgFade.checked; styleChanged(); });

// Title card and name. Typing into a field switches its option on.
const bindText = (input, key, toggle, toggleKey) => {
  input.value = state.style[key];
  input.addEventListener('input', () => {
    state.style[key] = input.value;
    if (input.value.trim() && !toggle.checked) { toggle.checked = true; state.style[toggleKey] = true; syncToggles(); }
    styleChanged();
  });
};
const titleOn = $('#titleOn');
const nameOn = $('#nameOn');
const introLen = $('#introLen');
titleOn.checked = state.style.titleOn;
nameOn.checked = state.style.nameOn;
introLen.value = String(state.style.introLen);
function syncToggles() {
  $('#titleFields').classList.toggle('off', !titleOn.checked);
  $('#nameText').classList.toggle('off', !nameOn.checked);
}
syncToggles();
bindText($('#titleText'), 'title', titleOn, 'titleOn');
bindText($('#subtitleText'), 'subtitle', titleOn, 'titleOn');
bindText($('#nameText'), 'name', nameOn, 'nameOn');
titleOn.addEventListener('change', () => {
  state.style.titleOn = titleOn.checked;
  syncToggles();
  // Show the card right away so people can see what they turned on.
  if (titleOn.checked && !player.playing) previewT = 0;
  styleChanged();
});
nameOn.addEventListener('change', () => { state.style.nameOn = nameOn.checked; syncToggles(); styleChanged(); });
introLen.addEventListener('change', () => { state.style.introLen = Number(introLen.value); styleChanged(); });
textSize.addEventListener('input', () => { state.style.size = Number(textSize.value); styleChanged(); });
textPos.addEventListener('change', () => { state.style.position = textPos.value; styleChanged(); });

const canvas = $('#preview');
const ctx = canvas.getContext('2d');
const player = new Player();
const scrub = $('#scrub');
let previewT = 0;
let loop = 0;

function introLength() {
  const s = state.style;
  return s.titleOn && (s.title.trim() || s.subtitle.trim()) ? s.introLen : 0;
}

function frameStyle() {
  const s = state.style;
  return {
    ...s,
    family: state.font?.family || 'Fredoka',
    bgImage: state.bgImage,
    intro: introLength(),
    name: s.nameOn ? s.name.trim() : '',
  };
}

function totalLength() {
  return introLength() + (state.audio?.buffer.duration || 0);
}

function updateScrub() {
  const total = totalLength();
  scrub.max = String(Math.max(0.01, total));
  if (previewT > total) previewT = 0;
  scrub.value = String(previewT);
}

function sizeCanvas() {
  const { w, h } = ASPECTS[state.style.aspect];
  // Preview at half resolution; export renders full size.
  canvas.width = w / 2;
  canvas.height = h / 2;
}

function previewCaptions() {
  if (state.captions.length) return state.captions;
  return [{ start: 0, end: 1e9, text: 'Your words will appear here', words: null }];
}

function draw() {
  ctx.save();
  ctx.scale(0.5, 0.5);
  drawFrame(ctx, canvas.width * 2, canvas.height * 2, previewT, previewCaptions(), { ...frameStyle(), still: !player.playing, highlightOn: state.style.highlightOn && state.captions.length > 0 });
  ctx.restore();
  $('#timeLabel').textContent = fmt(previewT);
}

function styleChanged() {
  saveStyle();
  sizeCanvas();
  updateScrub();
  draw();
}

function enterVideo() {
  const needs = [];
  if (!state.font) needs.push('a font (steps 2–3)');
  if (!state.audio) needs.push('a recording (step 4)');
  else if (!state.captions.length) needs.push('captions (step 5)');
  $('#vidNeeds').hidden = needs.length === 0;
  $('#vidNeeds').textContent = needs.length ? `To make a video you still need ${needs.join(' and ')}. You can play with the look in the meantime.` : '';
  $('#exportBtn').disabled = !state.audio || !state.captions.length;
  updateScrub();
  sizeCanvas();
  document.fonts.ready.then(draw);
  draw();
}

function stopPreview() {
  player.stop();
  cancelAnimationFrame(loop);
  $('#playBtn').textContent = '▶';
  $('#playBtn').setAttribute('aria-label', 'Play');
}

$('#playBtn').addEventListener('click', async () => {
  if (!state.audio) return;
  if (player.playing) return stopPreview();
  const from = previewT >= totalLength() - 0.05 ? 0 : previewT;
  await player.play(state.audio.buffer, from, { intro: introLength() });
  $('#playBtn').textContent = '❚❚';
  $('#playBtn').setAttribute('aria-label', 'Pause');
  const tick = () => {
    previewT = player.time;
    scrub.value = String(previewT);
    draw();
    if (player.playing) loop = requestAnimationFrame(tick);
    else stopPreview();
  };
  tick();
});
scrub.addEventListener('input', () => {
  const wasPlaying = player.playing;
  stopPreview();
  previewT = Number(scrub.value);
  draw();
  if (wasPlaying) $('#playBtn').click();
});

let exporting = null;
$('#exportBtn').addEventListener('click', async () => {
  if (exporting) { exporting.abort(); return; }
  if (!state.audio || !state.captions.length) return;
  if (!pickMime() && !window.MediaRecorder) {
    $('#exportStatus').textContent = "This browser can't record video. Try Chrome, Edge, Firefox or Safari on a computer or phone.";
    return;
  }
  stopPreview();
  const btn = $('#exportBtn');
  const bar = $('#exportProgress');
  const status = $('#exportStatus');
  exporting = new AbortController();
  btn.textContent = 'Cancel';
  bar.hidden = false;
  $('#exportResult').hidden = true;
  status.classList.remove('error');
  status.textContent = `Recording your video in real time (${fmt(totalLength())}). Keep this tab open and in front.`;
  try {
    await document.fonts.ready;
    const blob = await exportVideo({
      buffer: state.audio.buffer,
      captions: state.captions,
      style: frameStyle(),
      aspect: state.style.aspect,
      signal: exporting.signal,
      onProgress: (p) => { bar.firstElementChild.style.width = `${Math.round(p * 100)}%`; },
    });
    const url = URL.createObjectURL(blob);
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    $('#resultVideo').src = url;
    const base = (state.font?.name || 'scribble').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'scribble';
    $('#videoDownload').href = url;
    $('#videoDownload').download = `${base}-${state.style.aspect.replace(':', 'x')}.${ext}`;
    $('#videoDownload').textContent = `Download video (.${ext})`;
    $('#exportResult').hidden = false;
    status.textContent = ext === 'webm'
      ? 'Done! This browser saves WebM video — it plays in browsers and uploads to YouTube. For an MP4 (best for iPhone and Instagram), export from Safari or a recent Chrome.'
      : 'Done! Your video is ready.';
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(err);
      status.classList.add('error');
      status.textContent = `Video export failed: ${err.message || err}`;
    } else {
      status.textContent = 'Cancelled.';
    }
  } finally {
    exporting = null;
    btn.textContent = 'Create video';
    bar.hidden = true;
    bar.firstElementChild.style.width = '0';
  }
});

markDone();
