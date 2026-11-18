# Kaizer Games

Spanish language games for children and adults together. A static, phone-first web app (PWA): no accounts, no backend, no ads, no tracking, nothing leaves the device.

**Status: stage 2 plus Solitario de categorías.** Games: Constelaciones (four modes, four stories), Solitario de categorías (34 concrete categories in 4 levels). Live preview: https://katyakaizer-lab.github.io/kaizer-games/ (every push to `main` runs the tests, builds and deploys).

## Commands

```bash
npm install
npm run dev          # local dev server
npm run build        # all checks (contrast, hard-coded values, fonts, art, Constelaciones data), build to dist/, write dist/build-report.md
npm test             # Vitest: logic, validator, smoke test of every screen (happy-dom and a real Chrome/Edge at 360 and 375px)
npm run validate     # check the Constelaciones sentences only
npm run reskin:test  # re-skin acceptance test (see RESKIN.md)
npm run preview      # serve dist/ locally
```

Node 22.18 or newer (the validator is TypeScript run directly by Node). The browser smoke test uses the Chrome or Edge already on the machine; set `CHROME_PATH` if it is somewhere unusual.

## Layout

```
public/tokens.css             the only file with colours and fonts (served as-is)
public/assets/                art by id: manifest.json, pets/ (+ rig.json), pet-items/, objects/, scenes/, characters/, ui/, backgrounds/
public/audio/                 (optional) Katya's recordings: <constellation id>.mp3 and <id>-slow.mp3
public/fonts/                 self-hosted woff2 (copied from @fontsource at build)
src/main.ts, src/app/         boot, hash router, hub screens (picker, home, settings), pet state and mood, settings
src/ui/                       component library, art helper, icons, contrast and font tests
src/pets/                     pet loader (shared rig, mood fallback, item placement)
src/audio/                    soft pentatonic sounds (Web Audio), speech (recordings or a Spanish device voice)
src/data/                     storage, games.registry.json, content data (constelaciones/sample-sentences.json)
src/games/constelaciones/     the game: sentence logic, validator rules, seeded layouts, board, "Ilumina la frase", map, modes/
src/games/solitario/          sorting engine (also meant for Dos buzones), validator rules, screens
src/data/solitario/           Solitario categories by level (every JSON file in the folder is loaded)
src/i18n/                     UI strings: en and es complete, ru partial (falls back to English per key)
src/style-test/               the style-test page
tools/                        build checks, validator, build report, re-skin test
tests/                        Vitest
licenses/, LICENCES.md        licence texts and log
docs/                         planning documents (kept locally, not in the repository)
```

## Adding things

- **A game:** add an entry to `src/data/games.registry.json`. While it is `"pronto"` it shows as coming soon. When it is playable, create `src/games/<id>/index.ts` exporting `mount(el, ctx)`; the hub finds it by id and loads it only when opened.
- **Constellations and stories:** add them to `src/data/constelaciones/sample-sentences.json` (or a new file in that folder). The build fails if a rule is broken; unreviewed items are counted in the build report and marked "Sin revisar (dev)" when the app runs with `?dev`.
- **A Constelaciones mode:** one new file in `src/games/constelaciones/modes/` that implements `Mode` and reuses the board, the light stage and the finish panel; then add it to `MODES` in `index.ts`.
- **Solitario categories:** add them to `src/data/solitario/categories.json` with a `level`. Each has 3 to 8 cards (a game uses 4 to 6); a word may appear only once per level (the build fails otherwise). Use `avoid` for categories that must not be dealt together.
- **Recordings:** drop `public/audio/<id>.mp3` (and optionally `<id>-slow.mp3`). They are used instead of the device voice automatically.

## Decisions worth knowing

- **No UI framework.** Plain TypeScript with a tiny `h()` helper. First screen about 200 KB; Constelaciones loads only when opened (about 50 KB).
- **`tokens.css` lives in `public/`**, not in the bundle, so font names and colours appear in exactly one file.
- **Semantic tokens** (accepted 2026-11-17): components read `--bg`, `--surface`, `--text`, `--primary` and so on; each theme maps its palette to them. The hub uses the day theme `brote`; Constelaciones switches to `night` while it is open.
- **Pet mood timing:** `alegria` for 20 minutes after lighting a constellation; `siesta` ("Descansando") after 3 days without practice; otherwise `calma`. Both numbers are constants in `src/app/pet-state.ts`.
- **Story parts unlock in order** in every mode, not only in Cuentos, so the story always reads in order.
- **Al oído** goes straight to the finished sentence (no "Ilumina la frase"), since the point is listening; it counts as lighting the constellation.
- **Fantasma:** any lit constellation can be practised from memory, but only a due one moves to the next interval. "Ver otra vez" is counted as a hint and never changes the schedule.
- **Translation** is shown in English when the interface is in English or Spanish, and in Russian when it is in Russian.
- **"Ilumina la frase":** tapping a word toggles its capital. Words that may need an accent are marked and open a small row with the capital toggle and the accent options (shuffled), so one tap never does two things.
- **Sound** is off by default and offered once, when Constelaciones is first opened.

### Solitario de categorías

- Mechanics follow Katya's reference (a word-association solitaire); the look is our own (`mesa` card-table theme in tokens.css, plain small word cards, our own card back). No crown, ribbon or other graphics from that app.
- Layout follows Katya's card-layout mockup v4. Top bar: back, the level title ("A2 · Nivel 2") and the translation toggle. Status row one card high: moves on the left; the turned-over card and the deck (with how many cards are left) on the right, and up to two cards under the turned-over one show their word vertically along the edge. One row of category slots. The columns. A bottom bar with Pista, Deshacer and Reiniciar (60px buttons with labels; no counts, coins or limits on them).
- Each column is dealt face-down cards (`down` per level in categories.json, 2 for A1 to B1 and 3 for B2) with one face-up card on top. When the top face-up card leaves, the next one turns face up (a short flip, none with reduced motion). Face-down cards are never tappable, show a 16px strip (`--down-peek`), and undo turns them back over. Face-up cards in a column are fully visible, 6px apart (`--stack-gap`); they overlap only if the column would pass the bottom bar, and a covered card always keeps its word visible.
- Columns per level come from the data (`levels`: A1 6, A2 5, B1 4, B2 4), at most 6 under 400px, one fewer per text-size step, and fewer still if a word does not fit. Card width = min(`--card-max` 72px, (screen - side padding - gaps) / columns), height = width x 1.36; one size for every card and slot. As many categories as columns. Sizes are in rem, so the largest text size makes cards and gaps bigger too.
- Cards have a white edge and a framed inner panel (category cards an amber edge, with the book icon and count in their own row). The Spanish word is 16px, shrinks to 13px, then wraps at a syllable (marked with soft hyphens by `syllables.ts`, Spanish rules, never between two vowels: toa-lla), 2 lines at most; category names may use 3. Never "…". `npm run build` lists words that do not fit a level's cards on a 375px phone (dist/build-report.md): today "abuela", "Granja" and "Cuerpo" make A1 use 5 columns instead of 6 on phones under about 390px.
- A filled slot has a label tab above it with the category name, the count at the top right and the last word placed in the middle. A placed category with no words yet shows the book icon, 0/N and its name. An empty slot is darker felt with a book icon.
- Each category is also a card (coloured frame, with how many words it needs). A category card in an empty slot opens it; then its words go on it. A complete category leaves the table and frees its slot.
- On the columns a card goes on any card of the same category (word or category card), or on an empty column; a run of one category moves together. Tap or drag; double-tap sends a card to its slot.
- You choose only a level. Each deal mixes that level's concrete topics, 4 to 6 words each. Words and category names have no articles.
- Moves are counted (every move and every turn of the deck). On the level screen the player can choose a move limit: no limit, 80, 65 or 50. Every deal is checked by a solver before it is shown, so it can always be won, within the limit if one is set. Running out is not a "game over": undo, keep playing without the limit, try the same deal again, or deal a new one. The level screen shows games won and the best (fewest) moves.
- A complete category leaves the table with a small burst of stars (skipped with reduced motion).
- A wrong move changes nothing; a short message says why (and screen readers hear every step). "Pista" shows where a chosen card goes, or with nothing chosen a good next move (or the deck).
- Translations are on by default at A1. Category cards are solid amber with a dark frame. Spanish from Spain (plátano, patata, nevera).

## Open items

- **Russian headings.** The Russian interface comes later. Caveat Brush has no Cyrillic, so until a Cyrillic heading font is chosen, Russian headings fall back to the next font in `--font-head`. Body text (Nunito) already includes Cyrillic.
- Still open from the brief: pacing of unlocks (the four item slots in the room are ready and empty), who draws the final art, hosting choice for the store versions, a licensed Spanish word list.
- All Constelaciones sentences and stories (66) and all Solitario categories (34) are `reviewed: false` until Katya checks them.
