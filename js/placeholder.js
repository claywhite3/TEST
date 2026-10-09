/* install.html / content.html / troubleshoot.html — placeholders until each flow is built. Flow key comes from <body data-flow>. */
(function () {
  "use strict";
  const { guard, I, header, bindHeader, go } = EC;
  if (!guard()) return;

  const key = document.body.dataset.flow;
  const F = {
    install: { kicker: "Deploy", title: "Install", desc: "Mount, power, pair, and place a new display.", bg: "var(--card-install)", tint: "var(--tint-install)" },
    content: { kicker: "Manage", title: "Update Content", desc: "Choose what shows, push it, confirm the screen changed.", bg: "var(--card-content)", tint: "var(--tint-content)" },
    trouble: { kicker: "Diagnose", title: "Troubleshoot", desc: "Blank, stale, or offline.", bg: "var(--card-trouble)", tint: "var(--tint-trouble)" },
  }[key];

  document.getElementById("app").innerHTML = `
    <main class="screen">
      ${header({ home: true })}
      <div class="flow-body" style="--tint:${F.tint}">
        <div class="flow-hero" style="background:${F.bg}">${ECArt.home[key]()}</div>
        <span class="kicker" style="font:700 11px/1 var(--f-body);letter-spacing:.14em;text-transform:uppercase;color:var(--tint)">${F.kicker}</span>
        <h2>${F.title}</h2>
        <p>${F.desc}</p>
        <span class="pending-tag">Flow not built yet · Designed → No</span>
        <button class="btn ghost" id="back-home">${I.home.replace("<svg", '<svg style="width:18px;height:18px"')} Back to Home</button>
      </div>
    </main>`;
  bindHeader();
  document.getElementById("back-home").addEventListener("click", () => go("home"));
})();
