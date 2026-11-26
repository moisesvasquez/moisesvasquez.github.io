/*
 * Aperiodic "hat" monotile (the einstein tile) patch generator.
 * Metatile substitution after Smith, Myers, Kaplan & Goodman-Strauss (2023),
 * following the structure of Craig S. Kaplan's reference implementation.
 * Exposes window.HatTiling.generate(levels) -> [{ pts:[{x,y}...], kind }]
 */
(function () {
  const hr3 = Math.sqrt(3) / 2;
  const pt = (x, y) => ({ x, y });
  const hexPt = (x, y) => pt(x + 0.5 * y, hr3 * y);
  const padd = (p, q) => pt(p.x + q.x, p.y + q.y);
  const psub = (p, q) => pt(p.x - q.x, p.y - q.y);
  const ident = [1, 0, 0, 0, 1, 0];

  function inv(T) {
    const det = T[0] * T[4] - T[1] * T[3];
    return [T[4] / det, -T[1] / det, (T[1] * T[5] - T[2] * T[4]) / det,
      -T[3] / det, T[0] / det, (T[2] * T[3] - T[0] * T[5]) / det];
  }
  function mul(A, B) {
    return [A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
      A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]];
  }
  const trot = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0];
  const ttrans = (x, y) => [1, 0, x, 0, 1, y];
  const rotAbout = (p, a) => mul(ttrans(p.x, p.y), mul(trot(a), ttrans(-p.x, -p.y)));
  const transPt = (M, P) => pt(M[0] * P.x + M[1] * P.y + M[2], M[3] * P.x + M[4] * P.y + M[5]);
  const matchSeg = (p, q) => [q.x - p.x, p.y - q.y, p.x, q.y - p.y, q.x - p.x, p.y];
  const matchTwo = (p1, q1, p2, q2) => mul(matchSeg(p2, q2), inv(matchSeg(p1, q1)));
  function intersect(p1, q1, p2, q2) {
    const d = (q2.y - p2.y) * (q1.x - p1.x) - (q2.x - p2.x) * (q1.y - p1.y);
    const uA = ((q2.x - p2.x) * (p1.y - p2.y) - (q2.y - p2.y) * (p1.x - p2.x)) / d;
    return pt(p1.x + uA * (q1.x - p1.x), p1.y + uA * (q1.y - p1.y));
  }

  const hatOutline = [
    hexPt(0, 0), hexPt(-1, -1), hexPt(0, -2), hexPt(2, -2), hexPt(2, -1), hexPt(4, -2),
    hexPt(5, -1), hexPt(4, 0), hexPt(3, 0), hexPt(2, 2), hexPt(0, 3), hexPt(0, 2), hexPt(-1, 2)];

  class HatTile {
    constructor(kind) { this.kind = kind; }
    collect(T, out) { out.push({ pts: hatOutline.map((p) => transPt(T, p)), kind: this.kind }); }
  }

  class MetaTile {
    constructor(shape, width) { this.shape = shape; this.width = width; this.children = []; }
    addChild(T, geom) { this.children.push({ T, geom }); }
    evalChild(n, i) { return transPt(this.children[n].T, this.children[n].geom.shape[i]); }
    collect(S, out) { for (const c of this.children) c.geom.collect(mul(S, c.T), out); }
    recentre() {
      let cx = 0, cy = 0;
      for (const p of this.shape) { cx += p.x; cy += p.y; }
      cx /= this.shape.length; cy /= this.shape.length;
      const tr = pt(-cx, -cy);
      this.shape = this.shape.map((p) => padd(p, tr));
      const M = ttrans(-cx, -cy);
      for (const ch of this.children) ch.T = mul(M, ch.T);
    }
  }

  const H1 = new HatTile('H1'), H = new HatTile('H'), T = new HatTile('T'),
    P = new HatTile('P'), F = new HatTile('F');

  function initH() {
    const o = [pt(0, 0), pt(4, 0), pt(4.5, hr3), pt(2.5, 5 * hr3), pt(1.5, 5 * hr3), pt(-0.5, hr3)];
    const m = new MetaTile(o, 2);
    m.addChild(matchTwo(hatOutline[5], hatOutline[7], o[5], o[0]), H);
    m.addChild(matchTwo(hatOutline[9], hatOutline[11], o[1], o[2]), H);
    m.addChild(matchTwo(hatOutline[5], hatOutline[7], o[3], o[4]), H);
    m.addChild(mul(ttrans(2.5, hr3), mul([-0.5, -hr3, 0, hr3, -0.5, 0], [0.5, 0, 0, 0, -0.5, 0])), H1);
    return m;
  }
  function initT() {
    const m = new MetaTile([pt(0, 0), pt(3, 0), pt(1.5, 3 * hr3)], 2);
    m.addChild([0.5, 0, 0.5, 0, 0.5, hr3], T);
    return m;
  }
  function initP() {
    const m = new MetaTile([pt(0, 0), pt(4, 0), pt(3, 2 * hr3), pt(-1, 2 * hr3)], 2);
    m.addChild([0.5, 0, 1.5, 0, 0.5, hr3], P);
    m.addChild(mul(ttrans(0, 2 * hr3), mul([0.5, hr3, 0, -hr3, 0.5, 0], [0.5, 0, 0, 0, 0.5, 0])), P);
    return m;
  }
  function initF() {
    const m = new MetaTile([pt(0, 0), pt(3, 0), pt(3.5, hr3), pt(3, 2 * hr3), pt(-1, 2 * hr3)], 2);
    m.addChild([0.5, 0, 1.5, 0, 0.5, hr3], F);
    m.addChild(mul(ttrans(0, 2 * hr3), mul([0.5, hr3, 0, -hr3, 0.5, 0], [0.5, 0, 0, 0, 0.5, 0])), F);
    return m;
  }

  const rules = [
    ['H'], [0, 0, 'P', 2], [1, 0, 'H', 2], [2, 0, 'P', 2], [3, 0, 'H', 2], [4, 4, 'P', 2],
    [0, 4, 'F', 3], [2, 4, 'F', 3], [4, 1, 3, 2, 'F', 0], [8, 3, 'H', 0], [9, 2, 'P', 0],
    [10, 2, 'H', 0], [11, 4, 'P', 2], [12, 0, 'H', 2], [13, 0, 'F', 3], [14, 2, 'F', 1],
    [15, 3, 'H', 4], [8, 2, 'F', 1], [17, 3, 'H', 0], [18, 2, 'P', 0], [19, 2, 'H', 2],
    [20, 4, 'F', 3], [20, 0, 'P', 2], [22, 0, 'H', 2], [23, 4, 'F', 3], [23, 0, 'F', 3],
    [16, 0, 'P', 2], [9, 4, 0, 2, 'T', 2], [4, 0, 'F', 3]];

  function constructPatch(h, t, p, f) {
    const shapes = { H: h, T: t, P: p, F: f };
    const ret = new MetaTile([], h.width);
    for (const r of rules) {
      if (r.length === 1) {
        ret.addChild(ident, shapes[r[0]]);
      } else if (r.length === 4) {
        const poly = ret.children[r[0]].geom.shape;
        const M = ret.children[r[0]].T;
        const A = transPt(M, poly[(r[1] + 1) % poly.length]);
        const B = transPt(M, poly[r[1]]);
        const n = shapes[r[2]].shape;
        ret.addChild(matchTwo(n[r[3]], n[(r[3] + 1) % n.length], A, B), shapes[r[2]]);
      } else {
        const cP = ret.children[r[0]], cQ = ret.children[r[2]];
        const A = transPt(cQ.T, cQ.geom.shape[r[3]]);
        const B = transPt(cP.T, cP.geom.shape[r[1]]);
        const n = shapes[r[4]].shape;
        ret.addChild(matchTwo(n[r[5]], n[(r[5] + 1) % n.length], A, B), shapes[r[4]]);
      }
    }
    return ret;
  }

  function constructMetatiles(patch) {
    const bps1 = patch.evalChild(8, 2);
    const bps2 = patch.evalChild(21, 2);
    const rbps = transPt(rotAbout(bps1, -2 * Math.PI / 3), bps2);
    const p72 = patch.evalChild(7, 2);
    const p252 = patch.evalChild(25, 2);
    const llc = intersect(bps1, rbps, patch.evalChild(6, 2), p72);
    let w = psub(patch.evalChild(6, 2), llc);

    const hO = [llc, bps1];
    w = transPt(rotAbout(pt(0, 0), -Math.PI / 3), w);
    hO.push(padd(hO[1], w));
    hO.push(patch.evalChild(14, 2));
    w = transPt(rotAbout(pt(0, 0), -Math.PI / 3), w);
    hO.push(psub(hO[3], w));
    hO.push(patch.evalChild(6, 2));
    const nH = new MetaTile(hO, patch.width * 2);
    for (const c of [0, 9, 16, 27, 26, 6, 1, 8, 10, 15]) nH.addChild(patch.children[c].T, patch.children[c].geom);

    const nP = new MetaTile([p72, padd(p72, psub(bps1, llc)), bps1, llc], patch.width * 2);
    for (const c of [7, 2, 3, 4, 28]) nP.addChild(patch.children[c].T, patch.children[c].geom);

    const nF = new MetaTile([bps2, patch.evalChild(24, 2), patch.evalChild(25, 0), p252,
      padd(p252, psub(llc, bps1))], patch.width * 2);
    for (const c of [21, 20, 22, 23, 24, 25]) nF.addChild(patch.children[c].T, patch.children[c].geom);

    const AAA = hO[2];
    const BBB = padd(hO[1], psub(hO[4], hO[5]));
    const CCC = transPt(rotAbout(BBB, -Math.PI / 3), AAA);
    const nT = new MetaTile([BBB, CCC, AAA], patch.width * 2);
    nT.addChild(patch.children[11].T, patch.children[11].geom);

    nH.recentre(); nP.recentre(); nF.recentre(); nT.recentre();
    return [nH, nT, nP, nF];
  }

  function generate(levels) {
    let tiles = [initH(), initT(), initP(), initF()];
    for (let i = 0; i < levels; i++) tiles = constructMetatiles(constructPatch(...tiles));
    const out = [];
    // Assemble one more patch from the top-level metatiles for a wide area.
    constructPatch(...tiles).collect(ident, out);
    return out;
  }

  window.HatTiling = { generate };
})();
