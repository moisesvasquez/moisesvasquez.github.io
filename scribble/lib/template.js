// Printable worksheet geometry. All measurements are in inches in an 8.5 x 11
// design space; the scanner maps photos back onto these same coordinates.
// When printing, the design is shrunk slightly and centred so the same layout
// fits on both A4 and US Letter paper.

export const PAGE = { w: 8.5, h: 11 };
export const PAPERS = {
  a4: { w: 8.27, h: 11.69, label: 'A4', css: 'A4' },
  letter: { w: 8.5, h: 11, label: 'US Letter', css: 'letter' },
};
const PRINT_SCALE = 0.95;

// Solid corner squares used to find the page in a photo (TL, TR, BR, BL).
export const MARKER = {
  size: 0.35,
  centers: [[0.6, 0.6], [7.9, 0.6], [7.9, 10.4], [0.6, 10.4]],
};

// A small square printed at one of these spots tells the scanner which page it
// is looking at (and which way up the photo is).
export const CODE = { size: 0.22, spots: [[1.3, 0.6], [1.75, 0.6], [2.2, 0.6]], blank: [1.02, 0.6] };

export const GRID = { x0: 0.75, y0: 1.5, cols: 6, rows: 7, colW: 7 / 6, rowH: 8.6 / 7, label: 0.2, gap: 0.07 };

// Font units covered by a writing box: top edge, baseline and bottom edge.
export const METRICS = { top: 850, bottom: -300, xHeight: 450, capHint: 700 };

export const PAGES = [
  { title: 'Capital letters & numbers', chars: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'] },
  { title: 'Lowercase letters & symbols', chars: [...'abcdefghijklmnopqrstuvwxyz.,!?\'"-:;()&+♥★☺'] },
  { title: 'Accents & Spanish letters', chars: [...'ÁÉÍÓÚÑÜ¿¡áéíóúñüÇç'], optional: true },
];

export function cellBox(index) {
  const col = index % GRID.cols;
  const row = Math.floor(index / GRID.cols);
  const cx = GRID.x0 + col * GRID.colW;
  const cy = GRID.y0 + row * GRID.rowH;
  const x = cx + GRID.gap / 2;
  const w = GRID.colW - GRID.gap;
  const labelY = cy + GRID.gap / 2;
  const y = labelY + GRID.label;
  const h = GRID.rowH - GRID.gap - GRID.label;
  const span = METRICS.top - METRICS.bottom;
  return {
    x, y, w, h, labelY,
    baseline: y + h * (METRICS.top / span),
    xLine: y + h * ((METRICS.top - METRICS.xHeight) / span),
    unitsPerInch: span / h,
  };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function pageSVG(pageIndex, paperKey = 'a4', pageCount = PAGES.length) {
  const page = PAGES[pageIndex];
  const paper = PAPERS[paperKey] || PAPERS.a4;
  const vw = paper.w / PRINT_SCALE, vh = paper.h / PRINT_SCALE;
  const vx = (PAGE.w - vw) / 2, vy = (PAGE.h - vh) / 2;
  const font = 'font-family="Helvetica, Arial, sans-serif"';
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${paper.w}in" height="${paper.h}in" viewBox="${vx} ${vy} ${vw} ${vh}">`);
  parts.push(`<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#fff"/>`);

  for (const [cx, cy] of MARKER.centers) {
    const s = MARKER.size;
    parts.push(`<rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" fill="#000"/>`);
  }
  const [qx, qy] = CODE.spots[pageIndex];
  parts.push(`<rect x="${qx - CODE.size / 2}" y="${qy - CODE.size / 2}" width="${CODE.size}" height="${CODE.size}" fill="#000"/>`);

  parts.push(`<text x="${PAGE.w / 2}" y="0.72" text-anchor="middle" ${font} font-size="0.25" font-weight="700" fill="#222">Scribble Font · Page ${pageIndex + 1} of ${pageCount}</text>`);
  parts.push(`<text x="${GRID.x0}" y="1.06" ${font} font-size="0.16" font-weight="700" fill="#222">${esc(page.title)}</text>`);
  parts.push(`<text x="5.05" y="1.06" ${font} font-size="0.13" fill="#444">Name</text>`);
  parts.push(`<line x1="5.5" y1="1.07" x2="${GRID.x0 + 7}" y2="1.07" stroke="#888" stroke-width="0.01"/>`);
  parts.push(`<text x="${GRID.x0}" y="1.32" ${font} font-size="0.105" fill="#555">Write one character per box with a dark marker or pen. Letters sit on the solid line; tails (g j p q y) hang below it.</text>`);

  page.chars.forEach((ch, i) => {
    const b = cellBox(i);
    parts.push(`<text x="${b.x + 0.03}" y="${b.labelY + 0.155}" ${font} font-size="0.15" font-weight="700" fill="#9e9e9e">${esc(ch)}</text>`);
    parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="0.04" fill="none" stroke="#c9c9c9" stroke-width="0.012"/>`);
    parts.push(`<line x1="${b.x + 0.04}" y1="${b.xLine}" x2="${b.x + b.w - 0.04}" y2="${b.xLine}" stroke="#dadada" stroke-width="0.008" stroke-dasharray="0.05 0.05"/>`);
    parts.push(`<line x1="${b.x + 0.04}" y1="${b.baseline}" x2="${b.x + b.w - 0.04}" y2="${b.baseline}" stroke="#c4c4c4" stroke-width="0.012"/>`);
  });

  parts.push(`<text x="${PAGE.w / 2}" y="10.8" text-anchor="middle" ${font} font-size="0.1" fill="#777">To scan: lay the page flat in good light and take a photo from straight above with all four black corner squares visible.</text>`);
  parts.push('</svg>');
  return parts.join('');
}
