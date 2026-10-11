/* replace.html — Replace / Remove a display that's already installed.
   Find → What's going on? → (It's broken) Scan the new one → Move it over? → Battery in the new one → Swap them → Push Content → Wake → Replaced
                          → (Help me figure it out) Maintenance › guided help, this display already picked
                          → (Remove it) Remove this display? → Removed
   The new display takes the old one's location, orientation and sign; the tech confirms the move. The old display goes to the
   back room with its battery still in (a crew collects them). Removing needs a confirmation, not a reason. */
(function () {
  "use strict";
  const { state, save, go, guard, esc, I, header, bindHeader, haptic, SERIAL_LEN } = EC;
  if (!guard()) return;

  const FLOW_V = 1;
  const fresh = () => ({ v: FLOW_V, step: "find", old: null, neu: null, battSlide: 0, wakeSlide: 0 });
  let f = state.flows.replace;
  if (!f || f.v !== FLOW_V) f = fresh();
  f = state.flows.replace = Object.assign(fresh(), f);

  const $ = (id) => document.getElementById(id);
  const ORIENT = { landscape: "Landscape", portrait: "Portrait" };
  const REPLACE = ["find", "choose", "new", "confirm", "battery", "swap", "push", "wake", "done"];
  const REMOVE = ["find", "choose", "remove", "removed"];
  const path = () => (["remove", "removed"].includes(f.step) ? REMOVE : REPLACE);
  const oldD = () => EC.fleet().find((d) => d.serial === f.old) || (f.oldSnap || null);
  const mates = (d) => (d ? EC.atLocation(EC.locKey(d)).filter((x) => x.serial !== d.serial) : []);

  const COPY = {
    find: ["Which display?", "Scan it, or pick it from the list."],
    choose: ["", ""],
    new: ["Scan the new display", "Use a new display from the back room."],
    confirm: ["Move it to the new display?", ""],
    battery: ["Put a battery in the new display", "New displays ship without one. Use a new battery, not the old display’s."],
    swap: ["Swap the displays", ""],
    push: ["Push the sign", "Same sign as before, now on the new display."],
    wake: ["Wake the new display", "The sign is sent. Wake the display so it picks it up."],
    done: ["Replaced", ""],
    remove: ["Remove this display?", ""],
    removed: ["Removed", ""],
  };

  function validNew(sn) {
    if (sn === f.old) return "That’s the display you’re replacing. Scan the new one.";
    const inFleet = EC.fleet().find((d) => d.serial === sn);
    if (inFleet) return `Already installed at ${EC.locKey(inFleet)}. Use a new display.`;
    const known = EC.DEVICES.find((d) => d.serial === sn);
    if (known && known.siteId !== state.siteId) { const o = EC.site(known.siteId); return `Registered to ${o ? o.name : "another site"}.`; }
    if (sn.endsWith("9999")) return "Not registered. This display can’t take content yet.";
    return "";
  }

  function valid() {
    if (f.step === "push") return navigator.onLine;
    return !["find", "choose", "new"].includes(f.step);
  }
  const nextLabel = () => ({ confirm: "Move it over", battery: "Battery is in", swap: "The new one is up", push: "Push Content", wake: "Done", remove: "Remove it" }[f.step] || "Continue");

  let picker = null;
  function setStep(st) { if (picker) picker.scanner.stop(); f.step = st; save(); render(); const b = $("body"); if (b) b.scrollTop = 0; }

  function next() {
    if (!valid()) return;
    const d = oldD();
    if (f.step === "confirm") { f.oldSnap = d; return setStep("battery"); }
    if (f.step === "push") {
      // the move happens with the push: the new display takes the location, orientation and sign; the old one comes off
      const meta = { [f.neu]: { zone: d.zone, aisle: d.aisle, section: d.section, orient: d.orient, siteId: state.siteId } };
      EC.recordPush([f.neu], d.sign, meta);
      EC.removeDisplay(f.old);
      haptic(); f.wakeSlide = 0; return setStep("wake");
    }
    if (f.step === "wake") { EC.markWoken(f.neu); return setStep("done"); }
    if (f.step === "remove") { f.oldSnap = d; EC.removeDisplay(f.old); haptic(); return setStep("removed"); }
    const p = path();
    setStep(p[p.indexOf(f.step) + 1]);
  }
  function back() {
    if (f.step === "find") { go("home"); return; }
    if (f.step === "remove") return setStep("choose");
    if (f.step === "wake") return; // pushed: no going back past the push
    const p = path();
    setStep(p[p.indexOf(f.step) - 1]);
  }

  /* ---------- pieces ---------- */
  const eyebrow = () => {
    const d = oldD();
    if (!d || ["find", "done", "removed"].includes(f.step)) return "";
    if (["battery", "swap", "push", "wake"].includes(f.step) && f.neu) return `<div class="eyebrow-row"><span class="id-tag mono">${esc(f.neu)}</span><span>New · ${esc(EC.locKey(d))} · ${ORIENT[d.orient]}</span></div>`;
    return `<div class="eyebrow-row"><span class="id-tag mono">${esc(d.serial)}</span><span>${esc(EC.locKey(d))} · ${ORIENT[d.orient]}</span></div>`;
  };
  const displayCard = (d) => {
    const m = mates(d);
    return `<div class="cur-item">${ECPick.thumb(d).replace('class="thumb"', 'class="thumb big"')}
      <span class="dev-meta"><b class="mono">${esc(EC.locKey(d))}</b><span class="note mono">${esc(d.serial)}</span>
        <span class="dev-line">${ECPick.chip(d.status)}${EC.health(d)}</span>
        ${m.length ? `<span class="note wrap">Shares this location with ${esc(m[0].serial)}</span>` : ""}</span></div>`;
  };
  const backRoom = `<div class="brief" role="note"><h3>The old display</h3>
      <ul class="lines"><li>Put it in the back room where the new displays are kept.</li><li>Leave its battery in.</li><li>Someone will be by to collect it.</li></ul></div>`;

  function body() {
    const d = oldD();
    switch (f.step) {
      case "find": return ECPick.bodyHtml();
      case "choose": return `
        ${displayCard(d)}
        <div class="choice-list">
          <button class="choice" data-go="new"><span class="choice-t">It’s broken</span><span class="note">Replace it with a new display.</span>${I.next}</button>
          <button class="choice" data-go="help"><span class="choice-t">Help me figure it out</span><span class="note">Find out what’s wrong first.</span>${I.next}</button>
          <button class="choice danger" data-go="remove"><span class="choice-t">Remove it</span><span class="note">Take it down. Not replacing it.</span>${I.next}</button>
        </div>`;
      case "new": return ECPick.bodyHtml({ list: false, placeholder: "Or type the new display’s ID" });
      case "confirm": return `
        <div class="move-card">
          <div class="move-row"><span class="note">Location</span><b class="mono">${esc(EC.locKey(d))}</b></div>
          <div class="move-row"><span class="note">Orientation</span><b>${ORIENT[d.orient]}</b></div>
          <div class="move-row"><span class="note">Sign</span>${ECPick.thumb(d)}</div>
          <div class="move-row"><span class="note">From</span><b class="mono">${esc(d.serial)}</b></div>
          <div class="move-row"><span class="note">To</span><b class="mono">${esc(f.neu)}</b></div>
        </div>
        <p class="note" style="margin:0">${esc(d.serial)} comes off ${esc(EC.locKey(d))}. ${esc(f.neu)} takes its place with the same sign.</p>`;
      case "battery": return `<div class="safety-pin" role="note">${I.warn}<span>Li-ion pack. Keep metal off the plug tips. Swollen or hot pack: stop.</span></div>${ECGuide.html(ECGuide.INSERT, "Put a battery in the new display")}`;
      case "swap": return `
        <ul class="lines"><li>Take down the old display.</li><li>Hang the new one in the same spot, the same way up.</li></ul>
        ${backRoom}`;
      case "push": return `
        <div class="esign" data-o="${d.orient}">${ECSign.render(Object.assign({ orient: d.orient }, d.sign))}</div>
        ${navigator.onLine ? "" : `<div class="offline-note" role="status"><span>Offline. Push Content needs a connection.</span></div>`}
        <p class="note" style="margin:0">Sending to ${esc(f.neu)}.</p>`;
      case "wake": return `${ECGuide.html(ECGuide.WAKE, "Wake the display")}
        <button class="hint-row" id="no-light">${I.warn}<span>No light? Check the battery</span>${I.next}</button>`;
      case "done": {
        const n = EC.fleet().find((x) => x.serial === f.neu);
        return `
          <div class="done-list">
            ${n ? `<div class="device-card"><div class="head"><span><span class="mono" style="font-weight:700">${esc(EC.locKey(n))}</span><br><span class="note mono">${esc(n.serial)} · new</span></span>${ECPick.chip(n.status)}</div></div>` : ""}
            <div class="device-card"><div class="head"><span><span class="mono" style="font-weight:700">${esc(f.old)}</span><br><span class="note">Off ${esc(EC.locKey(d))} · to the back room</span></span><span class="status neutral">Removed</span></div></div>
          </div>
          <p class="note">The new display updates in 3–5 minutes.</p>
          <button class="btn" id="again">Replace or remove another</button>
          <button class="btn ghost" id="home">Home</button>`;
      }
      case "remove": {
        const m = mates(d);
        return `${displayCard(d)}
          <ul class="lines">
            <li>${m.length ? `${esc(EC.locKey(d))} keeps ${esc(m[0].serial)}.` : `${esc(EC.locKey(d))} will have no display.`}</li>
            <li>Take it down and put it in the back room where the new displays are kept.</li>
            <li>Leave its battery in. Someone will be by to collect it.</li>
          </ul>`;
      }
      case "removed": return `
        <div class="device-card"><div class="head"><span><span class="mono" style="font-weight:700">${esc(f.old)}</span><br><span class="note">Off ${esc(EC.locKey(d))} · to the back room</span></span><span class="status neutral">Removed</span></div></div>
        <button class="btn" id="again">Replace or remove another</button>
        <button class="btn ghost" id="home">Home</button>`;
    }
    return "";
  }

  function render() {
    if (picker) picker.scanner.release();
    picker = null;
    const d = oldD();
    const p = path(), i = p.indexOf(f.step), total = p.length - 1;
    let [title, sub] = COPY[f.step];
    if (f.step === "choose") title = `What’s going on with ${EC.locKey(d)}?`;
    const final = ["done", "removed"].includes(f.step);
    $("app").innerHTML = `
      <main class="screen" style="--tint:var(--tint-battery)">
        ${header({ home: true })}
        <div class="flow">
          ${["find", "new"].includes(f.step) ? ECPick.scanHtml("Start camera and scan a display") : ""}
          <div class="flow-top">
            <div class="flow-name"><span class="kicker">Replace / Remove</span><span class="count">${final ? "Done" : `${i + 1} / ${total}`}</span></div>
            <div class="progress">${p.slice(0, total).map((_, k) => `<i class="${k < i ? "done" : k === i ? "now" : ""}"></i>`).join("")}</div>
          </div>
          <div class="step" id="body">
            ${eyebrow()}
            <h2>${esc(title)}</h2>
            ${sub ? `<p class="note" style="margin:0;font-size:15px">${esc(sub)}</p>` : ""}
            ${body()}
          </div>
          ${final ? "" : `
          <nav class="flow-nav ${["find", "choose", "new"].includes(f.step) ? "solo" : ""}">
            <button class="btn ghost" id="back" ${f.step === "wake" ? "disabled" : ""}>${I.back.replace("<svg", '<svg style="width:18px;height:18px"')} Back</button>
            ${["find", "choose", "new"].includes(f.step) ? "" : `<button class="btn ${f.step === "remove" ? "danger" : ""}" id="next" ${valid() ? "" : "disabled"}>${esc(nextLabel())}</button>`}
          </nav>`}
        </div>
      </main>`;
    bindHeader();
    bind();
  }

  function bind() {
    $("back")?.addEventListener("click", back);
    $("next")?.addEventListener("click", next);
    if (f.step === "find") picker = ECPick.bind({ onPick: (sn) => { f.old = sn; f.neu = null; setStep("choose"); } });
    if (f.step === "new") picker = ECPick.bind({ validate: validNew, onPick: (sn) => { f.neu = sn; setStep("confirm"); } });
    document.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => {
      const to = b.dataset.go;
      if (to === "help") { state.flows.maint = { v: 1, step: "what", sn: f.old, from: "replace" }; go("maint"); return; }
      setStep(to);
    });
    if (f.step === "battery") ECGuide.bind(ECGuide.INSERT, () => f.battSlide, (k) => { f.battSlide = k; save(); });
    if (f.step === "wake") ECGuide.bind(ECGuide.WAKE, () => f.wakeSlide, (k) => { f.wakeSlide = k; save(); });
    $("no-light")?.addEventListener("click", () => { state.flows.battery = { step: 0, returnTo: "replace" }; go("battery"); });
    addEventListener("online", () => { if (f.step === "push") render(); });
    addEventListener("offline", () => { if (f.step === "push") render(); });
    $("again")?.addEventListener("click", () => { f = state.flows.replace = fresh(); save(); render(); });
    $("home")?.addEventListener("click", () => { delete state.flows.replace; go("home"); });
    if (f.step === "done") setTimeout(() => { if (f.step === "done") render(); }, 5000); // live status
  }

  if (!oldD() && f.step !== "find") f = state.flows.replace = fresh();
  render();
})();
