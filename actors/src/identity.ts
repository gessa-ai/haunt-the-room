// A ghost's generated name and colour are a pure function of its id, so the Ghost actor, the House and the server
// always agree. Names read like a seating chart of guests ("aunt thistle", "dr. crumb"), always lowercase, at most
// NAME_MAX characters; bots use the same generator.
import { GHOST_COLORS, NAME_MAX } from "../../contract/protocol"

const FIRST = ["Aunt", "Uncle", "Cousin", "Nana", "Dr.", "Lady", "Mabel", "Otto", "Wren", "Hazel", "Silas", "Ivy", "Edgar", "Opal", "Clem", "Juniper", "Tilly", "Felix", "Agnes", "Basil", "Poppy", "Elsie", "Ada", "Milo"]
const LAST = ["Pickering", "Crumb", "Underhill", "Mothwick", "Bassett", "Penny", "Fog", "Crow", "Moth", "Hollow", "Lantern", "Willow", "Ash", "Thistle", "Bramble", "Cobweb", "Fern", "Pumpkin", "Raven", "Candle", "Button", "Marrow"]

/** FNV-1a with a murmur3 finalizer (similar uuids must not share names). */
function hash(text: string): number {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    h ^= h >>> 16
    h = Math.imul(h, 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
    return h >>> 0
}

export function ghostIdentity(id: string): { name: string; colorIndex: number } {
    const h = hash(id)
    const first = FIRST[(h >>> 3) % FIRST.length]
    const last = LAST[(h >>> 13) % LAST.length]
    return { name: `${first} ${last}`.toLowerCase().slice(0, NAME_MAX), colorIndex: h % GHOST_COLORS.length }
}
