/* home.html — four tasks in three equal rows. No home button here: this page is home. */
(function () {
  "use strict";
  const { state, site, go, guard, esc, I, header, bindHeader, BUILD } = EC;
  if (!guard()) return;

  const FLOWS = {
    install: { page: "install", kicker: "Deploy", title: "Install", desc: "Mount, power, pair, and place a new display." },
    content: { page: "content", kicker: "Manage", title: "Update Content", desc: "Choose what shows, push it, confirm the screen changed." },
    replace: { page: "replace", kicker: "Replace", title: "Replace / Remove" },
    maint: { page: "maint", kicker: "Maintain", title: "Maintenance" },
  };

  // Maintenance shows how many problems the system can see at this site
  const nIssues = EC.issues().length;

  function card(key, major) {
    const f = FLOWS[key];
    const art = ECArt.home[key === "maint" ? "trouble" : key]();
    if (major) {
      return `<button class="action major" data-flow="${key}">
        <span class="copy">
          <span>
            <span class="kicker">${f.kicker}</span>
            <span class="title" style="display:block">${f.title}</span>
            <span class="desc" style="display:block">${f.desc}</span>
          </span>
          <span class="go">Start ${I.arrow}</span>
        </span>
        <span class="art" aria-hidden="true">${art}</span>
      </button>`;
    }
    return `<button class="action minor" data-flow="${key}">
      ${key === "maint" && nIssues ? `<span class="resume-chip">${nIssues} to fix</span>` : ""}
      <span class="kicker">${f.kicker}</span>
      <span class="art" aria-hidden="true">${art}</span>
      <span class="label-row"><span class="title">${f.title}</span>${I.arrow.replace("<svg", '<svg style="width:18px;height:18px;color:var(--tint);flex:none"')}</span>
    </button>`;
  }

  const s = site();
  document.getElementById("app").innerHTML = `
    <main class="screen">
      ${header({ home: false })}
      <section class="home-head">
        <span class="hello">Hello ${esc(state.user.first)}</span>
        <h2>${esc(s.name)}</h2>
        <span class="sub"><span>${esc(s.chain)} · ${esc(s.city)}</span><span>${s.displays} Engage Displays</span></span>
      </section>
      <nav class="actions" aria-label="Tasks">
        ${card("install", true)}
        ${card("content", true)}
        ${card("replace", false)}
        ${card("maint", false)}
      </nav>
      <div class="home-foot"><div class="build-stamp">${esc(BUILD)} · ${esc(s.id)}</div></div>
    </main>`;
  bindHeader();
  document.querySelectorAll(".action").forEach((el) => el.addEventListener("click", () => go(FLOWS[el.dataset.flow].page)));
})();
