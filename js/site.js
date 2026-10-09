/* site.html — Location picker. Chain → search → radio list → Continue (disabled until a site in the current chain is picked).
   Home button shows only once a site exists to go home to. */
(function () {
  "use strict";
  const { state, save, site, go, guard, esc, I, CHAINS } = EC;
  if (!guard({ needSite: false })) return;

  let pick = state.siteId;
  let q = "";
  const chain = () => CHAINS.find((c) => c.id === state.chainId) || CHAINS[0];
  const hasSite = !!site();

  document.getElementById("app").innerHTML = `
    <main class="screen">
      <header class="topbar">
        <span class="spacer"></span>
        <h1>Select Site</h1>
        ${hasSite ? `<button class="icon-btn" id="go-home" aria-label="Home">${I.home}</button>` : `<span class="spacer"></span>`}
      </header>
      <div class="sites-body">
        <div>
          <h2 class="section-label"><label for="chain">Chain</label></h2>
          <div class="select-wrap">
            <select class="input" id="chain">
              ${CHAINS.map((c) => `<option value="${c.id}" ${c.id === state.chainId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
            </select>
            ${I.check}
          </div>
        </div>
        <div class="divider"></div>
        <div>
          <h2 class="section-label"><label for="site-q">Site</label></h2>
          <div class="search-wrap">
            ${I.search}
            <input class="input" id="site-q" type="search" placeholder="Search name, number, or city" autocomplete="off" />
          </div>
        </div>
        <ul class="site-list" id="site-list" aria-label="Sites"></ul>
      </div>
      <footer class="sites-foot">
        <button class="btn" id="site-continue" disabled>Continue</button>
      </footer>
    </main>`;
  document.getElementById("go-home")?.addEventListener("click", () => go("home"));

  const list = document.getElementById("site-list");
  const cont = document.getElementById("site-continue");

  function paint() {
    const needle = q.toLowerCase().replace(/^#/, "");
    const rows = chain().sites.filter((s) => !needle || `${s.name} ${s.id} ${s.city}`.toLowerCase().includes(needle));
    list.innerHTML = rows.length ? rows.map((s) => `
      <li>
        <label class="site-row">
          <input type="radio" name="site" id="site-${esc(s.id)}" value="${esc(s.id)}" ${s.id === pick ? "checked" : ""} />
          <span class="radio" aria-hidden="true"></span>
          <span class="site-meta">
            <span class="site-name">${esc(s.name)}</span>
            <span class="site-sub"><span>${esc(s.city)}</span><span class="site-id">${esc(s.id)}</span></span>
          </span>
          <span class="site-count"><b>${s.displays}</b>displays</span>
        </label>
      </li>`).join("") : `<li class="empty">No sites match “${esc(q)}” in ${esc(chain().name)}.</li>`;
    cont.disabled = !chain().sites.some((s) => s.id === pick);
  }

  document.getElementById("chain").addEventListener("change", (e) => { state.chainId = e.target.value; save(); paint(); });
  document.getElementById("site-q").addEventListener("input", (e) => { q = e.target.value.trim(); paint(); });
  list.addEventListener("change", (e) => { if (e.target.name === "site") { pick = e.target.value; paint(); } });
  cont.addEventListener("click", () => {
    if (pick !== state.siteId) state.flows = {}; // in-progress work belongs to the old site
    state.siteId = pick;
    go("home");
  });
  paint();
})();
