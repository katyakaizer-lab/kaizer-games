# Re-skin guide

Everything visual in Kaizer Games comes from three places. Change these and the whole app changes look, with no code edits.

| What | Where | Notes |
|---|---|---|
| Colours, fonts, font files, spacing, radii, motion | `public/tokens.css` | The only file with colour values or font names. Served as-is, so it can even be edited after a build. |
| Pictures | `public/assets/**` | Referenced by id through `public/assets/manifest.json`, never by path. |
| Which picture an id means | `public/assets/manifest.json` | Add or change entries here. |

## How to re-skin

1. **Colours.** Edit the palette block of the theme in `public/tokens.css` (`--paper`, `--forest`, `--mint` …). Components read only the *semantic* tokens below it (`--bg`, `--surface`, `--text`, `--primary` …), so a palette change flows through everywhere.
2. **Fonts.** Put the new `.woff2` files in `public/fonts/`, change the `@font-face` blocks and the `--font-head` / `--font-body` line in `public/tokens.css`. Keep the font's licence in `licenses/` and add it to `LICENCES.md`.
3. **Pictures.** Drop a new file over the old one with the same name (for example `public/assets/pets/cat-calma.svg`), or add a new file and point the id at it in the manifest. Set `"status": "final"` when the art is final. If the art was made with an AI image tool, set `"aiGenerated": true` and fill in `source.tool`, `source.date`, `source.terms` and `source.prompt`.
4. **Painted frames.** `ui.frame.card` is a nine-slice image (`nineSlice.slice` is the corner size in image pixels, `nineSlice.width` the border width on screen). List the themes it suits in `themes`; in any other theme the plain CSS frame is used.
5. **New theme.** Copy the `:root[data-theme="brote"]` block, rename it, and set every semantic token. Add the new theme to nothing else: the contrast check picks it up automatically.
6. Run `npm run build`. The build fails if anything breaks the rules below.

## What the build checks

- `check-contrast`: every text/background pair that components use (listed in `tools/contrast-pairs.json`) is at least 4.5:1 for body text and 3:1 for icons, lines and large text, in every theme.
- `check-hardcoded`: no colour value or font name appears in `src/` or the HTML pages. (The style-test page's live token panel is the one allowed exception.)
- `check-fonts`: the heading and body fonts are self-hosted `woff2` with `font-display: swap`, and their character ranges cover `¿¡ áéíóúü ñ ÁÉÍÓÚÜ Ñ` (and Cyrillic for body text).
- `check-art`: ids are unique, every file exists, AI art has its provenance logged, every pet has the `calma` fallback mood, and **no SVG contains text** (raster images are listed for a by-eye check).
- The style-test page also runs a live `document.fonts` test in the browser and shows the result.

## Acceptance test (done, repeatable)

```bash
npm run reskin:test
```

This copies the project to a temporary folder and applies `reskin-demo/`:

- `tokens.css`: lilac paper, plum instead of forest green, *Patrick Hand* instead of Caveat Brush for headings,
- three swapped files: a pet (`pets/brote-alegria.svg`), a background (`backgrounds/paper.svg`) and a frame (`ui/frame-card.svg`),
- the new font files (`fonts/patrick-hand-*.woff2`).

It then proves that **nothing else changed** (it compares file hashes and fails if any other file differs, and fails if anything under `src/` differs), runs the full build with every check above, and writes the re-skinned site to `dist-reskin/`.

Result on 2026-11-17: pass. Changed files were exactly `public/tokens.css`, the three assets and the two font files. Contrast 40/40 pairs, fonts covered, 0 hard-coded values, all 28 art ids resolve.

## Rules for new art

- Text never lives inside an image. All Spanish and all UI words are real text.
- Layouts must not depend on the placeholder art's look: images sit in fixed slots and are contained, so any aspect ratio fits.
- Pets keep the shared rig: canvas 200 × 240, layer ids `shadow`, `body`, `head`, `eyes`, `mouth`, anchors and head width in `public/assets/pets/rig.json`.
- Pet items are transparent images on the same 200 × 240 canvas, drawn for a head width of 100. In the manifest give `anchor` (one of `head-top`, `face`, `neck`, `back`, `feet`, `top-extra`), `pivot` (the point in the item canvas that sits on the anchor) and `z` (stacking order).
- No recognisable characters, brands or lookalikes of famous apps or pets.
