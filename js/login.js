/* login.html — faked sign-in. Any valid-looking email + non-empty password works. Errors only on submit (principle 19). */
(function () {
  "use strict";
  const { state, save, site, go, esc, BUILD } = EC;
  if (state.user) { location.replace(site() ? "home.html" : "site.html"); return; }

  document.getElementById("app").innerHTML = `
    <main class="screen login">
      <div>
        <section class="login-hero">
          ${ECArt.home.hero()}
          <div class="brand">
            <div class="eyebrow">VusionGroup · Field</div>
            <h1>Engage Companion</h1>
            <p>Deploy, manage, and maintain Engage Displays.</p>
          </div>
        </section>
        <form class="form" id="login-form" novalidate>
          <div class="field">
            <label for="email">Work email</label>
            <input class="input" id="email" type="email" autocomplete="username" value="tech@example.com" />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input class="input" id="password" type="password" autocomplete="current-password" value="demo" />
          </div>
          <div class="form-error" id="login-error" role="alert"></div>
        </form>
      </div>
      <div class="login-foot">
        <button class="btn" type="submit" form="login-form">Sign in</button>
        <div class="demo-note">Demo sign-in. Any email and password work.</div>
        <div class="build-stamp">${esc(BUILD)}</div>
      </div>
    </main>`;

  document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const pw = document.getElementById("password").value;
    const err = document.getElementById("login-error");
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = "Enter your work email to sign in."; return; }
    if (!pw) { err.textContent = "Enter your password to sign in."; return; }
    const parts = email.split("@")[0].split(/[._-]+/).filter(Boolean);
    const name = parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(" ") || "Tech";
    state.user = { email, name, first: name.split(" ")[0], initials: ((parts[0] || "T")[0] + ((parts[1] || "")[0] || "")).toUpperCase() };
    save();
    go(site() ? "home" : "site");
  });
})();
