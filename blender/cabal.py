# L16b CABAL ROOM ART: top-down shot of the evil-cabal round table (one candle, six-room house map inlaid,
# four heavy chairs N/E/S/W for the hunter portraits, deep shadow at the edges for subtitles).
# Run: /Applications/Blender.app/Contents/MacOS/Blender -b --python blender/cabal.py [-- --variants]
# Writes web/public/3d/cabal/table.png (1920x1080) + seats.json (pixel anchors); --variants adds table-1..4.png.
import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render  # noqa: E402  (night_base: same engine, world, bloom and grade as the house)

OUT = os.path.abspath(os.path.join(HERE, "..", "web", "public", "3d", "cabal"))
W, H = 1920, 1080
TOP = 0.92  # table top height
GRID = [["attic", "nursery"], ["library", "ballroom"], ["chapel", "crypt"]]  # contract ROOM_GRID, top to bottom
TINT = {"attic": "#7b3fbf", "nursery": "#d0a020", "library": "#2f7fd0", "ballroom": "#2fa84f",
        "chapel": "#e0e0e0", "crypt": "#c03030"}
MAP_W, MAP_H = 2.3, 2.55  # house map inlay in metres (2 cols x 3 floors), plus a roof gable above
SEAT_R = 3.25
SEATS = {"exorcist": (0, 1), "medium": (1, 0), "skeptic": (0, -1), "priest": (-1, 0)}  # N, E, S, W


def hexrgb(h, k=1.0):
    return tuple(int(h[i:i + 2], 16) / 255 * k for i in (1, 3, 5)) + (1,)


def mat(name, color, rough=0.6, metal=0.0, emit=None, noise=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = color
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit:
        p.inputs["Emission Color"].default_value = emit[0]
        p.inputs["Emission Strength"].default_value = emit[1]
    if noise:  # grain/stone: voronoi or wave mixed over the base
        scale, kind = noise
        t = nt.nodes.new("ShaderNodeTexVoronoi" if kind == "stone" else "ShaderNodeTexWave")
        t.inputs["Scale"].default_value = scale
        if kind == "wood":
            t.inputs["Distortion"].default_value = 6.0
        r = nt.nodes.new("ShaderNodeMix")
        r.data_type = "RGBA"
        r.inputs["Factor"].default_value = 0.55
        r.inputs["A"].default_value = color
        r.inputs["B"].default_value = tuple(c * 0.45 for c in color[:3]) + (1,)
        nt.links.new(t.outputs["Color"] if kind == "wood" else t.outputs["Distance"], r.inputs["Factor"])
        nt.links.new(r.outputs["Result"], p.inputs["Base Color"])
    return m


def box(name, loc, size, m, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        b = o.modifiers.new("b", "BEVEL")
        b.width, b.segments = bevel, 2
    o.data.materials.append(m)
    return o


def cyl(name, loc, r, d, m, verts=64):
    bpy.ops.mesh.primitive_cylinder_add(location=loc, radius=r, depth=d, vertices=verts)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return o


def point(name, loc, color, energy, radius=0.05):
    ld = bpy.data.lights.new(name, "POINT")
    ld.color, ld.energy, ld.shadow_soft_size = color, energy, radius
    o = bpy.data.objects.new(name, ld)
    o.location = loc
    bpy.context.collection.objects.link(o)
    return o


def build():
    stone = mat("floor", (0.07, 0.07, 0.08, 1), 0.9, noise=(2.2, "stone"))
    wood = mat("table", (0.16, 0.07, 0.035, 1), 0.45, noise=(1.4, "wood"))
    dark = mat("chairwood", (0.05, 0.025, 0.018, 1), 0.5, noise=(3.0, "wood"))
    brass = mat("brass", (0.75, 0.52, 0.22, 1), 0.3, metal=1.0)
    velvet = mat("velvet", (0.22, 0.02, 0.04, 1), 0.9)
    wax = mat("wax", (0.85, 0.80, 0.68, 1), 0.5)
    flame = mat("flame", (1, 0.6, 0.2, 1), 1, emit=((1.0, 0.55, 0.15, 1), 60))

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    bpy.context.object.data.materials.append(stone)
    # round table: thick slab, brass rim, pedestal
    cyl("table", (0, 0, TOP - 0.06), 2.5, 0.12, wood, 128)
    cyl("rim", (0, 0, TOP - 0.065), 2.55, 0.10, brass, 128)
    cyl("pedestal", (0, 0, TOP / 2), 0.5, TOP, dark)
    # rune ring: twelve brass studs around the map
    for i in range(12):
        a = i / 12 * math.tau
        cyl(f"stud{i}", (2.32 * math.cos(a), 2.32 * math.sin(a), TOP + 0.005), 0.05, 0.02, brass, 16)
    bpy.ops.mesh.primitive_torus_add(location=(0, 0, TOP), major_radius=2.17, minor_radius=0.018, major_segments=128)
    bpy.context.object.data.materials.append(brass)

    # house map: six recessed panels (each a faint room tint) inside a brass frame, roof gable above
    cw, rh, gap = MAP_W / 2, MAP_H / 3, 0.04
    y0 = MAP_H / 2 - 0.2  # shift the house down a touch so the gable fits the ring
    rooms = {}
    box("mapframe", (0, -0.2, TOP + 0.003), (MAP_W + 0.08, MAP_H + 0.08, 0.012), brass)
    for r, row in enumerate(GRID):
        for c, rid in enumerate(row):
            x = (c - 0.5) * cw
            y = y0 - (r + 0.5) * rh
            m = mat(f"room-{rid}", hexrgb(TINT[rid], 0.16), 0.8, noise=(6.0, "stone"))
            box(f"room-{rid}", (x, y, TOP + 0.006), (cw - gap, rh - gap, 0.012), m)
            rooms[rid] = Vector((x, y, TOP + 0.012))
    gable = bpy.data.meshes.new("gable")
    gy = y0 + 0.02
    gable.from_pydata([(-MAP_W / 2 - 0.1, gy, TOP + 0.01), (MAP_W / 2 + 0.1, gy, TOP + 0.01), (0, gy + 0.5, TOP + 0.01)],
                      [], [(0, 1, 2)])
    g = bpy.data.objects.new("gable", gable)
    g.data.materials.append(brass)
    bpy.context.collection.objects.link(g)

    # candle: centre, on a brass dish
    cyl("dish", (0, 0, TOP + 0.02), 0.22, 0.03, brass)
    cyl("candle", (0, 0, TOP + 0.36), 0.075, 0.65, wax, 32)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, location=(0, 0, TOP + 0.74))
    f = bpy.context.object
    f.scale = (1, 1, 2.2)
    f.data.materials.append(flame)

    # four heavy high-back chairs, backs facing outward
    seats = {}
    for name, (dx, dy) in SEATS.items():
        a = math.atan2(dy, dx)
        cx, cy = SEAT_R * dx, SEAT_R * dy
        seat = box(f"seat-{name}", (cx, cy, 0.5), (0.95, 0.95, 0.14), dark, 0.03)
        box(f"cushion-{name}", (cx, cy, 0.6), (0.78, 0.78, 0.07), velvet, 0.03)
        bx, by = (SEAT_R + 0.5) * dx, (SEAT_R + 0.5) * dy
        back = box(f"back-{name}", (bx, by, 1.15), (1.15, 0.18, 1.5), dark, 0.04)
        back.rotation_euler.z = a + math.pi / 2
        crest = cyl(f"crest-{name}", (bx, by, 1.92), 0.13, 0.06, brass, 24)
        crest.rotation_euler = (math.pi / 2, 0, a + math.pi / 2)
        for s in (-1, 1):  # arms
            ax, ay = cx - s * 0.5 * dy, cy + s * 0.5 * dx
            arm = box(f"arm-{name}{s}", (ax, ay, 0.78), (0.95, 0.12, 0.12), dark, 0.02)
            arm.rotation_euler.z = a
        seat.rotation_euler.z = a
        seats[name] = Vector((cx, cy, 0.64))
    return rooms, seats


def lights(flicker=0):
    k = [1.0, 0.82, 1.12, 0.92, 1.05][flicker]
    off = [(0, 0), (0.02, -0.01), (-0.02, 0.015), (0.01, 0.02), (-0.015, -0.02)][flicker]
    point("candle", (off[0], off[1], TOP + 0.80), (1.0, 0.55, 0.22), 300 * k, 0.04)
    point("candlefill", (off[0], off[1], TOP + 1.6), (1.0, 0.45, 0.2), 90 * k, 0.6)
    sd = bpy.data.lights.new("moon", "SPOT")  # a cold moon shaft from a high window, upper left
    sd.color, sd.energy, sd.spot_size, sd.spot_blend, sd.shadow_soft_size = (0.55, 0.65, 1.0), 2500, 0.5, 0.6, 0.3
    mo = bpy.data.objects.new("moon", sd)
    mo.location = (-6, 5, 9)
    mo.rotation_euler = (Vector((0, 0, 0)) - mo.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(mo)


def camera():
    cd = bpy.data.cameras.new("cam")
    cd.lens = 30
    cam = bpy.data.objects.new("cam", cd)
    cam.location = (0, -2.4, 12.0)
    cam.rotation_euler = (Vector((0, -0.25, 0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(cam)
    return cam


def px(scene, cam, v):
    co = world_to_camera_view(scene, cam, v)
    return [round(co.x * W), round((1 - co.y) * H)]


def main():
    variants = "--variants" in sys.argv
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    render.night_base(scene, fog=0.01)
    scene.view_settings.exposure = 0.2
    rooms, seats = build()
    cam = camera()
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = W, H, 100
    scene.eevee.taa_render_samples = 64
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 100
    os.makedirs(OUT, exist_ok=True)

    shots = [0] + ([1, 2, 3, 4] if variants else [])
    for i in shots:
        for o in [o for o in scene.objects if o.type == "LIGHT"]:
            bpy.data.objects.remove(o)
        lights(i)
        scene.render.filepath = os.path.join(OUT, "table.png" if i == 0 else f"table-{i}.png")
        bpy.ops.render.render(write_still=True)
        print(f"L16b cabal {scene.render.filepath}: {os.path.getsize(scene.render.filepath) // 1024} KB")

    c = [px(scene, cam, Vector(p)) for p in ((-MAP_W / 2, MAP_H / 2 - 0.2, TOP), (MAP_W / 2, -MAP_H / 2 - 0.2, TOP))]
    data = {
        "size": [W, H],
        "seats": {k: px(scene, cam, v) for k, v in seats.items()},
        "map": {"x": c[0][0], "y": c[0][1], "w": c[1][0] - c[0][0], "h": c[1][1] - c[0][1]},
        "rooms": {k: px(scene, cam, v) for k, v in rooms.items()},
        "candle": px(scene, cam, Vector((0, 0, TOP + 0.74))),
    }
    with open(os.path.join(OUT, "seats.json"), "w") as fh:
        json.dump(data, fh, indent=1)
    print("L16b cabal seats.json", json.dumps(data))


main()
