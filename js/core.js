/* Engage Companion — shared core: build stamp, fixtures, session state, navigation, header, icons.
   Every page loads this first, then js/art.js, then its own page script. */
(function () {
  "use strict";

  const BUILD = "v0.6.1 · 2026-10-09";

  /* ---------- fixtures ----------
     Trap cases are deliberate (principle 55). Don't tidy them:
     #4108 has 0 displays · #0359 has a very long name · #5624 / #5642 near-duplicate IDs
     Serial …0112 never checks in after a swap · …0230 is registered to a different site · …9999 is unregistered */
  const CHAINS = [
    {
      id: "WMT", name: "Walmart",
      sites: [
        { id: "5624", name: "Walmart #5624", city: "Dallas, TX", displays: 48 },
        { id: "5642", name: "Walmart #5642", city: "Garland, TX", displays: 36 },
        { id: "0100", name: "Walmart #0100", city: "Bentonville, AR", displays: 12 },
        { id: "4108", name: "Walmart #4108", city: "Rogers, AR", displays: 0 },
        { id: "0359", name: "Walmart Supercenter #0359 — Fayetteville Martin Luther King Jr Blvd", city: "Fayetteville, AR", displays: 64 },
        { id: "3305", name: "Walmart #3305", city: "Springdale, AR", displays: 22 },
      ],
    },
    {
      id: "VGL", name: "VusionGroup Labs",
      sites: [
        { id: "CEC-DAL", name: "Dallas CEC", city: "Dallas, TX", displays: 9 },
        { id: "LAB-FAR", name: "Farmington Bench", city: "Farmington, AR", displays: 3 },
      ],
    },
  ];

  const MODEL = { name: "Engage MediaBoard 32W", input: "DC 14.8V 1A", pack: "Li-ion 14.8V 2600mAh 38.48Wh" };

  const DEVICES = [
    { serial: "EGDA0091", siteId: "5624", location: "Front entrance · Left", battery: 8, behavior: "ok" },
    { serial: "EGDA0107", siteId: "5624", location: "Aisle 12 · Endcap", battery: 14, behavior: "ok" },
    { serial: "EGDA0112", siteId: "5624", location: "Pharmacy · Counter", battery: 31, behavior: "silent" },
    { serial: "EGDA0230", siteId: "5642", location: "Grocery · Produce", battery: 22, behavior: "ok" },
    { serial: "EGDA0301", siteId: "CEC-DAL", location: "Demo wall · Bay 2", battery: 11, behavior: "ok" },
    { serial: "EGDA0302", siteId: "CEC-DAL", location: "Demo wall · Bay 3", battery: 47, behavior: "silent" },
    { serial: "EGDA0410", siteId: "0100", location: "Electronics · Endcap", battery: 5, behavior: "ok" },
    { serial: "EGDA0520", siteId: "0359", location: "Main entrance · Right", battery: 18, behavior: "ok" },
    { serial: "EGDA0611", siteId: "3305", location: "Seasonal · Front", battery: 9, behavior: "ok" },
    { serial: "EGDA0712", siteId: "LAB-FAR", location: "Bench · Slot A", battery: 3, behavior: "ok" },
  ];
  const SERIAL_LEN = 8; // bezel display ID: 8 alphanumeric characters (spec). The 13-char serial on the rear label is a different number.

  /* ---------- fleet: what each display shows and where it hangs ----------
     Seed signs for the Update flow. Location is Zone (letters) + Aisle + Section, shown as A15-1.
     Trap cases (principle 55): …0112 never connects after a push (goes Not confirmed);
     A16-2 was pushed 2 min ago and is still waiting for a wake; GM102-4 is portrait (can't be batched with landscape). */
  const SEED = {
    "EGDA0091": { zone: "A", aisle: "15", section: "1", orient: "landscape", ago: 600, sign: { type: "edlp", priceC: "212", uom: "lb", desc: "Tomatoes on the Vine", plu: "4664", img: "assets/products/tomatoes-on-vine.png" } },
    "EGDA0107": { zone: "A", aisle: "15", section: "2", orient: "landscape", ago: 600, sign: { type: "rollback", priceC: "119", wasC: "129", uom: "lb", desc: "Navel Oranges", plu: "4013", img: "assets/products/navel-oranges.png" } },
    "EGDA0112": { zone: "A", aisle: "16", section: "1", orient: "landscape", ago: 30, sign: { type: "edlp", priceC: "58", uom: "lb", desc: "Bananas", plu: "4011", img: "assets/products/bananas.png" } },
    "EGDA0118": { zone: "A", aisle: "16", section: "2", orient: "landscape", ago: 2, pending: true, sign: { type: "manager", priceC: "67", wasC: "97", uom: "ea", desc: "Hass Avocados", plu: "4225", img: "assets/products/hass-avocados.png" } },
    "EGDA0124": { zone: "B", aisle: "3", section: "1", orient: "landscape", ago: 900, sign: { type: "clearance", priceC: "212", wasC: "348", uom: "lb", desc: "Pie Pumpkins", plu: "3134", img: "assets/products/pie-pumpkins.png" } },
    "EGDA0131": { zone: "GM", aisle: "102", section: "4", orient: "portrait", ago: 900, sign: { type: "rollback", priceC: "147", wasC: "198", uom: "lb", desc: "Red Delicious Apples", plu: "4016", img: "assets/products/red-delicious-apples.png" } },
  };
  DEVICES.push({ serial: "EGDA0118", siteId: "5624", battery: 40, behavior: "ok" },
               { serial: "EGDA0124", siteId: "5624", battery: 52, behavior: "ok" },
               { serial: "EGDA0131", siteId: "5624", battery: 61, behavior: "ok" });

  const NOT_CONFIRMED_MIN = 7;   // no Wi-Fi connection this long after a push → Not confirmed
  const CONNECT_DEMO_SEC = 25;   // prototype only: a woken display "connects" this long after its push

  /* ---------- session state (shared across pages) ---------- */
  const KEY = "engage-companion";
  let state;
  // localStorage, not sessionStorage: an installed app is closed and reopened all day; progress must survive that
  try { state = JSON.parse(localStorage.getItem(KEY)) || JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { state = {}; }
  state = Object.assign({ user: null, chainId: "WMT", siteId: null, flows: {} }, state);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } };

  const allSites = () => CHAINS.flatMap((c) => c.sites.map((s) => ({ ...s, chainId: c.id, chain: c.name })));
  const site = (id = state.siteId) => allSites().find((s) => s.id === id) || null;

  /* fleet for a site: seed + installs + pushes made this session (all kept in session state) */
  function fleet(siteId = state.siteId) {
    const now = Date.now();
    const out = [];
    DEVICES.filter((d) => d.siteId === siteId && SEED[d.serial]).forEach((d) => {
      const seed = SEED[d.serial];
      const base = { serial: d.serial, behavior: d.behavior, zone: seed.zone, aisle: seed.aisle, section: seed.section, orient: seed.orient, sign: seed.sign,
        pushedAt: now - seed.ago * 60000, connectedAt: seed.pending || d.behavior === "silent" ? null : now - (seed.ago - 1) * 60000 };
      out.push(Object.assign(base, (state.fleet || {})[d.serial] || {}));
    });
    Object.values(state.fleet || {}).forEach((d) => { if (d.siteId === siteId && !out.some((o) => o.serial === d.serial)) out.push(d); });
    return out.map((d) => Object.assign({}, d, { status: statusOf(d, now) }));
  }
  /* Sent → Waiting for wake → Updated; Not confirmed once 7 min pass with no connection */
  function statusOf(d, now = Date.now()) {
    if (d.connectedAt && d.connectedAt >= d.pushedAt) return "updated";
    if (d.behavior !== "silent" && d.woken && now - d.pushedAt >= CONNECT_DEMO_SEC * 1000) return "updated";
    return now - d.pushedAt >= NOT_CONFIRMED_MIN * 60000 ? "unconfirmed" : "waiting";
  }
  const STATUS = {
    waiting: { word: "Waiting for wake", cls: "pending" },
    updated: { word: "Updated", cls: "confirmed" },
    unconfirmed: { word: "Not confirmed", cls: "rejected" },
  };
  /* record a push (Install or Update). meta carries location/orientation for new installs */
  function recordPush(serials, sign, meta = {}) {
    state.fleet = state.fleet || {};
    const now = Date.now();
    serials.forEach((sn) => {
      const known = (DEVICES.find((d) => d.serial === sn) || {});
      const prev = fleet().find((d) => d.serial === sn) || {};
      state.fleet[sn] = Object.assign({ serial: sn, siteId: state.siteId, behavior: known.behavior || "ok" },
        prev, meta[sn] || {}, { sign: Object.assign({}, sign), pushedAt: now, connectedAt: null, woken: false });
      delete state.fleet[sn].status;
    });
    save();
  }
  /* the tech finished the wake steps for this display (prototype: lets it "connect") */
  function markWoken(sn) {
    state.fleet = state.fleet || {};
    const cur = fleet().find((d) => d.serial === sn);
    if (!cur) return;
    state.fleet[sn] = Object.assign({}, cur, state.fleet[sn] || {}, { woken: true });
    delete state.fleet[sn].status;
    save();
  }
  const locCode = (d) => `${d.zone}${d.aisle}-${d.section}`;

  /* ---------- navigation ---------- */
  const PAGES = { login: "login.html", site: "site.html", home: "home.html", install: "install.html", content: "content.html", battery: "battery.html", trouble: "troubleshoot.html" };
  const go = (page) => { save(); location.href = PAGES[page] || page; };

  /** Redirect if prerequisites are missing. Returns false when it redirected. */
  function guard({ auth = true, needSite = true } = {}) {
    if (auth && !state.user) { location.replace(PAGES.login); return false; }
    if (needSite && !site()) { location.replace(PAGES.site); return false; }
    return true;
  }

  /* ---------- utils ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const haptic = (ms = 30) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* no vibration */ } };

  /* ---------- icons ---------- */
  const I = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 11l8-6.5 8 6.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 9v6M10 9v6M13 9v6M16 9v6"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1" fill="currentColor" stroke="none"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  };

  /* ---------- header ----------
     Home page: avatar + site pill (no home button — you're already home).
     Every other signed-in page: avatar + site pill + home button. */
  function header({ home = true } = {}) {
    const s = site();
    return `<header class="topbar">
      <button class="avatar" id="who" aria-label="Account: ${esc(state.user.name)}">${esc(state.user.initials)}</button>
      ${s ? `<button class="site-pill" id="change-site" aria-label="Change site, current ${esc(s.name)}">${I.pin}<span>${esc(s.name)}</span></button>` : `<span style="flex:1"></span>`}
      ${home ? `<button class="icon-btn" id="go-home" aria-label="Home">${I.home}</button>` : ""}
    </header>`;
  }

  function bindHeader() {
    document.getElementById("change-site")?.addEventListener("click", () => go("site"));
    document.getElementById("go-home")?.addEventListener("click", () => go("home"));
    document.getElementById("who")?.addEventListener("click", accountSheet);
  }

  function sheet(inner, { label = "Panel" } = {}) {
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}"><span class="grabber"></span>${inner}</div>`;
    const close = () => { scrim.dispatchEvent(new Event("close")); scrim.remove(); };
    scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
    document.addEventListener("keydown", function onKey(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } });
    document.body.appendChild(scrim);
    return { el: scrim, close };
  }

  function accountSheet() {
    const { el, close } = sheet(`
      <h3>Account</h3>
      <div class="who">
        <span class="avatar">${esc(state.user.initials)}</span>
        <div><div style="font-weight:700">${esc(state.user.name)}</div><div class="em">${esc(state.user.email)}</div></div>
      </div>
      <button class="btn ghost" id="sheet-site">Change site</button>
      <button class="btn" id="sheet-out">Sign out</button>
      <div class="build-stamp">${BUILD}</div>`, { label: "Account" });
    el.querySelector("#sheet-site").addEventListener("click", () => { close(); go("site"); });
    el.querySelector("#sheet-out").addEventListener("click", () => {
      close();
      state.user = null; state.siteId = null; state.flows = {};
      go("login");
    });
    el.querySelector("#sheet-out").focus();
  }

  /* ---------- installed-app plumbing ----------
     Service worker (sw.js) caches everything so the app opens instantly and offline.
     Strips: "Offline" while there's no connection; "New version" when a new build is ready. */
  function strip(kind, html) {
    let el = document.querySelector(".app-strip." + kind);
    if (!html) { if (el) el.remove(); return null; }
    if (!el) { el = document.createElement("div"); el.className = "app-strip " + kind; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.innerHTML = html;
    return el;
  }
  const paintOnline = () => strip("offline", navigator.onLine ? "" : "<span>Offline · You can look things up. Pushing a sign needs a connection.</span>");
  addEventListener("online", paintOnline);
  addEventListener("offline", paintOnline);
  addEventListener("DOMContentLoaded", paintOnline);

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        const offer = (w) => {
          const el = strip("update", '<span>New version available</span><button type="button">Reload</button>');
          el.querySelector("button").onclick = () => w.postMessage("skip-waiting");
        };
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(w); });
        });
      }).catch(() => { /* not available here (preview sandbox): the app still works online */ });
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
    });
  }

  /* iPhone has no install prompt: one-time hint in Safari (not once installed) */
  addEventListener("load", () => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
    let seen = false; try { seen = localStorage.getItem("ec-ios-hint") === "1"; } catch { /* ignore */ }
    if (!ios || standalone || seen) return;
    const el = document.createElement("div");
    el.className = "ios-hint"; el.setAttribute("role", "note");
    el.innerHTML = '<span><b>Install Engage Companion</b>Tap Share, then Add to Home Screen. It opens faster and works offline.</span><button type="button">Got it</button>';
    el.querySelector("button").onclick = () => { try { localStorage.setItem("ec-ios-hint", "1"); } catch { /* ignore */ } el.remove(); };
    document.body.appendChild(el);
  });

  window.EC = { BUILD, CHAINS, MODEL, DEVICES, SERIAL_LEN, fleet, statusOf, STATUS, recordPush, markWoken, locCode, NOT_CONFIRMED_MIN, state, save, site, allSites, go, guard, esc, haptic, I, header, bindHeader, sheet };
})();
