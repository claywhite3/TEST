/* install.html — Install a new display (or several with the same sign).
   Battery → Scan → Location (per display) → Price type → Details → Preview + Push Content → Wake → Sent.
   Site comes from the session; it is never asked again here. State lives in state.flows.install so a
   detour to the battery guide (battery.html) comes back to the same step. */
(function () {
  "use strict";
  const { state, save, site, go, guard, esc, I, header, bindHeader, haptic, DEVICES, SERIAL_LEN } = EC;
  if (!guard()) return;

  const FLOW_V = 4; // bump when the saved shape changes; older in-progress installs restart

  /* ---------- sign headers (colors sampled from the store sign files) ---------- */
  const SPARK = '<svg class="spark" viewBox="-16 -16 32 32" aria-hidden="true"><g fill="currentColor">' +
    [0, 60, 120, 180, 240, 300].map((r) => `<rect x="-2.1" y="-15" width="4.2" height="10" rx="2.1" transform="rotate(${r})"/>`).join("") + "</g></svg>";
  const TYPES = [
    { id: "edlp", label: "Everyday Low Price", was: false, mark: SPARK },
    { id: "rollback", label: "Rollback", was: true, mark: SPARK },
    { id: "clearance", label: "Clearance", was: true, mark: SPARK },
    { id: "manager", label: "Manager’s Special", was: true, mark: "" },
  ];
  const UOM = ["ea", "lb", "ct", "oz", "fl oz", "gal", "pk"];
  const NO_SIZE = ["ea", "lb"]; // priced per item or per pound: no unit size

  /* produce PLUs: js/plu.js, generated from the IFPS export (leading 9 = organic) */
  const PLU = Object.fromEntries((window.ECPLU || []).map(([plu, name, size, uom, img]) => [plu, { plu, name, size, uom, img }]));
  const RETAILER = new Set(window.ECPLU_RETAILER || []);
  const pluLookup = (code) => {
    if (/^\d{4}$/.test(code) && PLU[code]) return PLU[code];
    if (/^9\d{4}$/.test(code) && PLU[code.slice(1)]) { const p = PLU[code.slice(1)]; return Object.assign({}, p, { name: "Organic " + p.name }); }
    return null;
  };

  const STEPS = ["battery", "orient", "scan", "location", "type", "details", "preview", "wake", "done"];
  const COPY = {
    battery: ["Is the battery in?", "Displays ship without the battery installed."],
    orient: ["Which way does the display hang?", "Pick this before you scan."],
    scan: ["Scan the display", "Scan the barcode on the bezel."],
    location: ["Where is this display?", "Type the location as it’s labeled in the store."],
    type: ["Which sign is this?", ""],
    details: ["Enter the sign details", ""],
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

  const fresh = () => ({
    v: FLOW_V, step: "battery", orient: "landscape", multi: false, devices: [], locIdx: 0, wakeIdx: 0, wakeSlide: 0,
    type: null, desc: "", plu: "", img: "", priceC: "", size: "", uom: "", wasC: "", lastZone: "", lastAisle: "", reject: null,
  });
  let f = state.flows.install;
  if (!f || f.v !== FLOW_V) f = fresh();
  f = state.flows.install = Object.assign(fresh(), f);
  if (!STEPS.includes(f.step)) f.step = "battery";

  const s = site();
  const $ = (id) => document.getElementById(id);

  /* ---------- formatting ---------- */
  // Location: Zone 1–2 letters (caps), Aisle and Section 1–3 digits. Shown as A15-1.
  const normZone = (v) => String(v).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  const normNum = (v) => String(v).replace(/\D/g, "").slice(0, 3);
  const locOk = (d) => /^[A-Z]{1,2}$/.test(d.zone) && /^\d{1,3}$/.test(d.aisle) && /^\d{1,3}$/.test(d.section);
  const loc = (d) => (d.zone || d.aisle || d.section ? `${d.zone || "?"}${d.aisle || "?"}-${d.section || "?"}` : "No location");

  // Price: the tech types digits only; decimals are assumed. 597 → $5.97
  const normCents = (v) => String(v).replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 6);
  const centsToNum = (c) => (c ? Number(c) / 100 : null);
  const fmtMoney = (c) => {
    if (!c) return "";
    const p = c.padStart(3, "0");
    return `$${Number(p.slice(0, -2)).toLocaleString("en-US")}.${p.slice(-2)}`;
  };
  // sign price parts: $ · dollars · cents (or ¢ for under a dollar)
  const priceParts = (c) => {
    const n = centsToNum(c);
    if (n === null) return { cur: "$", dol: "0", cents: "00" };
    if (n < 1) return { cur: "", dol: String(Math.round(n * 100)), cents: "¢" };
    const p = c.padStart(3, "0");
    return { cur: "$", dol: String(Number(p.slice(0, -2))), cents: p.slice(-2) };
  };

  const typeOf = () => TYPES.find((t) => t.id === f.type);
  const ORIENT = { landscape: "Landscape", portrait: "Portrait" };
  const orientName = () => ORIENT[f.orient] || "Landscape";
  const sizeNeeded = () => !NO_SIZE.includes(f.uom);

  /* ---------- validity drives the Next button ---------- */
  function valid() {
    const d = f.devices[f.locIdx];
    switch (f.step) {
      case "scan": return f.devices.length > 0;
      case "location": return !!(d && locOk(d));
      case "type": return !!f.type;
      case "details": {
        const t = typeOf();
        return !!(f.desc.trim() && f.priceC && f.uom && (!sizeNeeded() || f.size.trim()) && (!t || !t.was || f.wasC));
      }
      default: return true;
    }
  }
  const nextLabel = () => ({
    battery: "Battery is in",
    location: f.locIdx < f.devices.length - 1 ? "Next display" : "Continue",
    details: "Preview sign",
    preview: "Push Content",
    wake: f.wakeIdx < f.devices.length - 1 ? "Next display" : "Done",
  }[f.step] || "Continue");

  function setStep(st) { scanner.stop(); f.step = st; f.reject = null; save(); render(); $("body").scrollTop = 0; }

  function next() {
    if (!valid()) return;
    const n = f.devices.length;
    if (f.step === "location" && f.locIdx < n - 1) {
      // Zone and Aisle carry forward to the next display; Section is always fresh
      const prev = f.devices[f.locIdx], nx = f.devices[f.locIdx + 1];
      if (!nx.zone) nx.zone = prev.zone;
      if (!nx.aisle) nx.aisle = prev.aisle;
      f.locIdx++; save(); render(); return;
    }
    if (f.step === "preview") {
      // the push: installed displays join the site's fleet, so Update Content can find them
      const meta = {};
      f.devices.forEach((d) => { meta[d.serial] = { zone: d.zone, aisle: d.aisle, section: d.section, orient: f.orient, siteId: s.id }; });
      EC.recordPush(f.devices.map((d) => d.serial), signOpts(), meta);
      haptic(); f.wakeIdx = 0; f.wakeSlide = 0; return setStep("wake");
    }
    if (f.step === "wake") EC.markWoken(f.devices[f.wakeIdx].serial);
    if (f.step === "wake" && f.wakeIdx < n - 1) { f.wakeIdx++; f.wakeSlide = 0; save(); render(); return; }
    if (f.step === "wake") { const last = f.devices[n - 1] || {}; f.lastZone = last.zone || ""; f.lastAisle = last.aisle || ""; }
    if (f.step === "scan") f.locIdx = 0;
    setStep(STEPS[STEPS.indexOf(f.step) + 1]);
  }
  function back() {
    if (f.step === "battery") { go("home"); return; }
    if (f.step === "location" && f.locIdx > 0) { f.locIdx--; save(); render(); return; }
    if (f.step === "wake" && f.wakeIdx > 0) { f.wakeIdx--; f.wakeSlide = 0; save(); render(); return; }
    if (f.step === "type") f.locIdx = Math.max(0, f.devices.length - 1);
    setStep(STEPS[STEPS.indexOf(f.step) - 1]);
  }
  function openBatteryGuide() {
    scanner.stop();
    state.flows.battery = { step: 0, returnTo: "install" };
    go("battery");
  }

  /* ---------- serial intake: one formatter owns the field (principles 16–19) ---------- */
  const norm = (v) => String(v).toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, SERIAL_LEN);
  const isSerialShape = (v) => new RegExp(`^[0-9A-Z]{${SERIAL_LEN}}$`).test(v);

  /* Adds a serial. Multi: the list grows and a fresh blank slot appears; the camera keeps running.
     Single: one slot; a valid read stops the camera. Repaints only the slot list so a live camera survives. */
  function addSerial(serial) {
    serial = norm(serial);
    if (serial.length !== SERIAL_LEN) return false;
    const known = DEVICES.find((d) => d.serial === serial);
    if (known && known.siteId !== s.id) {
      const other = EC.site(known.siteId);
      f.reject = { serial, why: `Registered to ${other ? other.name : "another site"}.` };
    } else if (serial.endsWith("9999")) {
      f.reject = { serial, why: "Not registered. This display can’t take content yet." };
    } else if (f.devices.some((d) => d.serial === serial)) {
      f.reject = null; save(); paintSlots(); return false; // already in the list: quiet
    } else {
      f.reject = null;
      const prev = f.devices[f.devices.length - 1];
      const dev = { serial, zone: prev ? prev.zone : f.lastZone, aisle: prev ? prev.aisle : f.lastAisle, section: "" };
      f.devices = f.multi ? f.devices.concat([dev]) : [dev];
      haptic(40);
      save(); paintSlots();
      return true;
    }
    save(); paintSlots();
    return false;
  }

  /* ---------- real camera scanner ----------
     BarcodeDetector where the browser has it (Chrome/Android), ZXing from the CDN otherwise (iOS Safari).
     Tap = start (principle 6). Single: valid code → stop, haptic, fill (11). Multi: fill and keep scanning.
     Wrong shape → shake, keep scanning (10). Camera released on every exit (12, 13). */
  const ZXING_URL = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js";
  const scanner = {
    state: "idle", stream: null, raf: 0, zx: null, lastShake: 0, last: { v: "", t: 0 }, torch: false,
    async start() {
      if (this.state === "starting" || this.state === "running") return;
      this.paint("starting");
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("no-camera-api");
        const video = $("scan-video");
        if ("BarcodeDetector" in window) {
          const det = new window.BarcodeDetector({ formats: ["code_128", "code_39", "qr_code", "data_matrix", "ean_13"] });
          this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          if (this.state !== "starting") { this.release(); return; } // cancelled while the permission prompt was up
          video.srcObject = this.stream;
          await video.play();
          this.paint("running");
          const tick = async () => {
            if (this.state !== "running") return;
            try {
              const codes = await det.detect(video);
              for (const c of codes) if (this.handle(c.rawValue)) return;
            } catch { /* frame not ready */ }
            this.raf = requestAnimationFrame(tick);
          };
          tick();
        } else {
          if (!window.ZXing) await new Promise((ok, bad) => {
            const sc = document.createElement("script"); sc.src = ZXING_URL; sc.onload = ok; sc.onerror = () => bad(new Error("zxing-load"));
            document.head.appendChild(sc);
          });
          if (this.state !== "starting") return;
          this.zx = new window.ZXing.BrowserMultiFormatReader();
          await this.zx.decodeFromConstraints({ video: { facingMode: "environment" }, audio: false }, video, (res) => {
            if (res && this.state === "running") this.handle(res.getText());
          });
          this.stream = video.srcObject;
          if (this.state !== "starting") { this.release(); return; }
          this.paint("running");
        }
        this.offerTorch();
      } catch (e) {
        this.release();
        this.paint("failed", e && e.name === "NotAllowedError" ? "Camera permission was declined." : "The camera couldn’t start here.");
      }
    },
    /* returns true when the scan loop should stop */
    handle(raw) {
      const v = norm(raw);
      const now = Date.now();
      if (isSerialShape(v)) {
        if (v === this.last.v && now - this.last.t < 2500) return false; // same code still in view
        this.last = { v, t: now };
        if (f.multi) { addSerial(v); flash(); return false; }
        this.stop(); addSerial(v); return true;
      }
      if (now - this.lastShake > 900) { // wrong code (UPC, pallet label): shake, keep going
        this.lastShake = now;
        const fr = document.querySelector(".scanner .cam .vf-frame");
        if (fr) { fr.classList.remove("shake"); void fr.offsetWidth; fr.classList.add("shake"); }
      }
      return false;
    },
    offerTorch() {
      const track = this.stream && this.stream.getVideoTracks && this.stream.getVideoTracks()[0];
      const caps = track && track.getCapabilities ? track.getCapabilities() : {};
      const b = $("torch");
      if (b && caps.torch) {
        b.hidden = false;
        b.onclick = async () => {
          this.torch = !this.torch;
          try { await track.applyConstraints({ advanced: [{ torch: this.torch }] }); } catch { /* ignore */ }
          b.setAttribute("aria-pressed", String(this.torch));
        };
      }
    },
    release() {
      cancelAnimationFrame(this.raf);
      try { this.zx && this.zx.reset(); } catch { /* ignore */ }
      this.zx = null;
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      const v = $("scan-video");
      if (v) v.srcObject = null;
      this.torch = false;
    },
    stop() { if (this.state === "idle") return; this.release(); this.paint("idle"); },
    paint(st, msg) {
      this.state = st;
      const el = $("scanner");
      if (!el) return;
      el.dataset.state = st;
      $("cam-msg").textContent = {
        idle: "", starting: "Starting camera…",
        running: f.multi ? "Scan each display. Tap × when done." : "Aim at the barcode on the bezel",
        failed: msg || "",
      }[st];
    },
  };
  function flash() {
    const c = document.querySelector(".scanner .cam");
    if (c) { c.classList.remove("got"); void c.offsetWidth; c.classList.add("got"); }
  }
  addEventListener("visibilitychange", () => { if (document.hidden) scanner.stop(); });
  addEventListener("pagehide", () => scanner.release());

  /* ---------- pieces ---------- */
  const typeBand = (t) => `
    <span class="sign-band" data-type="${t.id}">
      ${t.mark}<span class="sign-label">${esc(t.label)}</span>
      ${t.was ? `<span class="sign-was">Was:<b>$—</b></span>` : ""}
    </span>`;

  /* the sign as the display shows it — drawn on the real 2560×1440 / 1440×2560 canvas by js/sign.js */
  const signOpts = () => ({ orient: f.orient, type: f.type || "edlp", priceC: f.priceC, wasC: f.wasC, uom: f.uom,
    size: sizeNeeded() ? f.size : "", desc: f.desc, plu: f.plu, img: f.img });
  const eSign = () => `<div class="esign" data-o="${f.orient}" id="esign">${ECSign.render(signOpts())}</div>`;
  // re-measure once web fonts are in, so text widths match what renders
  ECSign.ready.then(() => { const el = $("esign"); if (el) el.innerHTML = ECSign.render(signOpts()); });

  function eyebrow() {
    const n = f.devices.length;
    const tag = (d) => `<span class="id-tag mono">${esc(d.serial)}</span>`;
    if (f.step === "location") {
      const d = f.devices[f.locIdx];
      return d ? `<div class="eyebrow-row">${tag(d)}${n > 1 ? `<span>Display ${f.locIdx + 1} of ${n}</span>` : ""}</div>` : "";
    }
    if (["type", "details", "preview"].includes(f.step)) {
      if (n > 1) return `<div class="eyebrow-row"><span class="id-tag">${n} displays</span><span>Same sign · ${orientName()}</span></div>`;
      const d = f.devices[0];
      return d ? `<div class="eyebrow-row">${tag(d)}<span>${esc(loc(d))} · ${orientName()}</span></div>` : "";
    }
    if (f.step === "wake") {
      const d = f.devices[f.wakeIdx];
      return d ? `<div class="eyebrow-row">${tag(d)}<span>${esc(loc(d))}${n > 1 ? ` · ${f.wakeIdx + 1} of ${n}` : ""}</span></div>` : "";
    }
    return "";
  }

  /* scan slots: filled rows + one blank row to type into (multi always has a next blank) */
  function slotsHtml() {
    const rows = f.devices.map((d, i) => `
      <div class="slot filled"><span class="slot-n">${i + 1}</span><span class="mono slot-id">${esc(d.serial)}</span>
        <button class="icon-btn plain" data-rm="${i}" aria-label="Remove ${esc(d.serial)}">${I.x}</button></div>`).join("");
    const blank = f.multi || f.devices.length === 0 ? `
      <div class="slot blank"><span class="slot-n">${f.devices.length + 1}</span>
        <div class="serial-field"><input class="input" id="serial" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Display ID" placeholder="Scan or type ID" /><span class="len" id="len">0/${SERIAL_LEN}</span></div></div>` : "";
    return rows + blank;
  }
  function paintSlots() {
    const box = $("slots");
    if (!box) return;
    const typing = document.activeElement && document.activeElement.id === "serial";
    box.innerHTML = slotsHtml();
    $("slots-label").textContent = f.multi ? `${f.devices.length} scanned` : "Display";
    $("scan-reject").innerHTML = f.reject ? `<div class="result bad" role="alert"><strong class="mono">${esc(f.reject.serial)}</strong><p>${esc(f.reject.why)}</p></div>` : "";
    bindSlots();
    if (typing && $("serial")) $("serial").focus();
    refreshNext();
  }
  function bindSlots() {
    const serial = $("serial");
    if (serial) {
      serial.addEventListener("focus", () => scanner.stop()); // never keyboard over a live camera
      serial.addEventListener("input", () => {
        const v = norm(serial.value);
        serial.value = v;
        $("len").textContent = `${v.length}/${SERIAL_LEN}`;
        if (v.length === SERIAL_LEN) addSerial(v); // quiet until complete
      });
    }
    document.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
      f.devices.splice(+b.dataset.rm, 1); f.reject = null; save(); paintSlots();
    }));
  }

  function body() {
    switch (f.step) {
      case "battery": return `
        <div class="stage" style="background:var(--card-install)">${ECArt.rear({ cover: "set-aside", screw: "none", plug: "apart", kind: "new", focus: "plug" })}</div>
        <button class="btn ghost" id="guide">Show me how</button>`;

      case "orient": return `
        <div class="orient-list" role="radiogroup" aria-label="Display orientation">
          ${["landscape", "portrait"].map((o) => `
          <button class="orient-card" role="radio" data-orient="${o}" aria-checked="${f.orient === o}">
            <span class="orient-art" aria-hidden="true">${o === "landscape"
              ? '<svg viewBox="0 0 120 80"><rect x="6" y="12" width="108" height="61" rx="3" fill="var(--hw-frame)"/><rect x="10" y="16" width="100" height="14" fill="#1358a8"/><rect x="10" y="30" width="100" height="39" fill="#000"/><text x="18" y="62" font-family="Helvetica Neue, Helvetica, Arial" font-weight="700" font-size="30" fill="#fff">$5</text></svg>'
              : '<svg viewBox="0 0 120 80"><rect x="41" y="2" width="38" height="76" rx="3" fill="var(--hw-frame)"/><rect x="44" y="5" width="32" height="10" fill="#1358a8"/><rect x="44" y="15" width="32" height="60" fill="#000"/><text x="47" y="40" font-family="Helvetica Neue, Helvetica, Arial" font-weight="700" font-size="20" fill="#fff">$5</text></svg>'}</span>
            <span class="orient-name">${ORIENT[o]}</span>
            <span class="orient-sub">${o === "landscape" ? "Wider than tall" : "Taller than wide"}</span>
          </button>`).join("")}
        </div>
        <div class="brief" role="note">
          <h3>Doing more than one display?</h3>
          <p class="note" style="margin:0">Every display in this install must hang the same way. Do landscape and portrait displays as separate installs.</p>
        </div>`;

      case "scan": return `
        ${f.multi ? `<div class="orient-pin">${I.warn}<span>Only <b>${orientName().toLowerCase()}</b> displays in this batch.</span></div>` : ""}
        <button class="switch-row" id="multi" aria-pressed="${f.multi}">
          <span>Same content on multiple displays</span><span class="switch" aria-hidden="true"><i></i></span>
        </button>
        <div class="scanner" id="scanner" data-state="idle">
          <button class="viewfinder" id="vf" aria-label="Start camera and scan the bezel barcode">
            <span class="vf-frame"></span>
            <span class="vf-hint">${I.scan.replace("<svg", '<svg style="width:28px;height:28px"')}Tap to scan</span>
          </button>
          <div class="cam">
            <video id="scan-video" playsinline muted></video>
            <span class="vf-frame"></span><span class="scanline"></span>
            <button class="cam-btn" id="cam-cancel" aria-label="Stop camera">${I.x}</button>
            <button class="cam-btn torch" id="torch" aria-label="Flashlight" aria-pressed="false" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 3h8l-2 6h-4z"/><path d="M10 9v11h4V9"/></svg></button>
          </div>
          <div class="cam-fail">
            <strong>Camera unavailable</strong>
            <span class="note">Type the ID in the list, or try again.</span>
            <button class="btn ghost" id="cam-retry">Try again</button>
          </div>
          <div class="cam-state" aria-live="polite"><i></i><span id="cam-msg"></span></div>
        </div>
        <div id="scan-reject"></div>
        <div class="slots">
          <span class="section-label" id="slots-label" style="font-size:15px;margin:0"></span>
          <div id="slots"></div>
        </div>`;

      case "location": {
        const d = f.devices[f.locIdx];
        const n = f.devices.length;
        return `
          ${n > 1 ? `<div class="progress">${f.devices.map((_, i) => `<i class="${i < f.locIdx ? "done" : i === f.locIdx ? "now" : ""}"></i>`).join("")}</div>` : ""}
          <div class="field"><label for="loc-zone">Zone <span class="hint">1–2 letters</span></label>
            <input class="input big" id="loc-zone" data-loc="zone" value="${esc(d.zone)}" maxlength="2" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" /></div>
          <div class="field"><label for="loc-aisle">Aisle <span class="hint">up to 3 digits</span></label>
            <input class="input big" id="loc-aisle" data-loc="aisle" value="${esc(d.aisle)}" maxlength="3" autocomplete="off" inputmode="numeric" pattern="[0-9]*" /></div>
          <div class="field"><label for="loc-section">Section <span class="hint">up to 3 digits</span></label>
            <input class="input big" id="loc-section" data-loc="section" value="${esc(d.section)}" maxlength="3" autocomplete="off" inputmode="numeric" pattern="[0-9]*" /></div>
          <div class="loc-code"><span class="note">Location</span><b class="mono" id="loc-code">${esc(loc(d))}</b></div>`;
      }

      case "type": return `<div class="sign-list">${TYPES.map((t) => `
        <button class="sign-card" data-type-pick="${t.id}" aria-pressed="${f.type === t.id}" ${f.type && f.type !== t.id ? 'data-dim="1"' : ""}>${typeBand(t)}</button>`).join("")}</div>`;

      case "details": {
        const t = typeOf();
        const need = sizeNeeded();
        return `
          ${t ? `<div class="sign-chip">${typeBand(t)}</div>` : ""}
          <div class="field"><label for="d-desc">Item description or produce PLU</label>
            <input class="input big" id="d-desc" value="${esc(f.desc)}" placeholder="e.g. Navel Oranges or 4013" spellcheck="true" autocorrect="on" autocapitalize="words" autocomplete="off" />
            <span class="field-note" id="plu-note">${f.plu ? `PLU ${esc(f.plu)} · edit the name if needed` : ""}</span></div>
          <div class="field"><label for="d-price">Price</label>
            <input class="input big money" id="d-price" data-money="priceC" value="${esc(fmtMoney(f.priceC))}" inputmode="numeric" pattern="[0-9]*" placeholder="$0.00" autocomplete="off" /></div>
          <div class="two">
            <div class="field"><label for="d-uom">Unit of measure</label>
              <div class="select-wrap"><select class="input big" id="d-uom">
                <option value="">Choose</option>${UOM.map((u) => `<option ${f.uom === u ? "selected" : ""}>${u}</option>`).join("")}
              </select>${I.check}</div></div>
            <div class="field"><label for="d-size">Unit size</label>
              <input class="input big" id="d-size" inputmode="decimal" value="${need ? esc(f.size) : "—"}" ${need ? "" : "disabled"} placeholder="e.g. 12" autocomplete="off" /></div>
          </div>
          ${t && t.was ? `<div class="field"><label for="d-was">Was price</label>
            <input class="input big money" id="d-was" data-money="wasC" value="${esc(fmtMoney(f.wasC))}" inputmode="numeric" pattern="[0-9]*" placeholder="$0.00" autocomplete="off" />
            <span class="field-note warn" id="was-note"></span></div>` : ""}`;
      }

      case "preview": {
        const n = f.devices.length;
        return `
          ${eSign()}
          <p class="note" style="margin:0">${n > 1 ? `Sending to ${n} displays.` : `Sending to ${esc(f.devices[0] ? f.devices[0].serial : "")}.`}</p>`;
      }

      case "wake": return `
        <div class="wake-post">
          <div class="carousel" id="track" tabindex="0" aria-roledescription="carousel" aria-label="Wake the display">
            ${WAKE.map((w, i) => `<div class="slide" aria-label="Step ${i + 1} of ${WAKE.length}">${ECArt.wake(w.art)}</div>`).join("")}
          </div>
          <div class="dots" role="tablist" aria-label="Steps">
            ${WAKE.map((w, i) => `<button class="dot" role="tab" data-i="${i}" aria-label="Step ${i + 1}: ${esc(w.title)}"></button>`).join("")}
          </div>
          <section class="caption" id="caption" aria-live="polite"></section>
        </div>
        <button class="hint-row" id="no-light">${I.warn}<span>No light? Check the battery</span>${I.next}</button>`;

      case "done": return `
        <div class="done-list">${f.devices.map((d) => `
          <div class="device-card"><div class="head">
            <span><span class="mono" style="font-weight:700">${esc(d.serial)}</span><br><span class="note">${esc(loc(d))}</span></span>
            <span class="status pending">${I.clock}Updating</span>
          </div></div>`).join("")}</div>
        <p class="note">Each display updates in 3–5 minutes.</p>
        <button class="btn" id="again">Install next display</button>
        <button class="btn ghost" id="home">Home</button>`;
    }
    return "";
  }

  /* ---------- render ---------- */
  const app = $("app");
  function render() {
    scanner.release(); scanner.state = "idle";
    const i = STEPS.indexOf(f.step);
    const total = STEPS.length - 1;
    const [title, sub] = COPY[f.step];
    const subText = f.step === "scan" && f.multi ? `Scan every ${orientName().toLowerCase()} display that gets the same sign.` : sub;
    app.innerHTML = `
      <main class="screen" style="--tint:var(--tint-install)">
        ${header({ home: true })}
        <div class="flow">
          <div class="flow-top">
            <div class="flow-name"><span class="kicker">Install</span><span class="count">${f.step === "done" ? "Done" : `${i + 1} / ${total}`}</span></div>
            <div class="progress">${STEPS.slice(0, total).map((_, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}"></i>`).join("")}</div>
          </div>
          <div class="step" id="body">
            ${eyebrow()}
            <h2>${esc(title)}</h2>
            ${subText ? `<p class="note" style="margin:0;font-size:15px">${esc(subText)}</p>` : ""}
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

  /* wake carousel: swipe the picture, dots under it, caption follows (same pattern as Swap Battery) */
  function bindWake() {
    const track = $("track");
    if (!track) return;
    const dots = [...document.querySelectorAll(".dot")];
    let idx = Math.min(f.wakeSlide || 0, WAKE.length - 1);
    const paint = () => {
      const w = WAKE[idx];
      dots.forEach((d, k) => d.setAttribute("aria-selected", String(k === idx)));
      $("caption").innerHTML = `<span class="step-no">Step ${idx + 1} of ${WAKE.length}</span><h2>${esc(w.title)}</h2>
        <ul class="lines">${w.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
        ${idx === 0 ? `<p class="swipe-hint">Swipe the picture for the next step</p>` : ""}`;
      f.wakeSlide = idx; save();
    };
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const goTo = (k, smooth = true) => {
      idx = Math.max(0, Math.min(WAKE.length - 1, k));
      track.scrollTo({ left: idx * track.clientWidth, behavior: smooth && !reduce ? "smooth" : "auto" });
      paint();
    };
    let ticking = false;
    track.addEventListener("scroll", () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const k = Math.round(track.scrollLeft / track.clientWidth);
        if (k !== idx && k >= 0 && k < WAKE.length) { idx = k; paint(); }
      });
    }, { passive: true });
    let drag = null;
    track.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") return;
      drag = { x: e.clientX, left: track.scrollLeft, from: idx }; track.classList.add("dragging"); track.setPointerCapture(e.pointerId);
    });
    track.addEventListener("pointermove", (e) => { if (drag) track.scrollLeft = drag.left - (e.clientX - drag.x); });
    const end = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, from = drag.from; track.classList.remove("dragging"); drag = null;
      goTo(Math.abs(dx) > track.clientWidth * 0.15 ? from + (dx < 0 ? 1 : -1) : from);
    };
    track.addEventListener("pointerup", end); track.addEventListener("pointercancel", end);
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(idx + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(idx - 1); }
    });
    dots.forEach((d) => d.addEventListener("click", () => goTo(+d.dataset.i)));
    paint();
    requestAnimationFrame(() => goTo(idx, false));
  }

  function checkWas() {
    const n = $("was-note");
    if (!n) return;
    const p = centsToNum(f.priceC), w = centsToNum(f.wasC);
    n.textContent = p !== null && w !== null && w <= p ? "Was price is not higher than the price. Check both." : "";
  }

  function bind() {
    $("back")?.addEventListener("click", back);
    $("next")?.addEventListener("click", next);
    $("guide")?.addEventListener("click", openBatteryGuide);
    $("no-light")?.addEventListener("click", openBatteryGuide);

    // scanner + slots
    if ($("scanner")) { scanner.paint("idle"); paintSlots(); }
    $("vf")?.addEventListener("click", () => scanner.start());
    $("cam-retry")?.addEventListener("click", () => scanner.start());
    $("cam-cancel")?.addEventListener("click", () => scanner.stop());
    $("multi")?.addEventListener("click", () => {
      f.multi = !f.multi;
      if (!f.multi) f.devices = f.devices.slice(0, 1);
      f.reject = null; save(); render();
    });

    // orientation (default landscape); multi-display batches all share it
    document.querySelectorAll("[data-orient]").forEach((b) => b.addEventListener("click", () => {
      f.orient = b.dataset.orient; save(); render();
    }));

    // location: Zone letters only (caps), Aisle/Section digits only
    document.querySelectorAll("[data-loc]").forEach((inp) => inp.addEventListener("input", () => {
      const k = inp.dataset.loc;
      const v = k === "zone" ? normZone(inp.value) : normNum(inp.value);
      if (inp.value !== v) inp.value = v;
      f.devices[f.locIdx][k] = v; save();
      $("loc-code").textContent = loc(f.devices[f.locIdx]);
      refreshNext();
    }));

    // price type
    document.querySelectorAll("[data-type-pick]").forEach((b) => b.addEventListener("click", () => {
      f.type = b.dataset.typePick; save(); render();
    }));

    // description: spell check on (the tech can ignore it); a produce PLU fills the name, unit and picture
    const desc = $("d-desc");
    if (desc) desc.addEventListener("input", () => {
      const raw = desc.value.trim();
      const hit = /^\d{4,5}$/.test(raw) ? pluLookup(raw) : null;
      const note = $("plu-note");
      if (hit) {
        f.plu = raw; f.desc = hit.name; f.img = hit.img || ""; desc.value = hit.name;
        if (!f.uom && hit.uom) { f.uom = hit.uom; $("d-uom").value = hit.uom; applyUom(); }
        note.textContent = `PLU ${raw} · edit the name if needed`; note.classList.remove("warn");
      } else if (/^\d{4}$/.test(raw) && RETAILER.has(raw)) {
        f.desc = ""; f.plu = raw; f.img = "";
        note.textContent = `PLU ${raw} is retailer-assigned. Type the item name.`; note.classList.remove("warn");
      } else if (/^\d{4}$/.test(raw) && !raw.startsWith("9")) {
        f.desc = ""; f.plu = ""; f.img = "";
        note.textContent = "PLU not found. Type the item name."; note.classList.add("warn");
      } else {
        f.desc = desc.value;
        if (/^\d*$/.test(raw)) { f.plu = ""; f.img = ""; note.textContent = ""; }
      }
      save(); refreshNext();
    });

    // unit of measure first; per-item and per-pound need no unit size
    function applyUom() {
      const sz = $("d-size");
      if (!sz) return;
      if (sizeNeeded()) { sz.disabled = false; if (sz.value === "—") sz.value = f.size; }
      else { sz.disabled = true; sz.value = "—"; f.size = ""; }
    }
    $("d-uom")?.addEventListener("change", (e) => { f.uom = e.target.value; applyUom(); save(); refreshNext(); });
    $("d-size")?.addEventListener("input", (e) => { f.size = e.target.value; save(); refreshNext(); });

    // money: digits in, decimals assumed (597 → $5.97)
    document.querySelectorAll("[data-money]").forEach((inp) => inp.addEventListener("input", () => {
      const c = normCents(inp.value);
      f[inp.dataset.money] = c;
      inp.value = fmtMoney(c);
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch { /* not supported */ }
      save(); checkWas(); refreshNext();
    }));
    checkWas();

    bindWake();

    $("again")?.addEventListener("click", () => {
      const keep = { lastZone: f.lastZone, lastAisle: f.lastAisle, orient: f.orient };
      f = state.flows.install = Object.assign(fresh(), keep, { step: "scan" });
      save(); render();
    });
    $("home")?.addEventListener("click", () => { delete state.flows.install; go("home"); });
  }

  render();
})();
