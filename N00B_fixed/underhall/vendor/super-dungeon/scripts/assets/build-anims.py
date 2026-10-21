"""Export the shared humanoid animation set (armature + chosen clips, no mesh).

  blender -b --python scripts/assets/build-anims.py -- <out.glb>

Source: Quaternius Universal Animation Library (CC0). Clip names drop the "_Armature" suffix.
Runtime keeps only quaternion tracks (plus a rest-relative pelvis offset), so the clips retarget
onto both Universal Base Character bodies by bone name.
"""
import bpy, sys

OUT = sys.argv[sys.argv.index('--') + 1]
SRC = '/home/ubuntu/aegisrun/assets/source/quaternius-ual/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb'
KEEP = ['Idle_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Punch_Jab', 'Punch_Cross', 'Sword_Attack',
        'Roll', 'Spell_Simple_Shoot', 'Spell_Simple_Enter', 'Spell_Simple_Idle_Loop', 'Spell_Simple_Exit', 'Hit_Chest', 'Hit_Head',
        'Death01', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Idle_Talking_Loop', 'Dance_Loop', 'Crouch_Idle_Loop', 'Interact',
        'Sitting_Idle_Loop', 'Push_Loop']

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
for o in list(bpy.data.objects):
    if o is not arm:
        bpy.data.objects.remove(o, do_unlink=True)
arm.animation_data_create()
for tr in list(arm.animation_data.nla_tracks):
    arm.animation_data.nla_tracks.remove(tr)
arm.animation_data.action = None
kept = []
for act in list(bpy.data.actions):
    name = act.name.replace('_Armature', '')
    if name not in KEEP:
        bpy.data.actions.remove(act)
        continue
    act.name = name
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    strip = tr.strips.new(name, int(act.frame_range[0]), act)
    strip.name = name
    tr.mute = False
    kept.append(name)
print('CLIPS', len(kept), sorted(kept))
missing = sorted(set(KEEP) - set(kept))
print('MISSING', missing)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True, export_animations=True,
    export_animation_mode='NLA_TRACKS', export_skins=True, export_morph=False, export_image_format='NONE',
    export_force_sampling=True, export_optimize_animation_size=True, export_frame_step=2,
)
print('EXPORTED', OUT)
