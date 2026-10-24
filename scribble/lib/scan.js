// Turns a photo of a filled-in worksheet into glyph outlines.
//
// 1. loadPhoto: decode the image into a single "darkest channel" plane, so
//    coloured markers and crayons count as ink just like black pen.
// 2. detectPage: find the four solid corner squares, solve the perspective
//    transform from sheet inches to photo pixels, and read the page code.
// 3. extractCell: resample one writing box, separate ink from paper.
// 4. traceBitmap: follow the ink edges into closed outlines.

import { MARKER, CODE, PAGES, METRICS, cellBox } from './template.js';

const MAX_SIDE = 2800;

export async function loadPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return fromCanvas(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function fromCanvas(canvas) {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    gray[i] = Math.min(data[j], data[j + 1], data[j + 2]);
  }
  return { canvas, gray, w, h };
}

// ---------- geometry ----------

// Solve the 3x3 homography mapping src[i] -> dst[i] for four point pairs.
export function homography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  if (!h) return null;
  return [...h, 1];
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function project(H, x, y) {
  const d = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
}

function sampler(photo) {
  const { gray, w, h } = photo;
  return (x, y) => {
    if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 255;
    const x0 = x | 0, y0 = y | 0;
    const fx = x - x0, fy = y - y0;
    const i = y0 * w + x0;
    const top = gray[i] + (gray[i + 1] - gray[i]) * fx;
    const bot = gray[i + w] + (gray[i + w + 1] - gray[i + w]) * fx;
    return top + (bot - top) * fy;
  };
}

// ---------- page detection ----------

function downscale(photo, maxSide) {
  const s = Math.max(1, Math.ceil(Math.max(photo.w, photo.h) / maxSide));
  const w = Math.floor(photo.w / s), h = Math.floor(photo.h / s);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < s; dy++) {
        const row = (y * s + dy) * photo.w + x * s;
        for (let dx = 0; dx < s; dx++) sum += photo.gray[row + dx];
      }
      out[y * w + x] = sum / (s * s);
    }
  }
  return { data: out, w, h, s };
}

function findSquareBlobs(small) {
  const { data, w, h } = small;
  // Local-mean threshold via an integral image so shadows don't matter.
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(Math.min(w, h) / 10));
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      dark[y * w + x] = data[y * w + x] < mean * 0.65 ? 1 : 0;
    }
  }

  const minDim = Math.min(w, h);
  const minArea = (minDim * 0.012) ** 2;
  const maxArea = (minDim * 0.12) ** 2;
  const blobs = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (dark[start] !== 1) continue;
    let sp = 0;
    stack[sp++] = start;
    dark[start] = 2;
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    let minx = w, maxx = 0, miny = h, maxy = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p - x) / w;
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (x > 0 && dark[p - 1] === 1) { dark[p - 1] = 2; stack[sp++] = p - 1; }
      if (x < w - 1 && dark[p + 1] === 1) { dark[p + 1] = 2; stack[sp++] = p + 1; }
      if (y > 0 && dark[p - w] === 1) { dark[p - w] = 2; stack[sp++] = p - w; }
      if (y < h - 1 && dark[p + w] === 1) { dark[p + w] = 2; stack[sp++] = p + w; }
    }
    if (n < minArea || n > maxArea) continue;
    const mx = sx / n, my = sy / n;
    const cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my;
    const tr = cxx + cyy, det = cxx * cyy - cxy * cxy;
    const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
    if (l2 <= 0) continue;
    // A solid rectangle's area equals 12*sqrt(l1*l2) at any rotation; rings,
    // letters and scribbles come out far below that.
    const solidity = n / (12 * Math.sqrt(l1 * l2));
    const elongation = l1 / l2;
    const fill = n / ((maxx - minx + 1) * (maxy - miny + 1));
    if (solidity < 0.8 || elongation > 2.5 || fill < 0.4) continue;
    blobs.push({ x: mx + 0.5, y: my + 0.5, area: n });
  }
  return blobs;
}

function quadArea(q) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function isConvex(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4], [cx, cy] = q[(i + 2) % 4];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

function pickCorners(blobs) {
  if (blobs.length < 4) return null;
  const top = (key) => [...blobs].sort((a, b) => key(a) - key(b)).slice(0, 6);
  const tl = top((b) => b.x + b.y);
  const tr = top((b) => b.y - b.x);
  const br = top((b) => -(b.x + b.y));
  const bl = top((b) => b.x - b.y);
  let best = null;
  for (const a of tl) for (const b of tr) for (const c of br) for (const d of bl) {
    const set = new Set([a, b, c, d]);
    if (set.size < 4) continue;
    const q = [[a.x, a.y], [b.x, b.y], [c.x, c.y], [d.x, d.y]];
    if (!isConvex(q)) continue;
    const areas = [a.area, b.area, c.area, d.area];
    const spread = Math.max(...areas) / Math.min(...areas);
    if (spread > 4) continue;
    // Positive area = TL→TR→BR→BL runs clockwise on screen; rejects mirrored picks.
    const area = quadArea(q);
    if (area <= 0) continue;
    const score = area / spread;
    if (!best || score > best.score) best = { score, q };
  }
  return best && best.q;
}

function darkness(photo, H, [cx, cy], half) {
  const sample = sampler(photo);
  let sum = 0, n = 0;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const [x, y] = project(H, cx + (i / 2) * half, cy + (j / 2) * half);
      sum += sample(x, y);
      n++;
    }
  }
  return sum / n;
}

// Corners are in template order (TL, TR, BR, BL). Returns which page the code
// square says this is, or -1 when it can't tell.
export function readPageCode(photo, corners) {
  const H = homography(MARKER.centers, corners);
  if (!H) return -1;
  const paper = darkness(photo, H, CODE.blank, 0.08);
  const marks = CODE.spots.map((spot) => darkness(photo, H, spot, 0.07) < paper * 0.55);
  const hits = marks.flatMap((m, i) => (m ? [i] : []));
  return hits.length === 1 ? hits[0] : -1;
}

export function detectPage(photo) {
  const small = downscale(photo, 900);
  const blobs = findSquareBlobs(small);
  const quad = pickCorners(blobs);
  if (!quad) return { found: false, corners: defaultCorners(photo), page: -1 };
  const pts = quad.map(([x, y]) => [x * small.s, y * small.s]);
  // The photo may be rotated; try each way up and keep the one whose page code reads cleanly.
  for (let r = 0; r < 4; r++) {
    const corners = [0, 1, 2, 3].map((k) => pts[(k + r) % 4]);
    const page = readPageCode(photo, corners);
    if (page >= 0) return { found: true, corners, page };
  }
  return { found: true, corners: pts, page: -1 };
}

function defaultCorners({ w, h }) {
  const mx = w * 0.12, my = h * 0.12;
  return [[mx, my], [w - mx, my], [w - mx, h - my], [mx, h - my]];
}

// ---------- glyph extraction ----------

export const BOX_PX = 300; // resampled height of a writing box
const INSET = 0.04;

export function extractCell(photo, H, cellIndex, { sensitivity = 0.65, weight = 0 } = {}) {
  const box = cellBox(cellIndex);
  const ppi = BOX_PX / box.h;
  const ix = box.w * INSET, iy = box.h * INSET;
  const ox = box.x + ix, oy = box.y + iy;
  const W = Math.round((box.w - 2 * ix) * ppi);
  const Ht = Math.round((box.h - 2 * iy) * ppi);
  const sample = sampler(photo);

  const raw = new Float32Array(W * Ht);
  for (let y = 0; y < Ht; y++) {
    for (let x = 0; x < W; x++) {
      const [px, py] = project(H, ox + (x + 0.5) / ppi, oy + (y + 0.5) / ppi);
      raw[y * W + x] = sample(px, py);
    }
  }
  const smooth = boxBlur(raw, W, Ht);

  const hist = new Uint32Array(256);
  for (const v of smooth) hist[Math.max(0, Math.min(255, v | 0))]++;
  const paper = percentile(hist, smooth.length, 0.85);
  const thr = paper * sensitivity;
  const minContrast = Math.max(25, paper * 0.15);

  let ink = new Uint8Array(W * Ht);
  for (let i = 0; i < ink.length; i++) ink[i] = smooth[i] < thr && paper - smooth[i] > minContrast ? 1 : 0;

  for (let k = 0; k < weight; k++) ink = morph(ink, W, Ht, true);
  for (let k = 0; k < -weight; k++) ink = morph(ink, W, Ht, false);

  const minArea = W * Ht * 0.0005;
  cleanComponents(ink, W, Ht, minArea);
  fillSmallHoles(ink, W, Ht, minArea * 0.6);

  let count = 0;
  for (const v of ink) count += v;
  const empty = count < minArea * 2;

  return {
    ink, W, H: Ht, empty,
    // Map bitmap pixel-corner coordinates to font units.
    toUnits: (px, py) => [((ox + px / ppi) - box.x) * box.unitsPerInch, (box.baseline - (oy + py / ppi)) * box.unitsPerInch],
  };
}

function boxBlur(src, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += src[yy * w + xx]; n++;
        }
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

function percentile(hist, total, q) {
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total * q) return v;
  }
  return 255;
}

function morph(src, w, h, dilate) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = dilate ? 0 : 1;
      for (let dy = -1; dy <= 1 && v === (dilate ? 0 : 1); dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : src[yy * w + xx];
          if (dilate && s) { v = 1; break; }
          if (!dilate && !s) { v = 0; break; }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function components(mask, w, h, value, eight) {
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== value || label[start] >= 0) continue;
    const id = comps.length;
    const c = { id, pixels: [], minx: w, maxx: 0, miny: h, maxy: 0, edge: false };
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p - x) / w;
      c.pixels.push(p);
      if (x < c.minx) c.minx = x; if (x > c.maxx) c.maxx = x;
      if (y < c.miny) c.miny = y; if (y > c.maxy) c.maxy = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.edge = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!eight && dx && dy) continue;
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (mask[q] === value && label[q] < 0) { label[q] = id; stack[sp++] = q; }
        }
      }
    }
    comps.push(c);
  }
  return comps;
}

// Drop specks, and stray bits of the printed box border caught at the crop edge.
function cleanComponents(ink, w, h, minArea) {
  for (const c of components(ink, w, h, 1, true)) {
    const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1;
    const borderLine = c.edge && ((bh < h * 0.05 && bw > w * 0.3) || (bw < w * 0.05 && bh > h * 0.3));
    if (c.pixels.length < minArea || borderLine) for (const p of c.pixels) ink[p] = 0;
  }
}

function fillSmallHoles(ink, w, h, maxArea) {
  for (const c of components(ink, w, h, 0, false)) {
    if (!c.edge && c.pixels.length < maxArea) for (const p of c.pixels) ink[p] = 1;
  }
}

// ---------- tracing ----------

// Walk the boundary between ink and paper pixels. Outer edges and holes come
// out with opposite winding, which is exactly what a font's fill rule needs.
export function traceBitmap(ink, w, h) {
  const V = w + 1;
  const outA = new Int32Array(V * (h + 1)).fill(-1);
  const outB = new Int32Array(V * (h + 1)).fill(-1);
  const from = [], to = [], dir = [];
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? ink[y * w + x] : 0);
  const add = (x0, y0, x1, y1, d) => {
    const id = from.length;
    const v = y0 * V + x0;
    from.push(v); to.push(y1 * V + x1); dir.push(d);
    if (outA[v] < 0) outA[v] = id; else outB[v] = id;
  };
  // Directions: 0 = +x, 1 = +y, 2 = -x, 3 = -y (y grows downward).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!ink[y * w + x]) continue;
      if (!at(x, y - 1)) add(x, y, x + 1, y, 0);
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1, 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1, 2);
      if (!at(x - 1, y)) add(x, y + 1, x, y, 3);
    }
  }
  const used = new Uint8Array(from.length);
  const loops = [];
  for (let e0 = 0; e0 < from.length; e0++) {
    if (used[e0]) continue;
    const pts = [];
    let e = e0;
    while (e >= 0 && !used[e]) {
      used[e] = 1;
      const v = from[e];
      pts.push([v % V, Math.floor(v / V)]);
      const nv = to[e];
      const a = outA[nv], b = outB[nv];
      if (b >= 0 && !used[a] && !used[b]) {
        // Saddle point: always take the right-hand turn so diagonal pixels stay separate.
        e = dir[a] === (dir[e] + 1) % 4 ? a : b;
      } else {
        e = a >= 0 && !used[a] ? a : b >= 0 && !used[b] ? b : -1;
      }
    }
    if (pts.length >= 4) loops.push(pts);
  }
  return loops;
}

function simplify(pts, eps) {
  // Douglas–Peucker on a closed loop: split at the point farthest from pts[0].
  let far = 0, best = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2;
    if (d > best) { best = d; far = i; }
  }
  const a = dp(pts.slice(0, far + 1), eps);
  const b = dp([...pts.slice(far), pts[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function dp(pts, eps) {
  if (pts.length < 3) return pts;
  const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1];
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  let idx = 0, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  const left = dp(pts.slice(0, idx + 1), eps);
  return [...left.slice(0, -1), ...dp(pts.slice(idx), eps)];
}

// A glyph is a list of contours; each contour is a list of quadratic segments
// in font units: { start: [x, y], segs: [[cx, cy, x, y], ...] }.
export function cellToGlyph(cell) {
  if (cell.empty) return null;
  const loops = traceBitmap(cell.ink, cell.W, cell.H);
  const contours = [];
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const loop of loops) {
    const poly = simplify(loop, 1.1).map(([x, y]) => cell.toUnits(x, y));
    if (poly.length < 3) continue;
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const n = poly.length;
    const start = mid(poly[n - 1], poly[0]);
    const segs = poly.map((p, i) => [...p, ...mid(p, poly[(i + 1) % n])]);
    contours.push({ start, segs });
    for (const [x, y] of poly) {
      if (x < xmin) xmin = x; if (x > xmax) xmax = x;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    }
  }
  if (!contours.length) return null;
  return { contours, xmin, xmax, ymin, ymax };
}

export function readSheet(photo, corners, page, opts) {
  const H = homography(MARKER.centers, corners);
  const out = [];
  PAGES[page].chars.forEach((ch, i) => {
    const cell = extractCell(photo, H, i, opts);
    out.push({ char: ch, cell, glyph: cellToGlyph(cell) });
  });
  return out;
}

export function cellPreview(cell, color = '#1d1d1f') {
  const c = document.createElement('canvas');
  c.width = cell.W;
  c.height = cell.H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(cell.W, cell.H);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let i = 0; i < cell.ink.length; i++) {
    if (!cell.ink[i]) continue;
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Baseline guide so parents can see how letters sit.
  const span = METRICS.top - METRICS.bottom;
  const inset = cell.H / (1 - 2 * INSET) * INSET;
  const baseY = (cell.H + 2 * inset) * (METRICS.top / span) - inset;
  ctx.fillStyle = 'rgba(80,140,220,.45)';
  ctx.fillRect(0, Math.round(baseY), cell.W, 2);
  return c;
}
