/* battery.html — Swap Battery, photo-post style.
   The picture swipes (CSS scroll-snap; mouse drag on desktop), pagination dots sit under it,
   and the caption below follows the active step. The last step carries Swap another / Home directly. */
(function () {
  "use strict";
  const { state, save, site, go, guard, esc, I, header, bindHeader, MODEL } = EC;
  if (!guard()) return;

  const R = ECArt.rear;
  const STEPS = [
    { title: "Access the display safely", safety: true,
      lines: ["Use a step stool or ladder if the rear of the display is out of reach.", "Keep the area below the display clear.", "Do not lean on or pull the display while you work."],
      art: () => ECArt.access() },
    { title: "Find the access panel",
      lines: ["Go to the back of the display.", "The access panel is the tall plate on the left side.", "It has one screw at the top."],
      art: () => ECArt.rearOverview() },
    { title: "Remove the screw", tool: true,
      lines: ["Use a #2 Phillips screwdriver.", "Turn the screw counter-clockwise until it comes free.", "Keep the screw. The panel has only one."],
      art: () => R({ screw: "out", focus: "screw", motion: "unscrew" }) },
    { title: "Remove the panel",
      lines: ["Swing the top of the panel away from the display.", "Lift it up and out of the slot at the bottom."],
      art: () => R({ cover: "tilt", screw: "none", motion: "tilt" }) },
    { title: "Unplug and remove the battery",
      lines: ["Hold both plugs at the joint and pull them straight apart.", "Do not pull on the wires.", "Slide the battery out from behind the side clip."],
      art: () => R({ cover: "set-aside", screw: "none", plug: "apart", battery: "out", kind: "old", focus: "plug", motion: "slideOut" }) },
    { title: "Plug in the new battery",
      lines: ["Slide the new battery in behind the side clip, label facing out.", "Push its plug onto the display plug.", "Push until no metal shows at the joint."],
      art: () => R({ cover: "set-aside", screw: "none", plug: "apart", kind: "new", focus: "plug", motion: "plugUp" }) },
    { title: "Replace the panel",
      lines: ["Hook the bottom tab of the panel into the slot.", "Swing the panel flat against the display."],
      art: () => R({ cover: "tilt", screw: "none", motion: "hook" }) },
    { title: "Replace the screw", tool: true,
      lines: ["Turn the screw clockwise until snug.", "Do not overtighten."],
      art: () => R({ cover: "on", screw: "out", focus: "screw", motion: "screwIn" }) },
  ];
  const N = STEPS.length;

  const f = (state.flows.battery = Object.assign({ step: 0 }, state.flows.battery || {}));
  if (!(f.step >= 0 && f.step < N)) f.step = 0;

  const lines = (arr) => `<ul class="lines">${arr.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
  const pin = (text) => `<div class="safety-pin" role="note">${I.warn}<span>${text}</span></div>`;
  const toolCard = `<div class="brief"><h3>Tool</h3><div class="stage" style="background:var(--surface-2)">${ECArt.tools()}</div><p class="note" style="margin:0">Replacement pack: ${esc(MODEL.pack)}.</p></div>`;

  const app = document.getElementById("app");
  app.innerHTML = `
    <main class="screen" style="--tint:var(--tint-battery)">
      ${header({ home: true })}
      <div class="flow">
        <div class="flow-top">
          <div class="flow-name"><span class="kicker">Swap Battery</span><span class="count" id="count"></span></div>
        </div>
        <div class="post" id="post">
          <div class="carousel" id="track" tabindex="0" aria-roledescription="carousel" aria-label="Swap battery steps">
            ${STEPS.map((s, i) => `<div class="slide${s.safety ? " safety" : ""}" aria-label="Step ${i + 1} of ${N}">${s.art()}</div>`).join("")}
          </div>
          <div class="dots" role="tablist" aria-label="Steps">
            ${STEPS.map((s, i) => `<button class="dot" role="tab" data-i="${i}" aria-label="Step ${i + 1}: ${esc(s.title)}"></button>`).join("")}
          </div>
          <section class="caption" id="caption" aria-live="polite"></section>
        </div>
        <nav class="flow-nav" id="donebar" hidden>
          ${f.returnTo
            ? `<button class="btn" id="to-install" style="grid-column:1/-1">${f.returnTo === "content" ? "Back to Update Content" : "Back to Install"}</button>`
            : `<button class="btn ghost" id="again">Swap another</button>
          <button class="btn" id="home">Home</button>`}
        </nav>
        ${f.returnTo ? `<div style="padding:0 16px 12px"><button class="btn ghost" id="to-install-now">${f.returnTo === "content" ? "Back to Update Content" : "Back to Install"}</button></div>` : ""}
      </div>
    </main>`;
  bindHeader();

  const $ = (id) => document.getElementById(id);
  const track = $("track");
  const dots = [...document.querySelectorAll(".dot")];
  let idx = Math.min(f.step, N - 1);

  function paint() {
    const st = STEPS[idx];
    $("count").textContent = `${idx + 1} / ${N}`;
    dots.forEach((d, i) => d.setAttribute("aria-selected", String(i === idx)));
    $("caption").innerHTML = `
      <span class="step-no">Step ${idx + 1} of ${N}</span>
      <h2>${esc(st.title)}</h2>
      ${st.safety
        ? pin("Li-ion pack inside. Do not puncture or crush it. Swollen, hot, or leaking pack: stop and call support.")
        : pin("Li-ion pack. Keep metal off the plug tips. Swollen or hot pack: stop.")}
      ${lines(st.lines)}
      ${st.tool ? toolCard : ""}
      ${idx === 0 ? `<p class="swipe-hint">Swipe the picture for the next step</p>` : ""}`;
    $("donebar").hidden = idx !== N - 1;
    if ($("to-install-now")) $("to-install-now").parentElement.hidden = idx === N - 1;
    f.step = idx;
    save();
  }

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function goTo(i, smooth = true) {
    idx = Math.max(0, Math.min(N - 1, i));
    track.scrollTo({ left: idx * track.clientWidth, behavior: smooth && !reduce ? "smooth" : "auto" });
    paint();
  }

  // swipe → active step (rAF-throttled; only the caption and dots repaint)
  let ticking = false;
  track.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const i = Math.round(track.scrollLeft / track.clientWidth);
      if (i !== idx && i >= 0 && i < N) { idx = i; paint(); $("post").scrollTop = 0; }
    });
  }, { passive: true });

  // mouse drag on desktop (touch and trackpad already swipe natively)
  let drag = null;
  track.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") return;
    drag = { x: e.clientX, left: track.scrollLeft, from: idx };
    track.classList.add("dragging");
    track.setPointerCapture(e.pointerId);
  });
  track.addEventListener("pointermove", (e) => { if (drag) track.scrollLeft = drag.left - (e.clientX - drag.x); });
  const endDrag = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, from = drag.from;
    track.classList.remove("dragging");
    drag = null;
    goTo(Math.abs(dx) > track.clientWidth * 0.15 ? from + (dx < 0 ? 1 : -1) : from);
  };
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);

  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(idx + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); goTo(idx - 1); }
  });
  dots.forEach((d) => d.addEventListener("click", () => goTo(+d.dataset.i)));
  addEventListener("resize", () => goTo(idx, false));

  $("again")?.addEventListener("click", () => { $("post").scrollTop = 0; goTo(0, false); });
  $("home")?.addEventListener("click", () => { delete state.flows.battery; go("home"); });
  // opened from Install: return there (both the always-visible link and the last-step button)
  const backToInstall = () => { const to = f.returnTo || "install"; delete state.flows.battery; go(to); };
  $("to-install")?.addEventListener("click", backToInstall);
  $("to-install-now")?.addEventListener("click", backToInstall);

  paint();
  requestAnimationFrame(() => goTo(idx, false));
})();
