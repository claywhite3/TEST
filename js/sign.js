/* Engage sign renderer — draws the sign on the display's real canvas (2560×1440 landscape, 1440×2560 portrait)
   as one SVG that scales to any width, so proportions match the output exactly.
   Every position below is measured from the store sign files (Tomato.png for landscape, FabricBirds.png for portrait).
   Regular price: white on black. Was price: black on white. Text widths are measured with the live font so long
   prices and names shrink to fit instead of colliding. */
(function () {
  "use strict";

  const F_PRICE = '"SignPrice", "Helvetica Neue", Helvetica, Arial, sans-serif'; // SignPrice = bundled Helvetica-metric font (fonts/)
  const F_WORDS = '"Bogle", "Figtree", "Helvetica Neue", Arial, sans-serif';

  const HEAD = {
    edlp: { label: ["Everyday Low Price"], portrait: ["Everyday", "Low Price"], bg: "#1358a8", fg: "#ffffff", spark: "#ffc220", weight: 400, was: false },
    rollback: { label: ["Rollback"], portrait: ["Rollback"], bg: "#e60000", fg: "#ffffff", spark: "#ffc220", weight: 400, was: true },
    clearance: { label: ["Clearance"], portrait: ["Clearance"], bg: "#f4d10d", fg: "#1d1d1d", spark: "#1d1d1d", weight: 400, was: true },
    manager: { label: ["Manager’s Special"], portrait: ["Manager’s", "Special"], bg: "#008cff", fg: "#000000", spark: null, weight: 700, was: true },
  };

  /* geometry in output pixels */
  const G = {
    landscape: {
      W: 2560, H: 1440, band: 365, tabW: 567,
      spark: { cx: 186, cy: 179, r: 122 }, labelX: 357, labelXNoSpark: 70, labelFs: 210, labelBase: 234, labelLS: -0.05,
      cur: { x: 143, fs: 467, base: 764 }, dolX: 413, gap: 0, capTop: 407,
      dol: { fs: 1372 }, cents: { fs: 569, base: 813, ls: -0.07 }, kern: 0.062,
      unit: { fs: 390, base: 818, beside: true }, each: { fs: 150, dx: 20, base: 1003 },
      maxRight: 2470,
      img: { x: 1613, y: 909, w: 864, h: 448 },
      plu: { x: 23, base: 1395, fs: 68 },
      desc: { x: 2538, base: 1398, fs: 66, ls: -0.04, anchor: "end", maxW: 1000, lines: 1 },
      was: { word: { fs: 120, base: 128 }, cur: 140, dol: 230, cents: 125, base: 326 },
    },
    portrait: {
      W: 1440, H: 2560, band: 493, tabW: 400,
      spark: { cx: 189, cy: 228, r: 179 }, labelX: 397, labelXNoSpark: 70, labelFs: 210, labelBase: 300, labelLS: -0.05,
      two: [{ fs: 120, base: 169 }, { fs: 210, base: 390 }],
      twoEqual: [{ fs: 185, base: 215 }, { fs: 185, base: 425 }],
      cur: { x: 215, fs: 375, base: 845 }, dolX: 391, gap: 0, capTop: 550,
      dol: { fs: 961 }, cents: { fs: 402, base: 838, ls: 0.05 }, kern: 0.044,
      unit: { fs: 112, beside: false }, each: { fs: 112, dx: 150, base: 973, weight: 400 },
      maxRight: 1400,
      img: { x: 282, y: 1357, w: 889, h: 601 },
      plu: { x: 70, base: 2490, fs: 68 },
      desc: { x: 70, base: 2314, fs: 155, ls: -0.04, anchor: "start", maxW: 1300, lines: 2, lead: 144 },
      was: { word: { fs: 96, base: 150 }, cur: 104, dol: 190, cents: 100, base: 400 },
    },
  };

  /* text measurement with the font that will actually render */
  const cv = document.createElement("canvas").getContext("2d");
  const width = (text, fs, family, weight = 700, ls = 0) => { cv.font = `${weight} ${fs}px ${family}`; return cv.measureText(text).width + Math.max(0, [...text].length - 1) * ls * fs; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* "597" → {cur:"$", dol:"5", cents:"97"}; under a dollar → {cur:"", dol:"67", cents:"¢"} */
  function parts(c) {
    if (!c) return { cur: "$", dol: "0", cents: "00" };
    const n = Number(c);
    if (n < 100) return { cur: "", dol: String(n), cents: "¢" };
    const p = String(c).padStart(3, "0");
    return { cur: "$", dol: String(Number(p.slice(0, -2))), cents: p.slice(-2) };
  }

  const spark = (cx, cy, r, color) => `<g transform="translate(${cx} ${cy}) scale(${(r / 16).toFixed(3)})" fill="${color}">` +
    [0, 60, 120, 180, 240, 300].map((a) => `<rect x="-2.1" y="-15" width="4.2" height="10" rx="2.1" transform="rotate(${a})"/>`).join("") + "</g>";

  function header(g, h, o, type) {
    const right = h.was ? g.W - g.tabW : g.W;
    const x = h.spark ? g.labelX : g.labelXNoSpark;
    const avail = right - x - 50;
    let out = `<rect width="${g.W}" height="${g.band}" fill="${h.bg}"/>`;
    if (h.spark) out += spark(g.spark.cx, g.spark.cy, g.spark.r, h.spark);
    const lines = o === "portrait" ? h.portrait : h.label;
    if (lines.length === 2 && g.two) {
      // two lines (portrait): small top line, large bottom line — as on the Fabric Birds file
      const rows = type === "manager" ? g.twoEqual : g.two;
      lines.forEach((t, i) => {
        const L = rows[i];
        const ls = g.labelLS || 0;
        const fs = Math.min(L.fs, avail / (width(t, 1, F_WORDS, h.weight, ls) || 1));
        out += `<text x="${x}" y="${L.base}" font-family='${F_WORDS}' font-weight="${h.weight}" font-size="${fs.toFixed(1)}" letter-spacing="${(ls * fs).toFixed(1)}" fill="${h.fg}">${esc(t)}</text>`;
      });
    } else {
      const t = lines[0];
      const ls = g.labelLS || 0;
      const fs = Math.min(g.labelFs, avail / (width(t, 1, F_WORDS, h.weight, ls) || 1));
      const base = o === "portrait" ? g.band / 2 + fs * 0.36 : g.labelBase - (g.labelFs - fs) * 0.36;
      out += `<text x="${x}" y="${base.toFixed(1)}" font-family='${F_WORDS}' font-weight="${h.weight}" font-size="${fs.toFixed(1)}" letter-spacing="${(ls * fs).toFixed(1)}" fill="${h.fg}">${esc(t)}</text>`;
    }
    return out;
  }

  function wasTab(g, c) {
    const x0 = g.W - g.tabW, cx = x0 + g.tabW / 2, w = g.was;
    const p = parts(c);
    const wc = width(p.cur, w.cur, F_PRICE), wd = width(p.dol, w.dol, F_PRICE), wn = width(p.cents, w.cents, F_PRICE);
    let k = Math.min(1, (g.tabW - 60) / (wc + wd + wn + 8));
    const tot = (wc + wd + wn + 8) * k;
    let x = cx - tot / 2;
    const dolCapTop = w.base - 0.717 * w.dol * k;
    let out = `<rect x="${x0}" width="${g.tabW}" height="${g.band}" fill="#ffffff"/>
      <text x="${cx}" y="${w.word.base}" text-anchor="middle" font-family='${F_WORDS}' font-weight="500" font-size="${w.word.fs}" fill="#000">Was:</text>`;
    if (p.cur) { out += `<text x="${x.toFixed(1)}" y="${(dolCapTop + 0.717 * w.cur * k).toFixed(1)}" font-family='${F_PRICE}' font-weight="700" font-size="${(w.cur * k).toFixed(1)}" fill="#000">$</text>`; x += (wc + 4) * k; }
    out += `<text x="${x.toFixed(1)}" y="${w.base}" font-family='${F_PRICE}' font-weight="700" font-size="${(w.dol * k).toFixed(1)}" fill="#000">${esc(p.dol)}</text>`;
    x += (wd + 4) * k;
    out += `<text x="${x.toFixed(1)}" y="${(dolCapTop + 0.717 * w.cents * k).toFixed(1)}" font-family='${F_PRICE}' font-weight="700" font-size="${(w.cents * k).toFixed(1)}" fill="#000">${esc(p.cents)}</text>`;
    return out;
  }

  function price(g, c, uom) {
    const p = parts(c);
    const unit = uom === "lb" ? "/lb" : "";
    const each = uom === "ea" ? "each" : "";
    // dollars shrink only as much as needed for the price to fit
    const curW = p.cur ? (g.dolX ? g.dolX - g.cur.x : width("$", g.cur.fs, F_PRICE) + g.gap) : 0;
    const dolW1 = width(p.dol, 1, F_PRICE) - g.kern;       // per px of font size
    const cls = g.cents.ls || 0;
    const centsW = width(p.cents, g.cents.fs, F_PRICE, 700, cls);
    const unitW = unit && g.unit.beside ? width(unit, g.unit.fs, F_PRICE, 400) - 0.11 * g.cents.fs : 0;
    const startX = p.cur ? g.cur.x : g.cur.x;
    let fs = g.dol.fs;
    const right = startX + curW + dolW1 * fs + centsW + unitW;
    if (right > g.maxRight) fs = Math.max(g.dol.fs * 0.35, (g.maxRight - startX - curW - centsW - unitW) / dolW1);
    const base = g.capTop + 0.717 * fs;
    const dolX = startX + curW;
    const centsX = dolX + dolW1 * fs;
    let out = "";
    if (p.cur) out += `<text x="${g.cur.x}" y="${g.cur.base}" font-family='${F_PRICE}' font-weight="700" font-size="${g.cur.fs}" fill="#fff">$</text>`;
    out += `<text x="${dolX.toFixed(1)}" y="${base.toFixed(1)}" font-family='${F_PRICE}' font-weight="700" font-size="${fs.toFixed(1)}" fill="#fff">${esc(p.dol)}</text>`;
    out += `<text x="${centsX.toFixed(1)}" y="${g.cents.base}" font-family='${F_PRICE}' font-weight="700" font-size="${g.cents.fs}" letter-spacing="${(cls * g.cents.fs).toFixed(1)}" fill="#fff">${esc(p.cents)}</text>`;
    if (unit && g.unit.beside) {
      out += `<text x="${(centsX + centsW - 0.11 * g.cents.fs).toFixed(1)}" y="${g.unit.base || g.cents.base}" font-family='${F_PRICE}' font-weight="400" font-size="${g.unit.fs}" fill="#fff">${unit}</text>`;
    }
    const below = each || (unit && !g.unit.beside ? unit : "");
    if (below) out += `<text x="${(centsX + g.each.dx).toFixed(1)}" y="${g.each.base}" font-family='${F_WORDS}' font-weight="${g.each.weight || 500}" font-size="${g.each.fs}" fill="#fff">${below}</text>`;
    return out;
  }

  function descText(g, desc, size) {
    const d = g.desc;
    const text = [desc, size].filter(Boolean).join(", ");
    if (!text) return "";
    let fs = d.fs;
    let lines = [text];
    if (width(text, fs, F_WORDS, 400) > d.maxW && d.lines > 1) {
      // split near the middle on a space
      const words = text.split(" ");
      let best = [text, ""], bestDiff = Infinity;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
        const diff = Math.abs(width(a, fs, F_WORDS, 400) - width(b, fs, F_WORDS, 400));
        if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
      }
      lines = best[1] ? best : [text];
    }
    const widest = Math.max(...lines.map((l) => width(l, fs, F_WORDS, 400)));
    if (widest > d.maxW) fs = fs * d.maxW / widest;
    const lead = (d.lead || fs * 1.2) * fs / d.fs;
    return lines.map((l, i) => `<text x="${d.x}" y="${(d.base - (lines.length - 1 - i) * lead).toFixed(1)}" text-anchor="${d.anchor}" font-family='${F_WORDS}' font-weight="400" font-size="${fs.toFixed(1)}" letter-spacing="${((d.ls || 0) * fs).toFixed(1)}" fill="#fff">${esc(l)}</text>`).join("");
  }

  /* opts: { orient, type, priceC, wasC, uom, size, desc, plu, img } */
  function render(o) {
    const orient = o.orient === "portrait" ? "portrait" : "landscape";
    const g = G[orient];
    const h = HEAD[o.type] || HEAD.edlp;
    const sizeLine = o.size && o.uom && !["ea", "lb"].includes(o.uom) ? `${o.size} ${o.uom}` : "";
    return `<svg class="esign-svg" viewBox="0 0 ${g.W} ${g.H}" role="img" aria-label="${orient} sign preview" xmlns="http://www.w3.org/2000/svg">
      <rect width="${g.W}" height="${g.H}" fill="#000"/>
      ${o.img ? `<image href="${esc(o.img)}" x="${g.img.x}" y="${g.img.y}" width="${g.img.w}" height="${g.img.h}" preserveAspectRatio="xMidYMid meet"/>` : ""}
      ${header(g, h, orient, o.type)}
      ${h.was ? wasTab(g, o.wasC) : ""}
      ${price(g, o.priceC, o.uom)}
      ${o.plu ? `<text x="${g.plu.x}" y="${g.plu.base}" font-family='${F_WORDS}' font-weight="500" font-size="${g.plu.fs}" fill="#fff">${esc(o.plu)}</text>` : ""}
      ${descText(g, o.desc, sizeLine)}
    </svg>`;
  }

  // fonts must be in before widths are measured; callers re-render when this resolves
  const ready = (document.fonts && document.fonts.load)
    ? Promise.all(["700 100px SignPrice", "400 100px SignPrice", "400 100px Figtree", "500 100px Figtree", "700 100px Figtree"].map((f) => document.fonts.load(f).catch(() => null)))
    : Promise.resolve();

  window.ECSign = { render, G, ready };
})();
