# HAUNT THE ROOM: style bible (L9 ART)

One hand, one palette, one light logic across every file. Painterly gothic illustration at premium game key-art
quality: it must read as a shipped game on a projector and at thumbnail size on a phone.

## Palette (hex; prompts and placeholders use only these)

| Role | Hex | Use |
|---|---|---|
| Ink | `#05060f` | deepest silhouettes (never pure black) |
| Night indigo | `#0b0d24` `#161a3f` `#232a5c` | sky, wall shadows, the dominant family |
| Teal shadow | `#0e2a33` `#17414a` `#2a6670` | floors, stone, cool shadow side |
| Moonlight | `#cfe0ff` | cool highlights through windows and from above only |
| Candle amber | `#ffb347` `#ffd27a` | warm key light, pooled low near the floor |
| Ember | `#ff7a2f` | the hot core of flames and coals |
| Ghost cyan | `#7af0ff` | spirits, magic, the only saturated cool accent |
| Blood red | `#b3122e` `#e0213f` | rare danger accent: glass, wax seals, the finale |

Hunter light colours come from `contract/protocol.ts` HUNTERS: exorcist `#ffd27a`, medium `#b18cff`,
skeptic `#7ad7ff`, priest `#ff8a7a`.

## Room signature colours (contract ROOM_STYLE; the game frames each room in it)

Each painting carries its room's colour in its light and props so the frames feel designed: attic crimson red,
nursery cornflower blue, library gold, ballroom emerald green (no red curtains), chapel violet, crypt teal.

## Dither-safe (owner: a dither post-process, lane L14, runs over everything)

Bold, simple shapes and big clear value masses with strong light/shadow contrast; no reliance on fine detail,
thin lines or subtle gradients.

## Light

- Two sources, always: cool moonlight from a window or from above-left, warm candle pools low in the room.
- Shadows are indigo and teal, never grey. Highlights are warm except where moonlight touches.
- Dark overall: most of every room sits below a quarter of full brightness, so cyan wisps (`#7af0ff`) and the
  stage UI pop on top. The brightest values in a room are its candles and its window.
- Cinematic: volumetric moon shafts, dust motes, soft bloom on flames, a gentle vignette.

## Surface

- Soft painterly edges, visible brush texture, lost-and-found edges. No hard vector outlines, no photo
  realism, no 3D-render plastic, no anime faces, no neon cyberpunk.

## Rooms (1536x1024)

- Front-facing at eye level, one-point perspective, like a dollhouse cross-section: back wall parallel to the
  picture plane, the floor a band across the bottom quarter, the ceiling at the top, side walls cropped by the
  frame edges. The room fills the frame edge to edge: no exterior, no frame, no border.
- One hero prop silhouette at the centre-back that reads at 200 px wide; the centre of the floor stays open
  (the wisps gather there).
- No people, no ghosts, no text, no letters, no logos.

## Sky (2560x1440)

- Moon in the upper-left third, torn clouds lit at their edges, faint diagonal rain, a few stars. Darkest at the
  centre and bottom where the mansion stands. Low fog at the bottom edge, no buildings.

## Hunters (transparent PNG, about 1024 tall)

- Full body, standing, three-quarter front view, feet at the bottom, silhouette-first: dark clothing, a shape
  that reads at 48 px tall, rim-lit by the light source each one holds, in that hunter's colour.
- Exorcist: long storm coat, wide-brimmed hat, a brass storm lantern raised high (amber).
- Medium: flowing layered shawls and a fringed headscarf, a glowing crystal orb in both hands (violet).
- Skeptic: lean, tall, in a fitted coat with brass goggles pushed up, an electric flashlight beam (cyan-blue).
- Priest: long cassock, round wide-brimmed priest hat, a swinging censer with coral-red embers and smoke.

## Emblem and glow

- title: a sigil, no words: a wrought-iron ring of thorns around a keyhole that burns ghost cyan, a crescent
  moon behind, one blood-red gem. Transparent background, readable at 40 px.
- wisp: procedural, a white-hot core with a soft falloff to transparent, so the stage can tint it per ghost.

## Never

Text, letters, numbers, watermarks, signatures, frames or borders, gore, real people, people in rooms, pure black
or pure white areas (except the wisp core), cartoon flatness, photo realism.

## Source of truth

Every generation prompt is built in `art/prompts.ts` from one shared style prefix; `art/gen.ts` only calls it.
