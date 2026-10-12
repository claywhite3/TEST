/* Engage Companion — shared core: build stamp, fixtures, session state, navigation, header, icons.
   Every page loads this first, then js/art.js, then its own page script. */
(function () {
  "use strict";

  const BUILD = "v0.8.4 · 2026-10-11";

  /* ---------- fixtures ----------
     Trap cases are deliberate (principle 55). Don't tidy them:
     #4108 has 0 displays · #0359 has a very long name · #5624 / #5642 near-duplicate IDs
     Serial …0112 never checks in after a swap · …0230 is registered to a different site · …9999 is unregistered */
  const CHAINS = [
    {
      id: "WMT", name: "Walmart",
      // customer sign font: only once the customer provides it. Walmart hasn't yet; when it does, put Bogle-Bold.woff2 in /fonts
      // and set signFont: "Bogle". It is then used on this chain's signs only, never in the app.
      signFont: null,
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
    { serial: "EGDA0230", siteId: "5642", battery: 22, behavior: "ok" },
    { serial: "EGDA0301", siteId: "CEC-DAL", battery: 11, behavior: "ok" },
    { serial: "EGDA0302", siteId: "CEC-DAL", battery: 47, behavior: "silent" },
    { serial: "EGDA0410", siteId: "0100", battery: 5, behavior: "ok" },
    { serial: "EGDA0520", siteId: "0359", battery: 18, behavior: "ok" },
    { serial: "EGDA0611", siteId: "3305", battery: 9, behavior: "ok" },
    { serial: "EGDA0712", siteId: "LAB-FAR", battery: 3, behavior: "ok" },
  ];
  const SERIAL_LEN = 8; // bezel display ID: 8 alphanumeric characters (spec). The 13-char serial on the rear label is a different number.

  /* ---------- demo fleet at Walmart #5624: what each display shows, where it hangs, its last check-in ----------
     Location is Zone (letters) + Aisle + Section, shown as A15-1. Up to two displays can share one location (produce corners).
     Every path has something to try (principle 55: these are test cases, don't tidy them):
       A15-1   two displays, same sign (pair) · …0091 is the comfortable 64% case
       A15-2   battery 14% → orange, listed in Maintenance
       A16-1   …0112 battery 4% + weak Wi-Fi, last push never connected → red; Not confirmed; never connects (replace it)
       A16-2   pushed 2 min ago, still Waiting for wake
       AP1-1   produce corner pair, same sign
       AP1-2   produce corner pair, different signs · …0204 battery 9%
       AP3-2   battery 3% → red
       B3-2    …0145 woke but still showing the old sign → listed; re-waking fixes it
       GM102-4, GM102-5  portrait (can't be batched with landscape)
       A5-100, B3-100, H2-100  endcaps */
  const P = (n) => `assets/products/${n}.png`;
  const SG = {
    tomatoes: { type: "edlp", priceC: "212", uom: "lb", desc: "Tomatoes on the Vine", plu: "4664", img: P("tomatoes-on-vine") },
    oranges: { type: "rollback", priceC: "119", wasC: "129", uom: "lb", desc: "Navel Oranges", plu: "4013", img: P("navel-oranges") },
    bananas: { type: "edlp", priceC: "58", uom: "lb", desc: "Bananas", plu: "4011", img: P("bananas") },
    avocados: { type: "manager", priceC: "67", wasC: "97", uom: "ea", desc: "Hass Avocados", plu: "4225", img: P("hass-avocados") },
    pumpkins: { type: "clearance", priceC: "212", wasC: "348", uom: "lb", desc: "Pie Pumpkins", plu: "3134", img: P("pie-pumpkins") },
    apples: { type: "rollback", priceC: "147", wasC: "198", uom: "lb", desc: "Red Delicious Apples", plu: "4016", img: P("red-delicious-apples") },
    avocadosEdlp: { type: "edlp", priceC: "88", uom: "ea", desc: "Hass Avocados", plu: "4225", img: P("hass-avocados") },
    orangesEdlp: { type: "edlp", priceC: "98", uom: "ea", desc: "Navel Oranges", plu: "4013", img: P("navel-oranges") },
  };
  // [serial, zone, aisle, section, orient, sign, pushed min ago, battery %, rssi dBm, last seen min ago, extra]
  const FLEET_5624 = [
    ["EGDA0091", "A", "15", "1", "landscape", "tomatoes", 600, 64, -58, 9],
    ["EGDA0140", "A", "15", "1", "landscape", "tomatoes", 600, 71, -61, 9],
    ["EGDA0107", "A", "15", "2", "landscape", "oranges", 600, 14, -66, 9],
    ["EGDA0112", "A", "16", "1", "landscape", "bananas", 30, 4, -86, 2880, { behavior: "silent" }],
    ["EGDA0118", "A", "16", "2", "landscape", "avocados", 2, 40, -74, 1440, { pending: true }],
    ["EGDA0150", "A", "5", "100", "landscape", "orangesEdlp", 1300, 82, -60, 1299],
    ["EGDA0201", "AP", "1", "1", "landscape", "bananas", 700, 90, -57, 699],
    ["EGDA0202", "AP", "1", "1", "landscape", "bananas", 700, 88, -59, 699],
    ["EGDA0203", "AP", "1", "2", "landscape", "avocadosEdlp", 700, 76, -63, 699],
    ["EGDA0204", "AP", "1", "2", "landscape", "oranges", 700, 9, -70, 699],
    ["EGDA0205", "AP", "2", "4", "landscape", "tomatoes", 700, 58, -62, 699],
    ["EGDA0206", "AP", "3", "2", "landscape", "pumpkins", 700, 3, -65, 699],
    ["EGDA0124", "B", "3", "1", "landscape", "pumpkins", 900, 52, -61, 899],
    ["EGDA0145", "B", "3", "2", "landscape", "apples", 40, 45, -68, 38, { stuck: true }],
    ["EGDA0151", "B", "3", "100", "landscape", "pumpkins", 900, 67, -71, 899],
    ["EGDA0131", "GM", "102", "4", "portrait", "apples", 900, 87, -55, 899],
    ["EGDA0153", "GM", "102", "5", "portrait", "bananas", 900, 79, -64, 899],
    ["EGDA0152", "H", "2", "100", "landscape", "avocados", 900, 73, -58, 899],
  ];
  const SEED = {};
  FLEET_5624.forEach(([serial, zone, aisle, section, orient, sign, ago, battery, rssi, seen, x = {}]) => {
    SEED[serial] = Object.assign({ zone, aisle, section, orient, ago, sign: SG[sign] }, x);
    DEVICES.push({ serial, siteId: "5624", battery, rssi, seen, behavior: x.behavior || "ok" });
  });
  /* Last check-in (battery, Wi-Fi strength) is reported each time a display connects. The app is never live with a display:
     it shows the last known values and how old they are. */

  const NOT_CONFIRMED_MIN = 7;   // no Wi-Fi connection this long after a push → Not confirmed
  const CONNECT_DEMO_SEC = 25;   // prototype only: a woken display "connects" this long after its push or fix
  const LOC_MAX = 2;             // displays allowed at one location

  /* ---------- session state (shared across pages) ---------- */
  const KEY = "engage-companion";
  let state;
  // localStorage, not sessionStorage: an installed app is closed and reopened all day; progress must survive that
  try { state = JSON.parse(localStorage.getItem(KEY)) || JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { state = {}; }
  state = Object.assign({ user: null, chainId: "WMT", siteId: null, flows: {} }, state);
  if (state.demo !== 2) { state.fleet = {}; state.removed = {}; state.checkins = {}; state.flows = {}; state.demo = 2; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } } // demo data reshaped in v0.8.0; saved at once so it runs only once
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } };

  const allSites = () => CHAINS.flatMap((c) => c.sites.map((s) => ({ ...s, chainId: c.id, chain: c.name })));
  const site = (id = state.siteId) => allSites().find((s) => s.id === id) || null;
  const signFont = () => { const s = site(); const c = s && CHAINS.find((x) => x.id === s.chainId); return (c && c.signFont) || ""; };

  /* a flow page (Install, Update Content, Replace / Remove, Maintenance) registers here:
     • the phone's back gesture steps back one step inside the flow (one history entry kept while the page is open)
     • on a Sent screen (finished), leaving the page any way clears the flow */
  /* to Home without piling up history: step back to it when Home is the page before, otherwise replace this entry */
  function toHome() {
    let fromHome = false;
    try { fromHome = !!document.referrer && new URL(document.referrer).pathname.endsWith("/" + PAGES.home); } catch { /* no referrer */ }
    if (fromHome) history.back(); else location.replace(PAGES.home);
  }
  // a page brought back from the browser's back/forward cache would show stale state: load it fresh
  addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });
  function flowPage(name, { back, finished, atStart }) {
    if (!history.state || !history.state.ecFlow) history.pushState({ ecFlow: 1 }, "");
    addEventListener("popstate", () => {
      // Sent: finish the flow and go Home without adding a history entry (so back from Home doesn't reopen it)
      if (finished()) { delete state.flows[name]; save(); return toHome(); }
      // first step: leave the flow for Home (progress kept)
      if (atStart()) { save(); return toHome(); }
      history.pushState({ ecFlow: 1 }, "");
      back();
    });
    addEventListener("pagehide", () => { if (finished()) { delete state.flows[name]; save(); } });
  }

  /* fleet for a site: seed + installs + pushes + fixes made in the app (kept on the phone) */
  function fleet(siteId = state.siteId) {
    const now = Date.now();
    const out = [];
    const removed = state.removed || {};
    DEVICES.filter((d) => d.siteId === siteId && SEED[d.serial]).forEach((d) => {
      const seed = SEED[d.serial];
      const base = { serial: d.serial, siteId, behavior: d.behavior, zone: seed.zone, aisle: seed.aisle, section: seed.section, orient: seed.orient, sign: seed.sign,
        pushedAt: now - seed.ago * 60000, connectedAt: seed.pending || seed.stuck || d.behavior === "silent" ? null : now - (seed.ago - 1) * 60000,
        stuck: !!seed.stuck, battery: d.battery, rssi: d.rssi, seenAt: d.seen != null ? now - d.seen * 60000 : null };
      out.push(Object.assign(base, (state.fleet || {})[d.serial] || {}));
    });
    Object.values(state.fleet || {}).forEach((d) => { if (d.siteId === siteId && !out.some((o) => o.serial === d.serial)) out.push(d); });
    return out.filter((d) => !removed[d.serial]).map((d) => {
      const r = Object.assign({}, d, { status: statusOf(d, now) });
      // prototype: a display that "connects" after a wake reports a fresh check-in (a new install reports a full battery)
      if (r.status === "updated" && r.woken && r.behavior !== "silent") {
        const at = r.pushedAt + CONNECT_DEMO_SEC * 1000;
        if (!r.seenAt || at > r.seenAt) Object.assign(r, { seenAt: at, battery: r.battery ?? 100, rssi: r.rssi ?? -60 });
      }
      // prototype: a fix in Maintenance (battery swapped, re-woken) reports in a little later
      const ck = (state.checkins || {})[r.serial];
      if (ck && now >= ck.at) { Object.assign(r, ck.patch, { seenAt: ck.at }); r.status = statusOf(r, now); }
      return r;
    });
  }
  /* Sent → Waiting for wake → Updated; Not confirmed once 7 min pass with no connection.
     A display that woke but still shows the old sign ("stuck") is never Updated. */
  function statusOf(d, now = Date.now()) {
    if (d.stuck) return "unconfirmed";
    if (d.connectedAt && d.connectedAt >= d.pushedAt) return "updated";
    if (d.behavior !== "silent" && d.woken && now - d.pushedAt >= CONNECT_DEMO_SEC * 1000) return "updated";
    return now - d.pushedAt >= NOT_CONFIRMED_MIN * 60000 ? "unconfirmed" : "waiting";
  }
  const STATUS = {
    waiting: { word: "Waiting for wake", cls: "pending" },
    updated: { word: "Updated", cls: "confirmed" },
    unconfirmed: { word: "Not confirmed", cls: "rejected" },
  };
  /* record a push (Install, Update, Replace). meta carries location/orientation for new displays */
  function recordPush(serials, sign, meta = {}) {
    state.fleet = state.fleet || {};
    const now = Date.now();
    serials.forEach((sn) => {
      const known = (DEVICES.find((d) => d.serial === sn) || {});
      const prev = fleet().find((d) => d.serial === sn) || {};
      state.fleet[sn] = Object.assign({ serial: sn, siteId: state.siteId, behavior: known.behavior || "ok" },
        prev, meta[sn] || {}, { sign: Object.assign({}, sign), pushedAt: now, connectedAt: null, woken: false, stuck: false });
      delete state.fleet[sn].status;
      if (state.checkins) delete state.checkins[sn];
      if (state.removed) delete state.removed[sn];
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
  /* prototype: after a fix, the display reports in CONNECT_DEMO_SEC later with these values (silent displays never do) */
  function expectCheckin(sn, patch) {
    const d = fleet().find((x) => x.serial === sn);
    if (!d || d.behavior === "silent") return;
    state.checkins = state.checkins || {};
    const prev = state.checkins[sn]; // a later fix adds to an earlier one that hasn't reported yet (re-wake, then battery swap)
    state.checkins[sn] = { at: Date.now() + CONNECT_DEMO_SEC * 1000, patch: Object.assign({}, prev && prev.patch, patch) };
    save();
  }
  /* take a display off its location (Remove, or the old one in a Replace) */
  function removeDisplay(sn) {
    state.removed = state.removed || {};
    state.removed[sn] = Date.now();
    if (state.fleet) delete state.fleet[sn];
    save();
  }
  const locKey = (d) => `${d.zone}${d.aisle}-${d.section}`;
  const atLocation = (key, siteId = state.siteId) => fleet(siteId).filter((d) => locKey(d) === key);

  /* ---------- Maintenance: problems the system can see (cleared when the display reports them fixed) ----------
     Battery low (15% or less) · Woke but didn't take its sign · Not confirmed. Weak Wi-Fi is not listed (nothing to fix in the field). */
  const ISSUE = {
    battery: { word: "Battery low", fix: "Swap the battery" },
    stuck: { word: "Woke but didn’t take its sign", fix: "Wake it again" },
    unconfirmed: { word: "Sign not confirmed", fix: "Wake it again" },
  };
  function issues(siteId = state.siteId) {
    const out = [];
    fleet(siteId).forEach((d) => {
      if (d.battery != null && d.battery <= 15) out.push({ type: "battery", d });
      if (d.stuck) out.push({ type: "stuck", d });
      else if (d.status === "unconfirmed") out.push({ type: "unconfirmed", d });
    });
    return out;
  }
  const locCode = (d) => `${d.zone}${d.aisle}-${d.section}`;

  /* ---------- last check-in: battery + Wi-Fi ----------
     Battery: 15% or less orange, 5% or less red. Wi-Fi (RSSI, dBm): below −76 is Weak (red); otherwise Good, Strong at −60 or better.
     Color is never alone: the number and the word always show. */
  const BATT_WARN = 15, BATT_BAD = 5;
  const battLevel = (p) => (p == null ? null : p <= BATT_BAD ? "bad" : p <= BATT_WARN ? "warn" : "ok");
  function wifiOf(rssi) {
    if (rssi == null) return null;
    if (rssi >= -60) return { bars: 4, word: "Strong", l: "ok" };
    if (rssi >= -68) return { bars: 3, word: "Good", l: "ok" };
    if (rssi >= -76) return { bars: 2, word: "Good", l: "ok" };
    return { bars: 1, word: "Weak", l: "bad" };
  }
  function ago(ts, now = Date.now()) {
    if (!ts) return "";
    const m = Math.round((now - ts) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} h ago`;
    return `${Math.round(h / 24)} days ago`;
  }
  const battIcon = (p) => `<svg viewBox="0 0 26 14" aria-hidden="true"><rect x="1" y="1" width="21" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="23" y="4.5" width="2.2" height="5" rx="1" fill="currentColor"/><rect x="3" y="3" width="${Math.max(1.5, 17 * Math.min(100, p) / 100).toFixed(1)}" height="8" rx="1.2" fill="currentColor"/></svg>`;
  const wifiIcon = (n) => `<svg viewBox="0 0 22 14" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<rect x="${i * 5.6 + 1}" y="${12 - (i + 1) * 3}" width="3.6" height="${(i + 1) * 3}" rx="1" fill="currentColor" opacity="${i < n ? 1 : 0.22}"/>`).join("")}</svg>`;
  /* battery + Wi-Fi readout; withAge adds "2 h ago" */
  function health(d, { withAge = false } = {}) {
    if (d.battery == null && d.rssi == null) return `<span class="health"><span class="note">No check-in yet</span></span>`;
    const bl = battLevel(d.battery), w = wifiOf(d.rssi);
    return `<span class="health">
      ${d.battery != null ? `<span class="hb" data-l="${bl}" aria-label="Battery ${d.battery}% at last check-in">${battIcon(d.battery)}${d.battery}%</span>` : ""}
      ${w ? `<span class="hw" data-l="${w.l}" aria-label="Wi-Fi ${w.word} at last check-in">${wifiIcon(w.bars)}${w.word}</span>` : ""}
      ${withAge && d.seenAt ? `<span class="note">${ago(d.seenAt)}</span>` : ""}
    </span>`;
  }

  /* ---------- navigation ---------- */
  const PAGES = { login: "login.html", site: "site.html", home: "home.html", install: "install.html", content: "content.html", battery: "battery.html", replace: "replace.html", maint: "maintenance.html", trouble: "troubleshoot.html" };
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
      // reload only when a new build replaces a running one; the very first install takes control quietly (no lost taps)
      const hadController = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
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

  window.EC = { BUILD, CHAINS, MODEL, DEVICES, SERIAL_LEN, fleet, statusOf, STATUS, recordPush, markWoken, expectCheckin, removeDisplay, locKey, atLocation, LOC_MAX, ISSUE, issues, locCode, BATT_WARN, BATT_BAD, battLevel, wifiOf, ago, health, NOT_CONFIRMED_MIN, state, save, site, allSites, signFont, flowPage, PAGES, go, guard, esc, haptic, I, header, bindHeader, sheet };
})();
