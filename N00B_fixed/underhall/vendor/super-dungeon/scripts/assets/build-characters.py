"""Blender (headless) stage of the character pipeline.

  blender -b --python scripts/assets/build-characters.py -- <male|female> <outdir>

For the chosen Quaternius Universal Base Character body:
  1. import the FBX, rotate the armature 180 deg about Z and apply it so its rest pose matches the
     Universal Animation Library armature (bone orientations then agree to < 1 deg, so UAL clips
     retarget by bone name),
  2. import every "Rigged to Head Bone" hairstyle, move it onto this body's Head bone and skin it
     to the same armature (runtime toggles visibility per character),
  3. rasterize the rest-pose surface into UV space: per-texel 3D position, normal and a few soft
     bone-region weights -> <outdir>/<gender>-bake.npz (input for paint-characters.py),
  4. export a lean skinned GLB (no images; runtime supplies the painted PBR maps).
"""
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
GENDER, OUT = argv[0], argv[1]
RES = int(argv[2]) if len(argv) > 2 else 2048
os.makedirs(OUT, exist_ok=True)
ROOT = '/home/ubuntu/aegisrun/assets/source/quaternius-ubc/Universal Base Characters[Standard]/'
FBX = ROOT + f"Base Characters/Unity/Superhero_{'Male' if GENDER == 'male' else 'Female'}_FullBody.fbx"
HAIRS = ['Hair_SimpleParted', 'Hair_Buzzed', 'Hair_BuzzedFemale', 'Hair_Long', 'Hair_Buns']
HAIR_DIR = ROOT + 'Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=FBX)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
arm.name = 'Rig'
arm.rotation_euler = (0, 0, 0)
arm.rotation_mode = 'XYZ'
bpy.context.view_layer.update()
for o in bpy.data.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
body = max(meshes, key=lambda o: len(o.data.vertices))
body.name = 'Body'
for o in meshes:
    if o is body:
        continue
    o.name = 'Eyes' if 'Eye' in o.name and 'brow' not in o.name.lower() else 'Brows'
# Boots, not bare feet: Laplacian-smooth the toe geometry into a rounded shoe shape.
gi = {g.name: g.index for g in body.vertex_groups}
bm = bmesh.new()
bm.from_mesh(body.data)
dl = bm.verts.layers.deform.active
toes = []
for v in bm.verts:
    w = v[dl] if dl else {}
    ball = sum(w.get(gi[n], 0) for n in ('ball_l', 'ball_r') if n in gi)
    foot = sum(w.get(gi[n], 0) for n in ('foot_l', 'foot_r') if n in gi)
    if ball > 0.25 or (foot > 0.3 and v.co.z < 0.05):
        toes.append(v)
for _ in range(30):
    bmesh.ops.smooth_vert(bm, verts=toes, factor=0.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.to_mesh(body.data)
bm.free()
body.data.update()
print('TOES smoothed', len(toes))
head_bone = arm.data.bones['Head']
head_pos = arm.matrix_world @ head_bone.head_local
eyes = bpy.data.objects.get('Eyes')
if eyes:
    ec = sum((eyes.matrix_world @ Vector(c) for c in eyes.bound_box), Vector()) / 8
    print('FACING eyes y =', round(ec.y, 3), '(expect < head y', round(head_pos.y, 3), ')')

# ── Hairstyles ──────────────────────────────────────────────────────────
for hname in HAIRS:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=HAIR_DIR + hname + '.gltf')
    new = set(bpy.data.objects) - before
    harm = next((o for o in new if o.type == 'ARMATURE'), None)
    hmesh = [o for o in new if o.type == 'MESH' and len(o.data.vertices) > 100]
    delta = Vector((0, 0, 0))
    if harm:
        delta = head_pos - (harm.matrix_world @ harm.data.bones['Head'].head_local)
    for m in hmesh:
        mw = m.matrix_world.copy()
        m.parent = None
        m.matrix_world = mw
        for mod in list(m.modifiers):
            m.modifiers.remove(mod)
        bpy.ops.object.select_all(action='DESELECT')
        m.select_set(True)
        bpy.context.view_layer.objects.active = m
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        m.data.transform(__import__('mathutils').Matrix.Translation(delta))
        # Rigidly skin to the Head bone.
        m.vertex_groups.clear()
        vg = m.vertex_groups.new(name='Head')
        vg.add(list(range(len(m.data.vertices))), 1.0, 'REPLACE')
        mod = m.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm
        m.parent = arm
        m.matrix_parent_inverse = arm.matrix_world.inverted()
        m.name = hname
    for o in new:
        if o not in hmesh:
            bpy.data.objects.remove(o, do_unlink=True)
    print('HAIR', hname, 'delta', tuple(round(x, 3) for x in delta), [m.name for m in hmesh])

# ── Rest-pose UV-space bake ─────────────────────────────────────────────
GROUPS = {
    'head': ['Head'], 'neck': ['neck_01'],
    'hand': ['hand_l', 'hand_r'] + [f'{f}_{i:02d}_{s}' for f in ('index', 'middle', 'pinky', 'ring', 'thumb') for i in (1, 2, 3) for s in 'lr'],
    'lowerarm': ['lowerarm_l', 'lowerarm_r'], 'upperarm': ['upperarm_l', 'upperarm_r'],
    'torso': ['spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'], 'pelvis': ['pelvis'],
    'thigh': ['thigh_l', 'thigh_r'], 'calf': ['calf_l', 'calf_r'], 'foot': ['foot_l', 'foot_r', 'ball_l', 'ball_r'],
}
GKEYS = list(GROUPS)
arm.data.pose_position = 'REST'
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
ev = body.evaluated_get(dg)
me = ev.to_mesh()
me.calc_loop_triangles()
nv = len(me.vertices)
co = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
mw = np.array(body.matrix_world, np.float32)
co = co @ mw[:3, :3].T + mw[:3, 3]
nt = len(me.loop_triangles)
tri_loops = np.empty(nt * 3, np.int32); me.loop_triangles.foreach_get('loops', tri_loops); tri_loops = tri_loops.reshape(-1, 3)
tri_verts = np.empty(nt * 3, np.int32); me.loop_triangles.foreach_get('vertices', tri_verts); tri_verts = tri_verts.reshape(-1, 3)
uvl = me.uv_layers.active.data
uv = np.empty(len(uvl) * 2, np.float32); uvl.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
cn = np.array([tuple(n.vector) for n in me.corner_normals], np.float32)
cn = cn @ mw[:3, :3].T
cn /= np.linalg.norm(cn, axis=1, keepdims=True) + 1e-8
# Vertex-group weights on the original (unevaluated) mesh: same vertex order.
gidx = {g.name: g.index for g in body.vertex_groups}
W = np.zeros((nv, len(GKEYS)), np.float32)
for v in body.data.vertices:
    for ge in v.groups:
        for k, key in enumerate(GKEYS):
            for bn in GROUPS[key]:
                if gidx.get(bn) == ge.group:
                    W[v.index, k] += ge.weight
W = np.clip(W, 0, 1)

P = np.zeros((RES, RES, 3), np.float32)
N = np.zeros((RES, RES, 3), np.float32)
G = np.zeros((RES, RES, len(GKEYS)), np.float32)
C = np.zeros((RES, RES), np.bool_)
TUV = uv[tri_loops] * RES
TUV[..., 1] = (1 - uv[tri_loops][..., 1]) * RES
for t in range(nt):
    p = TUV[t]
    x0 = max(int(math.floor(p[:, 0].min())), 0); x1 = min(int(math.ceil(p[:, 0].max())), RES - 1)
    y0 = max(int(math.floor(p[:, 1].min())), 0); y1 = min(int(math.ceil(p[:, 1].max())), RES - 1)
    if x1 < x0 or y1 < y0:
        continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    (ax, ay), (bx, by), (cx, cy) = p
    den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(den) < 1e-9:
        continue
    w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
    w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
    w2 = 1 - w0 - w1
    inside = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
    if not inside.any():
        continue
    iy, ix = np.nonzero(inside)
    b = np.stack([w0[inside], w1[inside], w2[inside]], 1)
    vi = tri_verts[t]; li = tri_loops[t]
    Y = iy + y0; X = ix + x0
    P[Y, X] = b @ co[vi]
    N[Y, X] = b @ cn[li]
    G[Y, X] = b @ W[vi]
    C[Y, X] = True
N /= np.linalg.norm(N, axis=2, keepdims=True) + 1e-8
np.savez_compressed(os.path.join(OUT, f'{GENDER}-bake.npz'), P=P.astype(np.float16), N=N.astype(np.float16),
                    G=(G * 255).astype(np.uint8), C=C, keys=np.array(GKEYS))
bb = co.min(0), co.max(0)
print('BAKE', GENDER, 'tris', nt, 'coverage', round(C.mean(), 3), 'bbox', bb[0].round(3), bb[1].round(3))
ev.to_mesh_clear()
arm.data.pose_position = 'POSE'

# ── Export lean skinned GLB ─────────────────────────────────────────────
# Images come from the runtime material library. Every texture slot points at one shared 4x4
# placeholder so the exporter keeps TEXCOORD_0 (it drops UVs when no image is referenced).
ph = bpy.data.images.new('placeholder', 4, 4)
ph.pixels = [1.0] * 64
for m in bpy.data.materials:
    if m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE':
                n.image = ph
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    if o.type in ('ARMATURE', 'MESH'):
        o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT, f'char_{GENDER}.glb'), export_format='GLB', use_selection=True,
    export_animations=False, export_skins=True, export_morph=False, export_image_format='AUTO',
    export_yup=True, export_apply=False, export_vertex_color='NONE', export_texcoords=True, export_normals=True, export_tangents=False,
)
print('EXPORTED', os.path.join(OUT, f'char_{GENDER}.glb'))
