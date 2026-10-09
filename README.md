# Engage Companion

Reference app for deploying, managing, and maintaining Engage Displays. Static site, no build step.
This prototype is the source of truth for **behavior** (the experience). Engineering decides the implementation.

## Host on GitHub Pages
1. Put the contents of this folder at the root of the repo.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Open `https://<org>.github.io/<repo>/` on a phone.
   - Android (Chrome): Install app from the menu.
   - iPhone (Safari): Share → Add to Home Screen (the app shows this hint once).

HTTPS is required for the camera scanner and for offline use; GitHub Pages provides it.

## Offline
`sw.js` caches every file on first visit, so the app opens instantly and works with no signal.
Looking things up, filling in a sign, and the guides work offline. **Building the preview and Push Content need a connection**; the app says so and unlocks them when the connection returns.

## Releasing a new build (one rule, one bump)
Bump the version in all three places together:
- `BUILD` in `js/core.js`
- `VERSION` in `sw.js`
- every `?v=` tag in the HTML files

Phones pick up the new build on the next open and show **New version available · Reload**.
If you add a file, add it to `ASSETS` in `sw.js` or it won't be available offline.

## What's bundled
| Path | What | License |
|---|---|---|
| `fonts/figtree-*.woff2` | UI font; stand-in for Bogle on signs | SIL OFL 1.1 |
| `fonts/jetbrains-mono-*.woff2` | IDs, codes | SIL OFL 1.1 |
| `fonts/sign-price-*.woff` | TeX Gyre Heros (Helvetica-metric) for sign prices | GUST |
| `lib/zxing.min.js` | Barcode reading on iPhone (Android uses the built-in reader) | Apache-2.0 |
| `js/plu.js`, `data/plu-reference.csv` | Produce PLUs from the IFPS export | IFPS data |

Licensed Bogle: drop `Bogle-Bold.woff2` into `fonts/` and add it to `ASSETS` in `sw.js`.

## Prototype-only behavior
- Login is faked. Site and display data are fixtures in `js/core.js` (trap cases are deliberate; don't tidy them).
- The preview build is simulated (2.5–4.5 s). Add `?slowpreview` to a URL to see the 30-second timeout.
- A woken display "connects" 25 s after its push; display `EGDA0112` never does (shows Not confirmed after 7 min).
