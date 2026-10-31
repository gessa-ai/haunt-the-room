// Every generation prompt, built from one shared style (art/STYLE.md). art/gen.ts only sends these.
import type { HunterId, RoomId } from "../contract/protocol.ts"

// The owner runs a dither pass over everything (lane L14): bold masses and clear values survive it, fine detail does not.
const BOLD =
  "Bold, simple, readable shapes and large clear value masses with strong contrast between light and shadow; " +
  "favour big graphic forms over fine detail and busy texture."

/** The two ballroom candidates for the owner's taste gate; the chosen one becomes the style for every file. */
export const STYLES = {
  1: {
    label: "Cinematic painterly",
    look:
      "Rich digital oil painting at AAA video game concept-art quality: believable proportions and materials, deep " +
      "atmospheric perspective, volumetric god rays, glowing bloom on every flame, loose painterly brushwork with " +
      "soft lost-and-found edges.",
  },
  2: {
    label: "Storybook gothic",
    look:
      "Stylized storybook gothic gouache illustration at premium game quality: tall, elegant, slightly crooked " +
      "whimsical shapes, bold simple silhouettes and clear value groups that read at thumbnail size, textured gouache " +
      "and dry-brush strokes, soft painterly edges, a limited harmonious palette.",
  },
} as const
export type StyleId = keyof typeof STYLES

const PALETTE_LIGHT =
  "Palette: moonlit indigo and deep teal shadows, warm candle-amber light, small accents of ghostly cyan and blood " +
  "red. Two light sources: cool moonlight from a window or from above, and warm candlelight pooled low. Dark overall " +
  "with rich coloured shadows (never flat black), luminous highlights, dust motes in light shafts, a gentle vignette."

const NO_TEXT = "No text, no letters, no numbers, no signature, no watermark, no frame, no border."

const ROOM_FRAMING =
  "Front-facing view at eye level, symmetrical one-point perspective, the room shown like a dollhouse cross-section: " +
  "the back wall parallel to the picture plane, the floor a band across the bottom quarter, the ceiling at the top, " +
  "the side walls cut off by the frame edges. The room fills the entire frame edge to edge, no exterior visible. " +
  "The centre of the floor is open and empty. One hero prop at the centre back with a strong silhouette that reads " +
  "at thumbnail size. No people, no figures, no ghosts, no animals."

export const ROOM_CONTENT: Record<RoomId, string> = {
  attic:
    "A dusty attic under a steep timber A-frame roof with exposed rafters. A round window at the centre of the gable " +
    "wall pours a shaft of moonlight full of floating dust. Old leather steamer trunks stacked on the left with one lit " +
    "candle, a wooden rocking horse on the right, sheet-draped furniture, hat boxes, cobwebs between the beams.",
  nursery:
    "An abandoned Victorian nursery. A wooden crib at the centre back under a hanging star mobile, a tall arched window " +
    "with moonlight on the left, peeling damask wallpaper in faded indigo with curling strips, an open music box glowing " +
    "faintly on a small table on the right with a candle beside it, a few wooden toy blocks and a worn teddy bear on a shelf.",
  library:
    "A grand gothic library. Towering bookshelves fill the back wall up to the ceiling, a rolling ladder leans on the " +
    "shelves, a large carved stone fireplace at the centre with a crackling fire as the warm key light, a worn red rug, " +
    "a wingback armchair, scattered open books and a candelabra.",
  ballroom:
    "A grand abandoned ballroom. A huge crystal chandelier with lit candles hangs at the centre top, a black and white " +
    "checkered marble floor, tall arched windows full of moonlight, heavy emerald-green velvet curtains framing both sides, " +
    "gilded pilasters, dust and cobwebs.",
  chapel:
    "A small gothic chapel. A tall pointed stained-glass window at the centre back glowing mostly violet with touches of cyan and amber, an altar " +
    "with many lit candles beneath it, rows of wooden pews on both sides of an open central aisle, stone columns and " +
    "pointed arches.",
  crypt:
    "A vaulted stone crypt. Three round stone arches along the back wall, stone sarcophagi with carved lids with one at " +
    "the centre front, clusters of melted candles on the coffins and the floor, low teal mist across the stone floor, cobwebs.",
}

/** Each room's signature colour (contract ROOM_STYLE) runs through its painting so the coloured frames feel designed. */
const ROOM_SIGNATURE: Record<RoomId, string> = {
  attic: "Signature colour of this room: crimson red (red lacquered trunks, a red saddle on the rocking horse, a warm red cast in the shadows).",
  nursery: "Signature colour of this room: cornflower blue (blue wallpaper, blue moonlight, blue blankets).",
  library: "Signature colour of this room: rich gold (gold firelight, gilded book spines, golden glow).",
  ballroom: "Signature colour of this room: emerald green (emerald velvet curtains, green-tinged marble and gilding); no red curtains.",
  chapel: "Signature colour of this room: royal violet (violet-dominant stained glass, violet light on the stone).",
  crypt: "Signature colour of this room: deep teal (teal stone, teal mist, teal shadows).",
}

/** A room from text alone (the two ballroom candidates). */
export const roomPrompt = (style: StyleId, room: RoomId) =>
  `Interior painting for a haunted-house video game. ${ROOM_CONTENT[room]} ${ROOM_SIGNATURE[room]} ${ROOM_FRAMING} Style: ${STYLES[style].look} ${BOLD} ${PALETTE_LIGHT} ${NO_TEXT}`

/** A room that copies the chosen ballroom's style, sent to the edits endpoint with that ballroom as the reference. */
export const roomFromReferencePrompt = (room: RoomId) =>
  "Use the reference image only for its painting style, brushwork, colour palette, lighting and camera framing. " +
  `Paint a completely different room in exactly that style, framing and camera height: ${ROOM_CONTENT[room]} ` +
  `${ROOM_SIGNATURE[room]} Nothing from the reference room's furniture, floor pattern, chandelier, windows, curtains ` +
  `or green colour appears. ${ROOM_FRAMING} ${BOLD} ${PALETTE_LIGHT} ${NO_TEXT}`

export const skyPrompt = (style: StyleId) =>
  "Wide night sky, the painted backdrop of a haunted-house video game. A large " +
  "luminous full moon in the upper-left third, torn ragged clouds drifting across and lit silver at their edges by the " +
  "moon, faint diagonal rain streaks, a few stars between the clouds. The centre and the bottom stay dark, empty indigo " +
  "so glowing particles pop on top; low mist along the bottom edge. No buildings, no trees, no land, no people, no birds. " +
  `Style: ${STYLES[style].look} ${BOLD} Palette: deep indigo and teal night, cool moonlight, no warm light. ${NO_TEXT}`

const HUNTER_BODY: Record<HunterId, string> = {
  exorcist:
    "The Exorcist: a grizzled veteran, tall and broad-shouldered, a long weathered storm coat flaring at the hem, a " +
    "wide-brimmed hat, a heavy leather satchel, holding a brass storm lantern raised high in one hand that glows warm " +
    "amber, prayer beads wrapped around the other hand. Commanding, blunt stance.",
  medium:
    "The Medium: a theatrical spirit medium, flowing layered shawls and a long fringed skirt making a wide bell-shaped " +
    "silhouette, a headscarf hung with little coins, many bangles, holding a glowing crystal orb in both hands that " +
    "casts violet light up onto her face. Dramatic, mystical pose.",
  skeptic:
    "The Skeptic: a lean, tall, sharp-featured investigator in a fitted long coat and a scarf, brass goggles pushed up " +
    "on the forehead, a boxy ghost-detector meter with a small antenna on the belt, pointing an electric flashlight " +
    "that throws a cold cyan-blue beam. Dry, sceptical posture.",
  priest:
    "The Priest: a pious, dramatic priest in a long black cassock with a crimson sash and a round wide-brimmed priest " +
    "hat, swinging a brass censer on chains that glows with coral-red embers and trails pale smoke, a small book of " +
    "rites held to his chest. Proud, theatrical stance.",
}

export const hunterPrompt = (style: StyleId, hunter: HunterId) =>
  `Full-body character art for a haunted-house video game. ${HUNTER_BODY[hunter]} Standing, three-quarter front view, ` +
  "the whole figure visible from hat to boots, centred with empty space around it, isolated on a transparent " +
  "background. Silhouette-first design: dark clothing in indigo and charcoal tones and a distinctive outline that " +
  "reads at very small size, rim-lit by the light the character holds; that light is the brightest thing in the image. " +
  `Style: ${STYLES[style].look} ${BOLD} No background, no ground, no cast shadow. ${NO_TEXT}`

export const titlePrompt = (style: StyleId) =>
  "A gothic sigil emblem for a haunted-house video game, centred and isolated on a transparent background: a circular " +
  "wrought-iron ring wreathed in sharp thorns, inside it a keyhole that burns with ghostly cyan light, a thin crescent " +
  "moon behind the keyhole, a single blood-red gem at the bottom of the ring. Aged silver and dark iron, a soft cyan " +
  "glow, symmetrical, a bold simple shape that reads at very small size. " +
  `Style: ${STYLES[style].look} ${BOLD} ${NO_TEXT}`

/** Sent to the edits endpoint with the chosen ballroom and the four hunters as references. */
export const socialPrompt =
  "Key art for this haunted-house video game, painted in exactly the style of the reference room. A towering haunted " +
  "Victorian mansion at night shown as a cutaway dollhouse cross-section, six candle-lit rooms in two columns and " +
  "three floors (attic and nursery at the top, library and ballroom in the middle, chapel and crypt at the bottom), " +
  "hundreds of glowing ghost-cyan wisps streaming through the rooms and out of the windows, a full moon and torn " +
  "clouds with faint rain behind the roof. The four ghost hunters from the reference images stand small in the " +
  "foreground with their lantern, crystal orb, flashlight and censer lights. Wide cinematic composition, the mansion " +
  `centred, a calm margin at the top and bottom edges. ${BOLD} ${PALETTE_LIGHT} ${NO_TEXT} No logo.`
