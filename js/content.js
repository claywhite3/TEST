/* content.html — Update Content: change the sign on displays that are already installed.
   Find (scan, or Zone → Aisle list) → Current sign → Price type → Details → Preview + Push Content → Wake → Sent.
   No battery, orientation or location steps: those come from the display's record.
   Details are prefilled from the current sign, except the price. On a markdown, the old price moves into Was.
   Status: Waiting for wake → Updated (Wi-Fi connection after the push) · Not confirmed after 7 min with none. */
(function () {
  "use strict";
  const { state, save, site, go, guard, esc, I, header, bindHeader, haptic, SERIAL_LEN, STATUS } = EC;
  if (!guard()) return;

  const FLOW_V = 1;
  const SPARK = '<svg class="spark" viewBox="-16 -16 32 32" aria-hidden="true"><g fill="currentColor">' +
    [0, 60, 120, 180, 240, 300].map((r) => `<rect x="-2.1" y="-15" width="4.2" height="10" rx="2.1" transform="rotate(${r})"/>`).join("") + "</g></svg>";
  const TYPES = [
    { id: "edlp", label: "Everyday Low Price", was: false, mark: SPARK },
    { id: "rollback", label: "Rollback", was: true, mark: SPARK },
    { id: "clearance", label: "Clearance", was: true, mark: SPARK },
    { id: "manager", label: "Manager’s Special", was: true, mark: "" },
  ];
  const UOM = ["ea", "lb", "ct", "oz", "fl oz", "gal", "pk"];
  const NO_SIZE = ["ea", "lb"];
  const PLU = Object.fromEntries((window.ECPLU || []).map(([plu, name, size, uom, img]) => [plu, { plu, name, size, uom, img }]));
  const RETAILER = new Set(window.ECPLU_RETAILER || []);
  const pluLookup = (code) => {
    if (/^\d{4}$/.test(code) && PLU[code]) return PLU[code];
    if (/^9\d{4}$/.test(code) && PLU[code.slice(1)]) { const p = PLU[code.slice(1)]; return Object.assign({}, p, { name: "Organic " + p.name }); }
    return null;
  };

  const STEPS = ["find", "current", "type", "details", "preview", "wake", "done"];
  const COPY = {
    find: ["Which display?", "Scan it, or pick it from the list."],
    current: ["This is on the display now", ""],
    type: ["Which sign is this?", ""],
    details: ["Enter the sign details", "Enter the new price. The rest is filled from the current sign."],
    preview: ["Check the sign", "This is what the display will show."],
    wake: ["Wake the display", "The sign is sent. Wake the display so it picks it up."],
    done: ["Sign sent", ""],
  };
  const WAKE = [
    { art: "where", title: "Find the pocket", lines: ["Go to the back of the display.", "The pocket is on the left side as you face the screen."] },
    { art: "find", title: "Find the button", lines: ["Reach into the pocket.", "The button is on the left. The light is on the right."] },
    { art: "hold", title: "Hold for 3 seconds", lines: ["Press and hold the button.", "Count to three, then let go."] },
    { art: "green", title: "The light turns green", lines: ["The light turns green."] },
    { art: "blink", title: "Then it blinks", lines: ["Then it blinks red or orange.", "That’s a good sign. The display is taking the sign."] },
    { art: "update", title: "The sign updates", lines: ["The screen changes in 3–5 minutes.", "You don’t need to wait."] },
  ];

  const fresh = () => ({ v: FLOW_V, step: "find", sel: [], open: {}, type: null, desc: "", plu: "", img: "", priceC: "", wasC: "", uom: "", size: "",
    wakeIdx: 0, wakeSlide: 0, wakeOnly: false, reject: null, base: null });
  let f = state.flows.content;
  if (!f || f.v !== FLOW_V) f = fresh();
  f = state.flows.content = Object.assign(fresh(), f);

  const s = site();
  const $ = (id) => document.getElementById(id);
  const ORIENT = { landscape: "Landscape", portrait: "Portrait" };

  /* ---------- data ---------- */
  const fleetNow = () => EC.fleet(s.id);
  const byId = (sn) => fleetNow().find((d) => d.serial === sn);
  const selected = () => f.sel.map(byId).filter(Boolean);
  const selOrient = () => (selected()[0] || {}).orient || null;
  const loc = EC.locCode;
  const chip = (st) => `<span class="status ${STATUS[st].cls}">${st === "updated" ? I.ok : st === "waiting" ? I.clock : I.x}${STATUS[st].word}</span>`;
  const thumb = (d, cls = "thumb") => `<span class="${cls}" data-o="${d.orient}">${ECSign.render(Object.assign({ orient: d.orient }, d.sign))}</span>`;

  /* ---------- money ---------- */
  const normCents = (v) => String(v).replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 6);
  const centsToNum = (c) => (c ? Number(c) / 100 : null);
  const fmtMoney = (c) => { if (!c) return ""; const p = c.padStart(3, "0"); return `$${Number(p.slice(0, -2)).toLocaleString("en-US")}.${p.slice(-2)}`; };
  const typeOf = () => TYPES.find((t) => t.id === f.type);
  const sizeNeeded = () => !NO_SIZE.includes(f.uom);

  /* Was rule: a markdown moves the old price into Was. Going to Everyday Low Price clears it.
     If the current sign is already a markdown, its Was (the original price) carries over. */
  function applyType(id) {
    f.type = id;
    const t = TYPES.find((x) => x.id === id);
    const b = f.base || {};
    if (!t.was) f.wasC = "";
    else if (!f.wasC) f.wasC = b.wasC || b.priceC || "";
  }

  /* ---------- validity ---------- */
  function valid() {
    switch (f.step) {
      case "find": return f.sel.length > 0;
      case "type": return !!f.type;
      case "details": { const t = typeOf(); return !!(f.desc.trim() && f.priceC && f.uom && (!sizeNeeded() || f.size.trim()) && (!t || !t.was || f.wasC)); }
      case "preview": return pv.canPush(previewKey());
      default: return true;
    }
  }
  /* preview build (js/preview.js): Push Content stays locked until it's back; 30 s limit */
  const pv = ECPreview.controller(() => { if (f.step === "preview") render(); });
  const previewKey = () => JSON.stringify(signOpts());
  const nextLabel = () => ({
    find: f.sel.length > 1 ? `Update ${f.sel.length} displays` : "Continue",
    current: "Change the sign",
    details: "Preview sign",
    preview: "Push Content",
    wake: f.wakeIdx < f.sel.length - 1 ? "Next display" : "Done",
  }[f.step] || "Continue");

  function setStep(st) { scanner.stop(); f.step = st; f.reject = null; save(); render(); const b = $("body"); if (b) b.scrollTop = 0; }

  function prefill() {
    // details come from the first selected display's current sign; the price never does
    const d = selected()[0];
    const sg = (d && d.sign) || {};
    f.base = { priceC: sg.priceC || "", wasC: sg.wasC || "", type: sg.type || "edlp" };
    Object.assign(f, { desc: sg.desc || "", plu: sg.plu || "", img: sg.img || "", uom: sg.uom || "", size: sg.size || "", priceC: "", wasC: "" });
    applyType(f.base.type);
  }

  function next() {
    if (!valid()) return;
    const n = f.sel.length;
    if (f.step === "current") { f.wakeOnly = false; prefill(); return setStep("type"); }
    if (f.step === "preview") {
      EC.recordPush(f.sel.slice(), signOpts());
      haptic(); f.wakeIdx = 0; f.wakeSlide = 0; return setStep("wake");
    }
    if (f.step === "wake") {
      EC.markWoken(f.sel[f.wakeIdx]);
      if (f.wakeIdx < n - 1) { f.wakeIdx++; f.wakeSlide = 0; save(); render(); return; }
      return setStep("done");
    }
    setStep(STEPS[STEPS.indexOf(f.step) + 1]);
  }
  function back() {
    if (f.step === "find") { go("home"); return; }
    if (f.step === "wake" && f.wakeIdx > 0) { f.wakeIdx--; f.wakeSlide = 0; save(); render(); return; }
    if (f.step === "wake" && f.wakeOnly) return setStep("current");
    setStep(STEPS[STEPS.indexOf(f.step) - 1]);
  }
  function openBatteryGuide() { scanner.stop(); state.flows.battery = { step: 0, returnTo: "content" }; go("battery"); }

  /* ---------- selection ---------- */
  function trySelect(sn, { fromScan = false, quiet = false } = {}) {
    const d = byId(sn);
    if (!d) {
      const known = EC.DEVICES.find((x) => x.serial === sn);
      const other = known && EC.site(known.siteId);
      f.reject = { serial: sn, why: other ? `Registered to ${other.name}.` : "Not installed at this site. Use Install first." };
      save(); paintFind(); return;
    }
    const o = selOrient();
    if (o && d.orient !== o) {
      f.reject = { serial: sn, why: `${loc(d)} is ${d.orient}. This batch is ${o}. Update it separately.` };
      save(); paintFind(); return;
    }
    f.reject = null;
    const added = !f.sel.includes(sn);
    if (added) { f.sel.push(sn); if (fromScan) haptic(40); }
    f.open[d.zone] = true; f.open[d.zone + d.aisle] = true; // reveal it in the list
    save(); paintFind();
    if (added && !quiet) askPartner(d);
  }
  function toggle(sn) {
    if (f.sel.includes(sn)) { f.sel = f.sel.filter((x) => x !== sn); f.reject = null; save(); paintFind(); }
    else trySelect(sn, { quiet: true });
  }
  function toggleLoc(key) {
    const grp = fleetNow().filter((d) => loc(d) === key);
    if (grp.every((d) => f.sel.includes(d.serial))) { f.sel = f.sel.filter((sn) => !grp.some((d) => d.serial === sn)); f.reject = null; save(); paintFind(); }
    else askLocation(key);
  }

  /* ---------- scanner (same behavior as Install: tap to start, keeps scanning, wrong codes shake) ---------- */
  const norm = (v) => String(v).toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, SERIAL_LEN);
  const isSerialShape = (v) => new RegExp(`^[0-9A-Z]{${SERIAL_LEN}}$`).test(v);
  const ZXING_URL = "lib/zxing.min.js"; // bundled (Apache-2.0) so iPhone scanning works offline
  const scanner = {
    state: "idle", stream: null, raf: 0, zx: null, lastShake: 0, last: { v: "", t: 0 },
    async start() {
      if (this.state === "starting" || this.state === "running") return;
      this.paint("starting");
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("no-camera-api");
        const video = $("scan-video");
        if ("BarcodeDetector" in window) {
          const det = new window.BarcodeDetector({ formats: ["code_128", "code_39", "qr_code", "data_matrix", "ean_13"] });
          this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          if (this.state !== "starting") { this.release(); return; }
          video.srcObject = this.stream; await video.play(); this.paint("running");
          const tick = async () => {
            if (this.state !== "running") return;
            try { for (const c of await det.detect(video)) this.handle(c.rawValue); } catch { /* frame not ready */ }
            this.raf = requestAnimationFrame(tick);
          };
          tick();
        } else {
          if (!window.ZXing) await new Promise((ok, bad) => { const sc = document.createElement("script"); sc.src = ZXING_URL; sc.onload = ok; sc.onerror = () => bad(new Error("zxing-load")); document.head.appendChild(sc); });
          if (this.state !== "starting") return;
          this.zx = new window.ZXing.BrowserMultiFormatReader();
          await this.zx.decodeFromConstraints({ video: { facingMode: "environment" }, audio: false }, video, (res) => { if (res && this.state === "running") this.handle(res.getText()); });
          this.stream = video.srcObject;
          if (this.state !== "starting") { this.release(); return; }
          this.paint("running");
        }
      } catch (e) {
        this.release();
        this.paint("failed", e && e.name === "NotAllowedError" ? "Camera permission was declined." : "The camera couldn’t start here.");
      }
    },
    handle(raw) {
      const v = norm(raw), now = Date.now();
      if (isSerialShape(v)) {
        if (v === this.last.v && now - this.last.t < 2500) return;
        this.last = { v, t: now };
        trySelect(v, { fromScan: true });
        const c = document.querySelector(".scanner .cam");
        if (c) { c.classList.remove("got"); void c.offsetWidth; c.classList.add("got"); }
        return;
      }
      if (now - this.lastShake > 900) {
        this.lastShake = now;
        const fr = document.querySelector(".scanner .cam .vf-frame");
        if (fr) { fr.classList.remove("shake"); void fr.offsetWidth; fr.classList.add("shake"); }
      }
    },
    release() {
      cancelAnimationFrame(this.raf);
      try { this.zx && this.zx.reset(); } catch { /* ignore */ }
      this.zx = null;
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      const v = $("scan-video"); if (v) v.srcObject = null;
    },
    stop() { if (this.state === "idle") return; this.release(); this.paint("idle"); },
    paint(st, msg) {
      this.state = st;
      const el = $("scanner"); if (!el) return;
      el.dataset.state = st;
      $("cam-msg").textContent = { idle: "", starting: "Starting camera…", running: "Scan each display. Tap × when done.", failed: msg || "" }[st];
    },
  };
  addEventListener("visibilitychange", () => { if (document.hidden) scanner.stop(); });
  addEventListener("pagehide", () => scanner.release());

  /* ---------- find: Zone → Aisle → display ---------- */
  function treeHtml() {
    const all = fleetNow();
    if (!all.length) return `<div class="empty">No displays installed at this site yet.</div>`;
    const o = selOrient();
    const zones = {};
    all.forEach((d) => { ((zones[d.zone] = zones[d.zone] || {})[d.aisle] = zones[d.zone][d.aisle] || []).push(d); });
    const num = (a, b) => Number(a) - Number(b);
    return Object.keys(zones).sort().map((z) => {
      const aisles = zones[z];
      const count = Object.values(aisles).reduce((n, l) => n + l.length, 0);
      const zOpen = !!f.open[z];
      return `
        <div class="tree-zone">
          <button class="tree-row zone" data-open="${esc(z)}" aria-expanded="${zOpen}">
            <span class="caret">${I.next}</span><span class="tree-name">Zone ${esc(z)}</span>
            <span class="tree-meta">${Object.keys(aisles).length} aisle${Object.keys(aisles).length > 1 ? "s" : ""} · ${count}</span>
          </button>
          ${zOpen ? Object.keys(aisles).sort(num).map((a) => {
            const list = aisles[a].sort((x, y) => num(x.section, y.section));
            const key = z + a;
            const aOpen = !!f.open[key];
            const pickable = list.filter((d) => !o || d.orient === o);
            const allIn = pickable.length && pickable.every((d) => f.sel.includes(d.serial));
            return `
              <div class="tree-aisle">
                <div class="tree-row aisle">
                  <button class="tree-open" data-open="${esc(key)}" aria-expanded="${aOpen}"><span class="caret">${I.next}</span><span class="tree-name">Aisle ${esc(a)}</span><span class="tree-meta">${list.length}</span></button>
                  <button class="tree-all" data-all="${esc(key)}" aria-pressed="${!!allIn}" ${pickable.length ? "" : "disabled"}>${allIn ? "Clear" : "Select all"}</button>
                </div>
                ${aOpen ? groupsOf(list).map((grp) => grp.length === 1 ? devRow(grp[0], o) : pairRow(grp, o)).join("") : ""}
              </div>`;
          }).join("") : ""}
        </div>`;
    }).join("");
  }
  /* displays in an aisle, grouped by location (a location holds up to two: produce corners) */
  function groupsOf(list) {
    const g = {};
    list.forEach((d) => (g[loc(d)] = g[loc(d)] || []).push(d));
    return Object.values(g).map((x) => x.sort((p, q) => p.serial.localeCompare(q.serial)));
  }
  function devRow(d, o) {
    const on = f.sel.includes(d.serial);
    const blocked = o && d.orient !== o && !on;
    return `
      <button class="tree-dev" data-pick="${d.serial}" aria-pressed="${on}" ${blocked ? 'data-blocked="1"' : ""}>
        <span class="check" aria-hidden="true">${on ? I.ok : ""}</span>
        ${thumb(d)}
        <span class="dev-meta"><b class="mono">${esc(loc(d))}</b><span class="note">${esc(d.sign.desc || "")}</span><span class="dev-line">${chip(d.status)}${EC.health(d)}</span></span>
        ${blocked ? `<span class="dev-why">${ORIENT[d.orient]}</span>` : ""}
      </button>`;
  }
  function pairRow(grp, o) {
    const key = loc(grp[0]);
    const ons = grp.filter((d) => f.sel.includes(d.serial)).length;
    const same = JSON.stringify(grp[0].sign) === JSON.stringify(grp[1].sign);
    const blocked = o && grp[0].orient !== o && !ons;
    return `
      <button class="tree-dev pair" data-pickloc="${esc(key)}" aria-pressed="${ons === grp.length}" ${blocked ? 'data-blocked="1"' : ""}>
        <span class="check" aria-hidden="true">${ons === grp.length ? I.ok : ons ? '<i class="part"></i>' : ""}</span>
        ${same ? thumb(grp[0]) : `<span class="thumb-pair">${grp.map((d) => thumb(d)).join("")}</span>`}
        <span class="dev-meta"><b class="mono">${esc(key)}<span class="pair-tag">2 displays</span></b>
          <span class="note">${same ? esc(grp[0].sign.desc || "") + " · same sign" : "Different signs"}</span>
          ${grp.map((d) => `<span class="dev-line"><span class="note mono">${esc(d.serial)}${f.sel.includes(d.serial) ? " ✓" : ""}</span>${chip(d.status)}${EC.health(d)}</span>`).join("")}</span>
        ${blocked ? `<span class="dev-why">${ORIENT[grp[0].orient]}</span>` : ""}
      </button>`;
  }
  /* tapping a shared location asks: same sign on both, or just one (pick it, or scan the one in front of you) */
  function askLocation(key) {
    const grp = fleetNow().filter((d) => loc(d) === key);
    const { el, close } = EC.sheet(`
      <h3>${esc(key)} has two displays</h3>
      <div class="opt-list">
        <button class="btn" data-both="1">Both · same sign</button>
        ${grp.map((d) => `<button class="btn ghost" data-one="${d.serial}">Just <span class="mono">${esc(d.serial)}</span></button>`).join("")}
      </div>
      <p class="note" style="margin:0">Not sure which is which? Close this and scan the one you’re updating.</p>`, { label: `${key} has two displays` });
    el.querySelector("[data-both]").onclick = () => { close(); grp.forEach((d) => trySelect(d.serial, { quiet: true })); };
    el.querySelectorAll("[data-one]").forEach((b) => b.onclick = () => {
      close();
      f.sel = f.sel.filter((sn) => !grp.some((d) => d.serial === sn));
      trySelect(b.dataset.one, { quiet: true });
    });
  }
  /* scanning or typing one display of a pair offers the other one */
  function askPartner(d) {
    const mate = fleetNow().find((x) => x.serial !== d.serial && loc(x) === loc(d));
    if (!mate || f.sel.includes(mate.serial)) return;
    const { el, close } = EC.sheet(`
      <h3>${esc(d.serial)} shares ${esc(loc(d))} with ${esc(mate.serial)}</h3>
      <p class="note" style="margin:0">Update both with the same sign?</p>
      <div class="opt-list">
        <button class="btn" data-both="1">Update both</button>
        <button class="btn ghost" data-one="1">Just this one</button>
      </div>`, { label: "Shared location" });
    el.querySelector("[data-both]").onclick = () => { close(); trySelect(mate.serial, { quiet: true }); };
    el.querySelector("[data-one]").onclick = () => close();
  }

  function paintFind() {
    if (f.step !== "find") return;
    const t = $("tree"); if (t) t.innerHTML = treeHtml();
    $("scan-reject").innerHTML = f.reject ? `<div class="result bad" role="alert"><strong class="mono">${esc(f.reject.serial)}</strong><p>${esc(f.reject.why)}</p></div>` : "";
    const o = selOrient();
    $("sel-bar").innerHTML = f.sel.length ? `<span><b>${f.sel.length}</b> selected · ${ORIENT[o]}</span><button class="link" id="sel-clear">Clear</button>` : `<span class="note">Nothing selected yet</span>`;
    bindFind();
    refreshNext();
  }
  function bindFind() {
    document.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => { const k = b.dataset.open; f.open[k] = !f.open[k]; save(); paintFind(); });
    document.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => toggle(b.dataset.pick));
    document.querySelectorAll("[data-pickloc]").forEach((b) => b.onclick = () => toggleLoc(b.dataset.pickloc));
    document.querySelectorAll("[data-all]").forEach((b) => b.onclick = () => {
      const key = b.dataset.all;
      const list = fleetNow().filter((d) => d.zone + d.aisle === key);
      const o = selOrient() || (list[0] && list[0].orient);
      const pickable = list.filter((d) => d.orient === o);
      const allIn = pickable.every((d) => f.sel.includes(d.serial));
      if (allIn) f.sel = f.sel.filter((sn) => !pickable.some((d) => d.serial === sn));
      else pickable.forEach((d) => { if (!f.sel.includes(d.serial)) f.sel.push(d.serial); });
      f.reject = null; save(); paintFind();
    });
    const clr = $("sel-clear"); if (clr) clr.onclick = () => { f.sel = []; f.reject = null; save(); paintFind(); };
    const serial = $("serial");
    if (serial && !serial.dataset.bound) {
      serial.dataset.bound = "1";
      serial.addEventListener("focus", () => scanner.stop());
      serial.addEventListener("input", () => {
        const v = norm(serial.value); serial.value = v; $("len").textContent = `${v.length}/${SERIAL_LEN}`;
        if (v.length === SERIAL_LEN) { trySelect(v); serial.value = ""; $("len").textContent = `0/${SERIAL_LEN}`; }
      });
    }
  }

  /* ---------- pieces ---------- */
  const typeBand = (t) => `<span class="sign-band" data-type="${t.id}">${t.mark}<span class="sign-label">${esc(t.label)}</span>${t.was ? `<span class="sign-was">Was:<b>$—</b></span>` : ""}</span>`;
  const signOpts = () => ({ orient: selOrient() || "landscape", type: f.type || "edlp", priceC: f.priceC, wasC: f.wasC, uom: f.uom,
    size: sizeNeeded() ? f.size : "", desc: f.desc, plu: f.plu, img: f.img });
  const eSign = () => `<div class="esign" data-o="${selOrient() || "landscape"}" id="esign">${ECSign.render(signOpts())}</div>`;
  ECSign.ready.then(() => { const el = $("esign"); if (el) el.innerHTML = ECSign.render(signOpts()); if (f.step === "find") paintFind(); });

  function eyebrow() {
    const sel = selected(), n = sel.length;
    if (!n || f.step === "find" || f.step === "done") return "";
    if (f.step === "wake") { const d = byId(f.sel[f.wakeIdx]); return d ? `<div class="eyebrow-row"><span class="id-tag mono">${esc(d.serial)}</span><span>${esc(loc(d))}${n > 1 ? ` · ${f.wakeIdx + 1} of ${n}` : ""}</span></div>` : ""; }
    if (n > 1) return `<div class="eyebrow-row"><span class="id-tag">${n} displays</span><span>Same sign · ${ORIENT[selOrient()]}</span></div>`;
    return `<div class="eyebrow-row"><span class="id-tag mono">${esc(sel[0].serial)}</span><span>${esc(loc(sel[0]))} · ${ORIENT[sel[0].orient]}</span></div>`;
  }

  function body() {
    switch (f.step) {
      case "find": return `
        <div class="serial-field"><input class="input" id="serial" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Display ID" placeholder="Or type the display ID" /><span class="len" id="len">0/${SERIAL_LEN}</span></div>
        <div id="scan-reject"></div>
        <div class="sel-bar" id="sel-bar"></div>
        <div class="tree" id="tree"></div>`;

      case "current": {
        const sel = selected();
        const waiting = sel.filter((d) => d.status === "waiting"), unconf = sel.filter((d) => d.status === "unconfirmed");
        const lowBatt = sel.filter((d) => EC.battLevel(d.battery) === "bad");
        const same = sel.every((d) => JSON.stringify(d.sign) === JSON.stringify(sel[0].sign));
        return `
          ${sel.length === 1 || same
            ? `<div class="esign" data-o="${sel[0].orient}">${ECSign.render(Object.assign({ orient: sel[0].orient }, sel[0].sign))}</div>
               <div class="cur-row">${sel.length === 1 ? `<span class="mono"><b>${esc(loc(sel[0]))}</b></span>${chip(sel[0].status)}` : `<span class="note">All ${sel.length} displays show this sign.</span>`}</div>`
            : `<div class="cur-list">${sel.map((d) => `<div class="cur-item">${thumb(d, "thumb big")}<span class="dev-meta"><b class="mono">${esc(loc(d))}</b>${chip(d.status)}</span></div>`).join("")}</div>
               <p class="note" style="margin:0">These displays show different signs. They will all get the same new sign.</p>`}
          <section class="checkin" aria-label="Last check-in">
            <h3>Last check-in</h3>
            ${sel.map((d) => `<div class="ck-row"><span class="ck-where"><b class="mono">${esc(loc(d))}</b><span class="note">${d.seenAt ? esc(EC.ago(d.seenAt)) : ""}</span></span>${EC.health(d)}</div>`).join("")}
            <p class="note" style="margin:0">From the display’s last Wi-Fi connection. Not live.</p>
          </section>
          ${lowBatt.length ? `<div class="hint-row as-note bad">${I.warn}<span>Battery was at ${lowBatt.map((d) => `<b>${d.battery}%</b> on <b>${esc(loc(d))}</b>`).join(", ")} at the last check-in. Swap it before you wake the display.</span></div>
          <button class="btn ghost" id="swap-now">Swap Battery</button>` : ""}
          ${waiting.length ? `<div class="hint-row as-note">${I.clock}<span>A sign is still waiting for a wake on <b>${waiting.map((d) => esc(loc(d))).join(", ")}</b>. A new push replaces it.</span></div>` : ""}
          ${unconf.length ? `<div class="hint-row as-note bad">${I.warn}<span>The last sign on <b>${unconf.map((d) => esc(loc(d))).join(", ")}</b> was not confirmed. Wake it to finish, or send a new sign.</span></div>` : ""}
          ${waiting.length || unconf.length ? `<button class="btn ghost" id="wake-only">Just wake ${waiting.length + unconf.length > 1 ? "them" : "it"}</button>` : ""}
          <p class="note" style="margin:0">Doesn’t match the screen in front of you? Wake the display. It takes the last sign sent.</p>`;
      }

      case "type": return `<div class="sign-list">${TYPES.map((t) => `<button class="sign-card" data-type-pick="${t.id}" aria-pressed="${f.type === t.id}" ${f.type && f.type !== t.id ? 'data-dim="1"' : ""}>${typeBand(t)}</button>`).join("")}</div>`;

      case "details": {
        const t = typeOf(), need = sizeNeeded();
        const from = selected()[0];
        return `
          ${t ? `<div class="sign-chip">${typeBand(t)}</div>` : ""}
          <div class="field"><label for="d-desc">Item description or produce PLU</label>
            <input class="input big" id="d-desc" value="${esc(f.desc)}" spellcheck="true" autocorrect="on" autocapitalize="words" autocomplete="off" />
            <span class="field-note" id="plu-note">${f.plu ? `PLU ${esc(f.plu)} · filled from ${esc(loc(from))}` : `Filled from ${esc(loc(from))}`}</span></div>
          <div class="field"><label for="d-price">New price</label>
            <input class="input big money" id="d-price" data-money="priceC" value="${esc(fmtMoney(f.priceC))}" inputmode="numeric" pattern="[0-9]*" placeholder="$0.00" autocomplete="off" />
            ${f.base && f.base.priceC ? `<span class="field-note">Was on the sign: ${esc(fmtMoney(f.base.priceC))}</span>` : ""}</div>
          <div class="two">
            <div class="field"><label for="d-uom">Unit of measure</label>
              <div class="select-wrap"><select class="input big" id="d-uom"><option value="">Choose</option>${UOM.map((u) => `<option ${f.uom === u ? "selected" : ""}>${u}</option>`).join("")}</select>${I.check}</div></div>
            <div class="field"><label for="d-size">Unit size</label>
              <input class="input big" id="d-size" inputmode="decimal" value="${need ? esc(f.size) : "—"}" ${need ? "" : "disabled"} placeholder="e.g. 12" autocomplete="off" /></div>
          </div>
          ${t && t.was ? `<div class="field"><label for="d-was">Was price</label>
            <input class="input big money" id="d-was" data-money="wasC" value="${esc(fmtMoney(f.wasC))}" inputmode="numeric" pattern="[0-9]*" placeholder="$0.00" autocomplete="off" />
            <span class="field-note" id="was-note">${f.wasC ? "Moved from the current price. Change it if needed." : ""}</span></div>` : ""}`;
      }

      case "preview": return `${pv.ready(previewKey()) ? eSign() + (navigator.onLine ? "" : `<div class="offline-note" role="status"><span>Offline. Push Content needs a connection.</span></div>`) : pv.html(previewKey(), selOrient() || "landscape")}<p class="note" style="margin:0">${f.sel.length > 1 ? `Sending to ${f.sel.length} displays.` : `Sending to ${esc(loc(selected()[0]))}.`}</p>`;

      case "wake": return `
        <div class="wake-post">
          <div class="carousel" id="track" tabindex="0" aria-roledescription="carousel" aria-label="Wake the display">${WAKE.map((w, i) => `<div class="slide" aria-label="Step ${i + 1} of ${WAKE.length}">${ECArt.wake(w.art)}</div>`).join("")}</div>
          <div class="dots" role="tablist" aria-label="Steps">${WAKE.map((w, i) => `<button class="dot" role="tab" data-i="${i}" aria-label="Step ${i + 1}: ${esc(w.title)}"></button>`).join("")}</div>
          <section class="caption" id="caption" aria-live="polite"></section>
        </div>
        <button class="hint-row" id="no-light">${I.warn}<span>No light? Check the battery</span>${I.next}</button>`;

      case "done": return `
        <div class="done-list" id="done-list"></div>
        <p class="note">Each display updates in 3–5 minutes. Status changes to Updated when it connects. If nothing connects within ${EC.NOT_CONFIRMED_MIN} minutes it shows Not confirmed.</p>
        <button class="btn" id="again">Update another</button>
        <button class="btn ghost" id="home">Home</button>`;
    }
    return "";
  }

  function paintDone() {
    const box = $("done-list"); if (!box) return;
    box.innerHTML = selected().map((d) => `
      <div class="device-card"><div class="head">
        <span><span class="mono" style="font-weight:700">${esc(loc(d))}</span><br><span class="note mono">${esc(d.serial)}</span></span>
        ${chip(d.status)}
      </div>${d.status === "unconfirmed" ? `<button class="btn ghost small" data-rewake="${d.serial}">Wake it again</button>` : ""}</div>`).join("");
    document.querySelectorAll("[data-rewake]").forEach((b) => b.onclick = () => { f.sel = [b.dataset.rewake]; f.wakeOnly = true; f.wakeIdx = 0; f.wakeSlide = 0; setStep("wake"); });
  }

  /* camera window at the very top, right under the phone's own camera */
  const scanBlock = () => `<div class="scan-top">
        <div class="scanner" id="scanner" data-state="idle">
          <button class="viewfinder" id="vf" aria-label="Start camera and scan a display"><span class="vf-frame"></span><span class="vf-hint">${I.scan.replace("<svg", '<svg style="width:28px;height:28px"')}Tap to scan again</span></button>
          <div class="cam"><video id="scan-video" playsinline muted></video><span class="vf-frame"></span><span class="scanline"></span><button class="cam-btn" id="cam-cancel" aria-label="Stop camera">${I.x}</button></div>
          <div class="cam-fail"><strong>Camera unavailable</strong><span class="note">Type the ID or pick from the list.</span><button class="btn ghost" id="cam-retry">Try again</button></div>
          <div class="cam-state" aria-live="polite"><i></i><span id="cam-msg"></span></div>
        </div>
      </div>`;

  /* ---------- render ---------- */
  let ticker = 0;
  function render() {
    scanner.release(); scanner.state = "idle";
    clearInterval(ticker);
    const i = STEPS.indexOf(f.step), total = STEPS.length - 1;
    const [title, sub] = COPY[f.step];
    $("app").innerHTML = `
      <main class="screen" style="--tint:var(--tint-content)">
        ${header({ home: true })}
        <div class="flow">
          ${f.step === "find" ? scanBlock() : ""}
          <div class="flow-top">
            <div class="flow-name"><span class="kicker">Update Content</span><span class="count">${f.step === "done" ? "Done" : `${i + 1} / ${total}`}</span></div>
            <div class="progress">${STEPS.slice(0, total).map((_, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}"></i>`).join("")}</div>
          </div>
          <div class="step" id="body">
            ${eyebrow()}
            <h2>${esc(title)}</h2>
            ${sub ? `<p class="note" style="margin:0;font-size:15px">${esc(sub)}</p>` : ""}
            ${body()}
          </div>
          ${f.step === "done" ? "" : `
          <nav class="flow-nav">
            <button class="btn ghost" id="back">${I.back.replace("<svg", '<svg style="width:18px;height:18px"')} Back</button>
            <button class="btn" id="next" ${valid() ? "" : "disabled"}>${esc(nextLabel())}</button>
          </nav>`}
        </div>
      </main>`;
    bindHeader();
    bind();
  }
  function refreshNext() { const b = $("next"); if (b) { b.disabled = !valid(); b.textContent = nextLabel(); } }

  function bindWake() {
    const track = $("track"); if (!track) return;
    const dots = [...document.querySelectorAll(".dot")];
    let idx = Math.min(f.wakeSlide || 0, WAKE.length - 1);
    const paint = () => {
      const w = WAKE[idx];
      dots.forEach((d, k) => d.setAttribute("aria-selected", String(k === idx)));
      $("caption").innerHTML = `<span class="step-no">Step ${idx + 1} of ${WAKE.length}</span><h2>${esc(w.title)}</h2><ul class="lines">${w.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>${idx === 0 ? `<p class="swipe-hint">Swipe the picture for the next step</p>` : ""}`;
      f.wakeSlide = idx; save();
    };
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const goTo = (k, smooth = true) => { idx = Math.max(0, Math.min(WAKE.length - 1, k)); track.scrollTo({ left: idx * track.clientWidth, behavior: smooth && !reduce ? "smooth" : "auto" }); paint(); };
    let ticking = false;
    track.addEventListener("scroll", () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { ticking = false; const k = Math.round(track.scrollLeft / track.clientWidth); if (k !== idx && k >= 0 && k < WAKE.length) { idx = k; paint(); } }); }, { passive: true });
    let drag = null;
    track.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") return; drag = { x: e.clientX, left: track.scrollLeft, from: idx }; track.classList.add("dragging"); track.setPointerCapture(e.pointerId); });
    track.addEventListener("pointermove", (e) => { if (drag) track.scrollLeft = drag.left - (e.clientX - drag.x); });
    const end = (e) => { if (!drag) return; const dx = e.clientX - drag.x, from = drag.from; track.classList.remove("dragging"); drag = null; goTo(Math.abs(dx) > track.clientWidth * 0.15 ? from + (dx < 0 ? 1 : -1) : from); };
    track.addEventListener("pointerup", end); track.addEventListener("pointercancel", end);
    dots.forEach((d) => d.addEventListener("click", () => goTo(+d.dataset.i)));
    paint(); requestAnimationFrame(() => goTo(idx, false));
  }

  function bind() {
    $("back")?.addEventListener("click", back);
    $("next")?.addEventListener("click", next);
    $("no-light")?.addEventListener("click", openBatteryGuide);
    $("swap-now")?.addEventListener("click", openBatteryGuide);

    if (f.step === "find") {
      scanner.paint("idle");
      $("vf").onclick = () => scanner.start();
      $("cam-retry").onclick = () => scanner.start();
      $("cam-cancel").onclick = () => scanner.stop();
      setTimeout(() => scanner.start(), 0); // the camera opens with the screen
      paintFind();
    }
    $("wake-only")?.addEventListener("click", () => {
      f.sel = selected().filter((d) => d.status !== "updated").map((d) => d.serial);
      f.wakeOnly = true; f.wakeIdx = 0; f.wakeSlide = 0; setStep("wake");
    });

    document.querySelectorAll("[data-type-pick]").forEach((b) => b.addEventListener("click", () => { applyType(b.dataset.typePick); save(); render(); }));

    const desc = $("d-desc");
    if (desc) desc.addEventListener("input", () => {
      const raw = desc.value.trim();
      const hit = /^\d{4,5}$/.test(raw) ? pluLookup(raw) : null;
      const note = $("plu-note");
      if (hit) { f.plu = raw; f.desc = hit.name; f.img = hit.img || ""; desc.value = hit.name; if (hit.uom) { f.uom = hit.uom; $("d-uom").value = hit.uom; applyUom(); } note.textContent = `PLU ${raw} · edit the name if needed`; note.classList.remove("warn"); }
      else if (/^\d{4}$/.test(raw) && RETAILER.has(raw)) { f.desc = ""; f.plu = raw; f.img = ""; note.textContent = `PLU ${raw} is retailer-assigned. Type the item name.`; note.classList.remove("warn"); }
      else if (/^\d{4}$/.test(raw) && !raw.startsWith("9")) { f.desc = ""; f.plu = ""; f.img = ""; note.textContent = "PLU not found. Type the item name."; note.classList.add("warn"); }
      else { f.desc = desc.value; if (/^\d*$/.test(raw)) { f.plu = ""; f.img = ""; } }
      save(); refreshNext();
    });
    function applyUom() {
      const sz = $("d-size"); if (!sz) return;
      if (sizeNeeded()) { sz.disabled = false; if (sz.value === "—") sz.value = f.size; } else { sz.disabled = true; sz.value = "—"; f.size = ""; }
    }
    $("d-uom")?.addEventListener("change", (e) => { f.uom = e.target.value; applyUom(); save(); refreshNext(); });
    $("d-size")?.addEventListener("input", (e) => { f.size = e.target.value; save(); refreshNext(); });
    document.querySelectorAll("[data-money]").forEach((inp) => inp.addEventListener("input", () => {
      const c = normCents(inp.value); f[inp.dataset.money] = c; inp.value = fmtMoney(c);
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch { /* not supported */ }
      const n = $("was-note");
      if (n) { const p = centsToNum(f.priceC), w = centsToNum(f.wasC); n.textContent = p !== null && w !== null && w <= p ? "Was price is not higher than the price. Check both." : n.textContent.startsWith("Was price is not") ? "" : n.textContent; n.classList.toggle("warn", p !== null && w !== null && w <= p); }
      save(); refreshNext();
    }));

    if (f.step === "preview") { const key = previewKey(); pv.ensure(key); $("pv-retry")?.addEventListener("click", () => pv.retry(key)); }

    bindWake();

    if (f.step === "done") { paintDone(); ticker = setInterval(paintDone, 5000); }
    $("again")?.addEventListener("click", () => { f = state.flows.content = fresh(); save(); render(); });
    $("home")?.addEventListener("click", () => { delete state.flows.content; go("home"); });
  }

  render();
})();
