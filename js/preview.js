/* Sign preview build — shared by Install and Update Content.
   In the product, the sign data goes out, the system pulls the product picture, builds the template and sends back
   the preview. That is not instant. Spec: the preview comes back in 30 seconds or less; past 30 s the tech gets
   "Try again". Push Content stays locked until a preview is back.
   Prototype: the build is simulated (2.5–4.5 s). Add ?slowpreview to the URL to see the 30 s timeout. */
(function () {
  "use strict";
  const LIMIT_MS = 30000;
  const slow = /[?&]slowpreview\b/.test(location.search);

  /* stand-in for the real call; resolves when the preview is ready */
  const request = () => new Promise((ok) => { if (!slow) setTimeout(ok, 2500 + Math.random() * 2000); });

  function controller(onChange) {
    let st = { key: null, state: "idle", t0: 0 }, tick = 0, guard = 0;
    // the preview is built by the backend: offline, it waits; back online, it starts
    addEventListener("online", () => { if (st.state === "offline") { st.state = "idle"; onChange(); } else onChange(); });
    addEventListener("offline", () => onChange());
    const stopTimers = () => { clearInterval(tick); clearTimeout(guard); };
    return {
      ready: (key) => st.key === key && st.state === "ready",
      canPush: (key) => st.key === key && st.state === "ready" && navigator.onLine,
      state: (key) => (st.key === key ? st.state : "idle"),
      /* start (or keep) building for this content; a change of content starts over */
      ensure(key) {
        if (!navigator.onLine) {
          if (st.key === key && (st.state === "ready" || st.state === "offline")) return;
          stopTimers(); st = { key, state: "offline", t0: 0 }; onChange(); return;   // repaint once with the offline note
        }
        if (st.key === key && st.state !== "idle" && st.state !== "offline") return;
        stopTimers();
        st = { key, state: "building", t0: Date.now() };
        request().then(() => { if (st.key === key && st.state === "building") { stopTimers(); st.state = "ready"; onChange(); } });
        guard = setTimeout(() => { if (st.key === key && st.state === "building") { stopTimers(); st.state = "failed"; onChange(); } }, LIMIT_MS);
        tick = setInterval(() => { const el = document.getElementById("pv-secs"); if (el) el.textContent = Math.floor((Date.now() - st.t0) / 1000) + " s"; }, 1000);
      },
      retry(key) { st = { key: null, state: "idle", t0: 0 }; this.ensure(key); onChange(); },
      cancel() { stopTimers(); st = { key: null, state: "idle", t0: 0 }; },
      /* loader / failure markup; orientation shapes the placeholder */
      html(key, orient) {
        if (st.key === key && st.state === "offline") {
          return `<div class="offline-note" role="status"><span>Offline. The preview needs a connection. It starts as soon as you’re back online.</span></div>`;
        }
        if (st.key === key && st.state === "failed") {
          return `<div class="pv-fail" role="alert"><strong>The preview didn’t come back</strong>
            <span class="note">It took longer than 30 seconds. Check the connection and try again.</span>
            <button class="btn ghost" id="pv-retry">Try again</button></div>`;
        }
        return `<div class="pv-build" data-o="${orient}" role="status" aria-live="polite">
            <div class="pv-ghost"><span class="pv-band"></span><span class="pv-shine"></span></div>
            <div class="pv-line"><span class="pv-spin" aria-hidden="true"></span><span>Building the sign preview…</span><span class="mono note" id="pv-secs">0 s</span></div>
            <span class="note">Pulling the picture and laying out the sign. This can take up to 30 seconds.</span>
          </div>`;
      },
    };
  }

  window.ECPreview = { controller, LIMIT_MS };
})();
