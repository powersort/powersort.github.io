/* ============================================================
   POWERSORT — "try it" playground: the run stack, box by box
   Every run on the stack is a box reaching up to the power of its left
   boundary; the stack invariant makes the boxes descend like a staircase.
   A new run computes its power as in the hero (the midpoint interval (a, b]
   drops onto the balanced tree, which stays faintly in the back), rises,
   and lands once the boxes to its left are tall enough; until then, merges
   promote boxes and fuse them, growing inside out from the merge tree's node.
   ============================================================ */
(() => {
"use strict";
/* ---------------- boundary powers + the run-stack machine as a step list ---------------- */

/** power of the boundary between runs (s1,l1) and (s2,l2) in an array of length n:
 *  number of leading equal bits of the run midpoints (s+l/2)/n — exact integer version */
function powerOf(s1, l1, s2, l2, n) {
  const a = 2 * s1 + l1, b = 2 * s2 + l2, d = 2 * n;   // midpoints scaled by 2n
  let p = 0, A = a, B = b;
  // floor(a*2^p/d) == floor(b*2^p/d) ?
  while (Math.floor(A / d) === Math.floor(B / d)) { p++; A *= 2; B *= 2; }
  return p;
}


/**
 * Builds the model: powers P[0..k] (P[0] = P[k] = 0 are the array ends) and the step list.
 * A stack block is {lo, hi, key, col, len, start}; key = P[lo] = power of its left boundary.
 * Steps: start | arrive | merge | land | end (virtual run) | done.
 */
function buildModel(lens, sentinel) {
  const k = lens.length;
  const starts = [];
  let n = 0;
  for (const l of lens) { starts.push(n); n += l; }
  const P = new Array(k + 1).fill(0);
  for (let b = 1; b < k; b++) P[b] = powerOf(starts[b - 1], lens[b - 1], starts[b], lens[b], n);
  const maxP = Math.max(1, ...P);

  const steps = [];
  const nodes = [];      // internal nodes in creation order
  const runCol = [];
  let col = 0, cost = 0, arrived = 0, endArrived = false;
  const stack = [];
  let tent = null;       // the run waiting to land
  const cp = (s) => s.map((x) => ({ ...x }));
  const childRef = (blk) => (blk.lo === blk.hi ? { leaf: blk.lo } : { node: blk.node });

  let lastKnown = 0;
  function snap(o) {
    if (o.known == null) o.known = lastKnown; else lastKnown = o.known;
    o.stack = cp(stack); o.tent = tent ? { ...tent } : null;
    o.nodeCount = nodes.length; o.arrived = arrived; o.cost = cost; o.endArrived = endArrived;
    steps.push(o); return o;
  }

  function merge(final) {
    const before = cp(stack);
    const R = stack.pop(), L = stack.pop();
    const M = { lo: L.lo, hi: R.hi, key: L.key, col: col++, len: L.len + R.len, start: L.start };
    nodes.push({ b: R.lo, lo: M.lo, hi: M.hi, depth: P[R.lo], col: M.col, left: childRef(L), right: childRef(R) });
    M.node = nodes.length - 1;
    stack.push(M);
    cost += M.len;
    snap({ kind: "merge", final, b: R.lo, L: { ...L }, R: { ...R }, M: { ...M }, before });
  }

  snap({ kind: "start", known: 0 });
  for (let r = 0; r < k; r++) {
    const key = P[r];
    const blk = { lo: r, hi: r, key, col: col++, len: lens[r], start: starts[r] };
    runCol[r] = blk.col;
    arrived = r + 1;
    snap({ kind: "extend", run: r, blk: { ...blk }, before: cp(stack), known: r - 1 });
    if (r > 0) snap({ kind: "power", run: r, key, before: cp(stack), known: r - 1 });
    const before = cp(stack);
    const top = stack[stack.length - 1];
    const blocked = !!top && top.key >= key;
    if (!blocked) stack.push(blk); else tent = blk;
    snap({ kind: "check", run: r, key, blk: { ...blk }, before, landed: !blocked, topKey: top ? top.key : null, known: r });
    if (blocked) {
      while (stack.length && stack[stack.length - 1].key >= key) merge(false);
      const before2 = cp(stack);
      tent = null; stack.push(blk);
      snap({ kind: "land", run: r, key, blk: { ...blk }, before: before2, topKey: before2[before2.length - 1].key });
    }
  }
  if (sentinel && stack.length) {
    endArrived = true;
    snap({ kind: "end", before: cp(stack) });
  }
  while (stack.length >= 2) merge(true);
  snap({ kind: "done", before: cp(stack) });
  snap({ kind: "tree", before: cp(stack) });   // the bare merge tree, without the final box

  return { lens, starts, n, k, P, maxP, steps, nodes, runCol, cost, sentinel };
}

/** self-test: invariants of the box picture */
function selfTest(m) {
  const errs = [];
  for (const s of m.steps) {
    if (s.kind === "merge") {
      if (!(s.M.key < s.L.key + 1e-9 && s.M.key < s.R.key)) errs.push("merged box not at least as tall as both parts");
      if (!(s.R.key > s.L.key)) errs.push("right box not shorter than left");
    }
    if (s.kind === "check" && s.landed || s.kind === "land" || s.kind === "start") {
      for (let i = 1; i < s.stack.length; i++)
        if (!(s.stack[i].key > s.stack[i - 1].key)) errs.push(`staircase broken at rest (step ${s.kind})`);
    }
  }
  // tree: parent of leaf r is the deeper of its two boundaries
  for (const nd of m.nodes) for (const c of [nd.left, nd.right]) if ("leaf" in c) {
    const r = c.leaf, pl = r > 0 ? m.P[r] : -1, pr = r < m.k - 1 ? m.P[r + 1] : -1;
    if (nd.depth !== Math.max(pl, pr)) errs.push(`leaf ${r} parent depth mismatch`);
  }
  if (m.nodes.length !== m.k - 1) errs.push("wrong number of merges");
  return errs;
}


/* ---------------- brand colours & helpers ---------------- */
const YEL = "#FFFF00", CYAN = "#0DEDF7", LIME = "#B5FF00", BLUE = "#380FFF", INK = "#EAF2FF", MUTED = "#A9BCE8", DARK = "#001C6B";
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, u) => a + (b - a) * u;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const easeOut = (u) => 1 - Math.pow(1 - u, 3);
const easeOutBounce = (u) => {
  const n1 = 7.5625, d1 = 2.75;
  if (u < 1 / d1) return n1 * u * u;
  if (u < 2 / d1) return n1 * (u -= 1.5 / d1) * u + 0.75;
  if (u < 2.5 / d1) return n1 * (u -= 2.25 / d1) * u + 0.9375;
  return n1 * (u -= 2.625 / d1) * u + 0.984375;
};
const f1 = (x) => Math.round(x * 10) / 10;
const op = (a) => Math.round(clamp(a, 0, 1) * 100) / 100;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

/* ---------------- state ---------------- */
let model = null, L = null, cur = 0, VALS = [];
let playing = false, raf = 0, timer = 0;
// the site’s choices: binary-tree edges, merges grow inside out, balanced tree faded in the back,
// array as bars, virtual end run, runs not yet found shown
const opt = { end: true, ghost: true };
let hoverLo = -1, hoverHi = -1, animating = false;
let lens = [];

/** the array: a descending staircase of ascending runs (as on the main page) */
function arrayFromRunLengths(ls) {
  const v = []; let s = ls.reduce((a, b) => a + b, 0);
  for (const len of ls) { s -= len; for (let i = 1; i <= len; i++) v.push(s + i); }
  return v;
}
/** first m bits of A / D (0 <= A < D), exactly */
function bitsOf(A, D, m) {
  const out = [];
  for (let i = 0; i < m; i++) { A *= 2; if (A >= D) { out.push(1); A -= D; } else out.push(0); }
  return out;
}

/* ---------------- layout ---------------- */
function layout() {
  const m = model, k = m.k;
  const st = $("pgStage"), padCss = parseFloat(getComputedStyle(st).paddingLeft);
  const W = clamp(Math.round(st.clientWidth - 2 * padCss), 260, 1140);
  const narrow = W < 560;                              // phones: slimmer gutter and margins
  const padL = narrow ? 24 : 44, padR = narrow ? 10 : 24, gutX = padL - (narrow ? 12 : 24);
  // every array element gets the same width e, so bars and ruler ticks are uniform;
  // runs, boxes and bars are separated by small insets instead of gaps
  const e = (W - padL - padR) / m.n;
  const xOf = (pos) => padL + pos * e;
  const X0 = m.starts.map((s0) => xOf(s0)), X1 = m.starts.map((s0, r) => xOf(s0 + m.lens[r]));
  const bx = [];
  for (let b = 0; b <= k; b++) bx.push(b < k ? X0[b] : X1[k - 1]);
  const INSET = 1, gap = 2 * INSET;
  const bw = e >= 4 ? e * 0.6 : Math.max(0.8, e - 1);    // bar width, the same for every element
  const leafLevel = m.maxP + 1;
  const rowH = clamp(Math.round(Math.min(380, W * 0.5) / (leafLevel + 1)), 24, 46);
  const padTop = 40;
  const Y = (l) => padTop + l * rowH;
  const floorY = Y(leafLevel) + Math.max(14, 0.7 * rowH);
  const arrY = floorY + 9, arrH = 80;
  const binY = arrY + arrH + 24;
  const H = Math.round(binY + 30);
  const leafY = () => Y(leafLevel);
  const markHW = (b) => clamp(0.5 * Math.min(X1[b - 1] - X0[b - 1], X1[b] - X0[b]) + 5, 8, 24);
  const boxX = (blk) => {
    let a = X0[blk.lo] + INSET, z = X1[blk.hi] - INSET;
    if (z - a < 0.6) { const c = (X0[blk.lo] + X1[blk.hi]) / 2; a = c - 0.3; z = c + 0.3; }   // tiny runs
    return [a, z];
  };
  const midX = (r) => (X0[r] + X1[r]) / 2;
  // x of the node of the balanced tree that (a, b] lands on: where boundary b sits in the hero’s tree
  const nodeX = [];
  for (let b = 1; b < k; b++) {
    const p = m.P[b], A = 2 * m.starts[b - 1] + m.lens[b - 1];
    const j = Math.floor(A * 2 ** p / (2 * m.n)) + 1;
    nodeX[b] = xOf(j * m.n / 2 ** p);
  }
  L = { nodeX, gutX, e, bw, INSET, W, H, padL, padR, gap, X0, X1, bx, xOf, Y, floorY, arrY, arrH, binY, leafY, markHW, boxX, midX, rowH, leafLevel };
}

/* ---------------- SVG pieces ---------------- */
const parts = [];
const out = (s) => parts.push(s);

function boxEl(x0, x1, top, o = {}) {
  const h = L.floorY - top;
  if (h <= 0.5) return;
  const c = o.color || CYAN;
  let stroke = c, so = 0.6, sw = 1.5, dash = "";
  if (o.hover) { stroke = INK; so = 1; sw = 2.5; }
  if (o.hot) { stroke = YEL; so = 1; sw = 2; }
  if (o.tent) { stroke = YEL; so = 1; sw = 2.2; dash = ' stroke-dasharray="0.1 5" stroke-linecap="round"'; }
  const clip = o.clip ? ` clip-path="url(#${o.clip})"` : "";
  const al = o.alpha != null ? ` opacity="${op(o.alpha)}"` : "";
  out(`<rect x="${f1(x0)}" y="${f1(top)}" width="${f1(Math.max(0.5, x1 - x0))}" height="${f1(h)}" rx="3" fill="${o.hover ? INK : c}" fill-opacity="${o.hover ? 0.2 : o.tent ? 0.06 : 0.12}" stroke="${stroke}" stroke-opacity="${so}" stroke-width="${sw}"${dash}${clip}${al}/>`);
}
const isHover = (blk) => blk && blk.lo === hoverLo && blk.hi === hoverHi;
const blkBox = (blk, top, o = {}) => {
  const [a, z] = L.boxX(blk);
  boxEl(a, z, top, isHover(blk) && o.color == null ? { ...o, hover: true, hot: false } : o);
  return { x0: a, x1: z, top };
};

/* boundary marks: the midpoint interval (a, b] at the depth of the power */
function markEl(b, color, alpha = 1) {
  if (alpha <= 0.01) return;
  intervalEl(L.midX(b - 1), L.midX(b), L.Y(model.P[b]), color, alpha, 2.5, 7);
}
function intervalEl(xa, xb, y, color, alpha, sw, hh) {
  if (alpha <= 0.01) return;
  hh = Math.min(hh, Math.max(4, (xb - xa) / 2.2));
  const cw = Math.min(hh * 0.9, (xb - xa) / 3);
  out(`<g opacity="${op(alpha)}" stroke="${color}" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
      `<line x1="${f1(xa + 2)}" y1="${f1(y)}" x2="${f1(xb - 1.5)}" y2="${f1(y)}" stroke-width="${sw + 1}"/>` +
      `<path d="M ${f1(xa + cw)} ${f1(y - hh)} Q ${f1(xa - cw)} ${f1(y)} ${f1(xa + cw)} ${f1(y + hh)}" stroke-width="${sw}"/>` +
      `<path d="M ${f1(xb - cw * 1.2)} ${f1(y - hh)} L ${f1(xb)} ${f1(y - hh)} L ${f1(xb)} ${f1(y + hh)} L ${f1(xb - cw * 1.2)} ${f1(y + hh)}" stroke-width="${sw}"/></g>`);
}
function powerLabel(b, color, alpha = 1) {
  if (alpha <= 0.01) return;
  const x = L.nodeX[b], y = L.Y(model.P[b]) - 11;
  out(`<text x="${f1(x)}" y="${f1(y)}" text-anchor="middle" font-size="12" font-weight="700" fill="${color}" opacity="${op(alpha)}" stroke="${DARK}" stroke-width="3" paint-order="stroke">${model.P[b]}</text>`);
}

/* merge tree: each node is a dot on the node of the balanced tree its interval landed on,
   with edges to its children; a faint bar (as thick as the leaf runs) spans the merged run
   and grows inside out from the interval (a, b] */
function nodeBar(nd, u, color) {
  const x0 = L.X0[nd.lo] + 1.2, x1 = L.X1[nd.hi] - 1.2;
  const a = lerp(L.midX(nd.b - 1), x0, u), z = lerp(L.midX(nd.b), x1, u), y = L.Y(nd.depth);
  out(`<rect x="${f1(a)}" y="${f1(y - 4)}" width="${f1(Math.max(0.8, z - a))}" height="8" rx="3" fill="${color}" fill-opacity=".38"/>`);
}
const nodePt = (nd) => [L.nodeX[nd.b], L.Y(nd.depth)];
function childPt(c) {
  if ("leaf" in c) return [L.midX(c.leaf), L.leafY(c.leaf) - 4];
  return nodePt(model.nodes[c.node]);
}
function edges(nd, v) {
  if (v <= 0.01) return;
  const [px, py] = nodePt(nd);
  for (const c of [nd.left, nd.right]) {
    const [cx, cy] = childPt(c);
    out(`<line x1="${f1(px)}" y1="${f1(py)}" x2="${f1(lerp(px, cx, v))}" y2="${f1(lerp(py, cy, v))}" stroke="${CYAN}" stroke-width="2" stroke-linecap="round"/>`);
  }
}
function nodeDot(nd, v, color) {
  if (v <= 0.01) return;
  const [x, y] = nodePt(nd);
  out(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(5.5 * v)}" fill="${color}" stroke="${DARK}" stroke-width="1.5"/>`);
}
function leafBar(r, alpha) {
  if (alpha <= 0.01) return;
  out(`<rect x="${f1(L.X0[r] + 1.2)}" y="${f1(L.leafY(r) - 4)}" width="${f1(Math.max(0.8, L.X1[r] - L.X0[r] - 2.4))}" height="8" rx="3" fill="${LIME}" opacity="${op(alpha)}"/>`);
}
function ghostLeaf(r, alpha) {
  if (alpha <= 0.01) return;
  out(`<rect x="${f1(L.X0[r] + 1.6)}" y="${f1(L.leafY(r) - 3.25)}" width="${f1(Math.max(0.5, L.X1[r] - L.X0[r] - 3.2))}" height="6.5" rx="3" fill="none" stroke="${LIME}" stroke-opacity="${op(0.35 * alpha)}" stroke-width="1.2" stroke-dasharray="3 3"/>`);
}

/* the array below the floor: lime run boxes with their values, like the hero */
/** the values of a block, sorted once and cached (merged blocks only) */
const SORTED = new Map();
function sortedVals(start, len, sorted) {
  if (!sorted) return VALS.slice(start, start + len);
  const key = start + ":" + len;
  if (!SORTED.has(key)) SORTED.set(key, VALS.slice(start, start + len).sort((a, b) => a - b));
  return SORTED.get(key);
}
/** one bar per element, its height proportional to the value (the main page’s classic look) */
function barsEl(items, color, alpha) {
  const bw = L.bw, cw = L.e;
  const base = L.arrY + L.arrH - 4, hmax = L.arrH - 10;
  out(`<g fill="${color}" opacity="${op(alpha)}">`);
  const step = Math.max(1, Math.ceil(1.5 / cw));        // tiny cells: every step-th bar is enough
  for (let i = 0; i < items.length; i += step) {
    const [x, v, dy] = items[i];
    const hh = 3 + hmax * v / model.n;
    out(`<rect x="${f1(x - bw / 2)}" y="${f1(base - hh + dy)}" width="${f1(bw)}" height="${f1(hh)}" rx="${f1(Math.min(1.5, bw / 2))}"/>`);
  }
  out(`</g>`);
}
function arrayBox(x0, x1, start, len, sorted, o = {}) {
  const y = L.arrY, h = L.arrH, w = x1 - x0;
  const clip = o.clip ? ` clip-path="url(#${o.clip})"` : "";
  const fill = o.color || LIME, ghost = !!o.ghost;
  out(`<g opacity="${op(o.alpha == null ? 1 : o.alpha)}"${clip}>`);
  if (ghost) out(`<rect x="${f1(x0 + 0.75)}" y="${f1(y + 0.75)}" width="${f1(Math.max(0.5, w - 1.5))}" height="${h - 1.5}" rx="5" fill="none" stroke="${LIME}" stroke-opacity=".38" stroke-width="1.3"/>`);
  else out(`<rect x="${f1(x0 + 0.8)}" y="${f1(y + 0.8)}" width="${f1(Math.max(0.5, w - 1.6))}" height="${f1(h - 1.6)}" rx="5" fill="${fill}" fill-opacity=".08" stroke="${fill}" stroke-width="1.6"/>`);
  const vals = sortedVals(start, len, sorted);
  barsEl(vals.map((v, i) => [L.xOf(start + i + 0.5), v, 0]), ghost ? LIME : fill, ghost ? 0.3 : 1);
  out(`</g>`);
}
const blkArray = (blk, o = {}) => {
  const [a, z] = L.boxX(blk);
  arrayBox(a + 0.6, z - 0.6, blk.start, blk.len, blk.lo !== blk.hi, o);
  if (isHover(blk) && !o.ghost && !o.clip) out(`<rect x="${f1(a - 1.5)}" y="${f1(L.arrY - 2.5)}" width="${f1(z - a + 3)}" height="${L.arrH + 5}" rx="7" fill="none" stroke="${INK}" stroke-width="2"/>`);
};

/** merging in the array: the two run boxes fuse and every bar slides to its place in the result */
function mergeArray(S, v) {
  const y = L.arrY, h = L.arrH;
  const [la, lz] = L.boxX(S.L), [ra, rz] = L.boxX(S.R), [ma, mz] = L.boxX(S.M);
  const box = (a, z, alpha) => out(`<rect x="${f1(a + 1.4)}" y="${f1(y + 0.8)}" width="${f1(Math.max(0.5, z - a - 2.8))}" height="${f1(h - 1.6)}" rx="5" fill="${LIME}" fill-opacity=".08" stroke="${LIME}" stroke-width="1.6" opacity="${op(alpha)}"/>`);
  box(la, lz, 1 - v); box(ra, rz, 1 - v);
  if (v > 0) box(ma, mz, v);
  if (L.e < 1.5) {                                        // too dense to slide values: fuse instead
    arrayBox(ma + 0.6, mz - 0.6, S.M.start, S.M.len, true, { alpha: v });
    if (v < 1) { arrayBox(la + 0.6, lz - 0.6, S.L.start, S.L.len, true, { alpha: 1 - v }); arrayBox(ra + 0.6, rz - 0.6, S.R.start, S.R.len, true, { alpha: 1 - v }); }
    return;
  }
  const lv = sortedVals(S.L.start, S.L.len, true), rv = sortedVals(S.R.start, S.R.len, true);
  const oldX = new Map();
  lv.forEach((x, i) => oldX.set(x, L.xOf(S.L.start + i + 0.5)));
  rv.forEach((x, i) => oldX.set(x, L.xOf(S.R.start + i + 0.5)));
  // a value that changes place lifts slightly while it travels
  barsEl(sortedVals(S.M.start, S.M.len, true).map((x, i) => {
    const nx = L.xOf(S.M.start + i + 0.5), ox = oldX.get(x);
    return [lerp(ox, nx, v), x, Math.abs(nx - ox) > 1 ? -Math.sin(Math.PI * v) * 5 : 0];
  }), LIME, 1);
}

/* the virtual perfectly balanced tree (as in the hero), faintly in the back all the time;
   while a power is computed, the pole the interval lands on lights up. That pole starts a
   little below its level, so the dropped interval (a, b] rests on it at exactly the height
   of the boundary mark it turns into */
const POLE_OFF = 2.5;
function balancedTree(alpha, hitL = -1, hitJ = -1, flash = false) {   // hitL >= 0: only that pole
  if (alpha <= 0.01) return;
  const n = model.n, base = L.floorY;
  const pole = (l, j) => L.xOf(j * n / 2 ** l);
  const pw = (l) => Math.max(1.6, (8.5 - (l - 1) * 1.4) * L.W / 1100);
  out(`<g opacity="${op(alpha)}">`);
  for (let l = 1; l <= model.maxP; l++) {
    const cnt = 2 ** l;
    if (L.W / cnt < 2.5) break;
    for (let j = 1; j < cnt; j += 2) {
      const target = l === hitL && j === hitJ;
      if (hitL >= 0 && !target) continue;
      const x = pole(l, j), top = L.Y(l) + (target ? POLE_OFF : 0), w = pw(l);
      const hit = flash && target;
      out(`<rect x="${f1(x - w / 2)}" y="${f1(top)}" width="${f1(w)}" height="${f1(base - top)}" rx="${f1(w / 2)}" fill="${hit ? YEL : CYAN}"/>`);
      if (target) out(`<text x="${f1(x)}" y="${f1(L.Y(l) - (hit ? 17 : 6))}" text-anchor="middle" font-size="${hit ? 15 : 11}" font-weight="600" fill="${hit ? YEL : CYAN}" stroke="${DARK}" stroke-width="3" paint-order="stroke">${l}</text>`);
    }
  }
  out(`</g>`);
}
function rulerTicks(alpha) {
  if (alpha <= 0.01) return;
  const n = model.n;
  out(`<line x1="${L.padL - 6}" y1="${f1(L.floorY)}" x2="${L.W - 6}" y2="${f1(L.floorY)}" stroke="${LIME}" stroke-width="2.2" opacity="${op(alpha)}"/>`);
  if ((L.W - L.padL) / n < 3) return;
  out(`<g stroke="${LIME}" stroke-width="1.4" opacity="${op(alpha)}">`);
  for (let i = 0; i <= n; i++) { const x = L.xOf(i); out(`<line x1="${f1(x)}" y1="${f1(L.floorY - 5)}" x2="${f1(x)}" y2="${f1(L.floorY + 5)}"/>`); }
  out(`</g>`);
}
/** everything about the power of boundary r: midpoints, (a,b], the node it hits, binary digits */
function powerInfo(r) {
  const m = model, D = 2 * m.n;
  const A = 2 * m.starts[r - 1] + m.lens[r - 1], B = 2 * m.starts[r] + m.lens[r];
  const p = m.P[r];
  const j = Math.floor(A * 2 ** p / D) + 1;               // the node j / 2^p inside (a, b]
  return { p, j, A, B, D, xa: L.midX(r - 1), xb: L.midX(r) };
}
function binaryReadout(info, alpha, showP) {
  if (alpha <= 0.01) return;
  const { p, A, B, D } = info;
  const mBits = Math.min(14, Math.max(p + 3, 7));
  const FS = 13.5, CW = FS * 0.602;
  const lab = ["a = 0.", "b = 0."];
  const totalW = (lab[0].length + mBits + 1 + 9) * CW;
  const cx = clamp((info.xa + info.xb) / 2, L.padL + totalW / 2, L.W - 8 - totalW / 2);
  const x0 = cx - totalW / 2;
  out(`<g opacity="${op(alpha)}" font-size="${FS}">`);
  [A, B].forEach((num, row) => {
    const bits = bitsOf(num, D, mBits);
    let s = `<text x="${f1(x0)}" y="${f1(L.binY - 8 + row * 18)}" fill="${CYAN}">${lab[row]}`;
    bits.forEach((bit, i) => {
      const kk = i + 1;
      if (kk < p) s += `<tspan fill="${LIME}" font-weight="700">${bit}</tspan>`;
      else if (kk === p) s += `<tspan fill="${YEL}" font-weight="700">${bit}</tspan>`;
      else s += `<tspan fill="${CYAN}" opacity=".45">${bit}</tspan>`;
    });
    out(s + `…</text>`);
  });
  if (showP) out(`<text x="${f1(x0 + (lab[0].length + mBits + 2) * CW)}" y="${f1(L.binY + 1)}" fill="${YEL}" font-weight="700">→ p = ${p}</text>`);
  out(`</g>`);
}
function bolt(x, y, s, alpha) {
  if (alpha <= 0.01) return;
  out(`<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s * 100) / 100})" opacity="${op(alpha)}"><path d="M 3 -11 L 11 -11 L 6 -3 L 12 -3 L -1 12 L 3 1 L -3 1 Z" fill="${YEL}" stroke="${DARK}" stroke-width="1.6" stroke-linejoin="round"/></g>`);
}
/** the gap below a waiting box: above every stack box lower than the new box */
function holeRects(drawn, yp) {
  const rects = [];
  for (let i = drawn.length - 1; i >= 0; i--) {
    const d = drawn[i];
    if (d.top <= yp + 0.5) break;
    rects.push([d.x0 - L.gap / 2, d.x1 + L.gap / 2, yp, d.top]);
  }
  return rects;
}
function hatch(rects, alpha) {
  if (alpha <= 0.01 || !rects.length) return;
  out(`<g opacity="${op(alpha)}">`);
  for (const [a, z, y0, y1] of rects) out(`<rect x="${f1(a)}" y="${f1(y0)}" width="${f1(z - a)}" height="${f1(y1 - y0)}" fill="url(#hatch)"/>`);
  out(`</g>`);
}

/* ---------------- one frame: step k at progress t ---------------- */
function render(k, t) {
  const m = model, S = m.steps[k], prev = k > 0 ? m.steps[k - 1] : S;
  const { W, H, Y, floorY } = L;
  const kind = S.kind;
  parts.length = 0;
  out(`<svg xmlns="http://www.w3.org/2000/svg" id="pgSvg" role="img" aria-label="Powersort’s run stack drawn as boxes, with the merge tree growing inside" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  // during a merge, the merged box grows inside out from the new node of the merge tree;
  // it is revealed in [rev0, rev1], the two child boxes outside of it
  let rev = null;
  if (kind === "merge") {
    const [a, z] = L.boxX(S.M), v = ease(seg(t, 0.42, 1)), c = L.nodeX[S.b];
    rev = [lerp(c, a, v), lerp(c, z, v)];
  }
  out(`<defs>
    <pattern id="hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)"><rect width="5" height="10" fill="${YEL}"/></pattern>
    ${rev ? `<clipPath id="cpA" clipPathUnits="userSpaceOnUse"><rect x="${f1(rev[0])}" y="0" width="${f1(rev[1] - rev[0])}" height="${H}"/></clipPath><clipPath id="cpB" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="${f1(rev[0])}" height="${H}"/><rect x="${f1(rev[1])}" y="0" width="${f1(W - rev[1])}" height="${H}"/></clipPath>` : ""}
  </defs>`);

  /* how strongly the power computation shows */
  const fromPower = kind === "check" && prev.kind === "power";
  const treeA = kind === "power" ? easeOut(seg(t, 0, 0.18)) : fromPower ? 1 - seg(t, 0, 0.22) : 0;

  /* grid */
  for (let l = 0; l <= m.maxP; l++) {
    out(`<line x1="${L.padL - 6}" y1="${Y(l)}" x2="${W - 6}" y2="${Y(l)}" stroke="${CYAN}" stroke-opacity="${l === 0 ? 0.22 : 0.11}" stroke-dasharray="2 5"/>`);
    out(`<text x="${L.gutX}" y="${Y(l) + 4}" text-anchor="end" font-size="10.5" fill="${MUTED}" opacity=".75">${l}</text>`);
  }
  out(`<line x1="${L.padL - 6}" y1="${floorY}" x2="${W - 6}" y2="${floorY}" stroke="${CYAN}" stroke-opacity=".45" stroke-width="1.2"/>`);
  balancedTree(0.17); rulerTicks(0.5);

  out(`<g>`);
  /* ---- boxes (drawn = stack boxes left to right, for the gap below a waiting box) ---- */
  const drawn = [];
  let tent = null, tentTop = 0, shake = 0, holeA = 0, boltA = 0, boltS = 1;
  if (kind === "extend" || kind === "power") {
    S.before.forEach((b) => drawn.push(blkBox(b, Y(b.key))));
  } else if (kind === "check") {
    const r0 = fromPower ? 0.22 : 0.05, r1 = S.landed ? 0.85 : 0.55;
    S.before.forEach((b, i) => drawn.push(blkBox(b, Y(b.key))));
    tent = S.blk; tentTop = lerp(floorY, Y(S.key), ease(seg(t, r0, r1)));
    if (!S.landed) {
      const v = seg(t, 0.55, 1);
      shake = Math.sin(v * Math.PI * 7) * 4 * (1 - v);
      holeA = v > 0 ? 0.3 + 0.5 * Math.abs(Math.sin(v * Math.PI * 3)) * (1 - v) + 0.15 * v : 0;
      boltA = seg(t, 0.55, 0.62); boltS = v < 0.25 ? 0.6 + 2.4 * v : 1.2 - 0.2 * seg(v, 0.25, 0.5);
    }
  } else if (kind === "merge") {
    S.before.slice(0, -2).forEach((b) => drawn.push(blkBox(b, Y(b.key))));
    const u = ease(seg(t, 0, 0.42)), v = seg(t, 0.42, 1);
    const rTop = lerp(Y(S.R.key), Y(S.L.key), u);
    drawn.push(blkBox(S.L, Y(S.L.key), { clip: v > 0 ? "cpB" : null }));
    drawn.push(blkBox(S.R, rTop, { clip: v > 0 ? "cpB" : null, hot: v === 0 }));
    if (v > 0) blkBox(S.M, Y(S.M.key), { clip: "cpA", hot: true });
    if (S.tent) { tent = S.tent; tentTop = Y(S.tent.key); holeA = 0.45; boltA = 1; }
  } else if (kind === "land") {
    S.before.forEach((b) => drawn.push(blkBox(b, Y(b.key))));
    tent = S.blk; tentTop = Y(S.key); holeA = 0.45 * (1 - t); boltA = 1 - seg(t, 0, 0.4);
  } else if (kind === "end") {
    S.before.forEach((b, i) => drawn.push(blkBox(b, Y(b.key), { hot: i === S.before.length - 1 && t > 0.75 })));
  } else if (kind === "done") {
    const b = S.before[0];
    if (b) { blkBox(b, Y(b.key), { alpha: 1 - t }); blkBox(b, Y(b.key), { color: "#FFFFFF", alpha: t }); }
  } else if (kind === "tree") {
    const b = S.before[0];
    if (b) blkBox(b, Y(b.key), { color: "#FFFFFF", alpha: 1 - t });
  } else if (kind === "start") { /* empty stack */ }
  if (tent) {
    hatch(holeRects(drawn, Y(tent.key)), holeA);
    const [a, z] = L.boxX(tent);
    const landed = (kind === "check" && S.landed && t >= 0.9) || (kind === "land" && t >= 0.5);
    const ho = isHover(tent) ? { hover: true } : {};
    boxEl(a + shake, z + shake, tentTop, landed ? { hot: true, ...ho } : { tent: true, ...ho });
  }

  /* ---- leaves & ghost leaves ---- */
  const arrivedBefore = prev.arrived, arrivedNow = S.arrived;
  for (let r = 0; r < m.k; r++) {
    if (r < arrivedBefore) leafBar(r, 1);
    else if (r < arrivedNow) { const a = seg(t, 0, 0.6); if (opt.ghost) ghostLeaf(r, 1 - a); leafBar(r, a); }
    else if (opt.ghost) ghostLeaf(r, 1);
  }

  /* ---- merge tree: edges below bars below node dots ---- */
  const doneNodes = kind === "merge" ? S.nodeCount - 1 : S.nodeCount;
  const tree = [];
  for (let i = 0; i < doneNodes; i++) {
    const isRoot = i === m.nodes.length - 1;
    tree.push([m.nodes[i], 1, isRoot && (kind === "done" && t > 0.5 || kind === "tree") ? "#FFFFFF" : CYAN]);
  }
  if (kind === "merge") tree.push([m.nodes[S.nodeCount - 1], ease(seg(t, 0.42, 1)), CYAN]);
  tree.forEach(([nd, v]) => edges(nd, v));
  tree.forEach(([nd, v, c]) => { if (v > 0) nodeBar(nd, v, c); });
  tree.forEach(([nd, v, c]) => nodeDot(nd, v, c));
  if (kind === "merge") markEl(S.b, YEL, 1 - ease(seg(t, 0.42, 1)));

  /* ---- pending boundary marks (power 0 at the array ends is never drawn) ---- */
  const merged = new Set();
  for (let i = 0; i < S.nodeCount; i++) merged.add(m.nodes[i].b);
  const hotB = kind === "check" ? S.run : kind === "merge" ? S.b : -1;
  // the left end of the array counts as a boundary of power 0: a quiet 0 at the first box’s corner
  if (S.known >= 0 && S.arrived >= 1) {
    const a0 = kind === "check" && S.run === 0 ? seg(t, 0.3, 0.7) : 1;
    out(`<text x="${f1(L.X0[0] + 1)}" y="${f1(Y(0) - 7)}" text-anchor="middle" font-size="11" font-weight="600" fill="${MUTED}" opacity="${op(0.55 * a0)}">0</text>`);
  }
  for (let b = 1; b <= S.known && b < m.k; b++) {
    const isNew = kind === "check" && b === S.run;
    let alpha = 1;
    if (isNew && !fromPower) alpha = seg(t, 0, 0.3);
    if (!merged.has(b)) markEl(b, b === hotB ? YEL : CYAN, alpha);
    const isMerging = kind === "merge" && b === S.b;
    powerLabel(b, b === hotB ? YEL : merged.has(b) && !isMerging ? MUTED : CYAN, alpha);
  }
  out(`</g>`);   // end of dimmed layer

  /* ---- the array: blocks on the stack, the current run, and what is not scanned yet ---- */
  if (kind === "merge") {
    S.before.slice(0, -2).forEach((b) => blkArray(b));
    mergeArray(S, ease(seg(t, 0.42, 1)));
    if (S.tent) blkArray(S.tent);
  } else if (kind === "done" || kind === "tree") {
    const b = S.before[0];
    blkArray(b); blkArray(b, { color: "#FFFFFF", alpha: kind === "tree" ? 1 : t });
  } else if (kind === "extend" || kind === "power") {
    S.stack.forEach((b) => blkArray(b));
    if (S.tent) blkArray(S.tent);
    const r = S.run, blk = { lo: r, hi: r, start: m.starts[r], len: m.lens[r] };
    const a = kind === "extend" ? seg(t, 0, 0.6) : 1;
    blkArray(blk, { alpha: a });
    if (opt.ghost && a < 1) blkArray(blk, { ghost: true, alpha: 1 - a });
  } else if (kind !== "start") {
    S.before.forEach((b) => blkArray(b));
    if (S.blk) blkArray(S.blk);
  }
  for (let r = arrivedNow; r < m.k && opt.ghost; r++) blkArray({ lo: r, hi: r, start: m.starts[r], len: m.lens[r] }, { ghost: true });
  if (!opt.ghost && arrivedNow < m.k) {
    const r0 = arrivedNow;
    arrayBox(L.X0[r0] + 0.6, L.X1[m.k - 1] - 0.6, m.starts[r0], m.n - m.starts[r0], false, { ghost: true });
  }

  /* ---- power computation: tree, ruler, (a, b] dropping, binary digits ---- */
  if (treeA > 0.01) {
    const info = powerInfo(S.run);
    const landT = 0.62;
    const flash = kind === "power" ? t >= landT : true;
    // band and guides
    const top = Y(0) - 30;
    out(`<g opacity="${op(treeA)}"><rect x="${f1(info.xa)}" y="${f1(top)}" width="${f1(info.xb - info.xa)}" height="${f1(floorY - top)}" fill="${BLUE}" opacity=".32"/>` +
        `<line x1="${f1(info.xa)}" y1="${f1(top)}" x2="${f1(info.xa)}" y2="${f1(floorY)}" stroke="${LIME}" stroke-width="1.4" stroke-dasharray="4 5" opacity=".85"/>` +
        `<line x1="${f1(info.xb)}" y1="${f1(top)}" x2="${f1(info.xb)}" y2="${f1(floorY)}" stroke="${LIME}" stroke-width="1.4" stroke-dasharray="4 5" opacity=".85"/></g>`);
    balancedTree(treeA, info.p, info.j, flash);
    rulerTicks(0.5 * treeA);
    out(`<g fill="${LIME}" opacity="${op(treeA)}"><circle cx="${f1(info.xa)}" cy="${f1(floorY)}" r="5"/><circle cx="${f1(info.xb)}" cy="${f1(floorY)}" r="5"/></g>`);
    // the interval drops until it hits the tallest pole inside it
    const y0 = Y(0) - 22, yl = Y(info.p);   // lands exactly where the mark will stay
    let iy = yl, ia = treeA;
    if (kind === "power") { iy = lerp(y0, yl, easeOutBounce(seg(t, 0.22, landT))); ia = seg(t, 0.12, 0.22); }
    intervalEl(info.xa, info.xb, iy, LIME, ia, 3.5, 10);
    binaryReadout(info, treeA, kind !== "power" || t >= landT);
  }

  /* ---- the two fronts of a growing merge, bolt, virtual end run ---- */
  if (rev && t > 0.42 && t < 1) {
    const a = Math.sin(Math.PI * seg(t, 0.42, 1));
    for (const x of rev)
      out(`<line x1="${f1(x)}" y1="${f1(Y(S.L.key))}" x2="${f1(x)}" y2="${f1(L.arrY + L.arrH)}" stroke="${YEL}" stroke-width="2" opacity="${op(a)}"/>`);
  }
  if (tent && boltA > 0) {
    const x = L.bx[tent.lo] - 11 + shake, y = Y(tent.key) + 20;
    bolt(x, y, 1.35 * boltS, boltA);
  }
  if (S.endArrived) {
    const x = L.bx[m.k] + 5;
    const top = kind === "end" ? lerp(floorY, Y(0), ease(seg(t, 0.15, 1))) : Y(0);
    const a = kind === "done" ? 1 - t : kind === "tree" ? 0 : 1;
    out(`<line x1="${f1(x)}" y1="${f1(floorY)}" x2="${f1(x)}" y2="${f1(top)}" stroke="${YEL}" stroke-width="6" stroke-dasharray="8 5" opacity="${op(a)}"/>`);
  }
  out(`</svg>`);
  $("pgSvg").outerHTML = parts.join("");
}

/* ---------------- captions, code, stack line ---------------- */
const KW = (w) => `<span class="code-keyword">${w}</span>`, FN = (w) => `<span class="code-func">${w}</span>`, NUM = (w) => `<span class="code-number">${w}</span>`;
const CODE = [
  `${KW("def")} ${FN("powersort")}(a):`,
  `  n = len(a); i = ${NUM(0)}`,
  "  runs = []",
  "  j = extend_run(a, i)",
  `  runs.append((i, j-i, ${NUM(0)})); i = j`,
  `  ${KW("while")} i &lt; n:`,
  "    j = extend_run(a, i)",
  `    p = power(runs[-${NUM(1)}], (i, j-i), n)`,
  `    ${KW("while")} p &lt;= runs[-${NUM(1)}][${NUM(2)}]:`,
  "      merge_topmost_2(a, runs)",
  "    runs.append((i, j-i, p)); i = j",
  `  ${KW("while")} len(runs) &gt;= ${NUM(2)}:`,
  "    merge_topmost_2(a, runs)",
];
function drawCode(hl) {
  $("pgCode").innerHTML = CODE.map((c, i) =>
    `<span class="cl${hl.includes(i + 1) ? " active" : ""}">${String(i + 1).padStart(2, " ")}  ${c}</span>`).join("");
}
function codeLines(S) {
  switch (S.kind) {
    case "extend": return S.run === 0 ? [4] : [7];
    case "power": return [8];
    case "check": return S.run === 0 ? [5] : S.landed ? [9, 11] : [9];
    case "merge": return S.final ? [12, 13] : [9, 10];
    case "land": return [9, 11];
    case "end": return [12];
    default: return [];
  }
}
function stackLine(S) {
  const st = S.kind === "done" || S.kind === "tree" ? S.before : S.stack;
  const tag = (b, inner, cls = "") => `<b class="run${cls}" tabindex="0" data-lo="${b.lo}" data-hi="${b.hi}">${inner}</b>`;
  let s = `<span class="pg-var">runs</span> = [${st.map((b) => tag(b, `(${b.start}, ${b.len}, ${b.key})`)).join(", ")}]`;
  if (S.tent) s += ` <span class="pg-wait">waiting: ${tag(S.tent, `(${S.tent.start}, ${S.tent.len}), p = ${S.tent.key}`, " t")}</span>`;
  $("pgStack").innerHTML = s;
}

const hot = (x) => `<span class="hot">${x}</span>`;
const B = (x) => `<b>${x}</b>`;
function caption(S) {
  const m = model;
  switch (S.kind) {
    case "start":
      return `${m.k} run${m.k > 1 ? "s" : ""}, n = ${m.n}. Step or play to watch Powersort fill its stack, one box at a time.`;
    case "extend": {
      const r = S.run, s = m.starts[r], len = m.lens[r];
      const where = len === 1 ? `position ${s}` : `positions ${s}–${s + len - 1}`;
      return `<code>extend_run</code> scans the ${r === 0 ? "first" : "next"} run: ${B(len)} element${len > 1 ? "s" : ""} in ascending order (${where}).`;
    }
    case "power": {
      const p = m.P[S.run];
      const agree = p - 1;
      return `Power of the boundary to its left: the midpoints of the two runs, as fractions of the array, are a and b. ` +
        `Their binary expansions agree on ${agree === 0 ? "no bits" : agree === 1 ? "the first bit" : `the first ${agree} bits`} and differ at bit ${p}, ` +
        `so (a, b] contains a node of depth ${p} of the perfectly balanced tree, but none higher up: the power is ${hot(p)}.`;
    }
    case "check": {
      if (S.run === 0)
        return `The first run’s left boundary is the start of the array, which counts as power ${hot(0)}: its box reaches all the way up and lands on the empty stack.`;
      const head = `The new run’s box rises to depth ${hot(S.key)}.`;
      if (S.landed)
        return `${head} Its left neighbour reaches depth ${S.topKey}, higher up: the staircase still descends to the right, so the run lands on the stack.`;
      return `${head} But its left neighbour only reaches depth ${hot(S.topKey)}: the new box would hang over a gap, which breaks the stack invariant. Boxes to its left must merge until there is a taller pedestal.`;
    }
    case "merge": {
      const i = m.steps.indexOf(S);
      const lead = S.final && !m.sentinel && m.steps[i - 1].kind !== "merge" ? "End of input: the remaining stack is merged from the top. " : "";
      const txt = `${lead}Merge at the boundary of power ${hot(m.P[S.b])}: the right box is promoted from depth ${S.R.key} to depth ${S.L.key}, the height of its left neighbour, and the two runs (lengths ${S.L.len} and ${S.R.len}) become one run of length ${B(S.M.len)}.`;
      if (S.final) return txt;
      const top = S.stack[S.stack.length - 1];
      return top.key >= S.tent.key ? `${txt} Still lower than the waiting box (depth ${top.key} vs. ${S.tent.key}): keep merging.` : txt;
    }
    case "land":
      return `Now the box to the left reaches depth ${S.topKey}, higher than the waiting box at depth ${S.key}: the gap is gone and the run lands on the stack.`;
    case "end":
      return `End of input. A virtual run of length 0 arrives at the right end; its boundary counts as power ${hot(0)}, higher than every box on the stack, so the whole stack collapses into one box.`;
    case "done":
      return `Sorted: ${m.n} elements in ${m.k} run${m.k > 1 ? "s" : ""}, ${m.nodes.length} merge${m.nodes.length === 1 ? "" : "s"}, merge cost ${m.cost} (the total length of all merge results).`;
    case "tree":
      return `Without its box: the finished merge tree. Every node sits at the depth given by the power of its boundary.`;
  }
  return "";
}

/* ---------------- animation ---------------- */
const interval = () => +$("pgSpeed").value;
function durOf(S) {
  const I = interval();
  switch (S.kind) {
    case "extend": return 0.45 * I;
    case "power": return 1.5 * I;
    case "check": return S.landed ? 0.75 * I : 1.1 * I;
    case "merge": return 0.85 * I;
    case "land": return 0.4 * I;
    case "end": return 0.7 * I;
    case "done": return 0.5 * I;
    case "tree": return 0.6 * I;
  }
  return 0;
}
function showStatic(k) { cancelAnimationFrame(raf); animating = false; cur = k; render(k, 1); syncUI(); }
function animTo(k, done) {
  cancelAnimationFrame(raf);
  cur = k; syncUI();
  const D = REDUCED ? 0 : durOf(model.steps[k]);
  if (D <= 0) { render(k, 1); if (done) done(); return; }
  const t0 = performance.now();
  animating = true;
  const frame = (now) => {
    const t = Math.min(1, (now - t0) / D);
    render(k, t);
    if (t < 1) raf = requestAnimationFrame(frame); else { animating = false; if (done) done(); }
  };
  raf = requestAnimationFrame(frame);
}
function syncUI() {
  const S = model.steps[cur], last = model.steps.length - 1;
  $("pgStatus").innerHTML = caption(S);
  drawCode(codeLines(S));
  stackLine(S);
  $("pgScrub").max = last; $("pgScrub").value = cur;
  $("pgStepNo").textContent = `${cur} / ${last}`;
  $("pgBack").disabled = $("pgFirst").disabled = cur === 0;
  $("pgStep").disabled = $("pgLast").disabled = cur === last;
}
function stop() { playing = false; clearTimeout(timer); $("pgPlay").textContent = "▶ play"; }
function play() {
  if (cur >= model.steps.length - 1) showStatic(0);
  playing = true; $("pgPlay").textContent = "❚❚ pause";
  const tick = () => {
    if (!playing) return;
    if (cur >= model.steps.length - 1) { stop(); return; }
    animTo(cur + 1, () => { timer = setTimeout(tick, 0.4 * interval()); });
  };
  tick();
}

/* ---------------- loading ---------------- */
function parseLens(s) {
  const toks = s.split(/[\s,;]+/).filter(Boolean);
  if (!toks.length) return { err: "Enter at least one run length." };
  const v = toks.map(Number);
  if (v.some((x) => !Number.isInteger(x) || x < 1)) return { err: "Run lengths must be positive whole numbers, separated by commas." };
  if (v.length > 64) return { err: "At most 64 runs, please; the boxes get too thin beyond that." };
  if (v.reduce((a, b) => a + b, 0) > 1e6) return { err: "The total length must stay below 1,000,000." };
  return { v };
}
function rebuild(keepStep) {
  const old = cur;
  model = buildModel(lens, opt.end);
  VALS = arrayFromRunLengths(lens); SORTED.clear();
  const errs = selfTest(model);
  if (errs.length) console.warn("self-test:", errs);
  layout();
  cur = keepStep ? Math.min(old, model.steps.length - 1) : 0;
  showStatic(cur);
}
function load() {
  stop();
  const p = parseLens($("pgLens").value);
  if (p.err) { $("pgStatus").innerHTML = `<span class="err">${p.err}</span>`; return; }
  lens = p.v;
  rebuild(false);
}
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const PRESETS = {
  hero: () => "7, 3, 1, 1, 6, 16, 6, 1, 3, 6",
  slides: () => "5, 3, 3, 14, 1, 2",
  colab: () => "9, 16, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7",
  few: () => "12, 20, 8, 24",
  equal: () => Array(16).fill(4).join(", "),
  many: () => Array.from({ length: 18 }, () => rnd(1, 6)).join(", "),
  random: () => Array.from({ length: rnd(9, 14) }, () => rnd(1, 20)).join(", "),
};

/* ---------------- wiring ---------------- */
$("pgPreset").addEventListener("change", () => { $("pgLens").value = PRESETS[$("pgPreset").value](); load(); });
$("pgLoad").addEventListener("click", load);
$("pgLens").addEventListener("keydown", (e) => { if (e.key === "Enter") load(); });
$("pgPlay").addEventListener("click", () => (playing ? stop() : play()));
$("pgStep").addEventListener("click", () => { stop(); if (cur < model.steps.length - 1) animTo(cur + 1); });
$("pgBack").addEventListener("click", () => { stop(); if (cur > 0) showStatic(cur - 1); });
$("pgFirst").addEventListener("click", () => { stop(); showStatic(0); });
$("pgLast").addEventListener("click", () => { stop(); showStatic(model.steps.length - 1); });
$("pgScrub").addEventListener("input", () => { stop(); showStatic(+$("pgScrub").value); });
/* hovering a run in the stack readout highlights its box */
function setHover(el) {
  const lo = el ? +el.dataset.lo : -1, hi = el ? +el.dataset.hi : -1;
  if (lo === hoverLo && hi === hoverHi) return;
  hoverLo = lo; hoverHi = hi;
  if (!animating) render(cur, 1);
}
$("pgStack").addEventListener("mouseover", (e) => setHover(e.target.closest("[data-lo]")));
$("pgStack").addEventListener("mouseleave", () => setHover(null));
$("pgStack").addEventListener("focusin", (e) => setHover(e.target.closest("[data-lo]")));
$("pgStack").addEventListener("focusout", () => setHover(null));
$("pgRoot").addEventListener("keydown", (e) => {   // only while focus is inside the playground
  if (e.target.closest("input[type=text], select")) return;
  if (e.key === "ArrowRight") { e.preventDefault(); $("pgStep").click(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); $("pgBack").click(); }
  else if (e.key === " " && !e.target.closest("button")) { e.preventDefault(); $("pgPlay").click(); }
});
let lastW = 0;
new ResizeObserver(() => {
  const w = $("pgStage").clientWidth;
  if (model && Math.abs(w - lastW) > 2) { lastW = w; layout(); render(cur, 1); }
}).observe($("pgStage"));

lens = parseLens($("pgLens").value).v;
rebuild(false);
})();
