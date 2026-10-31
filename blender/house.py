# L15 BLENDER: stylized Victorian mansion cross-section (front wall cut away), all geometry scripted.
# Run: /Applications/Blender.app/Contents/MacOS/Blender -b --python blender/house.py
# Output: web/public/3d/house.glb (glTF binary, Y up). Built in Blender Z-up; the exporter converts.
# Node contract (for the three.js stage): room_<id> (origin = room floor centre, front opening faces +Z in glTF, toward cam_overview),
# prop_<id>_<n>, room_<id>_light (empty), cam_overview, cam_<id> (kill cam), moon.
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "web", "public", "3d", "house.glb")

# contract/protocol.ts (copied values; contract owns them)
ROOM_GRID = [["attic", "nursery"], ["library", "ballroom"], ["chapel", "crypt"]]
ROOM_STYLE = {
    "attic": "#e2364f", "nursery": "#2f7de1", "library": "#e0a400",
    "ballroom": "#2fa84f", "chapel": "#9b4dff", "crypt": "#1fb5b5",
}

RW, RH, RD = 6.0, 3.4, 4.0  # room interior width, height, depth
WALL, FL = 0.35, 0.35  # wall and floor slab thickness
GAP = 2.6  # gap between left and right room interiors (stair shaft + 2 walls)
FOUND = 0.6  # foundation height
CX = {0: -(GAP / 2 + RW / 2), 1: GAP / 2 + RW / 2}  # column centres
TOP = FOUND + 3 * RH + 3 * FL  # top of the top ceiling slab
OUTER = GAP / 2 + RW + WALL  # outer face of the side walls (x)


def zbase(row):  # row 0 = top floor
    return FOUND + (2 - row) * (RH + FL)


def hexc(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


_MATS = {}


def mat(name, color, emit=0.0):
    key = (name, color, emit)
    if key in _MATS:
        return _MATS[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    c = hexc(color)
    p.inputs["Base Color"].default_value = (*c, 1)
    p.inputs["Roughness"].default_value = 1.0
    p.inputs["Metallic"].default_value = 0.0
    if emit > 0:
        p.inputs["Emission Color"].default_value = (*c, 1)
        p.inputs["Emission Strength"].default_value = emit
    m.diffuse_color = (*c, 1)
    _MATS[key] = m
    return m


class Mesh:
    """One named object built from primitives in world coordinates; origin at `origin`."""

    def __init__(self, name, origin=(0, 0, 0)):
        self.name, self.o, self.bm, self.mats = name, Vector(origin), bmesh.new(), []

    def _tag(self, verts, m):
        if m not in self.mats:
            self.mats.append(m)
        i = self.mats.index(m)
        for v in verts:
            for f in v.link_faces:
                f.material_index = i

    def _m(self, c, rot=None):
        M = Matrix.Translation(Vector(c) - self.o)
        return M @ rot if rot is not None else M

    def box(self, c, s, m, rot=None):
        M = self._m(c, rot) @ Matrix.Diagonal((s[0], s[1], s[2], 1))
        self._tag(bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)["verts"], m)

    def aabb(self, x0, x1, y0, y1, z0, z1, m):
        self.box(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), m)

    def cyl(self, c, r, depth, m, segs=12, r2=None, rot=None):
        M = self._m(c, rot)
        v = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r,
                                  radius2=r if r2 is None else r2, depth=depth, matrix=M)["verts"]
        self._tag(v, m)

    def sphere(self, c, r, m, u=12, v=6, scale=(1, 1, 1)):
        M = self._m(c) @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1))
        self._tag(bmesh.ops.create_uvsphere(self.bm, u_segments=u, v_segments=v, radius=r, matrix=M)["verts"], m)

    def beam(self, a, b, t, m, segs=4, t2=None):
        a, b = Vector(a), Vector(b)
        d = b - a
        rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        if segs == 4:
            rot = rot @ Matrix.Rotation(math.pi / 4, 4, "Z")
        self.cyl((a + b) / 2, t / 2 * 1.414 if segs == 4 else t / 2, d.length, m, segs=segs,
                 r2=None if t2 is None else (t2 / 2 * 1.414 if segs == 4 else t2 / 2), rot=rot)

    def prism(self, pts, plane, a0, a1, m):
        """Polygon pts (2D) extruded. plane 'XZ' extrudes along Y, 'XY' along Z, 'YZ' along X."""
        def p3(p, a):
            q = {"XZ": Vector((p[0], a, p[1])), "XY": Vector((p[0], p[1], a)), "YZ": Vector((a, p[0], p[1]))}[plane]
            return q - self.o
        bm = self.bm
        lo = [bm.verts.new(p3(p, a0)) for p in pts]
        hi = [bm.verts.new(p3(p, a1)) for p in pts]
        bm.faces.new(lo)
        bm.faces.new(list(reversed(hi)))
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([lo[i], lo[j], hi[j], hi[i]])
        self._tag(lo + hi, m)

    def done(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(self.name, me)
        ob.location = self.o
        bpy.context.scene.collection.objects.link(ob)
        return ob


def empty(name, loc):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = "PLAIN_AXES"
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    return ob


def camera(name, loc, target, lens, roll=0.0):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_start, cd.clip_end = 0.1, 400
    ob = bpy.data.objects.new(name, cd)
    ob.location = loc
    d = Vector(target) - Vector(loc)
    q = d.to_track_quat("-Z", "Y") @ Quaternion((0, 0, 1), roll)
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = q
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ---------- palette ----------
def P():
    return {
        "siding": mat("siding", "#262030"), "trim": mat("trim", "#3a3246"), "roof": mat("roof", "#17131f"),
        "stone": mat("stone", "#3c3a44"), "ground": mat("ground", "#161a22"), "path": mat("path", "#2a2c33"),
        "black": mat("silhouette", "#0b0a0e"), "wood": mat("wood", "#4a2e1c"), "wood_dk": mat("wood_dark", "#2c1c12"),
        "brass": mat("brass", "#b08a3a"), "moonglass": mat("moonglass", "#9cc4ff", 2.0),
        "warmglass": mat("warmglass", "#ffb45a", 3.0), "flame": mat("flame", "#ffd27a", 8.0),
        "fire": mat("fire", "#ff7a1a", 6.0), "candle": mat("candle", "#e8dcc0"), "grave": mat("grave", "#4a4a55"),
        "hill": mat("hill", "#10131c"), "moon": mat("moon", "#f4f1e0", 4.0), "shaft": mat("shaft", "#1e1a24"),
    }


ROOM_LOOK = {  # back wall, floor, wainscot
    "attic": ("#4a3a2e", "#3b2b1f", None),
    "nursery": ("#3b4a66", "#4a3a2c", "#2a3448"),
    "library": ("#3a3424", "#3a2617", "#2a2016"),
    "ballroom": ("#5a2333", None, "#3a1622"),
    "chapel": ("#4a4658", "#3a3842", None),
    "crypt": ("#2f4646", "#2a3032", None),
}


def room_shell(rid, cx, zb, K):
    wall_c, floor_c, wains_c = ROOM_LOOK[rid]
    wall = mat(f"wall_{rid}", wall_c)
    accent = mat(f"accent_{rid}", ROOM_STYLE[rid], 0.8)
    m = Mesh(f"room_{rid}", (cx, 0, zb))
    x0, x1, y0, y1 = cx - RW / 2, cx + RW / 2, -RD / 2, RD / 2
    # floor slab (ballroom: checker tiles on a dark slab)
    if floor_c:
        m.aabb(x0 - WALL, x1 + WALL, y0, y1 + WALL, zb - FL, zb, mat(f"floor_{rid}", floor_c))
    else:
        m.aabb(x0 - WALL, x1 + WALL, y0, y1 + WALL, zb - FL, zb - 0.02, K["black"])
        lt, dk = mat("tile_light", "#d8d0c0"), mat("tile_dark", "#1a1a22")
        nx, ny = 8, 5
        for i in range(nx):
            for j in range(ny):
                tx, ty = x0 + (i + 0.5) * RW / nx, y0 + (j + 0.5) * RD / ny
                m.box((tx, ty, zb - 0.01), (RW / nx, RD / ny, 0.02), lt if (i + j) % 2 else dk)
    m.aabb(x0, x1, y1, y1 + WALL, zb, zb + RH, wall)  # back wall
    m.aabb(x0, x0 + 0.05, y0, y1, zb, zb + RH, wall)  # side liners
    m.aabb(x1 - 0.05, x1, y0, y1, zb, zb + RH, wall)
    if wains_c:
        w = mat(f"wainscot_{rid}", wains_c)
        m.aabb(x0, x1, y1 - 0.04, y1, zb, zb + 0.95, w)
        m.aabb(x0, x1, y1 - 0.07, y1, zb + 0.92, zb + 1.0, K["wood"])
    if rid == "attic":  # rafters under the roof
        for s in (-1, 1):
            m.beam((cx + s * 3.0, 1.9, zb + 2.2), (cx + s * 1.6, 1.9, zb + RH), 0.18, K["wood_dk"])
        m.aabb(x0, x1, -RD / 2, RD / 2, zb + RH - 0.2, zb + RH, K["wood_dk"])
    if rid == "library":  # rug
        m.aabb(cx - 1.6, cx + 1.6, -1.3, 1.1, zb, zb + 0.03, mat("rug", "#5a1a1a"))
    if rid == "chapel":  # aisle runner
        m.aabb(x0 + 0.2, x1 - 0.2, -0.45, 0.45, zb, zb + 0.03, mat("runner", "#3a1a5a"))
    # accent rim around the opening (the room's signature colour, like the phone buttons)
    t, yf = 0.13, y0 - 0.06
    m.box((cx, yf, zb + RH - t / 2), (RW, 0.12, t), accent)
    m.box((cx, yf, zb + t / 2), (RW, 0.12, t), accent)
    m.box((x0 + t / 2, yf, zb + RH / 2), (t, 0.12, RH), accent)
    m.box((x1 - t / 2, yf, zb + RH / 2), (t, 0.12, RH), accent)
    m.done()


FLAMES = []  # world positions of every candle flame (render.py puts a small warm light on each)
SEATS = {}  # roomId -> cushion-top world positions of its seats (musical chairs)
SEAT_X = (-2.1, -0.7, 0.7, 2.1)
SEAT_Y = -1.15
SEAT_X_ROOM = {"library": (-2.55, -1.65, 1.65, 2.55)}  # library seats flank the fireplace so the kill cam sees the fire


def candle(m, x, y, z, h, K, r=0.05):
    m.cyl((x, y, z + h / 2), r, h, K["candle"], segs=6)
    m.cyl((x, y, z + h + 0.08), r * 1.15, 0.16, K["flame"], segs=6, r2=0.0)
    m.sphere((x, y, z + h + 0.06), r * 0.9, K["flame"], u=6, v=4)
    FLAMES.append((x, y, z + h + 0.1))


SEAT_STYLE = {  # frame colour, back shape
    "attic": ("#6b4a2a", "slat"), "nursery": ("#cfc8b8", "kid"), "library": ("#8a3a2a", "club"),
    "ballroom": ("#c9a44a", "oval"), "chapel": ("#3a2416", "tall"), "crypt": ("#5a6468", "slab"),
}


def seats(rid, cx, zb, K):
    """Four chairs in the front row of every room, cushions in the room colour: the musical-chairs seats."""
    frame_c, shape = SEAT_STYLE[rid]
    fr = mat(f"seat_frame_{rid}", frame_c, 0.15 if rid == "ballroom" else 0.0)
    cush = mat(f"seat_cushion_{rid}", ROOM_STYLE[rid], 0.35)
    SEATS[rid] = []
    k = 0.72 if shape == "kid" else 1.0
    for n, dx in enumerate(SEAT_X_ROOM.get(rid, SEAT_X), start=1):
        x, y = cx + dx, SEAT_Y
        top = zb + 0.48 * k
        m = Mesh(f"seat_{rid}_{n}", (x, y, top))
        w = 0.56 * k
        if shape in ("club", "slab"):
            m.box((x, y, zb + (top - zb) / 2), (w + 0.1, 0.55 * k, top - zb - 0.06), fr)
        else:
            for sx in (-1, 1):
                for sy in (-1, 1):
                    m.beam((x + sx * w * 0.4, y + sy * 0.2 * k, zb), (x + sx * w * 0.4, y + sy * 0.2 * k, top - 0.06), 0.05, fr)
        m.box((x, y, top - 0.03), (w, 0.5 * k, 0.1), cush)
        by = y + 0.24 * k
        if shape == "slat":
            for sx in (-1, 1):
                m.beam((x + sx * w * 0.4, by, top), (x + sx * w * 0.4, by, top + 0.6), 0.05, fr)
            for z in (0.25, 0.5):
                m.box((x, by, top + z), (w, 0.04, 0.08), fr)
        elif shape == "kid":
            m.box((x, by, top + 0.28), (w, 0.05, 0.42), fr)
            m.sphere((x, by - 0.03, top + 0.32), 0.08, cush, u=6, v=4, scale=(1, 0.3, 1))
        elif shape == "club":
            m.box((x, by, top + 0.22), (w + 0.1, 0.16, 0.48), fr)  # low back: the fire stays visible
            for sx in (-1, 1):
                m.box((x + sx * (w / 2 + 0.03), y, top + 0.12), (0.12, 0.55, 0.26), fr)
        elif shape == "oval":
            m.beam((x, by, top), (x, by, top + 0.15), 0.05, fr)
            m.sphere((x, by, top + 0.42), 0.28, fr, u=12, v=6, scale=(0.85, 0.15, 1.1))
            m.sphere((x, by - 0.03, top + 0.42), 0.21, cush, u=12, v=6, scale=(0.85, 0.15, 1.1))
        elif shape == "tall":
            m.box((x, by, top + 0.5), (w, 0.05, 1.0), fr)
            m.box((x, by - 0.03, top + 0.75), (0.05, 0.02, 0.3), cush)
            m.box((x, by - 0.03, top + 0.8), (0.18, 0.02, 0.05), cush)
        elif shape == "slab":
            m.prism([(x - w / 2 - 0.05, top), (x + w / 2 + 0.05, top), (x + w / 2, top + 0.85), (x, top + 1.05), (x - w / 2, top + 0.85)],
                    "XZ", by - 0.06, by + 0.06, fr)
        m.done()
        SEATS[rid].append((x, y, top))


# ---------- props (each prop is one object) ----------
def props_attic(cx, zb, K):
    out = []
    m = Mesh("prop_attic_1", (cx - 1.7, 0.6, zb))
    m.box((cx - 1.7, 0.6, zb + 0.35), (1.4, 0.8, 0.7), mat("trunk", "#5a3a22"))
    m.cyl((cx - 1.7, 0.6, zb + 0.7), 0.4, 1.4, mat("trunk", "#5a3a22"), segs=10, rot=Matrix.Rotation(math.pi / 2, 4, "Y"))
    for dx in (-0.45, 0.45):
        m.box((cx - 1.7 + dx, 0.6, zb + 0.36), (0.08, 0.84, 0.74), K["brass"])
        m.cyl((cx - 1.7 + dx, 0.6, zb + 0.7), 0.42, 0.08, K["brass"], segs=10, rot=Matrix.Rotation(math.pi / 2, 4, "Y"))
    out.append(m.done())
    m = Mesh("prop_attic_2", (cx - 0.3, 1.1, zb))
    m.box((cx - 0.3, 1.1, zb + 0.28), (1.0, 0.7, 0.56), mat("trunk2", "#6b4a2a"))
    m.box((cx - 0.3, 1.1, zb + 0.6), (1.06, 0.76, 0.08), K["wood_dk"])
    m.box((cx - 0.35, 1.15, zb + 0.9), (0.6, 0.5, 0.5), mat("crate", "#7a5a38"), rot=Matrix.Rotation(0.3, 4, "Z"))
    out.append(m.done())
    m = Mesh("prop_attic_3", (cx + 1.2, 1.95, zb + 2.0))  # round window
    rx = Matrix.Rotation(math.pi / 2, 4, "X")
    m.cyl((cx + 1.2, 1.97, zb + 2.0), 0.9, 0.22, K["wood_dk"], segs=20, rot=rx)
    m.cyl((cx + 1.2, 1.95, zb + 2.0), 0.74, 0.26, K["moonglass"], segs=20, rot=rx)
    m.box((cx + 1.2, 1.8, zb + 2.0), (1.5, 0.08, 0.09), K["wood_dk"])
    m.box((cx + 1.2, 1.8, zb + 2.0), (0.09, 0.08, 1.5), K["wood_dk"])
    out.append(m.done())
    m = Mesh("prop_attic_4", (cx + 2.2, 0.2, zb))  # dress form
    dm = mat("dressform", "#8a8478")
    m.cyl((cx + 2.2, 0.2, zb + 0.08), 0.35, 0.16, K["wood_dk"], segs=8, r2=0.1)
    m.beam((cx + 2.2, 0.2, zb), (cx + 2.2, 0.2, zb + 1.1), 0.06, K["wood_dk"])
    m.cyl((cx + 2.2, 0.2, zb + 1.45), 0.26, 0.7, dm, segs=10, r2=0.36)
    m.sphere((cx + 2.2, 0.2, zb + 1.82), 0.36, dm, u=10, v=5, scale=(1, 0.75, 0.35))
    m.cyl((cx + 2.2, 0.2, zb + 2.0), 0.06, 0.2, dm, segs=6)
    m.sphere((cx + 2.2, 0.2, zb + 2.12), 0.08, K["wood_dk"], u=6, v=4)
    out.append(m.done())
    return out


def props_nursery(cx, zb, K):
    white = mat("paint_white", "#cfc8b8")
    m = Mesh("prop_nursery_1", (cx - 0.7, 0.4, zb))  # crib
    x, y = cx - 0.7, 0.4
    m.box((x, y, zb + 0.6), (1.6, 0.9, 0.22), mat("blanket", "#8aa6d8"))
    for s in (-1, 1):
        m.box((x + s * 0.82, y, zb + 0.6), (0.08, 0.98, 1.2), white)
        m.sphere((x + s * 0.82, y - 0.45, zb + 1.25), 0.07, white, u=6, v=4)
        m.sphere((x + s * 0.82, y + 0.45, zb + 1.25), 0.07, white, u=6, v=4)
        m.box((x, y + s * 0.45, zb + 1.05), (1.6, 0.05, 0.06), white)
        for i in range(9):
            m.box((x - 0.72 + i * 0.18, y + s * 0.45, zb + 0.85), (0.04, 0.04, 0.42), white)
    m.done()
    m = Mesh("prop_nursery_2", (cx - 0.7, 0.4, zb + 2.2))  # mobile
    m.beam((x, y, zb + RH), (x, y, zb + 2.25), 0.03, K["black"])
    m.beam((x - 0.55, y, zb + 2.25), (x + 0.55, y, zb + 2.25), 0.03, K["black"])
    m.beam((x, y - 0.55, zb + 2.25), (x, y + 0.55, zb + 2.25), 0.03, K["black"])
    for (dx, dy) in ((-0.55, 0), (0.55, 0), (0, -0.55), (0, 0.55)):
        m.beam((x + dx, y + dy, zb + 2.25), (x + dx, y + dy, zb + 1.95), 0.015, K["black"])
        m.sphere((x + dx, y + dy, zb + 1.88), 0.1, mat("mobile_star", "#ffe27a", 1.5), u=6, v=4)
    m.done()
    m = Mesh("prop_nursery_3", (cx + 1.8, 0.2, zb))  # rocking horse
    hm = mat("horse", "#8a4b2a")
    hx, hy = cx + 1.8, 0.2
    for s in (-0.22, 0.22):
        pts = [(hx + 0.8 * math.sin(a), hy + s, zb + 0.18 - 0.18 * math.cos(a)) for a in [(-1 + i / 4) * 1.1 for i in range(9)]]
        for a, b in zip(pts, pts[1:]):
            m.beam(a, b, 0.07, K["wood_dk"])
        m.beam((hx - 0.4, hy + s, zb + 0.05), (hx - 0.3, hy + s * 0.6, zb + 0.65), 0.07, hm)
        m.beam((hx + 0.4, hy + s, zb + 0.05), (hx + 0.3, hy + s * 0.6, zb + 0.65), 0.07, hm)
    m.box((hx, hy, zb + 0.75), (0.95, 0.3, 0.32), hm)
    m.beam((hx + 0.4, hy, zb + 0.8), (hx + 0.62, hy, zb + 1.25), 0.2, hm)
    m.box((hx + 0.75, hy, zb + 1.28), (0.42, 0.2, 0.2), hm, rot=Matrix.Rotation(-0.35, 4, "Y"))
    m.beam((hx - 0.47, hy, zb + 0.82), (hx - 0.72, hy, zb + 0.45), 0.08, K["black"])
    m.beam((hx + 0.5, hy, zb + 1.22), (hx + 0.25, hy, zb + 0.95), 0.06, K["black"])
    m.done()
    m = Mesh("prop_nursery_4", (cx + 0.6, 1.95, zb + 1.9))  # tall window + curtains
    wx = cx + 0.6
    m.aabb(wx - 0.7, wx + 0.7, 1.9, 2.0, zb + 0.9, zb + 2.9, K["wood_dk"])
    m.aabb(wx - 0.6, wx + 0.6, 1.86, 1.95, zb + 1.0, zb + 2.8, K["moonglass"])
    m.aabb(wx - 0.04, wx + 0.04, 1.8, 1.86, zb + 1.0, zb + 2.8, K["wood_dk"])
    for z in (1.66, 2.33):
        m.aabb(wx - 0.6, wx + 0.6, 1.8, 1.86, zb + z - 0.03, zb + z + 0.03, K["wood_dk"])
    cm = mat("curtain_nursery", "#6a86b8")
    m.aabb(wx - 0.95, wx - 0.6, 1.7, 1.8, zb + 0.8, zb + 3.1, cm)
    m.aabb(wx + 0.6, wx + 0.95, 1.7, 1.8, zb + 0.8, zb + 3.1, cm)
    m.done()


def bookshelf(name, x, zb, rng, K):
    m = Mesh(name, (x, 1.65, zb))
    y = 1.65
    m.aabb(x - 0.7, x + 0.7, y + 0.25, y + 0.32, zb, zb + 3.0, K["wood_dk"])
    for s in (-1, 1):
        m.aabb(x + s * 0.7 - 0.05, x + s * 0.7 + 0.05, y - 0.3, y + 0.32, zb, zb + 3.0, K["wood"])
    books = [mat(f"book{i}", c) for i, c in enumerate(["#7a2a2a", "#2a4a7b", "#8a6a2a", "#3a6a3a", "#5a2a6a", "#9a8a60", "#202028"])]
    for k, z in enumerate((0.0, 0.7, 1.4, 2.1, 2.8)):
        m.aabb(x - 0.66, x + 0.66, y - 0.3, y + 0.25, zb + z, zb + z + 0.07, K["wood"])
        if z < 2.8:
            bx = x - 0.62
            while bx < x + 0.55:
                w, h = rng.uniform(0.07, 0.14), rng.uniform(0.38, 0.56)
                if rng.random() < 0.08:
                    bx += w
                    continue
                m.aabb(bx, bx + w - 0.01, y - 0.22, y + 0.2, zb + z + 0.07, zb + z + 0.07 + h, books[rng.randrange(len(books))])
                bx += w
    return m.done()


def props_library(cx, zb, K):
    rng = random.Random(11)
    bookshelf("prop_library_1", cx - 2.15, zb, rng, K)
    bookshelf("prop_library_2", cx + 2.15, zb, rng, K)
    m = Mesh("prop_library_3", (cx, 1.75, zb))  # fireplace + portrait
    st = mat("marble", "#6a6070")
    for s in (-1, 1):
        m.aabb(cx + s * 0.75 - 0.18, cx + s * 0.75 + 0.18, 1.45, 2.0, zb, zb + 1.4, st)
    m.aabb(cx - 1.0, cx + 1.0, 1.35, 2.0, zb + 1.4, zb + 1.58, st)
    m.aabb(cx - 0.7, cx + 0.7, 1.65, 2.0, zb + 1.58, zb + RH, mat("chimney_breast", "#4a3e48"))
    m.aabb(cx - 0.57, cx + 0.57, 1.85, 2.0, zb, zb + 1.4, K["black"])
    m.aabb(cx - 1.1, cx + 1.1, 1.2, 2.0, zb, zb + 0.08, st)
    for dx, h in ((-0.25, 0.55), (0.0, 0.75), (0.25, 0.5)):
        m.cyl((cx + dx, 1.8, zb + 0.12 + h / 2), 0.17, h, K["fire"], segs=6, r2=0.0)
    m.beam((cx - 0.4, 1.75, zb + 0.12), (cx + 0.4, 1.8, zb + 0.14), 0.12, K["wood_dk"], segs=6)
    m.aabb(cx - 0.55, cx + 0.55, 1.6, 1.65, zb + 1.9, zb + 3.0, mat("gilt", "#a8822a"))
    m.aabb(cx - 0.45, cx + 0.45, 1.56, 1.6, zb + 2.0, zb + 2.9, mat("portrait", "#1c1a26"))
    m.sphere((cx, 1.55, zb + 2.5), 0.2, mat("portrait_face", "#8a8070"), u=8, v=5, scale=(0.8, 0.3, 1))
    m.done()
    m = Mesh("prop_library_4", (cx + 1.35, 0.35, zb))  # wing armchair, turned toward the fire
    R = Matrix.Rotation(0.5, 4, "Z")
    piv = Vector((cx + 1.35, 0.35, zb))
    cm = mat("armchair", "#6a1f24")

    def b(c, s):
        m.box(piv + (R.to_3x3() @ Vector(c)), s, cm, rot=R)
    b((0, 0, 0.35), (0.95, 0.9, 0.35))
    b((0, 0.4, 0.95), (0.95, 0.2, 1.3))
    b((-0.45, 0.05, 0.62), (0.16, 0.8, 0.5))
    b((0.45, 0.05, 0.62), (0.16, 0.8, 0.5))
    b((-0.45, 0.3, 1.35), (0.18, 0.35, 0.5))
    b((0.45, 0.3, 1.35), (0.18, 0.35, 0.5))
    m.done()


def arch_window(m, x, w, zlo, zhi, y, K, glass):
    r = w / 2
    pts = [(x - r, zlo), (x + r, zlo), (x + r, zhi - r)]
    pts += [(x + r * math.cos(a), zhi - r + r * math.sin(a)) for a in [math.pi * i / 8 for i in range(1, 8)]]
    pts += [(x - r, zhi - r)]
    big = [(x - r - 0.1, zlo - 0.1), (x + r + 0.1, zlo - 0.1), (x + r + 0.1, zhi - r)]
    big += [(x + (r + 0.1) * math.cos(a), zhi - r + (r + 0.1) * math.sin(a)) for a in [math.pi * i / 8 for i in range(1, 8)]]
    big += [(x - r - 0.1, zhi - r)]
    m.prism(big, "XZ", y + 0.02, y + 0.1, K["wood_dk"])
    m.prism(pts, "XZ", y - 0.02, y + 0.02, glass)
    m.aabb(x - 0.03, x + 0.03, y - 0.06, y - 0.02, zlo, zhi, K["wood_dk"])
    for z in (zlo + (zhi - zlo) * 0.33, zlo + (zhi - zlo) * 0.62):
        m.aabb(x - r, x + r, y - 0.06, y - 0.02, z - 0.03, z + 0.03, K["wood_dk"])


def props_ballroom(cx, zb, K):
    m = Mesh("prop_ballroom_1", (cx, 0, zb + 2.3))  # chandelier
    br = mat("chandelier", "#c9a44a", 0.3)
    top = zb + RH
    m.beam((cx, 0, top), (cx, 0, zb + 2.2), 0.06, br)
    for r, z, n in ((1.0, zb + 2.3, 12), (0.5, zb + 2.6, 8)):
        pts = [(cx + r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z) for i in range(n)]
        for i in range(n):
            m.beam(pts[i], pts[(i + 1) % n], 0.06, br)
            if i % 2 == 0 or n == 8:
                m.beam((cx, 0, z + 0.15), pts[i], 0.04, br)
            candle(m, pts[i][0], pts[i][1], z, 0.2, K, r=0.035)
    m.sphere((cx, 0, zb + 2.05), 0.14, br, u=8, v=5)
    m.done()
    m = Mesh("prop_ballroom_2", (cx, 1.95, zb + 1.9))  # tall arched windows + curtains
    cur = mat("curtain_ballroom", "#7a1626")
    for x in (cx - 1.75, cx + 1.75):
        arch_window(m, x, 1.1, zb + 0.7, zb + 3.0, 1.93, K, K["moonglass"])
        m.aabb(x - 0.95, x - 0.6, 1.7, 1.82, zb + 0.4, zb + RH, cur)
        m.aabb(x + 0.6, x + 0.95, 1.7, 1.82, zb + 0.4, zb + RH, cur)
    m.done()
    m = Mesh("prop_ballroom_3", (cx + 1.9, 0.2, zb))  # grand piano, lid up
    px, py = cx + 1.9, 0.2
    pm = mat("piano", "#0e0d12")
    m.prism([(px - 0.8, py - 0.55), (px + 0.5, py - 0.55), (px + 0.85, py - 0.1), (px + 0.85, py + 0.55), (px - 0.8, py + 0.55)],
            "XY", zb + 0.7, zb + 1.05, pm)
    lid = Matrix.Rotation(-0.6, 4, "X")
    m.box((px, py + 0.45, zb + 1.38), (1.6, 0.04, 0.9), pm, rot=lid)
    m.beam((px, py - 0.2, zb + 1.05), (px, py + 0.1, zb + 1.6), 0.03, K["brass"])
    for (dx, dy) in ((-0.7, -0.45), (-0.7, 0.45), (0.7, 0.3)):
        m.beam((px + dx, py + dy, zb), (px + dx, py + dy, zb + 0.72), 0.1, pm)
    m.aabb(px - 0.8, px - 0.7, py - 0.5, py + 0.5, zb + 0.95, zb + 1.0, mat("keys", "#e8e0d0"))
    m.aabb(px - 1.55, px - 1.15, py - 0.35, py + 0.35, zb + 0.4, zb + 0.5, pm)
    for (dx, dy) in ((-1.5, -0.3), (-1.5, 0.3), (-1.2, -0.3), (-1.2, 0.3)):
        m.beam((px + dx, py + dy, zb), (px + dx, py + dy, zb + 0.42), 0.05, pm)
    m.done()


def props_chapel(cx, zb, K):
    m = Mesh("prop_chapel_1", (cx - 1.4, 0, zb))  # pews facing the altar (+x)
    for px in (cx - 2.4, cx - 1.4, cx - 0.4):
        m.aabb(px - 0.25, px + 0.25, -0.5, 1.4, zb + 0.42, zb + 0.5, K["wood"])
        m.aabb(px - 0.3, px - 0.22, -0.5, 1.4, zb + 0.42, zb + 1.1, K["wood"])
        for y in (-0.5, 1.4):
            m.aabb(px - 0.32, px + 0.27, y - 0.05, y + 0.05, zb, zb + 1.0, K["wood_dk"])
    m.done()
    m = Mesh("prop_chapel_2", (cx + 1.3, 1.95, zb + 2.2))  # stained glass window
    x, w, zlo, zhi = cx + 1.3, 1.5, zb + 1.2, zb + 3.15
    r = w / 2
    m.prism([(x - r - 0.12, zlo - 0.12), (x + r + 0.12, zlo - 0.12), (x + r + 0.12, zhi - 0.9), (x, zhi + 0.12), (x - r - 0.12, zhi - 0.9)],
            "XZ", 1.95, 2.0, K["black"])
    cols = [mat(f"glass_{i}", c, 2.5) for i, c in enumerate(["#9b4dff", "#e2364f", "#2f7de1", "#e0a400", "#1fb5b5"])]
    nx, nz, g = 3, 4, 0.05
    pw, ph = w / nx, (zhi - 0.85 - zlo) / nz
    for i in range(nx):
        for j in range(nz):
            x0, z0 = x - r + i * pw, zlo + j * ph
            m.aabb(x0 + g / 2, x0 + pw - g / 2, 1.9, 1.95, z0 + g / 2, z0 + ph - g / 2, cols[(i * 2 + j * 3) % 5])
    zt = zlo + nz * ph
    m.prism([(x - r + g, zt + g), (x - g / 2, zt + g), (x - g / 2, zhi - 0.05)], "XZ", 1.9, 1.95, cols[0])
    m.prism([(x + g / 2, zt + g), (x + r - g, zt + g), (x + g / 2, zhi - 0.05)], "XZ", 1.9, 1.95, cols[3])
    m.sphere((x, 1.89, zlo + 2 * ph), 0.22, cols[3], u=10, v=5, scale=(1, 0.2, 1))
    m.done()
    m = Mesh("prop_chapel_3", (cx + 1.3, 1.3, zb))  # altar, candles, cross
    m.aabb(cx + 0.55, cx + 2.05, 0.95, 1.75, zb, zb + 1.0, mat("altar", "#5a5466"))
    m.aabb(cx + 0.5, cx + 2.1, 0.9, 1.8, zb + 1.0, zb + 1.06, mat("altar_cloth", "#e8e0f0"))
    m.aabb(cx + 1.1, cx + 1.5, 0.88, 0.92, zb + 0.4, zb + 1.06, mat(f"accent_chapel", ROOM_STYLE["chapel"], 0.8))
    for dx in (-0.6, 0.6):
        candle(m, cx + 1.3 + dx, 1.35, zb + 1.06, 0.5, K)
    gold = mat("gold", "#d8b04a", 0.4)
    m.aabb(cx + 1.26, cx + 1.34, 1.3, 1.4, zb + 1.06, zb + 1.86, gold)
    m.aabb(cx + 1.1, cx + 1.5, 1.3, 1.4, zb + 1.55, zb + 1.63, gold)
    m.done()


def coffin_pts(L, W):
    return [(-L / 2, -W * 0.3), (-L * 0.22, -W / 2), (L / 2, -W * 0.27), (L / 2, W * 0.27), (-L * 0.22, W / 2), (-L / 2, W * 0.3)]


def props_crypt(cx, zb, K):
    st = mat("crypt_stone", "#5a6468")
    m = Mesh("prop_crypt_1", (cx, 1.8, zb))  # arcade along the back wall
    for x in (-2.625, -0.875, 0.875, 2.625):
        m.aabb(cx + x - 0.15, cx + x + 0.15, 1.6, 2.0, zb, zb + 2.0, st)
    for xc in (-1.75, 0.0, 1.75):
        m.aabb(cx + xc - 0.73, cx + xc + 0.73, 1.94, 2.0, zb, zb + 2.0, mat("recess", "#0e1214"))
        pts = [(cx + xc + 0.875 * math.cos(a), 1.8, zb + 2.0 + 0.875 * math.sin(a)) for a in [math.pi * i / 7 for i in range(8)]]
        for a, b in zip(pts, pts[1:]):
            m.beam(a, b, 0.32, st)
    m.done()
    wood = mat("coffin", "#3a2418")
    m = Mesh("prop_crypt_2", (cx - 1.0, 0.0, zb))  # coffin on a plinth, skull, candles
    m.aabb(cx - 2.2, cx + 0.2, -0.6, 0.6, zb, zb + 0.55, st)
    m.prism([(cx - 1.0 + p[0], p[1]) for p in coffin_pts(2.0, 0.85)], "XY", zb + 0.55, zb + 1.05, wood)
    m.prism([(cx - 1.0 + p[0], p[1]) for p in coffin_pts(2.08, 0.92)], "XY", zb + 1.05, zb + 1.12, K["wood_dk"])
    m.aabb(cx - 1.5, cx - 0.7, -0.04, 0.04, zb + 1.12, zb + 1.16, K["brass"])
    m.aabb(cx - 1.32, cx - 1.24, -0.22, 0.22, zb + 1.12, zb + 1.16, K["brass"])
    m.sphere((cx - 0.05, -0.35, zb + 0.72), 0.17, mat("bone", "#d8d0b8"), u=8, v=5)
    m.done()
    m = Mesh("prop_crypt_3", (cx + 1.75, 1.45, zb))  # upright coffin in the arch, lid ajar
    m.prism([(cx + 1.75 + p[1], zb + 1.05 + p[0]) for p in coffin_pts(2.0, 0.8)], "XZ", 1.3, 1.75, wood)
    m.prism([(cx + 1.75 + p[1], zb + 1.05 + p[0]) for p in coffin_pts(2.0, 0.8)], "XZ", 1.18, 1.3, K["black"])
    R = Matrix.Rotation(0.45, 4, "Z")
    m.box((cx + 1.55, 1.05, zb + 1.05), (0.82, 0.08, 1.95), K["wood_dk"], rot=R)
    m.done()
    m = Mesh("prop_crypt_4", (cx - 0.1, 0.9, zb))  # candle cluster
    for (dx, dy, h) in ((0, 0, 0.6), (0.18, 0.1, 0.4), (-0.15, 0.15, 0.3), (0.05, -0.18, 0.25), (0.3, -0.1, 0.5)):
        candle(m, cx - 0.1 + dx, 0.9 + dy, zb, h, K, r=0.055)
    m.done()


def props_extra(rid, cx, zb, K):
    """One more hero prop per room for close-ups (named after the room's last prop)."""
    n = {"attic": 5, "nursery": 5, "library": 5, "ballroom": 4, "chapel": 4, "crypt": 5}[rid]
    m = Mesh(f"prop_{rid}_{n}", (cx, 0, zb))
    if rid == "attic":  # bare bulb on a cord + canvases leaning on the back wall
        m.beam((cx - 0.5, -0.3, zb + RH), (cx - 0.5, -0.3, zb + 2.55), 0.02, K["black"])
        m.sphere((cx - 0.5, -0.3, zb + 2.48), 0.09, mat("bulb", "#ffd9a0", 6.0), u=8, v=5)
        FLAMES.append((cx - 0.5, -0.3, zb + 2.4))
        for i, (dx, h) in enumerate(((0.15, 0.9), (0.45, 0.7))):
            m.box((cx + dx, 1.75 - i * 0.06, zb + h / 2), (0.7, 0.05, h), mat("gilt", "#a8822a"), rot=Matrix.Rotation(-0.18, 4, "X"))
            m.box((cx + dx, 1.72 - i * 0.06, zb + h / 2), (0.58, 0.05, h - 0.12), mat("canvas", "#2a2430"), rot=Matrix.Rotation(-0.18, 4, "X"))
    elif rid == "nursery":  # teddy bear + toy blocks
        bear = mat("teddy", "#9a6a3a")
        x, y = cx - 2.3, 0.9
        m.sphere((x, y, zb + 0.28), 0.26, bear, u=10, v=6, scale=(1, 0.9, 1.1))
        m.sphere((x, y, zb + 0.66), 0.19, bear, u=10, v=6)
        for sx in (-1, 1):
            m.sphere((x + sx * 0.14, y, zb + 0.82), 0.07, bear, u=6, v=4)
            m.sphere((x + sx * 0.25, y - 0.12, zb + 0.12), 0.1, bear, u=6, v=4)
        m.sphere((x, y - 0.17, zb + 0.63), 0.06, mat("teddy_snout", "#d8b890"), u=6, v=4)
        for i, (bx, c) in enumerate(((0.0, "#e2364f"), (0.24, "#2f7de1"), (0.12, "#e0a400"))):
            m.box((cx + 0.6 + bx, 0.9, zb + 0.1 + (0.2 if i == 2 else 0)), (0.2, 0.2, 0.2), mat(f"block{i}", c), rot=Matrix.Rotation(0.3 * i, 4, "Z"))
    elif rid == "library":  # globe on a stand
        x, y = cx - 1.25, -0.15
        m.cyl((x, y, zb + 0.05), 0.25, 0.1, K["wood_dk"], segs=8)
        m.beam((x, y, zb), (x, y, zb + 0.75), 0.06, K["wood_dk"])
        m.sphere((x, y, zb + 1.0), 0.26, mat("globe", "#2a5a7a"), u=12, v=8)
        m.cyl((x, y, zb + 1.0), 0.3, 0.03, mat("brass", "#b08a3a"), segs=16, rot=Matrix.Rotation(1.2, 4, "Y"))
    elif rid == "ballroom":  # floor candelabra between the windows
        x, y = cx, 1.55
        gold = mat("chandelier", "#c9a44a", 0.3)
        m.cyl((x, y, zb + 0.05), 0.22, 0.1, gold, segs=8)
        m.beam((x, y, zb), (x, y, zb + 1.5), 0.05, gold)
        for dx in (-0.3, 0.3):
            m.beam((x, y, zb + 1.35), (x + dx, y, zb + 1.5), 0.04, gold)
            candle(m, x + dx, y, zb + 1.5, 0.22, K, r=0.035)
        candle(m, x, y, zb + 1.5, 0.28, K, r=0.035)
    elif rid == "chapel":  # tall candle stands + red sanctuary lamp
        iron = K["black"]
        for x in (cx + 0.3, cx + 2.35):
            m.cyl((x, 1.2, zb + 0.05), 0.18, 0.1, iron, segs=6)
            m.beam((x, 1.2, zb), (x, 1.2, zb + 1.25), 0.05, iron)
            m.cyl((x, 1.2, zb + 1.27), 0.1, 0.05, iron, segs=6)
            candle(m, x, 1.2, zb + 1.3, 0.35, K, r=0.05)
        m.beam((cx + 1.3, 0.3, zb + RH), (cx + 1.3, 0.3, zb + 2.6), 0.02, iron)
        m.cyl((cx + 1.3, 0.3, zb + 2.5), 0.12, 0.22, mat("sanctuary_lamp", "#ff2a2a", 3.0), segs=8, r2=0.06)
    elif rid == "crypt":  # urns in the arch recesses
        urn = mat("urn", "#7a6a50")
        for x, h in ((cx - 1.75, 0.6), (cx - 2.15, 0.4), (cx - 0.2, 0.5)):
            m.cyl((x, 1.7, zb + h * 0.35), 0.13, h * 0.7, urn, segs=8, r2=0.2)
            m.cyl((x, 1.7, zb + h * 0.8), 0.2, h * 0.3, urn, segs=8, r2=0.08)
            m.cyl((x, 1.7, zb + h + 0.03), 0.1, 0.06, urn, segs=8)
    m.done()


PROPS = {"attic": props_attic, "nursery": props_nursery, "library": props_library,
         "ballroom": props_ballroom, "chapel": props_chapel, "crypt": props_crypt}


# ---------- exterior ----------
def exterior(K):
    m = Mesh("house_shell")
    for s in (-1, 1):  # outer walls and shaft walls (cut at y = -RD/2: the section reads as a thick outline)
        m.aabb(s * OUTER - (WALL if s > 0 else 0), s * OUTER + (WALL if s < 0 else 0), -RD / 2, RD / 2 + WALL, FOUND - FL, TOP, K["siding"])
        a = s * (GAP / 2)
        m.aabb(min(a, a - s * WALL), max(a, a - s * WALL), -RD / 2, RD / 2 + WALL, FOUND - FL, TOP, K["siding"])
    m.aabb(-OUTER - 0.25, OUTER + 0.25, -RD / 2 - 0.25, RD / 2 + WALL + 0.25, 0, FOUND - FL, K["stone"])
    m.aabb(-OUTER, OUTER, -RD / 2, RD / 2 + WALL, TOP - FL, TOP, K["siding"])  # top ceiling slab
    m.aabb(-OUTER - 0.2, OUTER + 0.2, -RD / 2 - 0.2, RD / 2 + WALL + 0.2, TOP, TOP + 0.25, K["trim"])  # cornice
    for row in range(3):  # floor bands on the cut face
        z = zbase(row)
        m.aabb(-OUTER - 0.1, OUTER + 0.1, -RD / 2 - 0.12, -RD / 2, z - FL, z, K["trim"])
    m.done()

    m = Mesh("stairs")
    w = GAP / 2 - WALL
    m.aabb(-w, w, RD / 2 - 0.1, RD / 2 + WALL, FOUND, TOP - FL, K["shaft"])
    for row in range(3):
        z = zbase(row)
        m.aabb(-w, w, -RD / 2, RD / 2, z - FL, z, K["wood_dk"])
        m.box((0, RD / 2 - 0.2, z + 2.4), (0.25, 0.1, 0.35), K["warmglass"])  # sconce
    for row in (1, 2):
        z0, z1 = zbase(row), zbase(row - 1) - FL
        d = 1 if row == 2 else -1
        n = 8
        for k in range(n):
            x = d * (-w + 0.12 + k * (2 * w - 0.24) / (n - 1))
            m.aabb(x - 0.12, x + 0.12, -0.6, 0.9, z0, z0 + (k + 1) * (z1 - z0) / n, K["wood"])
        m.beam((-d * (w - 0.1), -0.65, z0 + 0.9), (d * (w - 0.1), -0.65, z1 + 0.9), 0.07, K["wood_dk"])
    m.done()

    m = Mesh("roof")
    for cx in (CX[0], CX[1]):
        hw, peak, y0, y1 = RW / 2 + WALL + 0.25, TOP + 3.6, -RD / 2 - 0.3, RD / 2 + WALL + 0.3
        m.prism([(cx - hw + 0.3, TOP), (cx + hw - 0.3, TOP), (cx, peak - 0.2)], "XZ", y0 + 0.15, y1, K["siding"])
        for s in (-1, 1):
            m.prism([(cx + s * (hw + 0.3), TOP - 0.25), (cx, peak), (cx, peak + 0.4), (cx + s * (hw + 0.3), TOP + 0.15)],
                    "XZ", y0 - 0.15, y1, K["roof"])
        rx = Matrix.Rotation(math.pi / 2, 4, "X")
        m.cyl((cx, y0 + 0.1, TOP + 1.4), 0.75, 0.12, K["trim"], segs=16, rot=rx)
        m.cyl((cx, y0 + 0.05, TOP + 1.4), 0.6, 0.12, K["warmglass"] if cx < 0 else K["moonglass"], segs=16, rot=rx)
        m.beam((cx, y0 - 0.25, peak + 0.35), (cx, y0 - 0.25, peak + 1.2), 0.06, K["black"])  # finial
    m.aabb(-GAP / 2, GAP / 2, -RD / 2 - 0.2, RD / 2 + WALL, TOP, TOP + 0.6, K["siding"])
    for i in range(7):  # widow's walk railing
        x = -GAP / 2 + 0.1 + i * (GAP - 0.2) / 6
        m.beam((x, -RD / 2 - 0.1, TOP + 0.6), (x, -RD / 2 - 0.1, TOP + 1.3), 0.05, K["black"])
    m.beam((-GAP / 2, -RD / 2 - 0.1, TOP + 1.3), (GAP / 2, -RD / 2 - 0.1, TOP + 1.3), 0.07, K["black"])
    m.done()

    m = Mesh("chimney")
    x = CX[0] - 1.9
    m.aabb(x - 0.45, x + 0.45, 0.3, 1.2, TOP, TOP + 4.6, mat("brick", "#4a2a2a"))
    m.aabb(x - 0.6, x + 0.6, 0.15, 1.35, TOP + 4.6, TOP + 4.85, K["trim"])
    for dx in (-0.2, 0.2):
        m.cyl((x + dx, 0.75, TOP + 5.1), 0.13, 0.5, mat("brick", "#4a2a2a"), segs=8)
    m.done()

    m = Mesh("turret")
    tx, ty = OUTER + 1.1, -0.4
    m.cyl((tx, ty, 5.6), 0.15, 1.2, K["siding"], segs=12, r2=1.4)
    m.cyl((tx, ty, 6.2 + 4.3), 1.4, 8.6, K["siding"], segs=12)
    m.cyl((tx, ty, 14.8), 1.6, 0.3, K["trim"], segs=12)
    m.cyl((tx, ty, 14.95 + 2.8), 1.75, 5.6, K["roof"], segs=12, r2=0.05)
    m.beam((tx, ty, 20.4), (tx, ty, 21.6), 0.06, K["black"])
    m.sphere((tx, ty, 21.0), 0.12, K["black"], u=6, v=4)
    for z in (8.2, 12.0):
        arch_window(m, tx, 0.7, z, z + 1.6, ty - 1.42, K, K["warmglass"] if z > 10 else K["moonglass"])
    m.done()

    m = Mesh("porch")
    px0, px1 = -OUTER - 3.3, -OUTER
    m.aabb(px0, px1, -RD / 2 - 0.4, RD / 2, 0, FOUND, K["wood_dk"])
    for k in range(3):
        m.aabb(px0 - 0.4 * (k + 1), px0 - 0.4 * k, -1.6, 1.0, 0, FOUND * (3 - k) / 4, K["stone"])
    for y in (-RD / 2 - 0.2, RD / 2 - 0.3):
        m.beam((px0 + 0.2, y, FOUND), (px0 + 0.2, y, 3.7), 0.18, K["trim"])
    m.prism([(px0 - 0.5, 3.6), (px1, 4.8), (px1, 5.1), (px0 - 0.5, 3.9)], "XZ", -RD / 2 - 0.7, RD / 2 + 0.2, K["roof"])
    m.beam((px0 + 0.2, -RD / 2 - 0.2, FOUND + 0.9), (px1, -RD / 2 - 0.2, FOUND + 0.9), 0.08, K["trim"])
    for i in range(7):
        x = px0 + 0.4 + i * 0.42
        m.beam((x, -RD / 2 - 0.2, FOUND), (x, -RD / 2 - 0.2, FOUND + 0.9), 0.05, K["trim"])
    m.box((px0 + 0.2, -RD / 2 + 0.05, 3.1), (0.22, 0.22, 0.32), K["warmglass"])  # lantern
    m.done()

    m = Mesh("tree")
    rng = random.Random(4)

    def branch(a, d, length, r, depth):
        b = a + d * length
        m.beam(a, b, r * 2, K["black"], segs=6, t2=r * 1.3)
        if depth == 0:
            return
        for k in range(2 if depth < 3 else 3):
            ang = rng.uniform(0.35, 0.8) * (1 if k % 2 == 0 else -1)
            nd = (Matrix.Rotation(ang, 3, "Y") @ d)
            nd.y += rng.uniform(-0.25, 0.25)
            nd.z += 0.15
            nd.normalize()
            branch(b, nd, length * rng.uniform(0.6, 0.78), r * 0.62, depth - 1)
    branch(Vector((-OUTER - 7.5, 1.0, -0.2)), Vector((0.12, 0, 1)).normalized(), 5.0, 0.42, 4)
    m.done()

    m = Mesh("gravestones")
    for (x, y, h, ang) in ((-OUTER - 4.5, -3.2, 1.2, 0.0), (-OUTER - 10.5, -2.4, 1.0, 0.12), (OUTER + 4.0, -3.4, 1.1, -0.1)):
        pts = [(x - 0.4, 0), (x + 0.4, 0), (x + 0.4, h - 0.4)] + [(x + 0.4 * math.cos(a), h - 0.4 + 0.4 * math.sin(a)) for a in [math.pi * i / 6 for i in range(1, 6)]] + [(x - 0.4, h - 0.4)]
        m.prism(pts, "XZ", y - 0.12, y + 0.12, K["grave"])
    m.beam((OUTER + 7.2, -2.8, 0), (OUTER + 7.2, -2.8, 1.6), 0.14, K["grave"])
    m.beam((OUTER + 6.7, -2.8, 1.15), (OUTER + 7.7, -2.8, 1.15), 0.14, K["grave"])
    m.done()

    m = Mesh("fence")
    fy = -6.5
    for s in (-1, 1):
        x0, x1 = s * 1.8, s * 22
        m.beam((x0, fy, 0.35), (x1, fy, 0.35), 0.06, K["black"])
        m.beam((x0, fy, 1.05), (x1, fy, 1.05), 0.06, K["black"])
        n = int(abs(x1 - x0) / 0.38)
        for i in range(n + 1):
            x = x0 + (x1 - x0) * i / n
            m.beam((x, fy, 0), (x, fy, 1.2), 0.05, K["black"])
            m.cyl((x, fy, 1.28), 0.06, 0.16, K["black"], segs=4, r2=0.0)
        m.aabb(s * 1.8 - 0.15, s * 1.8 + 0.15, fy - 0.15, fy + 0.15, 0, 1.8, K["black"])
        m.sphere((s * 1.8, fy, 1.95), 0.18, K["black"], u=6, v=4)
    m.done()

    m = Mesh("ground")
    m.aabb(-90, 90, -40, 80, -0.3, 0, K["ground"])
    m.aabb(-1.4, 1.4, fy - 2, -RD / 2 - 0.25, 0, 0.02, K["path"])
    m.done()
    m = Mesh("hills")
    for (x, y, sx, sz) in ((-40, 55, 40, 9), (25, 65, 50, 12), (70, 50, 30, 7)):
        m.sphere((x, y, 0), 1.0, K["hill"], u=16, v=8, scale=(sx, 8, sz))
    m.done()

    crow = mat("crow", "#050507")
    for i, (x, y, z, yaw) in enumerate(((CX[0] - 1.4, -1.0, TOP + 2.25, 0.4), (0.3, -RD / 2 - 0.1, TOP + 1.38, -0.3),
                                         (CX[1] + 1.2, -0.8, TOP + 2.35, 2.6)), start=1):
        c = Mesh(f"crow_{i}", (x, y, z))
        R = Matrix.Rotation(yaw, 4, "Z")
        c.sphere((x, y, z + 0.2), 0.3, crow, u=8, v=5, scale=(1.0, 0.45, 0.55))
        c.sphere(Vector((x, y, z)) + R.to_3x3() @ Vector((0.28, 0, 0.38)), 0.11, crow, u=8, v=5)
        c.cyl(Vector((x, y, z)) + R.to_3x3() @ Vector((0.42, 0, 0.37)), 0.04, 0.16, crow, segs=4, r2=0.0,
              rot=R @ Matrix.Rotation(math.pi / 2, 4, "Y"))
        c.box(Vector((x, y, z)) + R.to_3x3() @ Vector((-0.38, 0, 0.12)), (0.3, 0.14, 0.04), crow, rot=R @ Matrix.Rotation(0.4, 4, "Y"))
        for sy in (-0.06, 0.06):
            c.beam(Vector((x, y, z)) + R.to_3x3() @ Vector((0.02, sy, 0.05)), Vector((x, y, z)) + R.to_3x3() @ Vector((0.04, sy, -0.12)), 0.025, crow)
        c.done()
    m = Mesh("moon", (-34, 78, 29))
    m.sphere((-34, 78, 29), 10.0, K["moon"], u=32, v=16)
    toward = (Vector((-1, -44, 13)) - Vector((-34, 78, 29))).normalized()
    side = toward.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(toward).normalized()
    maria = mat("moon_maria", "#a9a698", 1.3)
    for (a, b, r) in ((-0.35, 0.3, 2.6), (0.3, 0.1, 1.8), (0.05, -0.45, 2.2), (0.5, -0.35, 1.1), (-0.55, -0.2, 1.0)):
        c = Vector((-34, 78, 29)) + side * (a * 10) + up * (b * 10)
        c = Vector((-34, 78, 29)) + (c - Vector((-34, 78, 29)) + toward * 10).normalized() * 9.9
        m.sphere(c, r, maria, u=12, v=6, scale=(1, 0.25, 1))
    m.done()


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()
    FLAMES.clear()
    SEATS.clear()
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
    K = P()
    for row, pair in enumerate(ROOM_GRID):
        for col, rid in enumerate(pair):
            cx, zb = CX[col], zbase(row)
            room_shell(rid, cx, zb, K)
            PROPS[rid](cx, zb, K)
            props_extra(rid, cx, zb, K)
            seats(rid, cx, zb, K)
            empty(f"room_{rid}_light", (cx, -0.4, zb + RH - 0.55))
            side = -1 if col == 0 else 1  # kill cam: low 3/4 from the outside edge, slight dutch
            camera(f"cam_{rid}", (cx - side * 2.4, -RD / 2 - 4.2, zb + 1.3), (cx + side * 0.3, 0.6, zb + 1.5), 22,
                   roll=side * 0.06)
    exterior(K)
    camera("cam_overview", (-1.0, -44.0, 13.0), (-1.0, 0.0, 9.6), 35)
    scene.camera = bpy.data.objects["cam_overview"]
    return scene


def bake_vertex_shade():
    """Hand-made shading the live three.js stage gets too: a COLOR_0 multiplier per face corner (darker near each
    floor and the ground, like contact shadow and grime, with a little per-face jitter so planks and books vary)."""
    rng = random.Random(5)
    floors = sorted(zbase(r) for r in range(3))
    for ob in bpy.context.scene.objects:
        if ob.type != "MESH" or ob.name in ("moon", "hills", "ground"):
            continue
        me = ob.data
        attr = me.color_attributes.new("shade", "BYTE_COLOR", "CORNER")
        mw = ob.matrix_world
        for poly in me.polygons:
            j = rng.uniform(0.86, 1.0)
            for li in poly.loop_indices:
                z = (mw @ me.vertices[me.loops[li].vertex_index].co).z
                base = max([f for f in floors if f <= z + 0.01], default=0.0)
                ao = 0.62 + 0.38 * min(1.0, max(0.0, z - base) / 1.4)
                v = ao * j
                attr.data[li].color = (v, v, v, 1.0)
        me.color_attributes.active_color = attr


def tri_count():
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH":
            me = ob.evaluated_get(dg).to_mesh()
            n += sum(len(p.vertices) - 2 for p in me.polygons)
            ob.evaluated_get(dg).to_mesh_clear()
    return n


def export():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bake_vertex_shade()
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_cameras=True,
                              export_lights=False, export_apply=True, export_texcoords=False, export_normals=True,
                              export_vertex_color="ACTIVE")
    print(f"L15 house.glb written: {OUT} ({os.path.getsize(OUT)} bytes, {tri_count()} triangles)")


if __name__ == "__main__":
    build()
    export()
