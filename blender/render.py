# L15 BLENDER: moonlit taste-review renders of the house (same build() as the glb, plus lights, fog, bloom).
# Run: /Applications/Blender.app/Contents/MacOS/Blender -b --python blender/render.py
# Output: web/public/3d/preview-night.png, preview-killcam.png (+ *-dither.png: a rough ordered-dither preview
# of the look on top; the real dither shader belongs to the three.js stage).
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import house  # noqa: E402

OUTDIR = os.path.join(HERE, "..", "web", "public", "3d")


def light(name, kind, loc, color, energy, size=0.3, direction=None):
    ld = bpy.data.lights.new(name, kind)
    ld.color, ld.energy = color, energy
    if kind == "SUN":
        ld.angle = 0.05
    else:
        ld.shadow_soft_size = size
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    if direction is not None:
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = Vector(direction).to_track_quat("-Z", "Y")
    bpy.context.scene.collection.objects.link(ob)
    return ob


def setin(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value
    else:
        setattr(node, name.lower().replace(" ", "_"), value)


def night_base(scene, fog=0.0035):
    """Engine, night world with volumetric haze, bloom. Shared by render.py, stage.py, story.py."""
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    ee = scene.eevee
    ee.taa_render_samples = 64
    ee.volumetric_end = 160.0
    ee.volumetric_tile_size = "4"
    ee.shadow_pool_size = "1024"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = 0.4
    scene.render.film_transparent = False

    w = bpy.data.worlds.new("night")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    bg.inputs["Color"].default_value = (0.010, 0.016, 0.045, 1)
    bg.inputs["Strength"].default_value = 1.0
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (0.55, 0.65, 1.0, 1)
    vol.inputs["Density"].default_value = fog
    nt.links.new(vol.outputs[0], nt.nodes["World Output"].inputs["Volume"])

    scene.use_nodes = True
    tree = scene.node_tree
    for n in list(tree.nodes):
        tree.nodes.remove(n)
    rl = tree.nodes.new("CompositorNodeRLayers")
    gl = tree.nodes.new("CompositorNodeGlare")
    out = tree.nodes.new("CompositorNodeComposite")
    try:
        gl.glare_type = "BLOOM"
    except TypeError:
        gl.glare_type = "FOG_GLOW"
    for k, v in (("Threshold", 0.8), ("Strength", 0.6), ("Size", 0.6)):
        try:
            setin(gl, k, v)
        except Exception as ex:  # property names moved between versions; report, never hide
            print(f"L15 glare {k} not set: {ex}")
    tree.links.new(rl.outputs["Image"], gl.inputs["Image"])
    # one colour grade for every render: cool shadows, warm highlights, a little extra contrast
    cb = tree.nodes.new("CompositorNodeColorBalance")
    cb.correction_method = "LIFT_GAMMA_GAIN"
    for k, v in (("lift", (0.97, 0.99, 1.06, 1)), ("gamma", (1.0, 0.99, 1.0, 1)), ("gain", (1.06, 1.0, 0.92, 1))):
        socks = [i for i in cb.inputs if i.name == k.capitalize() and i.type == "RGBA"]
        if socks:  # 4.5+: colour sockets
            socks[0].default_value = v
        else:
            setattr(cb, k, v[:3])
    tree.links.new(gl.outputs["Image"], cb.inputs["Image"])
    tree.links.new(cb.outputs["Image"], out.inputs["Image"])


def fog_slab(loc, scale, density, color=(0.6, 0.7, 1.0)):
    """A box of denser volumetric fog (ground mist)."""
    fogm = bpy.data.materials.new("groundfog")
    fogm.use_nodes = True
    fn = fogm.node_tree.nodes
    for n in list(fn):
        if n.type != "OUTPUT_MATERIAL":
            fn.remove(n)
    fv = fn.new("ShaderNodeVolumePrincipled")
    fv.inputs["Color"].default_value = (*color, 1)
    fv.inputs["Density"].default_value = density
    fogm.node_tree.links.new(fv.outputs[0], fn["Material Output"].inputs["Volume"])
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    fog = bpy.context.active_object
    fog.name = "fog_volume"
    fog.scale = scale
    fog.data.materials.append(fogm)
    return fog


TEX = {  # material name prefix -> procedural surface (renders only; the glb keeps flat base colours)
    "wood": "grain", "trunk": "grain", "floor_": "grain", "crate": "grain", "coffin": "grain", "chimney_breast": "stone",
    "wall_nursery": "stripe", "wall_ballroom": "damask", "wall_library": "stripe", "wall_attic": "grain",
    "wall_chapel": "stone", "wall_crypt": "stone", "brick": "brick", "roof": "shingle", "siding": "clap",
    "stone": "stone", "crypt_stone": "stone", "marble": "stone", "grave": "stone", "ground": "noise",
}


def texturize():
    """Hand-made look for close-ups: wood grain, wallpaper, brick, slate shingles, clapboard, stone, weathering."""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        p = nt.nodes.get("Principled BSDF")
        if p is None or p.inputs["Base Color"].is_linked:
            continue
        kind = next((k for pre, k in TEX.items() if m.name.startswith(pre)), None)
        if kind is None:  # every other non-glowing surface still gets wear
            if p.inputs["Emission Strength"].default_value > 0:
                continue
            kind = "grime"
        base = tuple(p.inputs["Base Color"].default_value)
        tc = nt.nodes.new("ShaderNodeTexCoord")
        if kind in ("grain", "stripe", "clap", "damask"):
            t = nt.nodes.new("ShaderNodeTexWave")
            t.wave_type = "BANDS"
            t.bands_direction = {"grain": "X", "stripe": "X", "damask": "X", "clap": "Z"}[kind]
            t.inputs["Scale"].default_value = {"grain": 3.0, "stripe": 9.0, "damask": 6.0, "clap": 2.6}[kind]
            t.inputs["Distortion"].default_value = {"grain": 9.0, "stripe": 0.0, "damask": 4.0, "clap": 0.5}[kind]
            t.inputs["Detail"].default_value = 3.0
            fac = t.outputs["Fac"]
            dark = 0.62 if kind != "stripe" else 0.8
        elif kind in ("brick", "shingle"):
            t = nt.nodes.new("ShaderNodeTexBrick")
            t.inputs["Scale"].default_value = 1.6 if kind == "brick" else 1.1
            t.inputs["Mortar Size"].default_value = 0.02 if kind == "brick" else 0.04
            t.inputs["Brick Width"].default_value = 0.5 if kind == "brick" else 0.35
            t.inputs["Row Height"].default_value = 0.25 if kind == "brick" else 0.3
            t.inputs["Color1"].default_value = base
            t.inputs["Color2"].default_value = tuple(c * 0.75 for c in base[:3]) + (1,)
            t.inputs["Mortar"].default_value = tuple(c * 0.35 for c in base[:3]) + (1,)
            nt.links.new(tc.outputs["Object"], t.inputs["Vector"])
            nt.links.new(t.outputs["Color"], p.inputs["Base Color"])
            continue
        else:  # stone / noise: voronoi cells + grime
            t = nt.nodes.new("ShaderNodeTexVoronoi" if kind == "stone" else "ShaderNodeTexNoise")
            t.inputs["Scale"].default_value = {"stone": 2.2, "noise": 0.6, "grime": 5.0}[kind]
            fac = t.outputs["Distance" if kind == "stone" else "Fac"]
            dark = 0.6 if kind != "grime" else 0.78
        nt.links.new(tc.outputs["Object"], t.inputs["Vector"])
        grime = nt.nodes.new("ShaderNodeTexNoise")  # weathering: low-frequency dirt over everything
        grime.inputs["Scale"].default_value = 1.2
        nt.links.new(tc.outputs["Object"], grime.inputs["Vector"])
        mix1 = nt.nodes.new("ShaderNodeMix")
        mix1.data_type = "RGBA"
        nt.links.new(fac, mix1.inputs["Factor"])
        mix1.inputs["A"].default_value = tuple(c * dark for c in base[:3]) + (1,)
        mix1.inputs["B"].default_value = base
        mix2 = nt.nodes.new("ShaderNodeMix")
        mix2.data_type = "RGBA"
        mix2.blend_type = "MULTIPLY"
        mix2.inputs["Factor"].default_value = 0.35
        nt.links.new(mix1.outputs["Result"], mix2.inputs["A"])
        nt.links.new(grime.outputs["Color"], mix2.inputs["B"])
        nt.links.new(mix2.outputs["Result"], p.inputs["Base Color"])


def setup(scene):
    night_base(scene)
    texturize()
    fog_slab((0, -6, 0.9), (120, 30, 1.8), 0.06)
    for r, row in enumerate(house.ROOM_GRID):  # warm candle haze inside every room
        for c, rid in enumerate(row):
            fog_slab((house.CX[c], 0, house.zbase(r) + house.RH / 2), (house.RW - 0.1, house.RD - 0.1, house.RH - 0.1), 0.05, (1.0, 0.86, 0.7))

    # cold moon key from the front-left, cold rim from behind (the moon side), warm candle light per room
    light("moon_key", "SUN", (0, 0, 30), (0.55, 0.68, 1.0), 2.8, direction=(0.45, 0.75, -0.55))
    light("moon_rim", "SUN", (0, 0, 30), (0.6, 0.72, 1.0), 2.5, direction=(0.35, -0.75, -0.45))
    warm = (1.0, 0.6, 0.3)
    for pair in house.ROOM_GRID:
        for rid in pair:
            e = bpy.data.objects[f"room_{rid}_light"]
            light(f"L_{rid}", "POINT", e.location, warm, 400 if rid != "ballroom" else 420, size=0.5)
    for i, f in enumerate(house.FLAMES):  # every candle, bulb and chandelier flame casts a little warm light
        light(f"L_flame{i}", "POINT", f, (1.0, 0.6, 0.26), 9, size=0.04)
    lib = bpy.data.objects["room_library"].location
    light("L_fire", "POINT", lib + Vector((0, 1.3, 0.5)), (1.0, 0.45, 0.12), 180, size=0.3)
    cry = bpy.data.objects["room_crypt"].location
    light("L_crypt_candles", "POINT", cry + Vector((-0.1, 0.6, 0.8)), (1.0, 0.55, 0.25), 90, size=0.2)
    light("L_porch", "POINT", (-house.OUTER - 3.1, -RD_FRONT - 0.2, 2.8), (1.0, 0.6, 0.3), 60, size=0.2)
    moon = bpy.data.objects["moon"].location
    light("L_moonhalo", "POINT", moon + Vector((0, -14, 0)), (0.7, 0.8, 1.0), 40000, size=6)


RD_FRONT = house.RD / 2


def dither(src, dst, block=3, levels=6):
    img = bpy.data.images.load(src)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, :3]
    hh, ww = h // block, w // block
    small = px[: hh * block, : ww * block].reshape(hh, block, ww, block, 3).mean(axis=(1, 3))
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float32) / 16.0
    t = np.tile(bayer, (hh // 4 + 1, ww // 4 + 1))[:hh, :ww, None]
    q = np.floor(small * (levels - 1) + t) / (levels - 1)
    q = np.clip(q, 0, 1).repeat(block, 0).repeat(block, 1)
    outp = np.ones((h, w, 4), dtype=np.float32)
    outp[: q.shape[0], : q.shape[1], :3] = q
    o = bpy.data.images.new("dither", w, h)
    o.pixels = outp.ravel()
    o.filepath_raw = dst
    o.file_format = "PNG"
    o.save()


def main():
    scene = house.build()
    setup(scene)
    scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
    scene.render.image_settings.file_format = "PNG"
    shots = [("cam_overview", "preview-night.png"), ("cam_ballroom", "preview-killcam.png")]
    for cam, fn in shots:
        scene.camera = bpy.data.objects[cam]
        path = os.path.abspath(os.path.join(OUTDIR, fn))
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        dither(path, path.replace(".png", "-dither.png"))
        print(f"L15 rendered {path}")


if __name__ == "__main__":
    main()
