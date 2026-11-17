# Licence log

Keep this up to date whenever a font, icon set or picture is added. Licence texts are in `licenses/`.

## Fonts (self-hosted, no Google Fonts CDN)

| Font | Use | Source | Licence | File |
|---|---|---|---|---|
| Caveat Brush 400 (latin, latin-ext) | headings | npm `@fontsource/caveat-brush` 5.3.0 (from Google Fonts) | SIL Open Font License 1.1, verified in the package's LICENSE on 2026-11-17 | `licenses/caveat-brush-OFL.txt` |
| Nunito 400 and 700 (latin, latin-ext, cyrillic) | body | npm `@fontsource/nunito` 5.3.0 (from Google Fonts) | SIL Open Font License 1.1, verified 2026-11-17 | `licenses/nunito-OFL.txt` |
| Patrick Hand 400 (latin, latin-ext) | re-skin demo only (`reskin-demo/`) | npm `@fontsource/patrick-hand` (from Google Fonts) | SIL Open Font License 1.1, verified 2026-11-17 | `licenses/patrick-hand-OFL.txt` |

## Icons

| Set | Source | Licence | File |
|---|---|---|---|
| Tabler Icons (outline) | npm `@tabler/icons` 3.52.0 | MIT | `licenses/tabler-icons-MIT.txt` |

## Art

All art is original. Every entry is also in `public/assets/manifest.json` (the manifest is the source of truth; this table is the human-readable log).

| Id(s) | File(s) | Made by | Date | AI-generated | Status |
|---|---|---|---|---|---|
| `pet.{cat,dog,dragon,raven,fox}.{calma,alegria,siesta}` | `assets/pets/<pet>-<mood>.svg` (15 files) | Claude (vector code), original designs | 2026-11-17 | yes | placeholder |
| `pet.brote.{calma,alegria,siesta}` | `assets/pets/brote-<mood>.svg` | Claude, style-test mascot. The files carry C2PA provenance metadata. | 2026-11-17 | yes | placeholder |
| `pet-item.boina` | `assets/pet-items/boina.svg` | Claude | 2026-11-17 | yes | placeholder |
| `background.brote` | `assets/backgrounds/paper.svg` | Claude | 2026-11-17 | yes | placeholder |
| `ui.frame.card` | `assets/ui/frame-card.svg` | Claude | 2026-11-17 | yes | placeholder |
| `object.*`, `scene.house.room1` | none: generated vector placeholders drawn by code | code | 2026-11-17 | no | placeholder |
| App icon | `public/icons/icon.svg` and the PNGs made from it | Claude, simple original shape | 2026-11-17 | yes | placeholder |
| Re-skin demo art | `reskin-demo/assets/**` | Claude (recolour of Brote; new background and frame) | 2026-11-17 | yes | demo only |

"AI-generated: yes" here means the SVG code was written by Claude (Anthropic) on request. Terms: https://www.anthropic.com/legal/consumer-terms. In some countries raw AI output may not be protected by copyright; the human work around it (layout, edits, text, brand) is. Do not rely on the images alone as the product.

## Third-party code

Build and test tools (Vite, vite-plugin-pwa/Workbox, TypeScript, Vitest, happy-dom, sharp) are dev dependencies under their own open-source licences. Only Workbox's service-worker runtime (MIT) ships in the built site.
