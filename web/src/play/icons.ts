// Pixel icons for the phone (no emoji anywhere): each icon is a tiny grid, drawn as crisp SVG squares in
// currentColor so it inherits the text colour and survives the dither.

const GRIDS = {
  flame: ["....#....", "...##....", "...###...", "..####.#.", ".#######.", ".########", "#########", "####.####", ".###.###.", "..#####.."],
  hand: ["..#.#.#..", "..#.#.#.#", "..#.#.#.#", "#.#######", "#########", ".########", ".#######.", "..#####..", "..#####.."],
  lure: [".#######.", "#########", "##.#.#.##", "#########", ".#######.", "...##....", "..#......"],
  crown: ["#...#...#", "##.###.##", "#########", "#########", ".#######."],
  ghost: ["..#####..", ".#######.", "##.###.##", "##.###.##", "#########", "#########", "#########", "#.##.##.#"],
  spark: ["....#....", "....#....", "...###...", "#########", "...###...", "....#....", "....#...."],
  full: ["###...###", "#.......#", "#.......#", ".........", ".........", ".........", "#.......#", "#.......#", "###...###"],
  check: ["........#", ".......##", "......##.", "#....##..", "##..##...", ".####....", "..##....."],
  lock: ["..###..", ".#...#.", ".#...#.", "#######", "###.###", "###.###", "#######"],
  x: ["#.......#", ".#.....#.", "..#...#..", "...#.#...", "....#....", "...#.#...", "..#...#..", ".#.....#.", "#.......#"],
  insta: [".#######.", "#.......#", "#..###.##", "#.#...#.#", "#.#...#.#", "#.#...#.#", "#..###..#", "#.......#", ".#######."],
  eye: [".#######.", "#.......#", "#..###..#", "#..###..#", "#.......#", ".#######."],
  chair: [".######.", ".#cccc#.", ".#cccc#.", ".######.", "########", "#cccccc#", "########", "#......#", "#......#"],
  link: ["..#####..", ".#..#..#.", "#..#.#..#", "#########", "#..#.#..#", "#########", "#..#.#..#", ".#..#..#.", "..#####.."],
} as const

export type IconName = keyof typeof GRIDS

const SVG = new Map<IconName, string>()

function svg(name: IconName): string {
  let s = SVG.get(name)
  if (s) return s
  const rows = GRIDS[name]
  const w = Math.max(...rows.map((r) => r.length))
  let rects = ""
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      // "#" = currentColor, "c" = an accent (CSS --accent, e.g. a cushion in the room colour)
      if (row[x] === "#") rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`
      else if (row[x] === "c") rects += `<rect class="ac" x="${x}" y="${y}" width="1.02" height="1.02"/>`
    }
  })
  s = `<svg viewBox="0 0 ${w} ${rows.length}" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`
  SVG.set(name, s)
  return s
}

/** A pixel icon as an inline element (markup comes only from the constant grids above). */
export function icon(name: IconName, className = ""): HTMLSpanElement {
  const el = document.createElement("span")
  el.className = `hr-icon ${className}`.trim()
  el.innerHTML = svg(name)
  return el
}
