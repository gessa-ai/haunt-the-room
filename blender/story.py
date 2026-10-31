# L15 BLENDER: story scenes for L20 (same low-poly night style, no brands).
# Run: /Applications/Blender.app/Contents/MacOS/Blender -b --python blender/story.py
# Writes web/public/3d/story/: plane-interior, plane-window-moon, sf-street-billboard (+ -text), house-gate (.webp)
# and story.json (billboard face rect in pixels). intro.webp is reused from web/public/3d/stage/.
import json
import math
import os
import random
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import house  # noqa: E402
import render  # noqa: E402
import stage  # noqa: E402
from house import Mesh, camera, mat  # noqa: E402

OUT = os.path.abspath(os.path.join(HERE, "..", "web", "public", "3d", "story"))
W, H = 1920, 1080
META = {}


def fresh(fog):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    house._MATS.clear()
    scene = bpy.context.scene
    render.night_base(scene, fog=fog)
    scene.render.resolution_x, scene.render.resolution_y = W, H
    scene.render.image_settings.file_format = "PNG"
    return scene


def shoot(scene, cam, name):
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = W, H
    png = os.path.join(stage.TMP, "story-" + name.replace(".webp", ".png"))
    scene.render.filepath = png
    bpy.ops.render.render(write_still=True)
    stage.webp(png, os.path.join(OUT, name))


def px(scene, cam, co):
    bpy.context.view_layer.update()
    v = world_to_camera_view(scene, cam, Vector(co))
    return [round(v.x * W, 1), round((1 - v.y) * H, 1)]


# ---------------- plane interior ----------------
def plane_interior():
    scene = fresh(0.02)
    sil = mat("silhouette", "#07060a")
    m = Mesh("cabin")
    m.cyl((0, 7.5, 1.3), 2.1, 22, mat("cabin_wall", "#3a4050"), segs=22, rot=Matrix.Rotation(math.pi / 2, 4, "X"))
    m.aabb(-1.95, 1.95, -3.5, 18.5, -0.1, 0.0, mat("carpet", "#1e2230"))
    m.aabb(-0.32, 0.32, -3.5, 18.5, 0.0, 0.01, mat("aisle", "#2a2030"))
    m.aabb(-2.2, 2.2, 18.0, 18.3, -1, 3.6, mat("galley_wall", "#2a3040"))
    m.aabb(-0.45, 0.45, 17.9, 18.0, 0.0, 1.95, mat("galley_glow", "#cfe0ff", 2.2))
    seat, head = mat("seat", "#22283a"), mat("headrest", "#c8ccd8")
    screen = mat("seat_screen", "#5a8adf", 1.6)
    shade = mat("window_shade", "#4a5060")
    lip, dot, win = mat("bin_lip", "#ffb070", 0.6), mat("floor_dot", "#ffb070", 3.0), mat("moonglass", "#9cc4ff", 2.0)
    for row in range(15):
        y = row * 1.0
        for s in (-1, 1):
            for x in (0.6, 1.08, 1.56):
                m.box((s * x, y, 0.45), (0.44, 0.5, 0.14), seat)
                m.box((s * x, y - 0.25, 0.86), (0.44, 0.12, 0.74), seat, rot=Matrix.Rotation(0.12, 4, "X"))
                m.box((s * x, y - 0.29, 1.18), (0.38, 0.14, 0.2), head, rot=Matrix.Rotation(0.12, 4, "X"))
                m.box((s * x, y - 0.33, 0.9), (0.26, 0.02, 0.17), screen, rot=Matrix.Rotation(0.12, 4, "X"))  # seat-back screen
            m.box((s * 0.36, y, 0.62), (0.06, 0.45, 0.06), seat)  # armrest
            m.sphere((s * 1.97, y + 0.4, 1.35), 1.0, win, u=10, v=6, scale=(0.04, 0.17, 0.24))
            if (row * 7 + s) % 3:  # shades half down
                m.box((s * 1.93, y + 0.4, 1.5), (0.06, 0.38, 0.28), shade)
            if row in (3, 8, 11) and s > 0:  # a few reading lights on
                m.sphere((s * 1.1, y - 0.1, 1.9), 0.05, mat("reading_light", "#fff0c8", 8.0), u=6, v=4)
                render.light(f"read{row}", "SPOT", (s * 1.1, y - 0.1, 1.88), (1.0, 0.9, 0.7), 40, size=0.03,
                             direction=(0, 0.2, -1)).data.spot_size = 0.6
            m.box((s * 0.35, y + 0.5, 0.02), (0.04, 0.04, 0.03), dot)
    for s in (-1, 1):
        m.aabb(s * 0.85 if s > 0 else -1.75, s * 1.75 if s > 0 else -0.85, -3.5, 17.9, 1.95, 2.45, mat("bins", "#5a6070"))
        for k in range(18):  # bin doors with gaps, latches
            y0 = -3.4 + k * 1.18
            m.box((s * 0.83, y0 + 0.58, 2.2), (0.04, 1.1, 0.44), mat("bin_door", "#6a7080"))
            m.box((s * 0.8, y0 + 0.58, 2.36), (0.03, 0.18, 0.05), mat("latch", "#2a2e38"))
        m.aabb(s * 0.85 - 0.02, s * 0.85 + 0.02, -3.5, 17.9, 1.9, 1.95, lip)
    m.done()
    a = Mesh("attendant", (0, 14.6, 0))  # standing wrong: hovering, neck too long, head at a right angle, an elbow bent backwards
    y, lift = 14.6, 0.12  # feet do not touch the carpet
    for sx in (-1, 1):
        a.beam((sx * 0.08, y, lift), (sx * 0.08, y, 0.55 + lift), 0.07, sil)
    a.cyl((0, y, 0.78 + lift), 0.27, 0.56, sil, segs=12, r2=0.17)
    a.cyl((0, y, 1.25 + lift), 0.17, 0.42, sil, segs=12, r2=0.21)
    a.sphere((0, y, 1.44 + lift), 0.24, sil, u=10, v=5, scale=(1, 0.6, 0.35))
    a.beam((-0.23, y, 1.42 + lift), (-0.29, y, 0.36 + lift), 0.07, sil)  # one arm hangs past the knee
    a.beam((0.23, y, 1.42 + lift), (0.42, y + 0.1, 1.05 + lift), 0.07, sil)  # the other bends the wrong way
    a.beam((0.42, y + 0.1, 1.05 + lift), (0.36, y + 0.05, 1.55 + lift), 0.06, sil)
    a.beam((0.0, y, 1.5 + lift), (0.04, y, 1.86 + lift), 0.06, sil)  # neck far too long
    a.sphere((0.16, y, 1.9 + lift), 0.11, sil, u=10, v=6, scale=(1.1, 1, 0.9))  # head tipped flat onto the shoulder line
    a.sphere((0.27, y + 0.08, 1.9 + lift), 0.07, sil, u=8, v=5)
    a.box((0.06, y, 1.98 + lift), (0.06, 0.12, 0.18), sil)
    a.done()
    cl = Mesh("cabin_ceiling")
    for k in range(20):  # ceiling panels with a cool cove light, small dome lights
        y0 = -3.4 + k * 1.08
        cl.box((0, y0 + 0.52, 2.62), (1.66, 1.0, 0.06), mat("ceiling_panel", "#4a5264"))
        if k % 3 == 1:
            cl.sphere((0, y0 + 0.52, 2.585), 0.09, mat("dome_light", "#b8ccff", 2.0), u=8, v=4, scale=(1, 1, 0.4))
    for sx in (-1, 1):
        cl.box((sx * 0.86, 7.2, 2.5), (0.04, 21.0, 0.04), mat("cove", "#6a8cff", 2.5))
        for k in range(15):  # aisle-side seat markers
            cl.box((sx * 0.37, k * 1.0 - 0.1, 0.3), (0.02, 0.06, 0.12), mat("aisle_marker", "#ffb070", 2.0))
    cl.done()
    render.light("galley", "SPOT", (0, 17.7, 2.2), (0.75, 0.85, 1.0), 900, size=0.1, direction=(0, -1, -0.15)).data.spot_size = 1.2
    for y in (2, 7, 12):
        render.light(f"cabin{y}", "POINT", (0, y, 2.2), (0.45, 0.55, 0.9), 25, size=0.5)
    cam = camera("cam_story_plane", (0.0, -1.6, 1.55), (0.0, 14.0, 1.25), 30)
    shoot(scene, cam, "plane-interior.webp")


# ---------------- plane window, moon over clouds ----------------
def oval(a, b, n, y):
    return [Vector((a * math.cos(2 * math.pi * i / n), y, b * math.sin(2 * math.pi * i / n))) for i in range(n)]


def plane_window_moon():
    scene = fresh(0.0015)
    n = 48
    wall = mat("cabin_panel", "#9a9eac")
    bm_mesh = Mesh("window_wall")
    bm = bm_mesh.bm
    inner = oval(0.25, 0.35, n, 0.0)
    outer = []
    for p in inner:  # matching points on the panel rectangle (1.4 x 1.6)
        d = Vector((p.x / 0.25, 0, p.z / 0.35))
        k = min(0.7 / max(abs(d.x), 1e-6), 0.8 / max(abs(d.z), 1e-6))
        outer.append(Vector((d.x * k, 0, d.z * k)))
    deep = oval(0.21, 0.30, n, 0.16)
    vi = [bm.verts.new(v) for v in inner]
    vo = [bm.verts.new(v) for v in outer]
    vd = [bm.verts.new(v) for v in deep]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([vo[i], vo[j], vi[j], vi[i]])
        bm.faces.new([vi[i], vi[j], vd[j], vd[i]])
    bm_mesh._tag(vi + vo + vd, wall)
    bm_mesh.box((0, 0.1, 0.3), (0.5, 0.02, 0.16), mat("shade", "#c8ccd4"))  # window shade, a third down
    bm_mesh.done()
    rng = random.Random(3)
    c = Mesh("clouds")
    cm = mat("cloud", "#7a86a8", 0.3)
    edge = mat("cloud_edge", "#c8d4f0", 0.9)
    for _ in range(13):  # separate puffy clouds with sky between them
        y = rng.uniform(90, 480)
        x = rng.uniform(-0.6, 0.6) * y
        z = -0.1 * y - rng.uniform(0, 8)
        size = rng.uniform(7, 15) * (y / 250) ** 0.5
        for k in range(rng.randint(4, 6)):
            off = Vector((rng.uniform(-1.8, 1.8) * size, rng.uniform(-0.5, 0.5) * size, rng.uniform(0, 0.6) * size))
            r = size * rng.uniform(0.55, 1.0)
            c.sphere((x + off.x, y + off.y, z + off.z), r, cm, u=12, v=6, scale=(1.3, 1.0, 0.7))
            c.sphere((x + off.x, y + off.y + r * 0.25, z + off.z + r * 0.32), r * 0.72, edge, u=12, v=6, scale=(1.25, 0.9, 0.55))  # moonlit top
    c.done()
    mm = Mesh("moon", (0, 520, 60))
    mm.sphere((0, 520, 60), 70, mat("moon", "#f4f1e0", 4.0), u=32, v=16)
    maria = mat("moon_maria", "#b4b0a0", 2.4)
    for (dx, dz, r) in ((-22, 18, 17), (16, 10, 12), (-6, -20, 15), (26, -16, 8), (-30, -8, 7), (6, 30, 6)):
        mm.cyl((dx, 520 - 69.5 + abs(dx) * 0.03 + abs(dz) * 0.03, 60 + dz), r, 1.0, maria, segs=14, rot=Matrix.Rotation(math.pi / 2, 4, "X"))
    for i, (r, e) in enumerate(((84, 0.7), (100, 0.35), (122, 0.16))):  # stepped halo rings behind the disc
        mm.cyl((0, 560 + i * 10, 60), r, 1.0, mat(f"moon_halo{i}", "#9fb4e8", e), segs=40, rot=Matrix.Rotation(math.pi / 2, 4, "X"))
    mm.done()
    render.light("moonlight", "SUN", (0, 0, 10), (0.6, 0.7, 1.0), 3.0, direction=(0, -0.35, -1))
    render.light("cabin_fill", "POINT", (0.3, -0.7, 0.4), (0.5, 0.6, 0.95), 6, size=0.4)
    cam = camera("cam_story_window", (0.06, -0.85, -0.02), (0.0, 10.0, 0.25), 26)
    cam.data.clip_end = 3000
    shoot(scene, cam, "plane-window-moon.webp")


# ---------------- foggy SF street, giant billboard ----------------
def sf_street():
    scene = fresh(0.004)
    slope, crest = 0.26, 58.0  # steep SF hill, flattening at the crest
    rng = random.Random(9)

    def gz(y):  # ground height along the street
        return min(y, crest) * slope

    road, walk = mat("asphalt", "#1c1e26"), mat("sidewalk", "#34363e")
    steel, iron = mat("rail_steel", "#8a8c96", 0.15), mat("iron", "#0b0a0e")
    st = Mesh("street")
    ang = Matrix.Rotation(math.atan(slope), 4, "X")
    for i in range(16):
        y0, y1 = i * 4.0 - 6, i * 4.0 - 2
        if y0 >= crest:
            break
        z0, z1 = gz(y0), gz(y1)
        st.box((0, (y0 + y1) / 2, (z0 + z1) / 2 - 0.2), (9, 4.1, 0.4), road, rot=ang)
        for s in (-1, 1):  # SF sidewalks climb in steps
            for k in range(4):
                top = gz(y0 + k + 1) + 0.15
                st.aabb(min(s * 4.5, s * 6.7), max(s * 4.5, s * 6.7), y0 + k, y0 + k + 1, top - 1.4, top, walk)
            st.aabb(min(s * 4.45, s * 4.6), max(s * 4.45, s * 4.6), y0, y1, z0 - 0.2, z1 + 0.18, mat("curb", "#5a5850"))
    st.aabb(-60, 60, crest, crest + 80, crest * slope - 0.4, crest * slope, road)  # crest plateau
    for x in (-1.05, -0.45, 0.45, 1.05):  # cable-car rails (two tracks of two rails), the slot between them
        st.beam((x, -6, gz(-6) + 0.03), (x, crest, gz(crest) + 0.03), 0.07, steel)
    for x in (-0.75, 0.75):
        st.beam((x, -6, gz(-6) + 0.005), (x, crest, gz(crest) + 0.005), 0.05, iron)
    st.done()

    hs = Mesh("row_houses")  # Victorian row houses: gabled fronts, bay windows, stoops, stepping up the hill
    cols = [mat(f"house{i}", c) for i, c in enumerate(["#7a8a6a", "#5a7088", "#8a6a7a", "#b8a888", "#a89a5a", "#9a6a6a", "#6a7a8a"])]
    trim, lit, dark = mat("trim_sf", "#c8c0b0"), mat("window_lit", "#ffb45a", 2.5), mat("window_dark", "#14161e")
    roofm = mat("roof_sf", "#1a1820")
    for s in (-1, 1):
        y = -6.0
        first = True
        while y < crest - 2:
            w = rng.uniform(5.0, 6.2)
            hgt = rng.uniform(7.0, 9.0)
            zb = gz(y + w / 2) - 0.3
            x0 = s * 6.6  # facade plane
            xb = x0 + s * 9  # back
            col = cols[rng.randrange(len(cols))]
            hs.aabb(min(x0, xb), max(x0, xb), y + 0.08, y + w - 0.08, zb - 6, zb + hgt, col)
            hs.prism([(y + 0.08, zb + hgt), (y + w - 0.08, zb + hgt), (y + w / 2, zb + hgt + w * 0.45)], "YZ", x0 + s * 0.3, xb, roofm)
            hs.prism([(y - 0.1, zb + hgt - 0.1), (y + w + 0.1, zb + hgt - 0.1), (y + w / 2, zb + hgt + w * 0.45 + 0.15)], "YZ",
                     x0 - s * 0.05, x0 + s * 0.3, trim)
            hs.prism([(y + 0.3, zb + hgt + 0.05), (y + w - 0.3, zb + hgt + 0.05), (y + w / 2, zb + hgt + w * 0.45 - 0.2)], "YZ",
                     x0 - s * 0.1, x0 + s * 0.2, col)
            hs.sphere((x0 - s * 0.12, y + w / 2, zb + hgt + w * 0.2), 0.32, lit if rng.random() < 0.5 else dark, u=10, v=5, scale=(0.3, 1, 1))
            bay_y, bay_w = y + w * 0.62, w * 0.5  # bay window, two storeys, slanted sides
            for fl in (0, 1):
                z0 = zb + 1.6 + fl * (hgt - 1.6) / 2
                zh = (hgt - 1.6) / 2 - 0.25
                hs.box((x0 - s * 0.45, bay_y, z0 + zh / 2), (0.9, bay_w * 0.6, zh), col)
                for sy in (-1, 1):
                    hs.box((x0 - s * 0.25, bay_y + sy * bay_w * 0.36, z0 + zh / 2), (0.55, 0.12, zh), col,
                           rot=Matrix.Rotation(s * sy * 0.7, 4, "Z"))
                hs.box((x0 - s * 0.91, bay_y, z0 + zh * 0.55), (0.05, bay_w * 0.55, zh * 0.72), trim)
                hs.box((x0 - s * 0.93, bay_y, z0 + zh * 0.55), (0.05, bay_w * 0.45, zh * 0.6), lit if rng.random() < 0.4 else dark)
                hs.box((x0 - s * 0.45, bay_y, z0 + zh + 0.08), (1.0, bay_w * 0.7, 0.16), trim)
                hs.box((x0 - s * 0.02, y + w * 0.2, z0 + zh * 0.55), (0.05, w * 0.18, zh * 0.6), lit if rng.random() < 0.3 else dark)
            hs.box((x0 - s * 0.02, y + w * 0.2, zb + 1.1 + 0.3), (0.06, 1.0, 1.9), mat("door", "#2a1c18"))
            hs.box((x0 - s * 0.01, y + w * 0.2, zb + 1.1 + 0.3), (0.05, 1.3, 2.2), trim)
            hs.aabb(min(x0, x0 - s * 0.25), max(x0, x0 - s * 0.25), y, y + w, zb + hgt - 0.45, zb + hgt - 0.1, trim)  # cornice
            for k in range(int(w / 0.6)):  # brackets under the cornice
                hs.box((x0 - s * 0.12, y + 0.3 + k * 0.6, zb + hgt - 0.6), (0.2, 0.12, 0.3), trim)
            hs.aabb(min(x0, x0 - s * 0.12), max(x0, x0 - s * 0.12), y, y + w, zb + 1.45, zb + 1.6, trim)  # belt course
            if first and s < 0:  # corner store: lit shopfront and awning, no signage
                hs.box((x0 - s * 0.03, y + w * 0.65, zb + 1.6), (0.06, w * 0.55, 1.6), mat("shop_glow", "#d8ffe8", 3.0))
                hs.box((x0 - s * 0.7, y + w * 0.65, zb + 2.75), (1.4, w * 0.6, 0.1), mat("awning", "#2a4a3a"), rot=Matrix.Rotation(s * 0.25, 4, "Y"))
                render.light("shop", "AREA", (x0 - s * 0.6, y + w * 0.65, zb + 1.6), (0.85, 1.0, 0.92), 400, direction=(-s, 0, -0.2)).data.size = 2.5
            first = False
            for k in range(4):  # stoop
                hs.box((x0 - s * (0.25 + k * 0.3), y + w * 0.2, zb + 0.15 + (3 - k) * 0.2), (0.3, 1.2, 0.3 + (3 - k) * 0.4), mat("stoop", "#4a4650"))
            y += w
    hs.done()

    lp = Mesh("lamps_wires")
    for s in (-1, 1):
        for y in range(0, int(crest), 13):
            z = gz(y)
            lp.beam((s * 5.0, y, z), (s * 5.0, y, z + 4.2), 0.12, iron)
            lp.beam((s * 5.0, y, z + 4.2), (s * 4.3, y, z + 4.4), 0.08, iron)
            lp.box((s * 4.1, y, z + 4.4), (0.7, 0.35, 0.18), iron)
            lp.box((s * 4.1, y, z + 4.28), (0.5, 0.25, 0.06), mat("sodium_glow", "#ffa040", 8.0))
            render.light(f"lamp{s}{y}", "SPOT", (s * 4.1, y, z + 4.2), (1.0, 0.5, 0.15), 900, size=0.3,
                         direction=(0, 0, -1)).data.spot_size = 2.0
            render.light(f"lampfill{s}{y}", "POINT", (s * 4.1, y, z + 4.0), (1.0, 0.55, 0.2), 160, size=0.4)
    for y in range(22, int(crest), 12):  # trolley poles + span wires (all below the board in view)
        z = gz(y)
        for s in (-1, 1):
            lp.beam((s * 4.7, y, z), (s * 4.7, y, z + 7.6), 0.2, mat("wood_pole", "#5a3a22"))
            lp.box((s * 4.7, y, z + 7.3), (1.2, 0.1, 0.1), mat("wood_pole", "#5a3a22"))
        lp.beam((-4.7, y, z + 6.9), (4.7, y, z + 6.9), 0.03, iron)
    for x in (-0.5, 0.5):  # overhead wires start far up the hill so they never cross the board in view
        lp.beam((x, 34, gz(34) + 6.8), (x, crest, gz(crest) + 6.8), 0.025, iron)
    lp.done()

    # billboard on the crest: steel frame, two thick legs, catwalk with railing, three downlights
    camloc = Vector((0.0, -4.0, 1.7))
    bw, bh = 24.0, 9.0
    bc = Vector((0.0, crest + 12, gz(crest) + 26.0))
    bb = Mesh("billboard", tuple(bc))
    face = mat("billboard_face", "#d8d6cc", 0.35)
    bb.box(bc + Vector((0, 0.35, 0)), (bw + 1.0, 0.5, bh + 1.0), iron)
    bb.box(bc, (bw, 0.1, bh), face)  # one seamless panel
    ground = gz(crest)
    for sx in (-0.3, 0.3):
        bb.box((bc.x + sx * bw, bc.y + 0.9, (ground + bc.z) / 2), (1.0, 1.0, bc.z - ground), iron)
        for k in range(4):  # cross bracing
            z0 = ground + k * (bc.z - bh / 2 - ground) / 4
            z1 = z0 + (bc.z - bh / 2 - ground) / 4
            bb.beam((bc.x + sx * bw - 0.5, bc.y + 0.9, z0), (bc.x + sx * bw + 0.5, bc.y + 0.9, z1), 0.12, iron)
    cz = bc.z - bh / 2 - 0.55
    bb.box((bc.x, bc.y - 0.6, cz), (bw + 1.0, 1.4, 0.12), iron)  # catwalk
    bb.beam((bc.x - bw / 2 - 0.5, bc.y - 1.25, cz + 1.0), (bc.x + bw / 2 + 0.5, bc.y - 1.25, cz + 1.0), 0.06, iron)
    for i in range(13):
        x = bc.x - bw / 2 - 0.5 + i * (bw + 1.0) / 12
        bb.beam((x, bc.y - 1.25, cz), (x, bc.y - 1.25, cz + 1.0), 0.05, iron)
    for sx in (-0.33, 0.0, 0.33):  # downlights on arms above the face, aimed down at it
        top = Vector((bc.x + sx * bw, bc.y + 0.2, bc.z + bh / 2 + 0.5))
        head = top + Vector((0, -2.2, 0.6))
        bb.beam(top, head, 0.12, iron)
        bb.box(head, (0.7, 0.5, 0.35), iron)
        bb.box(head + Vector((0, 0, -0.2)), (0.55, 0.4, 0.05), mat("flood_lamp", "#fff4dc", 6.0))
        spot = render.light(f"flood{sx}", "SPOT", head + Vector((0, 0, -0.25)), (1.0, 0.95, 0.85), 4500, size=0.15,
                            direction=Vector((bc.x + sx * bw, bc.y - 0.1, bc.z - 1.5)) - head)
        spot.data.spot_size, spot.data.spot_blend = 0.75, 0.25
    bb.done()
    render.fog_slab((0, bc.y - 3.5, bc.z), (bw + 12, 5, bh + 8), 0.03)  # haze in front of the board shows the cones
    render.fog_slab((0, crest + 4, ground + 3.5), (90, 26, 7), 0.022)  # fog rolling over the crest
    render.fog_slab((0, 20, gz(20) + 1), (40, 60, 4), 0.015)
    render.fog_slab((0, crest + 20, ground + 14), (120, 40, 6), 0.012)  # Golden Gate fog: a high layer over the crest
    cars = Mesh("parked_cars")
    tilt = Matrix.Rotation(math.atan(slope), 4, "X")
    glass, tyre = mat("car_glass", "#0e1218"), mat("tyre", "#0a0a0c")
    for i, (sx, y, c) in enumerate(((1, 10, "#6a2a2a"), (-1, 12, "#2a3a5a"), (1, 19.5, "#c8c0b0"), (-1, 27, "#3a4a3a"), (1, 36, "#202024"), (-1, 44, "#8a7a5a"))):
        M = Matrix.Translation((sx * 3.5, y, gz(y))) @ tilt
        body = mat(f"car{i}", c)

        def cb(lc, size, mm, extra=None):
            r = tilt if extra is None else tilt @ extra
            cars.box(M @ Vector(lc), size, mm, rot=r)
        cb((0, 0, 0.6), (1.8, 4.3, 0.65), body)
        cb((0, -0.3, 1.2), (1.6, 2.2, 0.6), glass)
        cb((0, -0.3, 1.52), (1.62, 2.0, 0.06), body)
        for wx in (-0.85, 0.85):
            for wy in (-1.4, 1.4):
                cars.cyl(M @ Vector((wx, wy, 0.35)), 0.35, 0.25, tyre, segs=10, rot=tilt @ Matrix.Rotation(math.pi / 2, 4, "Y"))
        for tx in (-0.7, 0.7):
            cb((tx, -2.16, 0.75), (0.3, 0.04, 0.12), mat("taillight", "#c01818", 2.5 if i == 1 else 0.3))
    for y, sx in ((2.5, 1), (24, -1), (39, 1)):  # hydrants
        z = gz(y) + 0.15
        cars.cyl((sx * 4.85, y, z + 0.3), 0.13, 0.6, mat("hydrant", "#d8d4c8"), segs=8)
        cars.sphere((sx * 4.85, y, z + 0.62), 0.14, mat("hydrant_cap", "#c8a030"), u=8, v=4)
        cars.cyl((sx * 4.85, y, z + 0.4), 0.07, 0.4, mat("hydrant", "#d8d4c8"), segs=6, rot=Matrix.Rotation(math.pi / 2, 4, "Y"))
    # cable car on the left track, braked on the hill: red lower body, cream upper, lit windows, open end platform
    cc = Mesh("cable_car")
    Mc = Matrix.Translation((-0.75, 24.0, gz(24.0))) @ tilt
    red, cream, roofc = mat("cc_red", "#8a1c1c"), mat("cc_cream", "#d8ccb0"), mat("cc_roof", "#2a2a30")

    def cbx(lc, size, mm):
        cc.box(Mc @ Vector(lc), size, mm, rot=tilt)
    cbx((0, 0, 0.75), (2.4, 8.0, 0.9), red)
    cbx((0, 0.6, 1.75), (2.4, 5.6, 1.1), cream)
    cbx((0, 0, 2.45), (2.7, 8.6, 0.2), roofc)
    cbx((0, 0, 2.62), (1.6, 7.0, 0.18), roofc)
    for k in range(6):
        for sx in (-1.21, 1.21):
            cbx((sx, -1.6 + k * 0.95, 1.8), (0.04, 0.7, 0.75), mat("cc_window", "#ffcf80", 2.2))
    cbx((0, -2.15, 1.8), (2.0, 0.04, 0.75), mat("cc_window", "#ffcf80", 2.2))
    for sx in (-1.1, 1.1):
        cc.beam(Mc @ Vector((sx, -3.9, 1.2)), Mc @ Vector((sx, -3.9, 2.4)), 0.06, mat("brass", "#b08a3a"))
    cbx((0, -4.05, 0.45), (2.3, 0.15, 0.25), roofc)
    cc.sphere(Mc @ Vector((0, -4.15, 1.0)), 0.16, mat("cc_headlamp", "#fff2d0", 6.0), u=8, v=4)
    for wy in (-2.8, 2.8):
        for sx in (-0.75, 0.75):
            cc.cyl(Mc @ Vector((sx, wy, 0.3)), 0.3, 0.18, tyre, segs=10, rot=tilt @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    cc.done()
    render.light("cc_inside", "POINT", tuple(Mc @ Vector((0, 0.5, 1.9))), (1.0, 0.75, 0.45), 250, size=1.0)
    # manhole with steam rising into the lamplight
    mh = Mesh("manhole")
    mh.cyl((2.2, 13.0, gz(13.0) + 0.02), 0.45, 0.04, mat("manhole", "#16161a"), segs=14)
    mh.done()
    for k, (h, w) in enumerate(((1.2, 0.7), (1.4, 1.1), (1.6, 1.6))):
        render.fog_slab((2.2 + 0.15 * k, 13.0, gz(13.0) + 0.6 + k * 1.3), (w, w, h), 0.35 - 0.1 * k, (1.0, 0.95, 0.9))
    # beyond the crest: distant skyline silhouettes and city lights in the fog, a far ridge
    city = Mesh("distant_city")
    rr = random.Random(21)
    skyline, citylit = mat("skyline", "#151a26"), mat("city_light", "#ffc070", 9.0)
    for i in range(130):
        x = rr.uniform(-160, 160)
        y = rr.uniform(160, 320)
        h = rr.uniform(8, 40) if abs(x) > 25 else rr.uniform(6, 18)
        w = rr.uniform(6, 14)
        base = gz(crest) + 38
        city.aabb(x - w / 2, x + w / 2, y, y + w, base, base + h, skyline)
        for _ in range(rr.randint(3, 8)):
            city.box((x + rr.uniform(-w / 2, w / 2) * 0.8, y - 0.2, base + rr.uniform(2, h - 1)), (1.2, 0.3, 0.9), citylit)
    city.sphere((0, 420, gz(crest) + 18), 1.0, mat("ridge", "#10141e"), u=24, v=8, scale=(320, 40, 45))
    base = gz(crest) + 38
    for i, e in enumerate((1.6, 1.0, 0.6, 0.32, 0.14)):  # fog-bank glow fading upward (stepped, reads well dithered)
        city.aabb(-400, 400, 345 + i, 346 + i, base - 10 + i * 30, base + 20 + i * 30, mat(f"fog_glow{i}", "#2c3450", e))
    for (x, h, w) in ((-18, 70, 9), (14, 58, 12), (40, 48, 10), (-48, 52, 11)):  # a few tall towers, one with a spire
        city.aabb(x - w / 2, x + w / 2, 300, 300 + w, base, base + h, skyline)
        for k in range(10):
            city.box((x + ((k * 37) % 7 - 3) * w / 9, 299.7, base + 6 + k * h / 11), (1.4, 0.3, 1.0), citylit)
    city.cyl((-18, 304.5, base + 70 + 14), 6.3, 28, skyline, segs=4, r2=0.2)
    city.beam((-80, 320, base - 5), (-80, 320, base + 95), 2.5, skyline, t2=0.6)  # radio mast with crossarms and red lights
    for z in (40, 70, 95):
        city.box((-80, 320, base + z), (16 - z * 0.12, 1.0, 1.0), skyline)
        city.sphere((-80 + (8 - z * 0.06), 319, base + z), 1.2, mat("mast_light", "#ff2020", 8.0), u=6, v=4)
    city.done()
    cars.done()
    sg = Mesh("shop_signs")  # blank lit blade signs; L20 paints fictional ads on them in-engine
    sign_quads = []
    for i, (sx, y) in enumerate(((-1, 3.5), (1, 6.5), (-1, 13.5), (1, 16.5), (-1, 23.5), (1, 26.5), (-1, 33.5), (1, 36.5))):
        z = gz(y) + 3.4
        x0, x1 = sorted((sx * 4.95, sx * 6.55))
        sg.aabb(x0 - 0.06, x1 + 0.06, y - 0.02, y + 0.12, z - 0.06, z + 1.16, iron)
        sg.aabb(x0, x1, y - 0.06, y - 0.02, z, z + 1.1, mat("sign_face", "#f0ead8", 1.2))
        sg.beam((sx * 6.55, y + 0.05, z + 1.4), (sx * 4.95, y + 0.05, z + 1.16), 0.05, iron)
        sign_quads.append([(x0, y - 0.07, z + 1.1), (x1, y - 0.07, z + 1.1), (x1, y - 0.07, z), (x0, y - 0.07, z)])
    sg.done()
    mm = Mesh("moon", (-45, 260, 165))
    mm.sphere((-45, 260, 165), 20, mat("moon", "#f4f1e0", 4.0), u=24, v=12)
    mm.done()
    render.light("moon_key", "SUN", (0, 0, 30), (0.55, 0.68, 1.0), 3.0, direction=(0.3, -0.8, -0.5))
    cam = camera("cam_story_sf", tuple(camloc), (0.0, 60.0, 24.0), 24)
    cam.data.clip_end = 1000
    corners = [px(scene, cam, bc + Vector((sx * bw / 2, -0.06, sz * bh / 2))) for sx, sz in ((-1, 1), (1, 1), (1, -1), (-1, -1))]
    xs, ys = [c[0] for c in corners], [c[1] for c in corners]
    META["sf-street-billboard.webp"] = {"face": {"x": min(xs), "y": min(ys), "w": round(max(xs) - min(xs), 1),
                                                  "h": round(max(ys) - min(ys), 1), "quad": corners},
                                         "signs": [[px(scene, cam, c) for c in q] for q in sign_quads]}
    shoot(scene, cam, "sf-street-billboard.webp")
    # secondary: the line rendered on the board (primary is the blank face; L20 draws the text)
    font = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
    lines = []
    for i, (line, color) in enumerate((("THIS IS NOT AN AI AD.", "#141414"), ("YOU ARE ALL DEAD.", "#b0101c"))):
        cu = bpy.data.curves.new(f"line{i}", "FONT")
        cu.body = line
        if os.path.exists(font):
            cu.font = bpy.data.fonts.load(font)
        cu.align_x, cu.align_y = "CENTER", "CENTER"
        cu.size = 1.0
        cu.extrude = 0.02
        ob = bpy.data.objects.new(f"line{i}", cu)
        ob.data.materials.append(mat(f"ink{i}", color, 0.0 if i == 0 else 1.5))
        bpy.context.scene.collection.objects.link(ob)
        lines.append(ob)
    bpy.context.view_layer.update()
    scale = min(min(bw * 0.88 / ob.dimensions.x, bh * 0.36 / ob.dimensions.y) for ob in lines)
    for i, ob in enumerate(lines):
        ob.matrix_world = Matrix.Translation(bc + Vector((0, -0.1, bh * (0.22 - 0.44 * i)))) @ Matrix.Rotation(math.pi / 2, 4, "X") @ Matrix.Diagonal((scale, scale, scale, 1))
    shoot(scene, cam, "sf-street-billboard-text.webp")


# ---------------- house gate ----------------
def house_gate():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = house.build()
    render.setup(scene)
    scene.render.image_settings.file_format = "PNG"
    K = house.P()
    g = Mesh("gate", (0, -6.5, 0))
    for s in (-1, 1):  # two leaves, swung a little inward
        hinge = Vector((s * 1.8, -6.5, 0))
        R = Matrix.Rotation(-s * 0.45, 3, "Z")
        for i in range(12):
            u = 0.07 + i * 0.14
            top = 2.0 + 0.35 * math.sin(math.pi * (1 - u / 1.75) / 2)
            a = hinge + R @ Vector((-s * u, 0, 0.05))
            b = hinge + R @ Vector((-s * u, 0, top))
            g.beam(a, b, 0.045, K["black"])
            g.cyl(b + Vector((0, 0, 0.08)), 0.05, 0.16, K["black"], segs=4, r2=0.0)
        for z in (0.3, 1.0, 1.75):
            g.beam(hinge + R @ Vector((0, 0, z)), hinge + R @ Vector((-s * 1.75, 0, z)), 0.06, K["black"])
        g.sphere(hinge + R @ Vector((-s * 0.9, 0, 1.38)), 0.18, K["black"], u=8, v=4, scale=(1, 0.3, 1))
    g.done()
    cam = camera("cam_story_gate", (0.6, -16.0, 1.4), (-0.5, 0.0, 7.0), 20)
    shoot(scene, cam, "house-gate.webp")


def street_to_house():
    """Looking down the road at the lit mansion under the full moon; frame 1 plus a 3-frame push-in."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = house.build()
    render.setup(scene)
    scene.render.image_settings.file_format = "PNG"
    K = house.P()
    r = Mesh("approach_road")
    r.aabb(-90, 90, -160, -40, -0.3, 0, K["ground"])
    r.aabb(-4, 4, -160, -6.6, 0, 0.03, mat("asphalt", "#1c1e26"))
    for y in range(-158, -10, 6):
        r.aabb(-0.08, 0.08, y, y + 2.5, 0.03, 0.04, mat("lane_line", "#c8b070"))
    for s in (-1, 1):
        for y in range(-150, -12, 16):
            r.beam((s * 5, y, 0), (s * 5, y, 4.4), 0.12, K["black"])
            r.box((s * 4.3, y, 4.4), (0.8, 0.35, 0.18), K["black"])
            r.box((s * 4.3, y, 4.28), (0.5, 0.25, 0.06), mat("sodium_glow", "#ffa040", 8.0))
            render.light(f"road{s}{y}", "POINT", (s * 4.3, y, 4.0), (1.0, 0.55, 0.2), 200, size=0.3)
    r.done()
    render.fog_slab((0, -80, 1.0), (60, 150, 2.0), 0.05)
    for i, y in enumerate((-90.0, -60.0, -34.0), start=1):
        cam = camera(f"cam_story_road{i}", (0.0, y, 1.6), (0.0, 0.0, 7.5 + i * 0.6), 35)
        cam.data.clip_end = 600
        shoot(scene, cam, f"street-to-house-{i}.webp")
    import shutil
    shutil.copy(os.path.join(OUT, "street-to-house-1.webp"), os.path.join(OUT, "street-to-house.webp"))


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(stage.TMP, exist_ok=True)
    plane_interior()
    plane_window_moon()
    sf_street()
    house_gate()
    street_to_house()
    META["intro"] = "../stage/intro.webp"
    with open(os.path.join(OUT, "story.json"), "w") as f:
        json.dump(META, f, indent=1)


if __name__ == "__main__":
    main()
