/* ============================================================
   POWERSORT — interactive explainer
   Act 1: the virtual perfectly balanced binary tree (hero)
   (Act 2, the "try it" playground, lives in playground.js)
   ============================================================ */
"use strict";

/* ---------- brand colors (kept in sync with style.css) ---------- */
const C = {
  darkblue: "#001C6B",
  blue: "#380FFF",
  lightblue: "#0DEDF7",
  green: "#00D600",
  lime: "#B5FF00",
  yellow: "#FFFF00",
};

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SVGNS = "http://www.w3.org/2000/svg";

/* ---------- tiny helpers ---------- */
function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  if (parent) parent.appendChild(node);
  return node;
}

const easeOutCubic = (u) => 1 - Math.pow(1 - u, 3);
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
// a "drop with a little bounce past the target"
const easeOutBack = (u) => {
  const c1 = 1.20158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
};
// a real bounce — for things that fall and get stuck
const easeOutBounce = (u) => {
  const n1 = 7.5625, d1 = 2.75;
  if (u < 1 / d1) return n1 * u * u;
  if (u < 2 / d1) return n1 * (u -= 1.5 / d1) * u + 0.75;
  if (u < 2.5 / d1) return n1 * (u -= 2.25 / d1) * u + 0.9375;
  return n1 * (u -= 2.625 / d1) * u + 0.984375;
};

function sleep(ms, token) {
  if (REDUCED || ms <= 0 || (token && (token.cancelled || token.instant))) return Promise.resolve();
  return new Promise((res) => setTimeout(res, ms));
}

function tween(dur, apply, ease = easeOutCubic, token = null) {
  return new Promise((res) => {
    if (REDUCED || dur <= 16 || (token && (token.cancelled || token.instant))) { apply(1); res(); return; }
    const t0 = performance.now();
    const frame = (t) => {
      if (token && token.cancelled) { apply(1); res(); return; }
      const u = Math.min(1, (t - t0) / dur);
      apply(ease(u));
      if (u < 1) requestAnimationFrame(frame); else res();
    };
    requestAnimationFrame(frame);
  });
}

/* ============================================================
   SHARED MATH — runs, powers, node positions
   ============================================================ */

/** power of the boundary between segments r1 and r2 (start/len), array length n */
function boundaryPower(r1, r2, n) {
  const a = (r1.start + r1.len / 2) / n;
  const b = (r2.start + r2.len / 2) / n;
  let l = 0;
  while (Math.floor(a * Math.pow(2, l)) === Math.floor(b * Math.pow(2, l))) l++;
  return l;
}

/** fraction (in [0,1]) of the shallowest tree node strictly between midpoints a<b, at depth p */
function nodeFraction(r1, r2, n, p) {
  const a = (r1.start + r1.len / 2) / n;
  const m = Math.floor(a * Math.pow(2, p)) + 1;
  return m / Math.pow(2, p);
}

/** first m binary digits of f ∈ [0,1) */
function binaryBits(f, m) {
  const out = [];
  let x = f;
  for (let k = 0; k < m; k++) { x *= 2; const b = x >= 1 ? 1 : 0; out.push(b); x -= b; }
  return out;
}

/** build a "descending staircase of ascending runs" from run lengths */
function arrayFromRunLengths(lens) {
  const values = [];
  const suffix = [];
  let s = 0;
  for (let k = lens.length - 1; k >= 0; k--) { suffix[k] = s; s += lens[k]; }
  lens.forEach((len, k) => {
    for (let v = 0; v < len; v++) values.push(suffix[k] + 1 + v);
  });
  return values;
}

/** all (fraction, level) nodes of the virtual balanced tree down to maxLevel */
function virtualNodes(maxLevel) {
  const nodes = [];
  for (let l = 1; l <= maxLevel; l++) {
    const denom = Math.pow(2, l);
    for (let k = 1; k < denom; k += 2) nodes.push({ frac: k / denom, level: l });
  }
  return nodes;
}

/* ============================================================
   ACT 1 — HERO: the tree drops in (recreates the brand GIF)
   ============================================================ */

const HERO = (() => {
  const svg = document.getElementById("heroSvg");
  const caption = document.getElementById("heroCaption");
  const replayBtn = document.getElementById("heroReplay");

  // exact example from the showcase GIF: 10 runs, n = 50
  const RUN_LENS = [7, 3, 1, 1, 6, 16, 6, 1, 3, 6];
  const values = arrayFromRunLengths(RUN_LENS);
  const n = values.length;
  const runs = [];
  { let s = 0; for (const len of RUN_LENS) { runs.push({ start: s, len }); s += len; } }

  // geometry (viewBox 1520 x 700)
  const W = 1520, padX = 42, plotW = W - 2 * padX;
  const xAt = (i) => padX + (i / n) * plotW;
  const RUN_Y = 18, RUN_H = 42;
  const CHIP_Y = 70;
  const TREE_TOP = 128, BASE_Y = 596, LEVELS = 5;
  const levelY = (l) => TREE_TOP + (l - 1) * ((BASE_Y - 110 - TREE_TOP) / (LEVELS - 1));
  const barW = (l) => 17 - (l - 1) * 2.6;

  let token = { cancelled: true };
  let started = false;

  function buildStatic() {
    svg.innerHTML = "";
    const gRuns = el("g", { id: "hRuns" }, svg);
    const gBand = el("g", { id: "hBand" }, svg);
    const gTree = el("g", { id: "hTree" }, svg);
    const gRuler = el("g", { id: "hRuler" }, svg);
    const gChips = el("g", { id: "hChips" }, svg);
    const gFront = el("g", { id: "hFront" }, svg); // top overlay: the dropping (a,b] interval

    // --- run boxes with values ---
    const runEls = runs.map((r, ri) => {
      const g = el("g", { opacity: 0 }, gRuns);
      const x0 = xAt(r.start) + 2.5, x1 = xAt(r.start + r.len) - 2.5;
      el("rect", { x: x0, y: RUN_Y, width: x1 - x0, height: RUN_H, rx: 8, class: "svg-run-box" }, g);
      for (let k = 0; k < r.len; k++) {
        el("text", {
          x: xAt(r.start + k + 0.5), y: RUN_Y + RUN_H / 2 + 5.5,
          "text-anchor": "middle", "font-size": 15.5, class: "svg-run-num",
          text: values[r.start + k],
        }, g);
      }
      return g;
    });

    // --- ruler ---
    el("line", { x1: padX, y1: BASE_Y + 14, x2: padX + plotW, y2: BASE_Y + 14, class: "svg-ruler" }, gRuler);
    for (let i = 0; i <= n; i++) {
      el("line", { x1: xAt(i), y1: BASE_Y + 7, x2: xAt(i), y2: BASE_Y + 21, class: "svg-ruler", "stroke-width": 1.6 }, gRuler);
    }

    // --- tree bars (hidden above the canvas, ready to drop) ---
    const nodes = virtualNodes(LEVELS).map((nd) => {
      const x = padX + nd.frac * plotW;
      const top = levelY(nd.level);
      const g = el("g", {}, gTree);
      const h = BASE_Y - top;
      const drop = el("g", { transform: `translate(0 ${-(BASE_Y + 60)})` }, g);
      el("rect", {
        x: x - barW(nd.level) / 2, y: top, width: barW(nd.level), height: h,
        rx: barW(nd.level) / 2, class: "svg-bar",
      }, drop);
      const digit = el("text", {
        x, y: top - 10, "text-anchor": "middle", "font-size": 21,
        fill: C.lightblue, class: "svg-power-digit", opacity: 0, text: nd.level,
      }, g);
      return { ...nd, x, top, g, drop, digit, rect: drop.firstChild };
    });

    // --- edges parent -> child (drawn later) ---
    const edges = [];
    for (const nd of nodes) {
      if (nd.level === 1) continue;
      const k = Math.round(nd.frac * Math.pow(2, nd.level));
      const pk = ((k - 1) / 2) % 2 === 1 ? (k - 1) / 2 : (k + 1) / 2;
      // reduce parent numerator to its own level
      let num = pk, lev = nd.level - 1;
      while (num % 2 === 0) { num /= 2; lev -= 1; }
      const parent = nodes.find((o) => o.level === lev && Math.round(o.frac * Math.pow(2, lev)) === num);
      if (!parent) continue;
      const line = el("line", {
        x1: parent.x, y1: parent.top, x2: nd.x, y2: nd.top,
        class: "svg-edge", opacity: 0,
      }, gTree);
      edges.push({ line, childLevel: nd.level, len: Math.hypot(nd.x - parent.x, nd.top - parent.top) });
    }

    return { gRuns, gBand, gTree, gRuler, gChips, gFront, runEls, nodes, edges };
  }

  async function playIntro(S, tk) {
    // 1 · runs appear
    caption.textContent = "scan once → chop the input into sorted runs";
    for (const g of S.runEls) {
      if (tk.cancelled) return;
      tween(360, (u) => g.setAttribute("opacity", u), easeOutCubic, tk);
      await sleep(95, tk);
    }
    await sleep(500, tk);
    if (tk.cancelled) return;

    // 2 · bars drop level by level
    caption.textContent = "node powers of a (virtual) perfectly balanced binary tree";
    for (let l = 1; l <= LEVELS; l++) {
      if (tk.cancelled) return;
      const lvlNodes = S.nodes.filter((nd) => nd.level === l);
      const lvlEdges = S.edges.filter((e) => e.childLevel === l);
      for (const e of lvlEdges) {
        e.line.setAttribute("stroke-dasharray", e.len);
        e.line.setAttribute("stroke-dashoffset", e.len);
        e.line.setAttribute("opacity", 1);
        tween(420, (u) => e.line.setAttribute("stroke-dashoffset", e.len * (1 - u)), easeOutCubic, tk);
      }
      const drops = lvlNodes.map((nd, idx) =>
        (async () => {
          await sleep(idx * 55, tk);
          const from = -(BASE_Y + 60);
          await tween(650, (u) => {
            nd.drop.setAttribute("transform", `translate(0 ${from * (1 - u)})`);
          }, easeOutBack, tk);
          tween(220, (u) => nd.digit.setAttribute("opacity", u), easeOutCubic, tk);
        })()
      );
      await Promise.all(drops);
      await sleep(140, tk);
    }
    await sleep(650, tk);
  }

  /** the half-open interval (a, b] as an SVG group: open paren, line, closing bracket */
  function makeInterval(xa, xb) {
    const g = el("g", { opacity: 0 });
    el("line", {
      x1: xa + 4, y1: 0, x2: xb - 3, y2: 0, // cap reaches xa+1.5, into the "(" stroke at xa
      stroke: C.lime, "stroke-width": 5, "stroke-linecap": "round",
    }, g);
    el("path", {
      d: `M ${xa + 7.5} -12 Q ${xa - 7.5} 0 ${xa + 7.5} 12`, // apex of "(" sits on the dashed guide at xa
      stroke: C.lime, "stroke-width": 4, fill: "none", "stroke-linecap": "round",
    }, g);
    el("path", {
      d: `M ${xb - 11} -12 L ${xb} -12 L ${xb} 12 L ${xb - 11} 12`,
      stroke: C.lime, "stroke-width": 4, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round",
    }, g);
    return g;
  }

  /** binary readout of the two midpoints, shared prefix in lime, first differing bit in yellow */
  function makeBinaryReadout(fa, fb, p, gParent) {
    const m = Math.min(12, Math.max(p + 3, 8));
    const bitsA = binaryBits(fa, m), bitsB = binaryBits(fb, m);
    const FS = 23, CW = FS * 0.602; // IBM Plex Mono advance ≈ 0.6em
    const label = ["a = 0.", "b = 0."];
    const totalChars = label[0].length + m;
    const x0 = 760 - (totalChars * CW) / 2;
    const g = el("g", { opacity: 0 }, gParent);
    [bitsA, bitsB].forEach((bits, row) => {
      const t = el("text", {
        x: x0, y: 652 + row * 32, "font-size": FS,
        class: "svg-binary", fill: C.lightblue,
      }, g);
      const lab = document.createElementNS(SVGNS, "tspan");
      lab.textContent = label[row]; t.appendChild(lab);
      bits.forEach((b, i) => {
        const ts = document.createElementNS(SVGNS, "tspan");
        ts.textContent = b;
        const k = i + 1; // 1-based bit index
        if (k < p) { ts.setAttribute("fill", C.lime); ts.setAttribute("font-weight", 700); }
        else if (k === p) { ts.setAttribute("fill", C.yellow); ts.setAttribute("font-weight", 700); }
        else { ts.setAttribute("fill", C.lightblue); ts.setAttribute("opacity", 0.45); }
        t.appendChild(ts);
      });
      t.appendChild(document.createTextNode("\u2026"));
    });
    el("text", {
      x: x0 + (totalChars + 1.6) * CW, y: 652 + 16, "font-size": FS,
      class: "svg-binary", fill: C.yellow, "font-weight": 700,
      text: `→ p = ${p}`,
    }, g);
    return g;
  }

  async function playBoundaries(S, tk) {
    caption.textContent = "each boundary's midpoint interval (a, b] drops until it lands on the tallest pole in its way — that depth is the power";
    for (let b = 0; b < runs.length - 1; b++) {
      if (tk.cancelled) return;
      const L = runs[b], R = runs[b + 1];
      const p = boundaryPower(L, R, n);
      const fa = (L.start + L.len / 2) / n;
      const fb = (R.start + R.len / 2) / n;
      const fNode = nodeFraction(L, R, n, p);
      const xa = padX + fa * plotW, xb = padX + fb * plotW;

      // background band + midpoint markers on the ruler
      const band = el("rect", {
        x: xa, y: TREE_TOP - 34, width: xb - xa, height: BASE_Y + 20 - (TREE_TOP - 34),
        fill: C.blue, opacity: 0,
      }, S.gBand);
      const edgeA = el("line", { x1: xa, y1: TREE_TOP - 34, x2: xa, y2: BASE_Y + 20, stroke: C.lime, "stroke-width": 1.6, "stroke-dasharray": "5 6", opacity: 0 }, S.gBand);
      const edgeB = el("line", { x1: xb, y1: TREE_TOP - 34, x2: xb, y2: BASE_Y + 20, stroke: C.lime, "stroke-width": 1.6, "stroke-dasharray": "5 6", opacity: 0 }, S.gBand);
      const mkA = el("circle", { cx: xa, cy: BASE_Y + 14, r: 7, fill: C.lime, opacity: 0 }, S.gBand);
      const mkB = el("circle", { cx: xb, cy: BASE_Y + 14, r: 7, fill: C.lime, opacity: 0 }, S.gBand);
      const gBin = makeBinaryReadout(fa, fb, p, S.gBand);
      tween(240, (u) => {
        band.setAttribute("opacity", 0.30 * u);
        edgeA.setAttribute("opacity", 0.85 * u); edgeB.setAttribute("opacity", 0.85 * u);
        mkA.setAttribute("opacity", u); mkB.setAttribute("opacity", u);
        gBin.setAttribute("opacity", u);
      }, easeOutCubic, tk);
      await sleep(340, tk);
      if (tk.cancelled) { band.remove(); edgeA.remove(); edgeB.remove(); mkA.remove(); mkB.remove(); gBin.remove(); return; }

      // the half-open interval (a, b] drops until it lands on the tallest pole inside it
      const gInt = makeInterval(xa, xb);
      S.gFront.appendChild(gInt);
      const yStart = TREE_TOP - 22;
      const yLand = levelY(p) - 2; // the line itself rests on the pole (the (—] end markers wrap around it)
      gInt.setAttribute("transform", `translate(0 ${yStart})`);
      await tween(220, (u) => gInt.setAttribute("opacity", u), easeOutCubic, tk);
      await sleep(160, tk);
      await tween(760, (u) => {
        gInt.setAttribute("transform", `translate(0 ${yStart + (yLand - yStart) * u})`);
      }, easeOutBounce, tk);

      // it's stuck — flash the pole it landed on
      const node = S.nodes.find((nd) => nd.level === p && Math.abs(nd.frac - fNode) < 1e-9);
      if (node) {
        node.rect.classList.add("flash");
        node.digit.setAttribute("fill", C.yellow);
        node.digit.setAttribute("font-size", 27);
      }
      // chip with the boundary's power between the two run boxes
      const bx = xAt(R.start);
      const chip = el("g", { opacity: 0 }, S.gChips);
      el("rect", { x: bx - 14, y: CHIP_Y, width: 28, height: 30, rx: 7, fill: C.lime }, chip);
      el("text", {
        x: bx, y: CHIP_Y + 21.5, "text-anchor": "middle", "font-size": 19,
        "font-weight": 700, fill: C.darkblue, class: "svg-power-digit", text: p,
      }, chip);
      await tween(240, (u) => chip.setAttribute("opacity", u), easeOutCubic, tk);
      await sleep(560, tk);

      if (node) {
        node.rect.classList.remove("flash");
        node.digit.setAttribute("fill", C.lightblue);
        node.digit.setAttribute("font-size", 21);
      }
      tween(260, (u) => {
        band.setAttribute("opacity", 0.30 * (1 - u));
        edgeA.setAttribute("opacity", 0.85 * (1 - u)); edgeB.setAttribute("opacity", 0.85 * (1 - u));
        mkA.setAttribute("opacity", 1 - u); mkB.setAttribute("opacity", 1 - u);
        gBin.setAttribute("opacity", 1 - u); gInt.setAttribute("opacity", 1 - u);
      }, easeOutCubic, tk).then(() => { band.remove(); edgeA.remove(); edgeB.remove(); mkA.remove(); mkB.remove(); gBin.remove(); gInt.remove(); });
      await sleep(120, tk);
    }
    if (tk.cancelled) return;
    caption.textContent = "boundary powers decide the merge order — that's all of Powersort's policy ↓";
  }

  async function run() {
    token.cancelled = true;
    token = { cancelled: false };
    const tk = token;
    const S = buildStatic();
    await sleep(250, tk);
    await playIntro(S, tk);
    if (tk.cancelled) return;
    await playBoundaries(S, tk);
  }

  replayBtn.addEventListener("click", run);

  // start when scrolled into view (once)
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && !started) {
      started = true;
      run();
      io.disconnect();
    }
  }, { threshold: 0.35 });
  io.observe(svg);

  return { run };
})();
