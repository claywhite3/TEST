/* maintenance.html — Maintenance.
   Two ways in:
   • To fix at this site: problems the system can see from check-ins (battery low, woke but didn't take its sign, sign not
     confirmed). Each opens its fix. An item leaves the list when the display reports it fixed (feedback), not when the tech says so.
   • Help with this one: scan or pick the display in front of you, say what's wrong, and follow guided steps until it's fixed
     (a visual check: "does it look right now?") or it needs replacing (hands off to Replace / Remove).
   The battery guide lives here now (and stays reachable from the wake steps). */
(function () {
  "use strict";
  const { state, save, go, guard, esc, I, header, bindHeader } = EC;
  if (!guard()) return;

  const FLOW_V = 1;
  const fresh = () => ({ v: FLOW_V, step: "home", sn: null, issue: null, sub: null, node: null, hist: [], wakeSlide: 0, from: null });
  let f = state.flows.maint;
  if (!f || f.v !== FLOW_V) f = fresh();
  f = state.flows.maint = Object.assign(fresh(), f);

  const $ = (id) => document.getElementById(id);
  const ORIENT = { landscape: "Landscape", portrait: "Portrait" };
  const dev = () => EC.fleet().find((d) => d.serial === f.sn);
  const at = () => Date.now() + 25000;
  const ago = EC.ago;

  /* ---------- guided help: what a tech can do in the field, then replace ---------- */
  const SYMPTOMS = [
    { id: "nolight", t: "No light when I press the button", n: "" , start: "hold" },
    { id: "nosign", t: "It didn’t take the new sign", n: "It still shows the old one.", start: "rewake" },
    { id: "looks", t: "The screen looks wrong", n: "Blank, half drawn, or faded.", start: "redraw" },
    { id: "damaged", t: "It’s damaged", n: "Cracked, bent, or loose.", start: "damaged" },
    { id: "unknown", t: "I don’t know", n: "We’ll start with the button.", start: "hold" },
  ];
  const NODES = {
    hold: { kind: "q", title: "Hold the button for a full 3 seconds", art: "hold", lines: ["Reach into the pocket on the back.", "Press and hold the button. Count to three, then let go."], q: "Did the light turn on?", yes: "wait", no: "battery" },
    battery: { kind: "battery", title: "Swap the battery", lines: ["The battery may be empty.", "Put in a new battery, then try the button again."], next: "hold2" },
    hold2: { kind: "q", title: "Hold the button for 3 seconds again", art: "hold", lines: ["Press and hold the button. Count to three, then let go."], q: "Did the light turn on?", yes: "wait", no: "replace" },
    rewake: { kind: "wake", title: "Wake it again", next: "blinked" },
    blinked: { kind: "q", title: "Did it wake?", art: "blink", lines: ["When you let go, the light turns green, then blinks red or orange."], q: "Did the light turn green, then blink?", yes: "wait", no: "battery" },
    redraw: { kind: "wake", title: "Wake it so it redraws the sign", next: "wait" },
    wait: { kind: "q", title: "Give it 5 minutes", art: "update", lines: ["The screen changes in 3–5 minutes."], q: "Does the screen show the right sign now?", yes: "fixed", no: "replace" },
    damaged: { kind: "replace", title: "This one needs replacing", lines: ["Cracks, a bent frame, or loose parts can’t be fixed in the field."] },
    replace: { kind: "replace", title: "Replace this display", lines: ["It can’t be fixed in the field."] },
    fixed: { kind: "fixed", title: "Fixed", lines: ["Nothing else to do."] },
  };

  /* ---------- the list ---------- */
  const ISSUE_NOTE = {
    battery: "Swap the battery. It comes off the list when the display reports a good battery.",
    stuck: "It woke up but still shows the old sign. Wake it again.",
    unconfirmed: "The last sign never connected. Wake it again.",
  };
  function detail(type, d) {
    if (type === "battery") return EC.health(d, { withAge: true });
    if (type === "stuck") return `<span class="note">Woke ${esc(ago(d.seenAt))}. Still showing the old sign.</span>`;
    return `<span class="note">Pushed ${esc(ago(d.pushedAt))}. Never connected.</span>`;
  }
  /* issues by location: one row per display, a pill per problem; filter by type; zones collapse */
  const PILL = {
    dead: { word: "Dead battery", cls: "bad", issue: "battery", type: "battery", rank: 0 },
    unconfirmed: { word: "Not confirmed", cls: "bad", issue: "unconfirmed", type: "sign", rank: 1 },
    stuck: { word: "Woke, old sign", cls: "warn", issue: "stuck", type: "sign", rank: 2 },
    low: { word: "Low battery", cls: "warn", issue: "battery", type: "battery", rank: 3 },
  };
  const FILTERS = [{ id: "all", word: "All" }, { id: "battery", word: "Battery" }, { id: "sign", word: "Sign" }];
  function byDisplay() {
    const m = {};
    EC.issues().forEach(({ type, d }) => {
      const k = type === "battery" ? (EC.battLevel(d.battery) === "bad" ? "dead" : "low") : type;
      (m[d.serial] = m[d.serial] || { d, pills: [] }).pills.push(k);
    });
    return Object.values(m).map((x) => (x.pills.sort((a, b) => PILL[a].rank - PILL[b].rank), x));
  }
  function listHtml() {
    const all = byDisplay();
    if (!all.length) return `<div class="empty">Nothing to fix at this site right now.</div>`;
    const flt = f.filter || "all";
    const count = (id) => (id === "all" ? all.length : all.filter((x) => x.pills.some((p) => PILL[p].type === id)).length);
    const shown = all.filter((x) => flt === "all" || x.pills.some((p) => PILL[p].type === flt));
    const zones = {};
    shown.forEach((x) => (zones[x.d.zone] = zones[x.d.zone] || []).push(x));
    const n = (a, b) => Number(a) - Number(b);
    return `
      <div class="filter-chips" role="group" aria-label="Filter by problem">
        ${FILTERS.map((x) => `<button class="fchip" data-filter="${x.id}" aria-pressed="${flt === x.id}"><span class="fdot ${x.id}"></span>${x.word}<b>${count(x.id)}</b></button>`).join("")}
      </div>
      ${Object.keys(zones).sort().map((z) => ECPick.zoneSection("maint", z, `${zones[z].length} to fix`,
        zones[z].sort((a, b) => n(a.d.aisle, b.d.aisle) || n(a.d.section, b.d.section)).map(({ d, pills }) => {
          const ps = pills.filter((p) => flt === "all" || PILL[p].type === flt);
          return `<div class="fix-row2">
            <span class="ck-where"><b class="mono">${esc(EC.locKey(d))}</b><span class="note mono">${esc(d.serial)}</span></span>
            <span class="fix-mid">
              ${ps.map((p) => `<span class="pill ${PILL[p].cls}"><i></i>${PILL[p].word}${PILL[p].type === "battery" ? ` · ${d.battery}%` : ""}</span>`).join("")}
              <span class="note">Last seen ${esc(ago(d.seenAt) || "never")}</span>
            </span>
            <button class="help-btn" data-issue="${PILL[ps[0]].issue}" data-sn="${d.serial}">Help me ${I.next}</button>
          </div>`;
        }).join(""), true)).join("")}`;
  }

  const displayCard = (d) => `<div class="cur-item">${ECPick.thumb(d).replace('class="thumb"', 'class="thumb big"')}
      <span class="dev-meta"><b class="mono">${esc(EC.locKey(d))}</b><span class="note mono">${esc(d.serial)}</span>
      <span class="dev-line">${ECPick.chip(d.status)}</span>${EC.health(d, { withAge: true })}</span></div>`;

  /* search: location (A15-1, a151) or display ID; tap a result to get help with it */
  function resultsHtml() {
    const q = String(f.q || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (!q) return "";
    const hits = EC.fleet().filter((d) => EC.locKey(d).replace("-", "").includes(q) || d.serial.includes(q)).slice(0, 8);
    if (!hits.length) return `<div class="empty" style="padding:12px">No display matches “${esc(f.q)}”.</div>`;
    return `<div class="pick-zone">${hits.map((d) => `<button class="tree-dev pick-dev" data-hit="${d.serial}">${ECPick.thumb(d)}
      <span class="dev-meta"><b class="mono">${esc(EC.locKey(d))}</b><span class="note mono">${esc(d.serial)}</span><span class="dev-line">${ECPick.chip(d.status)}${EC.health(d)}</span></span>
      ${I.next.replace("<svg", '<svg class="row-go"')}</button>`).join("")}</div>`;
  }

  /* ---------- screens ---------- */
  function body() {
    const d = dev();
    switch (f.step) {
      case "home": return `
        <h3 class="section-label" style="margin:0">Help with this one</h3>
        <div class="search-scan">
          ${I.search}
          <input class="input" id="m-search" type="search" placeholder="Search location or display ID" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(f.q || "")}" />
          <button class="scan-btn" id="help" aria-label="Scan the display’s barcode">${I.scan}</button>
        </div>
        <p class="note" style="margin:-4px 0 0">Type to search, or tap the barcode to scan.</p>
        <div id="m-results">${resultsHtml()}</div>
        <h3 class="section-label" style="margin:8px 0 0">To fix at this site</h3>
        <div id="m-list">${listHtml()}</div>
        <button class="link" id="batt-guide">Just swapping batteries? Open the battery guide</button>`;
      case "find": return ECPick.bodyHtml();
      case "issue": {
        if (f.sub === "sent") {
          const still = EC.issues().some((x) => x.d.serial === f.sn && x.type === f.issue);
          return `${displayCard(d)}
            <div class="hint-row as-note ${still ? "" : "ok"}">${still ? I.clock : I.ok}<span>${still
              ? (f.issue === "battery" ? "Waiting for the display to report its battery. It comes off the list when it does." : "Waiting for the display to confirm its sign. It comes off the list when it does.")
              : "Reported in. It’s off the list."}</span></div>
            <button class="btn" id="to-home">Back to Maintenance</button>
            <button class="link" id="still">Still not working? Help me figure it out</button>`;
        }
        if (f.issue === "battery" && f.sub !== "wake") return `${displayCard(d)}
            <ul class="lines"><li>Battery was at ${d.battery}% at the last check-in.</li><li>Swap it, then wake the display so it reports.</li></ul>
            <button class="link" id="still">Not the battery? Help me figure it out</button>`;
        return `${ECGuide.html(ECGuide.WAKE, "Wake the display")}
            <button class="hint-row" id="no-light">${I.warn}<span>No light? Check the battery</span>${I.next}</button>`;
      }
      case "what": return `${displayCard(d)}
        <div class="choice-list">${SYMPTOMS.map((s) => `<button class="choice" data-sym="${s.id}"><span class="choice-t">${esc(s.t)}</span>${s.n ? `<span class="note">${esc(s.n)}</span>` : ""}${I.next}</button>`).join("")}</div>`;
      case "node": {
        const n = NODES[f.node];
        if (n.kind === "wake") return `${ECGuide.html(ECGuide.WAKE, n.title)}
          <button class="hint-row" id="no-light">${I.warn}<span>No light? Check the battery</span>${I.next}</button>`;
        if (n.kind === "q") return `
          <div class="stage">${ECArt.wake(n.art)}</div>
          <ul class="lines">${n.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
          <p class="q">${esc(n.q)}</p>
          <div class="yes-no"><button class="btn ghost" data-ans="no">No</button><button class="btn" data-ans="yes">Yes</button></div>`;
        if (n.kind === "battery") return `
          <ul class="lines">${n.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
          <button class="btn" id="open-batt">Open the battery guide</button>`;
        if (n.kind === "replace") return `${displayCard(d)}
          ${f.node === "damaged" ? `<div class="safety-pin" role="note">${I.warn}<span>Swollen, hot, or leaking battery: stop and call support.</span></div>` : ""}
          <ul class="lines">${n.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
          ${d.rssi != null && d.rssi < -76 ? `<div class="hint-row as-note">${I.warn}<span>Its Wi-Fi was weak at the last check-in. A new display in the same spot may have the same trouble.</span></div>` : ""}
          <button class="btn" id="go-replace">Replace it</button>
          <button class="btn ghost" id="to-home">Back to Maintenance</button>`;
        if (n.kind === "fixed") return `<div class="hint-row as-note ok">${I.ok}<span>Nice work. Nothing else to do.</span></div>
          <button class="btn" id="to-home">Back to Maintenance</button>
          <button class="btn ghost" id="home">Home</button>`;
      }
    }
    return "";
  }

  function titles() {
    const d = dev();
    if (f.step === "home") return ["Maintenance", ""];
    if (f.step === "find") return ["Which display?", "Scan it, or pick it from the list."];
    if (f.step === "issue") {
      if (f.sub === "sent") return [f.issue === "battery" ? "Battery swapped" : "Woken", ""];
      if (f.issue === "battery" && f.sub !== "wake") return ["Swap the battery", ""];
      return ["Wake it again", f.issue === "battery" ? "So it reports its new battery." : (f.issue === "stuck" ? "It woke up but still shows the old sign." : "The last sign never connected.")];
    }
    if (f.step === "what") return [`What’s wrong with ${d ? EC.locKey(d) : "it"}?`, ""];
    if (f.step === "node") return [NODES[f.node].title, ""];
    return ["", ""];
  }

  const eyebrow = () => {
    const d = dev();
    if (!d || ["home", "find"].includes(f.step)) return "";
    return `<div class="eyebrow-row"><span class="id-tag mono">${esc(d.serial)}</span><span>${esc(EC.locKey(d))} · ${ORIENT[d.orient]}</span></div>`;
  };

  function navHtml() {
    const n = f.step === "node" ? NODES[f.node] : null;
    if (f.step === "issue" && f.sub === "sent") return "";
    /* end screens: their own buttons, plus Back to the last answer */
    let fwd = "";
    if (f.step === "issue" && f.issue === "battery" && f.sub !== "wake") fwd = `<button class="btn" id="next">Open the battery guide</button>`;
    else if (f.step === "issue") fwd = `<button class="btn" id="next">Done</button>`;
    else if (n && n.kind === "wake") fwd = `<button class="btn" id="next">Done</button>`;
    else if (n && n.kind === "battery") fwd = `<button class="btn" id="next">Battery is swapped</button>`;
    return `<nav class="flow-nav ${fwd ? "" : "solo"}"><button class="btn ghost" id="back">${I.back.replace("<svg", '<svg style="width:18px;height:18px"')} Back</button>${fwd}</nav>`;
  }

  let picker = null;
  function render() {
    if (picker) picker.scanner.release();
    picker = null;
    const [title, sub] = titles();
    $("app").innerHTML = `
      <main class="screen" style="--tint:var(--tint-trouble)">
        ${header({ home: true })}
        <div class="flow">
          ${f.step === "find" ? ECPick.scanHtml("Start camera and scan a display") : ""}
          <div class="flow-top"><div class="flow-name"><span class="kicker">Maintenance</span><span class="count">${f.step === "home" ? `${new Set(EC.issues().map((x) => x.d.serial)).size} to fix` : ""}</span></div></div>
          <div class="step" id="body">
            ${eyebrow()}
            <h2>${esc(title)}</h2>
            ${sub ? `<p class="note" style="margin:0;font-size:15px">${esc(sub)}</p>` : ""}
            ${body()}
          </div>
          ${navHtml()}
        </div>
      </main>`;
    bindHeader();
    bind();
  }
  function setStep(st, extra = {}) { if (picker) picker.scanner.stop(); Object.assign(f, { step: st }, extra); save(); render(); const b = $("body"); if (b) b.scrollTop = 0; }
  const toNode = (id) => { f.hist.push(f.node); setStep("node", { node: id, wakeSlide: 0 }); };
  const openBattery = () => { state.flows.battery = { step: 0, returnTo: "maint" }; go("battery"); };
  /* a fix the display reports on: re-wake clears "stuck"/unconfirmed, a battery swap reports a full battery */
  const reportWake = () => { EC.markWoken(f.sn); EC.expectCheckin(f.sn, { stuck: false, connectedAt: at() }); };

  function back() {
    if (f.step === "home") return go("home");
    if (f.step === "find" || f.step === "issue") return setStep("home", { sub: null });
    if (f.step === "what") {
      if (f.from === "replace") { state.flows.replace = { v: 1, step: "choose", old: f.sn }; delete state.flows.maint; return go("replace"); }
      if (f.from === "issue") return setStep("issue", { sub: f.issue === "battery" ? null : "wake" });
      if (f.from === "search") return setStep("home");
      return setStep("find");
    }
    if (f.step === "node") {
      const prev = f.hist.pop();
      return prev ? setStep("node", { node: prev }) : setStep("what", { node: null });
    }
  }

  function bind() {
    $("back")?.addEventListener("click", back);
    $("help")?.addEventListener("click", () => setStep("find", { from: null }));
    $("batt-guide")?.addEventListener("click", () => { state.flows.battery = { step: 0, returnTo: "maint" }; go("battery"); });
    const bindList = () => {
      document.querySelectorAll("[data-issue]").forEach((b) => b.onclick = () => setStep("issue", { issue: b.dataset.issue, sn: b.dataset.sn, sub: b.dataset.issue === "battery" ? null : "wake", wakeSlide: 0 }));
      document.querySelectorAll("[data-filter]").forEach((b) => b.onclick = () => { f.filter = b.dataset.filter; save(); repaintList(); });
      ECPick.bindZones(repaintList);
    };
    const repaintList = () => { const box = $("m-list"); if (box) { box.innerHTML = listHtml(); bindList(); } };
    bindList();
    const bindHits = () => document.querySelectorAll("[data-hit]").forEach((b) => b.onclick = () => { f.q = ""; setStep("what", { sn: b.dataset.hit, hist: [], node: null, from: "search" }); });
    bindHits();
    $("m-search")?.addEventListener("input", (e) => { f.q = e.target.value; save(); $("m-results").innerHTML = resultsHtml(); bindHits(); });
    if (f.step === "find") picker = ECPick.bind({ onPick: (sn) => setStep("what", { sn, hist: [], node: null }) });
    document.querySelectorAll("[data-sym]").forEach((b) => b.onclick = () => { f.hist = []; f.node = null; const s = SYMPTOMS.find((x) => x.id === b.dataset.sym); setStep("node", { node: s.start, wakeSlide: 0 }); });
    document.querySelectorAll("[data-ans]").forEach((b) => b.onclick = () => toNode(NODES[f.node][b.dataset.ans]));
    $("open-batt")?.addEventListener("click", openBattery);
    $("no-light")?.addEventListener("click", openBattery);
    $("still")?.addEventListener("click", () => setStep("what", { from: "issue", hist: [], node: null }));
    $("go-replace")?.addEventListener("click", () => { state.flows.replace = { v: 1, step: "new", old: f.sn }; delete state.flows.maint; go("replace"); });
    $("to-home")?.addEventListener("click", () => { Object.assign(f, fresh()); save(); render(); });
    $("home")?.addEventListener("click", () => { delete state.flows.maint; go("home"); });
    $("next")?.addEventListener("click", () => {
      if (f.step === "issue" && f.issue === "battery" && f.sub !== "wake") { f.sub = "wake"; f.wakeSlide = 0; save(); return openBattery(); }
      if (f.step === "issue") {
        reportWake();
        if (f.issue === "battery") EC.expectCheckin(f.sn, { stuck: false, connectedAt: at(), battery: 100 });
        return setStep("issue", { sub: "sent" });
      }
      const n = NODES[f.node];
      if (n.kind === "wake") { reportWake(); return toNode(n.next); }
      if (n.kind === "battery") { EC.expectCheckin(f.sn, { battery: 100 }); return toNode(n.next); }
    });
    if (f.step === "issue" && f.sub === "wake") ECGuide.bind(ECGuide.WAKE, () => f.wakeSlide, (k) => { f.wakeSlide = k; save(); });
    if (f.step === "node" && NODES[f.node].kind === "wake") ECGuide.bind(ECGuide.WAKE, () => f.wakeSlide, (k) => { f.wakeSlide = k; save(); });
    if (f.step === "issue" && f.sub === "sent") setTimeout(() => { if (f.step === "issue" && f.sub === "sent") render(); }, 5000);
  }

  if (!dev() && !["home", "find"].includes(f.step)) f = state.flows.maint = fresh();
  EC.flowPage("maint", { back, finished: () => f.step === "issue" && f.sub === "sent", atStart: () => f.step === "home" });
  render();
})();
