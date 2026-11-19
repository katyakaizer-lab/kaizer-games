# Kaizer Games

Spanish language games for children and adults together. A static, phone-first web app (PWA): no accounts, no backend, no ads, no tracking, nothing leaves the device.

**Status: stage 2 plus Solitario de categorías and Crucigramas.** Games: Constelaciones (four modes, four stories), Solitario de categorías (34 concrete categories in 4 levels), Crucigramas (37 topics, 835 words in 4 levels). Stars are earned in every game. Pets: a creator with 5 species and 19 breeds built from parts. Live preview: https://katyakaizer-lab.github.io/kaizer-games/ (every push to `main` runs the tests, builds and deploys).

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
src/pets/                     pets built from parts: species.ts (data, profiles, descriptions, Sorpréndeme), markup.ts (the SVG from parts), compose.ts (loading, caching, items), geometry.ts and validate.ts; pets.ts is Brote, the mascot
src/data/pets/                one JSON per species (rig, breeds, swatches) and patterns.json
public/assets/pet-parts/      pet parts by species, shared parts and pattern overlays (made by tools/make-pet-parts.mjs)
src/audio/                    soft pentatonic sounds (Web Audio), speech (recordings or a Spanish device voice)
src/data/                     storage, games.registry.json, content data (constelaciones/sample-sentences.json)
src/games/constelaciones/     the game: sentence logic, validator rules, seeded layouts, board, "Ilumina la frase", map, modes/
src/games/solitario/          sorting engine (also meant for Dos buzones), validator rules, screens, card sizing
src/games/shared/             code shared by games (syllabify.ts: Spanish syllable breaks for wrapping words)
src/data/solitario/           Solitario categories by level (every JSON file in the folder is loaded)
src/games/crucigramas/        crossword engine (seeded grid generator, no-repeat word choice, hint limits, checking), validator rules, screen and keyboard
src/data/crucigramas/         levels.json (settings per level) and <level>/<topic>.json (words with Spanish clues, decorations)
src/games/shared/accents.ts   accent and ñ check ("¡Casi!") shared by games that take typed Spanish
src/rewards/                  stars: config.ts (all values), wallet.ts (earn, balance, spend for the later pet shop), show.ts ("+3 ★")
src/app/haptics.ts            short vibration (Capacitor Haptics later, navigator.vibrate on Android, nothing on iOS Safari)
public/assets/decor/          Crucigramas decorations (made by tools/make-decor.mjs)
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
- **Crossword topics:** one file per topic, `src/data/crucigramas/<level>/<topic>.json` (the file name is the id). At least 20 words, each one word in small letters with its accents and ñ, short enough for the level's grid, with 2 or 3 clues of different kinds: `def` (definition), `gap` (a sentence with `___` for the word), `syn` / `ant` (synonym / opposite) or `use` (what it is for or where it is); at most 70 characters, never containing the answer. `decor` names 4 to 6 objects and a border style (leaves, dots, stars, waves); run `node tools/make-decor.mjs` after adding objects (it draws them and updates the manifest). The build generates 30 puzzles per topic and fails if they do not come out full and within the level's grid size.
- **Recordings:** drop `public/audio/<id>.mp3` (and optionally `<id>-slow.mp3`). They are used instead of the device voice automatically.

## Decisions worth knowing

- **Pets** (Katya, 2026-11-19):
  - Pets are fully customisable: species, breed, colours, patterns, and later clothes, house and furniture.
  - The house will be a front-view room (like a dollhouse), not isometric.
  - Companions (later) are small living plant creatures in Brote's style that follow the pet. Brote is the app mascot and runs the shop; it is not a selectable pet.
  - Later: a second pet, with friendship between pets raised by snacks and play.
  - Stars are earned only in games and spent in the shop; never bought with money, never expire, never lost.
  - Snacks (later) are treats that raise cariño/amistad. Pets are never hungry, sad or sick, and nothing goes down while the learner is away.
  - Spanish item and breed names are shown without articles (Salchicha, Bufanda, Sofá).
- **Stars** (changed 2026-11-19, approved by Katya; this replaces "no coins / no shop"): every game awards stars, earned only by playing. They can be spent on pet items (the pet shop is a later step; the wallet already has `spend`), can never be bought, never expire and are never lost or taken away. No penalties, no "you will lose your stars" messages. Nothing is sold, no real money, no ads. The total shows on the home screen next to the pet. Values are in `src/rewards/config.ts`: Crucigramas 1 per word solved, +3 for finishing, +3 with Sin ayuda or +1 with Poca ayuda (hints never subtract); Solitario 1 per category, +3 for clearing the table; Constelaciones 2 per constellation lit. The wallet is part of progress (save/load to a file, reset).
- **Vibración** setting (on by default): a short vibration where the device supports it (Android browsers now, the store builds later through Capacitor); never with reduced motion.

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
- Each column is dealt face-down cards (`down` per level in categories.json, 2 for A1 to B1 and 3 for B2) with one face-up card on top. When the top face-up card leaves, the next one turns face up (a short flip, none with reduced motion). Face-down cards are never tappable, show a 16px strip (`--down-peek`), and undo turns them back over. A face-up card placed on another sits partly on top of it, like a real pile: card height x `--up-step` (0.6) lower, more for one card if its covered word needs it (2 lines), and less only when the column would pass the bottom bar, never so little that a covered word is hidden. Covered cards show their word at the top. Moved cards glide to their place (not with reduced motion).
- Columns per level come from the data (`levels`: A1 6, A2 5, B1 4, B2 4), at most 6 under 400px, one fewer per text-size step, and fewer still only if a word would not fit at all. Card width = min(`--card-max` 72px, (screen - side padding 8px - gaps 6px) / columns), height = width x 1.36; one size for every card and slot. As many categories as columns. Sizes are in rem, so the largest text size makes cards and gaps bigger too. On resize the cards take the new width and every word is fitted again.
- Cards have a 3px white edge and a framed inner panel (category cards an amber edge, with the book icon and count in their own row). Words are fitted to the inner panel (card minus edge, frame line and 1px padding): 16px down to 13px on one line; if still too wide, wrapped at a Spanish syllable (soft hyphens from `src/games/shared/syllabify.ts`, set with `-webkit-hyphens`/`hyphens: manual` so iOS Safari follows them) and again from 16px down until it fits in 2 lines; never below 11px. Category names try 2 lines first and may use 3. If a short card cannot hold a word and its translation, the word gets smaller, then the translation (down to 11px). After every render the game also checks each word as the browser actually draws it and shrinks or wraps it if needed, so a different font on a phone cannot cut a word off. Cards and words have no `overflow: hidden`: a misfit shows up in tests instead of being hidden, and never "…". `npm run build` lists, for 360, 375 and 390px phones, every word that wraps and any word that does not fit (dist/build-report.md); today all words fit.
- A filled slot has a label tab above it with the category name, the count at the top right and the last word placed in the middle. A placed category with no words yet shows the book icon, 0/N and its name. An empty slot is darker felt with a book icon.
- Each category is also a card (coloured frame, with how many words it needs). A category card in an empty slot opens it; then its words go on it. A complete category leaves the table and frees its slot.
- On the columns a card goes on any card of the same category (word or category card), or on an empty column; a run of one category moves together. Tap or drag; double-tap sends a card to its slot.
- You choose only a level. Each deal mixes that level's concrete topics, 4 to 6 words each. Words and category names have no articles.
- Moves are counted (every move and every turn of the deck). On the level screen the player can choose a move limit: no limit, 80, 65 or 50. Every deal is checked by a solver before it is shown, so it can always be won, within the limit if one is set. Running out is not a "game over": undo, keep playing without the limit, try the same deal again, or deal a new one. The level screen shows games won and the best (fewest) moves.
- A complete category leaves the table with a small burst of stars (skipped with reduced motion).
- A wrong move changes nothing; a short message says why (and screen readers hear every step). "Pista" shows where a chosen card goes, or with nothing chosen a good next move (or the deck).
- Translations are on by default at A1. Category cards are solid amber with a dark frame. Spanish from Spain (plátano, patata, nevera).

### Crucigramas

- Choices Katya made (2026-11-18): our own on-screen Spanish keyboard (no phone keyboard), accents required (Ó is not O; the keyboard has Ñ and a row of Á É Í Ó Ú Ü), puzzles generated from topics, clues in Spanish only. 2026-11-19: more topics and clue kinds, chosen and limited help, the "¡Casi!" window, decorations, stars, and a review of every word by level.
- 37 topics, 9 or 10 per level, 20 to 28 words each (`src/data/crucigramas/<level>/<topic>.json`):
  - A1: frutas, colores y formas, familia, animales, ropa, casa, cuerpo, los días y los meses, los números.
  - A2: verduras y comida, desayuno, bebidas, escuela, tiempo, transporte, ciudad, la compra y las tiendas, la rutina diaria.
  - B1: postres, accesorios, cocina, profesiones, deportes, música, aficiones, en el mercado, el trabajo.
  - B2: festividades, tapas, naturaleza, salud, tecnología, viajes, emociones, medio ambiente, sociedad y política, el carácter.
- Each word has 2 or 3 clues of different kinds (definition, a sentence with a gap, synonym or opposite, what it is for); a puzzle picks one at random. A puzzle places some words of one topic (A1 6, A2 7, B1 8, B2 9) on a grid of at most 10x10 (A1) to 11x12 (B2); every word crosses another and no letters touch by accident.
- Level review (2026-11-19, after Katya's test): every word was checked against its level (Instituto Cervantes curriculum and everyday frequency). Words too rare for their level were removed or moved (for example mosto, horchata, sidra, cava and granizado left A2; harder fruit and vegetables moved to the B1 "En el mercado"; C-level words such as nazareno, ofrenda, petardo, banderilla, salmorejo, fabada, acantilado and musgo left B2, and hojaldre, gominola, horquilla, bisutería, riñonera and ganchillo left B1). A test keeps them out.
- Before each crossword: the help level (Sin ayuda: no hint button; Poca ayuda: 1 letter per word; Ayuda normal: up to 2 letters per word, never more than a third of it; the last choice is the default) and the topic or "Sorpréndeme" (a topic not played recently; it goes round every topic before repeating). A hint writes one letter of the selected word; it never gives a whole word and there is no "solve" button. When a word's hints are used up the button says "Sin pistas para esta palabra".
- No repeats: the words of the last 5 puzzles of each topic are kept on the device; a new puzzle takes words not seen in those first, then the ones seen longest ago.
- Layout: top bar, decorations, the grid in its own container (cells 32 to 44px; a grid that still does not fit scrolls inside its container, with soft fades at the edges; the page never scrolls sideways), a slim border, then the clue list. Tapping a clue selects the word and scrolls the grid to it. Fixed at the bottom: the current clue (tap to switch across/down), Pista and Comprobar (icons in the top bar on short phones) and the keyboard. A physical keyboard works too.
- "¡Casi!": a letter that only lacks its accent or the tilde of ñ (O for Ó, N for Ñ) is not a mistake. A coral window near the square says "¡Casi! Falta la tilde: Ó" (or "¡Casi! Es Ñ") with a button to put the right letter; it closes on tap or after 4 seconds, with a short vibration. The check lives in `src/games/shared/accents.ts` for other games.
- Decorations: 4 to 6 small objects per topic and an ornament border (art ids `decor.<topic>.<object>` and `decor.border.<style>`, simple original silhouettes, placeholders), coloured by tokens, never behind letters or clue text, aria-hidden and not tappable; under 400px at most 2 objects.
- Finished: the help level and hints used ("Poca ayuda · 1 pista"), the stars earned, the grid and every word with its clue. A crossword in progress is kept per level ("Continuar"). `?dev` marks unreviewed topics "Sin revisar (dev)".

### Pets (stage 1: the creator)

- A pet is a profile: `{ id, species, breed, parts, colors: { fur1, fur2, fur3, eyes, nose }, pattern, name, createdAt }`, kept in `pets[]` with `activePetId` (a second pet needs no migration). Save files are now version 2; an older save (one `{ species, name }`) becomes a profile of that species' default breed with the same name, and stars and progress are untouched (also when an old file is loaded). Reset and save/load cover the new fields.
- Parts, not one drawing per breed: each species has a library of parts on the shared 200x240 rig (body, belly, head, ears, snout, tail, feet, wings, arms, horns), plus pattern overlays (manchas, rayas, manto, antifaz, parches, puntas) and two patterns that recolour parts (calcetines, pecho). A pattern file has one group per part (`<g data-on="body">`, `<g data-on="head">`); each group is drawn right after its part, clipped to that part's fur shapes, then the outline and details (muzzle, blush) go on top, so markings never cross an outline, never cover eyes, nose or beak, and never reach ears or wings unless the breed lists them in `patternOn`. Markings have no outline; spots have a soft edge. Fillable shapes carry classes coloured by CSS variables set on each pet (`--fur-1`, `--fur-2`, `--fur-3`, `--eyes`, `--nose`), so recolouring costs nothing; outlines stay ink, and the night-theme halo still applies. Moods swap only eyes and mouth; a missing mood falls back to calma. The pet is composed at runtime as inline SVG and cached. Every part is in the manifest as kind `pet-part` (placeholder, AI-generated, tool Claude).
- A breed is data: `src/data/pets/<species>.json` lists its parts, default colours, allowed patterns and rig adjustments (`headWidth`, anchor offsets). A breed whose name is a colour fixes or limits it: `lockedColors` (Gato Negro is always black, Urraca black and white; locked slots are not offered) and `colorChoices` (Zorro rojo, Zorro ártico, Cuervo, and the three dragons offer only their colour family). Siamés is colour points: light body, a darker oval on the muzzle, darker ears, paws and tail tip (`fur2`), always blue eyes; its colours step offers only the body shade and the points colour. Starting breeds: Perro (Salchicha, Pastor, Caniche, Labrador, Chihuahua), Gato (Atigrado, Siamés, Persa, Negro, Carey), Zorro (Rojo, Ártico, Fénec), Cuervo (Cuervo, Urraca, Búho), Dragón (Del bosque, De fuego, De agua). New parts: add them to `tools/make-pet-parts.mjs` and run it.
- The creator (first launch, and "Editar mascota" in Settings): Especie, Raza, Colores (swatches per slot, natural colours first, then a "Fantasía" row, and the pattern), Nombre (optional; the default is the breed name), with a large live preview that briefly shows its moods after a change (static with reduced motion). "Sorpréndeme" picks a breed, colours and pattern. Choices are native radio groups (keyboard arrows), tap targets are at least 44px, and the preview has a generated Spanish description such as "Perro salchicha, marrón con manchas blancas" (breed lowercase after the species, shown once when it equals the species: "Cuervo, negro"; a colour in the breed name is not repeated: "Gato negro con pecho blanco"; cards keep the capital). The pattern's colour is offered only once a pattern is chosen, so every colour picked is drawn and described. Editing changes only the look.
- Ready for later: clothing slots on the rig (head, face, neck, body, feet, back; the boina sits on every breed, scaled by its headWidth) and a smaller companion rig in `rig.json`. Not built yet: the shop, wardrobe, room editor, snacks, companions and the second pet.
- `npm run build` validates pets (`tools/validate-pets.ts`): required layers (shadow, body, head, eyes, mouth), every part id resolves, no floating parts (head, ears and tail touch or overlap the body or head; `src/pets/geometry.ts`), every pattern shape sits in a per-part group and, composed, inside a clipPath of that part, locked colours and choices are swatches matching the defaults, ink outlines stay visible on both themes' backgrounds (the day background and the night halo), default colours are swatches, breed names are unique and without articles. The style-test page has a "Mascotas" gallery: every breed in two colour sets, each with the boina.

## Open items

- **Russian headings.** The Russian interface comes later. Caveat Brush has no Cyrillic, so until a Cyrillic heading font is chosen, Russian headings fall back to the next font in `--font-head`. Body text (Nunito) already includes Cyrillic.
- The pet shop (spending stars on pet items) is the next step for rewards; the wallet is ready.
- Still open from the brief: pacing of unlocks (the four item slots in the room are ready and empty), who draws the final art, hosting choice for the store versions, a licensed Spanish word list.
- All Constelaciones sentences and stories (66), all Solitario categories (34) and all Crucigramas topics (37, 835 words with clues) are `reviewed: false` until Katya checks them.
