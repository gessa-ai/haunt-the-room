# L15 BLENDER: pre-rendered stage art for the 2.5D Pixi stage (conductor decision 13:28).
# Run: /Applications/Blender.app/Contents/MacOS/Blender -b --python blender/stage.py
# Writes web/public/3d/stage/: overview.webp (3840x2160) + overview.json (room rects, float points, moon),
# killcam-<id>-{dark,swept,possessed}.webp (1920x1080), intro.webp (1920x1080). PNG -> cwebp q80 (< 400 KB).
import json
import os
import subprocess
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import house  # noqa: E402
import render  # noqa: E402

OUT = os.path.abspath(os.path.join(HERE, "..", "web", "public", "3d", "stage"))
TMP = os.path.join(HERE, ".renders")
ROOMS = [rid for row in house.ROOM_GRID for rid in row]
MAX_BYTES = 400 * 1024


def webp(png, dst):
    name = os.path.basename(dst)
    for q in (80, 72, 64, 56):
        subprocess.run(["cwebp", "-quiet", "-q", str(q), "-m", "6", png, "-o", dst], check=True)
        if os.path.getsize(dst) < MAX_BYTES:
            break
    size = os.path.getsize(dst)
    if size >= MAX_BYTES:
        raise RuntimeError(f"{name} is {size} bytes even at q{q}")
    print(f"L15 stage {name}: {size // 1024} KB (q{q})")


def shoot(scene, cam, name, w, h, samples=64):
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.eevee.taa_render_samples = samples
    png = os.path.join(TMP, name.replace(".webp", ".png"))
    scene.render.filepath = png
    bpy.ops.render.render(write_still=True)
    webp(png, os.path.join(OUT, name))


def px(scene, cam, co, w, h):
    v = world_to_camera_view(scene, cam, Vector(co))
    return round(v.x * w, 1), round((1 - v.y) * h, 1)


def add_camera(name, loc, target, lens):
    return house.camera(name, loc, target, lens)


def overview(scene):
    W, H = 3840, 2160
    # ~12% tighter than preview-night, shifted so the house sits in the left ~75% (UI panel room on the right)
    cam = add_camera("stage_overview", (3.4, -44.0, 11.0), (3.4, 0.0, 10.4), 39)
    scene.render.resolution_x, scene.render.resolution_y = W, H
    bpy.context.view_layer.update()  # world_to_camera_view reads matrix_world
    rooms = {}
    for r, row in enumerate(house.ROOM_GRID):
        for c, rid in enumerate(row):
            cx, zb = house.CX[c], house.zbase(r)
            y0 = -house.RD / 2
            corners = [px(scene, cam, (cx + sx * house.RW / 2, y0, zb + sz * house.RH), W, H) for sx in (-1, 1) for sz in (0, 1)]
            xs, ys = [p[0] for p in corners], [p[1] for p in corners]
            floats = [px(scene, cam, (cx + dx, -0.3, zb + dz), W, H) for dz in (1.1, 2.2) for dx in (-2.1, -0.7, 0.7, 2.1)]
            rooms[rid] = {"x": min(xs), "y": min(ys), "w": round(max(xs) - min(xs), 1), "h": round(max(ys) - min(ys), 1),
                          "float": [list(p) for p in floats],
                          "seats": [list(px(scene, cam, sp, W, H)) for sp in house.SEATS[rid]]}
    moon = bpy.data.objects["moon"].location
    mc = px(scene, cam, moon, W, H)
    edge = px(scene, cam, moon + Vector((10, 0, 0)), W, H)
    meta = {"image": "overview.webp", "width": W, "height": H, "rooms": rooms,
            "moon": {"x": mc[0], "y": mc[1], "r": round(abs(edge[0] - mc[0]), 1)}}
    with open(os.path.join(OUT, "overview.json"), "w") as f:
        json.dump(meta, f, indent=1)
    shoot(scene, cam, "overview.webp", W, H)


def killcams(scene):
    for rid in ROOMS:
        cam = bpy.data.objects[f"cam_{rid}"]
        room = bpy.data.objects[f"room_{rid}"].location
        L = bpy.data.objects[f"L_{rid}"]
        base_color, base_energy = tuple(L.data.color), L.data.energy
        shoot(scene, cam, f"killcam-{rid}-dark.webp", 1920, 1080)
        # swept: harsh cold flashlight from the camera side, candles nearly out
        spot = render.light("L_swept", "SPOT", cam.location + Vector((0, 0.5, 0.4)), (0.82, 0.9, 1.0), 9000, size=0.05,
                            direction=(room + Vector((0, 0.8, 1.4))) - (cam.location + Vector((0, 0.5, 0.4))))
        spot.data.spot_size, spot.data.spot_blend = 0.75, 0.15
        L.data.energy = base_energy * 0.15
        shoot(scene, cam, f"killcam-{rid}-swept.webp", 1920, 1080)
        bpy.data.objects.remove(spot)
        # possessed: the room floods with its signature colour
        accent = house.hexc(house.ROOM_STYLE[rid])
        L.data.color, L.data.energy = accent, 2600
        flood = render.light("L_flood", "POINT", room + Vector((0, 1.2, 0.4)), accent, 1800, size=1.0)
        shoot(scene, cam, f"killcam-{rid}-possessed.webp", 1920, 1080)
        bpy.data.objects.remove(flood)
        L.data.color, L.data.energy = base_color, base_energy


def intro(scene):
    cam = add_camera("stage_intro", (-13.0, -23.0, 0.8), (-3.0, 0.0, 11.5), 22)
    shoot(scene, cam, "intro.webp", 1920, 1080)


def main():
    os.makedirs(TMP, exist_ok=True)
    scene = house.build()
    render.setup(scene)
    scene.render.image_settings.file_format = "PNG"
    overview(scene)
    intro(scene)
    killcams(scene)


if __name__ == "__main__":
    main()
