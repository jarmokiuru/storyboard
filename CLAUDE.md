# Project note for Claude

Read this first in every session, then `SPEC.md`. Update the **Decisions** and **Status** sections at the end of every session that changes something.

## What this is
An offline storyboard app for Jarmo Kiuru, a cinematographer, modelled on Wonder Unit's Storyboarder. Installed from GitHub Pages to his iPad home screen. Full requirements: `SPEC.md`.

## Talking to Jarmo
- Open with the point in plain language, 1–2 sentences, saying what it means for him. Then the reasoning, short.
- Film and cinematography terms are fine. Avoid programming terms, or explain each in everyday words the first time.
- One idea per sentence. No preamble, no flattery.
- Flag wrong premises directly. Mark what is verified, inferred or unverified.
- He tests on the iPad. After each change, tell him exactly what to try and what he should see.
- Chat in English unless he writes in Finnish.

## Standing rules
- **Offline first.** No network requests at runtime except the update check. Every library is vendored in `vendor/` with its licence noted in `vendor/LICENSES.md`.
- **No project data in the repository.** Boards live on his devices only. `samples/` holds generic test material only.
- **Never write his `Shot List.xlsx` or `Breakdown.xlsx`.** The app exports a separate shot data sheet; merging is done elsewhere.
- **Re-imports merge, never wipe.** Drawings and 3D data survive any import.
- **Two test machines:** iPad Air 11-inch (M3) in Safari and the 2017 MacBook Pro (dual-core Intel i5, macOS 13.7). If it is slow on the Mac, it is a bug.
- **Storyboarder's main repository has no licence file** — copy its ideas and layout, not its code or data. The model library (`wonderunit/shot-generator-models`) is MIT and may be used.
- Bump the version number shown in the app with every change Jarmo will test, and add a line to `CHANGELOG.md`.
- Keep files small and named plainly so a later session can find things.

## Decisions (do not change without asking)
- 2026-10-23 — Model the tools, functions and UI on Storyboarder as closely as practical.
- 2026-10-23 — Must work with no signal (planes, locations). Installed web app + offline cache.
- 2026-10-23 — Contact-sheet PDF with adjustable boards per page.
- 2026-10-23 — Pencil drawing on top of any frame, including 3D renders.
- 2026-10-23 — No animatics for now.
- 2026-10-23 — Scene headings come from his Breakdown.xlsx (pasted script as fallback); boards carry `Kuva #` from Shot List.xlsx.
- 2026-10-23 — One floor plan per location, used both for the 3D set and as a Shot Designer background; each plan tagged measured / traced / assumed.
- 2026-10-23 — Test with the generic kitchen in `samples/`, not a real production.
- 2026-10-23 — Moving work between devices is by exported project file, not live sync.
- 2026-10-23 — Line weight comes from tilt and stroke speed (his Apple Pencil (USB-C) has no pressure). If a pen reports varying pressure (e.g. a Pencil Pro), use pressure automatically, no setting needed.

## Status
- 2026-10-23 — Spec written.
- 2026-10-23 — Phase 1 pencil test built (`pencil-test/`, v0.1.0) on branch `phase-1-pencil-test`. Checked in a desktop browser with simulated Pencil input: pressure width, tilt shading and palm rejection work. Not yet checked: real Apple Pencil, offline copy (the test browser blocks it), home-screen mode. Needs GitHub Pages switched on (Settings → Pages → main, root). Home-screen exemption from Safari's 7-day storage deletion: inferred from WebKit statements (2020) and a WebKit bug comment (2021), no formal Apple doc found; the page shows whether storage is promised. Safari 18.2+ gives extra Pencil samples between frames; those samples lack pointer IDs, so the code reads them from the parent event. Now live on GitHub Pages and merged to main.
- 2026-10-23 — iPad results (Safari 27.0.1, reports a Mac user agent): Pencil sends ~250 samples/s; input delay 3–4 ms (to the page only, not to the pixels); tilt reads 6°–68°; palm rejection worked (16 and 27 touches ignored); offline copy saved; prediction feels good. Storage promised as a home-screen app, not promised as a Safari tab — so the app must run from the home screen. **Pressure stuck at 0.30 in both modes**: Jarmo uses an Apple Pencil (USB-C). Verified on apple.com/apple-pencil (2026-10-23): no pressure sensitivity; has tilt sensitivity and hover. Safari reports a fixed 0.30 for it. Line-weight decision recorded above. Next: phase 2.
