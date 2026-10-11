/* Pick one installed display: camera at the very top (opens with the screen), type the ID, or tap it in the list.
   Shared by Replace / Remove and Maintenance › Help with this one. Same scanner rules as Install and Update Content:
   wrong-shape codes shake and scanning continues; a good read vibrates and picks; camera released on every exit. */
(function () {
  "use strict";
  const { esc, I, haptic, SERIAL_LEN, STATUS } = EC;
  const $ = (id) => document.getElementById(id);
  const norm = (v) => String(v).toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, SERIAL_LEN);
  const isShape = (v) => new RegExp(`^[0-9A-Z]{${SERIAL_LEN}}$`).test(v);
  const chip = (st) => `<span class="status ${STATUS[st].cls}">${st === "updated" ? I.ok : st === "waiting" ? I.clock : I.x}${STATUS[st].word}</span>`;
  const thumb = (d) => `<span class="thumb" data-o="${d.orient}">${ECSign.render(Object.assign({ orient: d.orient }, d.sign))}</span>`;

  const scanHtml = (label) => `<div class="scan-top">
      <div class="scanner" id="scanner" data-state="idle">
        <button class="viewfinder" id="vf" aria-label="${esc(label)}"><span class="vf-frame"></span><span class="vf-hint">${I.scan.replace("<svg", '<svg style="width:28px;height:28px"')}Tap to scan again</span></button>
        <div class="cam"><video id="scan-video" playsinline muted></video><span class="vf-frame"></span><span class="scanline"></span>
          <button class="cam-btn" id="cam-cancel" aria-label="Stop camera">${I.x}</button>
          <button class="cam-btn torch" id="torch" aria-label="Flashlight" aria-pressed="false" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 3h8l-2 6h-4z"/><path d="M10 9v11h4V9"/></svg></button></div>
        <div class="cam-fail"><strong>Camera unavailable</strong><span class="note">Type the ID or pick from the list.</span><button class="btn ghost" id="cam-retry">Try again</button></div>
        <div class="cam-state" aria-live="polite"><i></i><span id="cam-msg"></span></div>
      </div>
    </div>`;

  function listHtml(fleet) {
    if (!fleet.length) return `<div class="empty">No displays installed at this site yet.</div>`;
    const byLoc = {};
    fleet.forEach((d) => (byLoc[EC.locKey(d)] = byLoc[EC.locKey(d)] || []).push(d));
    const zones = {};
    fleet.forEach((d) => (zones[d.zone] = zones[d.zone] || []).push(d));
    const n = (a, b) => Number(a) - Number(b);
    return Object.keys(zones).sort().map((z) => `
      <div class="pick-zone"><span class="pick-zone-name">Zone ${esc(z)}</span>
        ${zones[z].sort((a, b) => n(a.aisle, b.aisle) || n(a.section, b.section) || a.serial.localeCompare(b.serial)).map((d) => {
          const mates = byLoc[EC.locKey(d)];
          return `<button class="tree-dev pick-dev" data-pick="${d.serial}">
            ${thumb(d)}
            <span class="dev-meta"><b class="mono">${esc(EC.locKey(d))}${mates.length > 1 ? `<span class="pair-tag">${mates.indexOf(d) + 1} of ${mates.length}</span>` : ""}</b>
              <span class="note mono">${esc(d.serial)}</span><span class="dev-line">${chip(d.status)}${EC.health(d)}</span></span>
            ${I.next.replace("<svg", '<svg class="row-go"')}
          </button>`;
        }).join("")}
      </div>`).join("");
  }

  /* opts: { onPick(serial), label } — returns { scanner } so the page can stop it */
  function bind(opts) {
    const fleetNow = () => EC.fleet();
    function tryPick(sn, fromScan) {
      const rej = $("pick-reject");
      if (opts.validate) {
        const why = opts.validate(sn);
        if (why) { rej.innerHTML = `<div class="result bad" role="alert"><strong class="mono">${esc(sn)}</strong><p>${esc(why)}</p></div>`; return false; }
        rej.innerHTML = ""; if (fromScan) haptic(40); scanner.stop(); opts.onPick(sn); return true;
      }
      const d = fleetNow().find((x) => x.serial === sn);
      if (!d) {
        const known = EC.DEVICES.find((x) => x.serial === sn);
        const other = known && known.siteId !== EC.state.siteId && EC.site(known.siteId);
        rej.innerHTML = `<div class="result bad" role="alert"><strong class="mono">${esc(sn)}</strong><p>${other ? `Registered to ${esc(other.name)}.` : "Not installed at this site."}</p></div>`;
        return false;
      }
      rej.innerHTML = "";
      if (fromScan) haptic(40);
      scanner.stop();
      opts.onPick(sn);
      return true;
    }
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
            if (this.state !== "starting") { this.release(); return; }
            video.srcObject = this.stream; await video.play(); this.paint("running");
            const tick = async () => {
              if (this.state !== "running") return;
              try { for (const c of await det.detect(video)) if (this.handle(c.rawValue)) return; } catch { /* frame not ready */ }
              this.raf = requestAnimationFrame(tick);
            };
            tick();
          } else {
            if (!window.ZXing) await new Promise((ok, bad) => { const sc = document.createElement("script"); sc.src = "lib/zxing.min.js"; sc.onload = ok; sc.onerror = () => bad(new Error("zxing-load")); document.head.appendChild(sc); });
            if (this.state !== "starting") return;
            this.zx = new window.ZXing.BrowserMultiFormatReader();
            await this.zx.decodeFromConstraints({ video: { facingMode: "environment" }, audio: false }, video, (res) => { if (res && this.state === "running") this.handle(res.getText()); });
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
      handle(raw) {
        const v = norm(raw), now = Date.now();
        if (isShape(v)) {
          if (v === this.last.v && now - this.last.t < 2500) return false;
          this.last = { v, t: now };
          return tryPick(v, true);
        }
        if (now - this.lastShake > 900) {
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
          b.onclick = async () => { this.torch = !this.torch; try { await track.applyConstraints({ advanced: [{ torch: this.torch }] }); } catch { /* ignore */ } b.setAttribute("aria-pressed", String(this.torch)); };
        }
      },
      release() {
        cancelAnimationFrame(this.raf);
        try { this.zx && this.zx.reset(); } catch { /* ignore */ }
        this.zx = null;
        if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
        const v = $("scan-video"); if (v) v.srcObject = null;
        this.torch = false;
      },
      stop() { if (this.state === "idle") return; this.release(); this.paint("idle"); },
      paint(st, msg) {
        this.state = st;
        const el = $("scanner"); if (!el) return;
        el.dataset.state = st;
        $("cam-msg").textContent = { idle: "", starting: "Starting camera…", running: "Aim at the barcode on the bezel", failed: msg || "" }[st];
      },
    };
    addEventListener("visibilitychange", () => { if (document.hidden) scanner.stop(); });
    addEventListener("pagehide", () => scanner.release());

    scanner.paint("idle");
    $("vf").onclick = () => scanner.start();
    $("cam-retry").onclick = () => scanner.start();
    $("cam-cancel").onclick = () => scanner.stop();
    setTimeout(() => scanner.start(), 0); // the camera opens with the screen
    const serial = $("pick-serial");
    serial.addEventListener("focus", () => scanner.stop()); // never keyboard over a live camera
    serial.addEventListener("input", () => {
      const v = norm(serial.value); serial.value = v; $("pick-len").textContent = `${v.length}/${SERIAL_LEN}`;
      if (v.length === SERIAL_LEN) tryPick(v, false); // quiet until complete
    });
    document.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => tryPick(b.dataset.pick, false));
    return { scanner };
  }

  const bodyHtml = ({ list = true, placeholder = "Or type the display ID" } = {}) => `
    <div class="serial-field"><input class="input" id="pick-serial" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Display ID" placeholder="${esc(placeholder)}" /><span class="len" id="pick-len">0/${SERIAL_LEN}</span></div>
    <div id="pick-reject"></div>
    ${list ? `<div class="pick-list">${listHtml(EC.fleet())}</div>` : ""}`;

  window.ECPick = { scanHtml, bodyHtml, bind, thumb, chip };
})();
