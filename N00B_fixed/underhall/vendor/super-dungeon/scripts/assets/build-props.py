"""Convert Poly Haven .blend props into normalized GLBs.

  blender -b --python scripts/assets/build-props.py -- <outdir> id [id ...]

Each prop: all mesh objects kept, transforms applied, pivot moved to floor centre (min z = 0,
xy centred), Y-up GLB with its PBR JPEG maps embedded (gltf-transform later shrinks them to
512 px WebP and meshopt-compresses the geometry). Prints dimensions + triangle counts.
"""
import bpy, sys, os, glob
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, IDS = argv[0], argv[1:]
SRC = '/home/ubuntu/aegisrun/assets/source/polyhaven/'
os.makedirs(OUT, exist_ok=True)
MAX_TRIS = 8000

def build(pid):
    blend = glob.glob(SRC + pid + '/*.blend')
    if not blend:
        print('MISSING', pid)
        return
    bpy.ops.wm.open_mainfile(filepath=blend[0])
    # Poly Haven blends reference textures/<file>.(exr|png); relink by name stem to the flat
    # retrieval folder's JPEGs (GL normals; metal/metallic and rough/roughness aliases).
    def stem(pth):
        b = os.path.splitext(os.path.basename(pth))[0].lower().replace('_nor_dx_', '_nor_gl_')
        return b.replace('_metallic_', '_metal_').replace('_roughness_', '_rough_')
    files = {stem(f): f for f in glob.glob(SRC + pid + '/*.jpg') + glob.glob(SRC + pid + '/*.png')}
    for img in bpy.data.images:
        if not img.filepath:
            continue
        k = stem(bpy.path.abspath(img.filepath))
        if k in files:
            img.filepath = files[k]
            img.source = 'FILE'
            img.reload()
        else:
            print('UNRESOLVED', pid, img.filepath)
    vl = set(bpy.context.view_layer.objects)
    for o in list(bpy.data.objects):
        if o.type != 'MESH' or o not in vl:
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.hide_set(False)
        o.hide_viewport = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    for o in meshes:
        if o.parent:
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    total = 0
    for o in meshes:
        o.data.calc_loop_triangles()
        total += len(o.data.loop_triangles)
    if total > MAX_TRIS:
        for o in meshes:
            mod = o.modifiers.new('dec', 'DECIMATE')
            mod.ratio = MAX_TRIS / total
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier='dec')
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    tris = 0
    for o in meshes:
        for v in o.data.vertices:
            lo = Vector(map(min, lo, v.co)); hi = Vector(map(max, hi, v.co))
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    off = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    for o in meshes:
        o.data.transform(__import__('mathutils').Matrix.Translation(off))
    dims = hi - lo
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, pid + '.glb'), export_format='GLB', use_selection=True,
                              export_yup=True, export_image_format='AUTO', export_animations=False, export_vertex_color='NONE')
    print(f'PROP {pid} dims(x,y,z)=({dims.x:.2f},{dims.y:.2f},{dims.z:.2f}) tris={tris} objects={len(meshes)}')


for pid in IDS:
    try:
        build(pid)
    except Exception as e:  # keep converting the rest
        print('FAILED', pid, e)
