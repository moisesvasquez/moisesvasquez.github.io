// Builds an OpenType font from traced glyphs. Relies on the global `opentype`
// from vendor/opentype.min.js.

import { METRICS } from './template.js';

// Characters people (and speech-to-text) type that we can draw with an existing glyph.
const ALIASES = { '’': "'", '‘': "'", '“': '"', '”': '"', '–': '-', '—': '-', '❤': '♥', '☆': '★', '☻': '☺' };

function toPath(glyph, shift) {
  const path = new opentype.Path();
  for (const { start, segs } of glyph.contours) {
    path.moveTo(start[0] + shift, start[1]);
    for (const [cx, cy, x, y] of segs) path.quadraticCurveTo(cx + shift, cy, x + shift, y);
    path.close();
  }
  return path;
}

// glyphs: Map of character -> traced glyph (from scan.cellToGlyph).
// spacing: extra font units added to each side of every letter (can be negative).
export function buildFont(glyphs, familyName, { spacing = 0 } = {}) {
  const bearing = Math.max(0, 30 + spacing);
  const name = (familyName || 'My Handwriting').trim() || 'My Handwriting';
  const map = new Map(glyphs);
  // Fill gaps from the other case so a missing "q" still types something.
  for (const [ch, g] of glyphs) {
    for (const other of [ch.toLowerCase(), ch.toUpperCase()]) {
      if (other !== ch && other.length === 1 && !map.has(other)) map.set(other, g);
    }
  }

  const notdef = new opentype.Path();
  notdef.moveTo(60, 0); notdef.lineTo(60, 650); notdef.lineTo(440, 650); notdef.lineTo(440, 0); notdef.close();
  notdef.moveTo(100, 40); notdef.lineTo(400, 40); notdef.lineTo(400, 610); notdef.lineTo(100, 610); notdef.close();
  const out = [new opentype.Glyph({ name: '.notdef', advanceWidth: 500, path: notdef })];

  const widths = [];
  const byChar = new Map();
  for (const [ch, g] of map) {
    const shift = bearing - g.xmin;
    const advanceWidth = Math.round(g.xmax - g.xmin + 2 * bearing);
    const glyph = new opentype.Glyph({
      name: glyphName(ch),
      unicode: ch.codePointAt(0),
      advanceWidth,
      path: toPath(g, shift),
    });
    out.push(glyph);
    byChar.set(ch, glyph);
    if (/[a-z]/.test(ch)) widths.push(advanceWidth);
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (byChar.has(target) && !byChar.has(alias)) byChar.get(target).addUnicode(alias.codePointAt(0));
  }

  const avg = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : 500;
  const space = new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: Math.round(avg * 0.62), path: new opentype.Path() });
  space.addUnicode(0xa0);
  out.splice(1, 0, space);

  const font = new opentype.Font({
    familyName: name,
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: METRICS.top,
    descender: METRICS.bottom,
    designer: name,
    description: 'Handwriting font made with Scribble Font',
    glyphs: out,
  });
  return { font, buffer: font.toArrayBuffer(), name, count: map.size };
}

function glyphName(ch) {
  const cp = ch.codePointAt(0);
  if (/[A-Za-z0-9]/.test(ch)) return /[0-9]/.test(ch) ? `digit${ch}` : ch;
  return `uni${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

let loadCount = 0;

// Registers the font with the page so canvases and previews can use it.
export async function registerFont(buffer) {
  const family = `ScribbleUser${++loadCount}`;
  const face = new FontFace(family, buffer);
  await face.load();
  document.fonts.add(face);
  return family;
}

export function fontNameFromBuffer(buffer) {
  try {
    const f = opentype.parse(buffer);
    return f.names.fontFamily?.en || '';
  } catch {
    return '';
  }
}
