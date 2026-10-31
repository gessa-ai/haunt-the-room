// Type: Geist Pixel Square (OFL, the geist package; the face spawn.co uses) for all UI text; old-print serifs
// (IM Fell English, Pirata One, Cinzel) for headers. Registered once as "Geist Pixel".
import "@fontsource/pirata-one/400.css"
import "@fontsource/cinzel/700.css"
import "@fontsource/im-fell-english/400.css"
import "@fontsource/im-fell-english/400-italic.css"
import "@fontsource/im-fell-english-sc/400.css"

const url = new URL("../../node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Square.woff2", import.meta.url).href
const face = new FontFace("GeistPixel", `url(${url}) format("woff2")`)
document.fonts.add(face)
face.load().catch((err: unknown) => console.error("[fonts] GeistPixel failed to load", err))
