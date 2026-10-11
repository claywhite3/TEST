/* Swipe guides shared by Replace / Remove and Maintenance (Install and Update Content carry their own copy — tech debt).
   The picture swipes, dots under it, the caption follows. Slide position is kept in the flow's state. */
(function () {
  "use strict";
  const { esc } = EC;
  const R = (o) => ECArt.rear(o);
  const INSERT = [
    { art: () => ECArt.rearOverview(), title: "Find the access panel", lines: ["Turn the display so you face its back.", "The access panel is the tall plate on the left side."] },
    { art: () => R({ screw: "out", focus: "screw", motion: "unscrew" }), title: "Remove the screw", lines: ["Use a #2 Phillips screwdriver.", "Turn the screw counter-clockwise until it comes free.", "Keep the screw. The panel has only one."] },
    { art: () => R({ cover: "tilt", screw: "none", motion: "tilt" }), title: "Remove the panel", lines: ["Swing the top of the panel away from the display.", "Lift it up and out of the slot at the bottom."] },
    { art: () => R({ cover: "set-aside", screw: "none", plug: "apart", kind: "new", focus: "plug", motion: "plugUp" }), title: "Plug in the battery", lines: ["Slide the battery in behind the side clip, label facing out.", "Push its plug onto the display plug.", "Push until no metal shows at the joint."] },
    { art: () => R({ cover: "tilt", screw: "none", motion: "hook" }), title: "Replace the panel", lines: ["Hook the bottom tab of the panel into the slot.", "Swing the panel flat against the display."] },
    { art: () => R({ cover: "on", screw: "out", focus: "screw", motion: "screwIn" }), title: "Replace the screw", lines: ["Turn the screw clockwise until snug.", "Do not overtighten."] },
  ];
  const WAKE = [
    { art: () => ECArt.wake("where"), title: "Find the pocket", lines: ["Go to the back of the display.", "The pocket is on the left side as you face the screen."] },
    { art: () => ECArt.wake("find"), title: "Find the button", lines: ["Reach into the pocket.", "The button is on the left. The light is on the right."] },
    { art: () => ECArt.wake("hold"), title: "Hold for 3 seconds", lines: ["Press and hold the button.", "Count to three, then let go."] },
    { art: () => ECArt.wake("green"), title: "The light turns green", lines: ["The light turns green."] },
    { art: () => ECArt.wake("blink"), title: "Then it blinks", lines: ["Then it blinks red or orange.", "That’s a good sign. The display is taking the sign."] },
    { art: () => ECArt.wake("update"), title: "The sign updates", lines: ["The screen changes in 3–5 minutes.", "You don’t need to wait."] },
  ];

  const html = (steps, label) => `
    <div class="wake-post">
      <div class="carousel" id="track" tabindex="0" aria-roledescription="carousel" aria-label="${esc(label)}">
        ${steps.map((w, i) => `<div class="slide" aria-label="Step ${i + 1} of ${steps.length}">${w.art()}</div>`).join("")}
      </div>
      <div class="dots" role="tablist" aria-label="Steps">
        ${steps.map((w, i) => `<button class="dot" role="tab" data-i="${i}" aria-label="Step ${i + 1}: ${esc(w.title)}"></button>`).join("")}
      </div>
      <section class="caption" id="caption" aria-live="polite"></section>
    </div>`;

  /* get(): saved slide · set(i): save slide */
  function bind(steps, get, set) {
    const track = document.getElementById("track");
    if (!track) return;
    const dots = [...document.querySelectorAll(".dot")];
    let idx = Math.min(get() || 0, steps.length - 1);
    const paint = () => {
      const w = steps[idx];
      dots.forEach((d, k) => d.setAttribute("aria-selected", String(k === idx)));
      document.getElementById("caption").innerHTML = `<span class="step-no">Step ${idx + 1} of ${steps.length}</span><h2>${esc(w.title)}</h2>
        <ul class="lines">${w.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
        ${idx === 0 ? `<p class="swipe-hint">Swipe the picture for the next step</p>` : ""}`;
      set(idx);
    };
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const goTo = (k, smooth = true) => { idx = Math.max(0, Math.min(steps.length - 1, k)); track.scrollTo({ left: idx * track.clientWidth, behavior: smooth && !reduce ? "smooth" : "auto" }); paint(); };
    let ticking = false;
    track.addEventListener("scroll", () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { ticking = false; const k = Math.round(track.scrollLeft / track.clientWidth); if (k !== idx && k >= 0 && k < steps.length) { idx = k; paint(); } }); }, { passive: true });
    let drag = null;
    track.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") return; drag = { x: e.clientX, left: track.scrollLeft, from: idx }; track.classList.add("dragging"); track.setPointerCapture(e.pointerId); });
    track.addEventListener("pointermove", (e) => { if (drag) track.scrollLeft = drag.left - (e.clientX - drag.x); });
    const end = (e) => { if (!drag) return; const dx = e.clientX - drag.x, from = drag.from; track.classList.remove("dragging"); drag = null; goTo(Math.abs(dx) > track.clientWidth * 0.15 ? from + (dx < 0 ? 1 : -1) : from); };
    track.addEventListener("pointerup", end); track.addEventListener("pointercancel", end);
    track.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { e.preventDefault(); goTo(idx + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); goTo(idx - 1); } });
    dots.forEach((d) => d.addEventListener("click", () => goTo(+d.dataset.i)));
    paint(); requestAnimationFrame(() => goTo(idx, false));
  }

  window.ECGuide = { INSERT, WAKE, html, bind };
})();
