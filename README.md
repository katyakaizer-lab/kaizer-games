# Kaizer Games

Spanish language games for children and adults together. A static, phone-first web app (PWA): no accounts, no backend, no ads, no tracking, nothing leaves the device.

**Status: stage 1 (design system and style-test page).** Stage 2 (hub, pet picker, Constelaciones) starts after approval.

## Commands

```bash
npm install
npm run dev          # local dev server
npm run build        # all checks, then build to dist/ and write dist/build-report.md
npm test             # Vitest: logic tests and a smoke test of every screen
npm run reskin:test  # re-skin acceptance test (see RESKIN.md)
npm run preview      # serve dist/ locally
```

## Layout

```
public/tokens.css        the only file with colours and fonts (served as-is)
public/assets/           art by id: manifest.json, pets/ (+ rig.json), pet-items/, objects/, scenes/, characters/, ui/, backgrounds/
public/fonts/            self-hosted woff2 (copied from @fontsource at build)
src/ui/                  component library, art helper, icons, contrast and font tests
src/pets/                pet loader (shared rig, mood fallback, item placement)
src/app/                 boot, settings, background, service worker registration
src/data/                storage (localStorage + memory fallback, save/load progress file), content data
src/i18n/                UI strings: en (complete), es, ru (partial; fall back to English per key)
src/games/, src/audio/   stage 2
src/style-test/          the style-test page
tools/                   build checks and the build report
tests/                   Vitest
licenses/, LICENCES.md   licence texts and log
docs/                    planning documents (kept locally, not in the repository)
```

## Decisions worth knowing

- **No UI framework.** Plain TypeScript with a tiny `h()` helper keeps the bundle small (first screen about 170 KB).
- **`tokens.css` lives in `public/`**, not in the bundle, so a re-skin can be done even on a built site, and the font `@font-face` rules live there too. That way font names appear in exactly one file.
- **Semantic tokens.** Components read `--bg`, `--surface`, `--text`, `--primary` and so on. Each theme maps its palette to them. That is what lets the night theme (and any future theme) work with no component changes.
- **Semantic token names are accepted** (2026-11-17). `claude-code-design-system-prompt.md` (kept in `docs/`) and `RESKIN.md` use the same names as the code.

## Open items

- **Russian headings.** The Russian interface comes later. Caveat Brush has no Cyrillic, so until a Cyrillic heading font is chosen, Russian headings fall back to the next font in `--font-head`. Body text (Nunito) already includes Cyrillic. Decide the heading font when the Russian interface is built.
- Still open from the brief: pacing of unlocks, who draws the final art, a licensed Spanish word list.
- **`src/app/`** was added next to the folders in the brief for start-up code shared by every page.
