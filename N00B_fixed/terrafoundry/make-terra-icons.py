import os, sys
from PIL import Image, ImageDraw, ImageFont
OUT = 'D:/noob-terra/game/public/assets/icons'
os.makedirs(OUT, exist_ok=True)
E = {
 'wood': '🪵', 'stone': '🪨', 'fiber': '🌿', 'crystal': '💎', 'soil': '🟫', 'planks': '🟧', 'berries': '🫐', 'raw_meat': '🥩', 'cooked_meat': '🍖',
 'skewer': '🍢', 'bandage': '🩹', 'stone_axe': '🪓', 'stone_pickaxe': '⛏️', 'stone_shovel': '🥄', 'stone_spear': '🔱', 'crystal_pickaxe': '⛏️',
 'crystal_axe': '🪓', 'crystal_blade': '🗡️', 'bow': '🏹', 'arrow': '➶', 'torch': '🔦', 'campfire': '🔥', 'workbench': '🛠️', 'lamp': '💡',
 'stone_block': '⬜', 'foundation': '🟦', 'wood_floor': '🟫', 'wood_wall': '🧱', 'wood_ramp': '📐', 'wood_pillar': '🪵', 'wood_door': '🚪',
 'wood_roof': '🏠', 'wood_window': '🪟', 'half_wall': '🧱', 'gable_wall': '🏚️', 'ridge_cap': '🔺', 'roof_corner': '🔻', 'storage_chest': '📦',
 'hud_health': '❤️', 'hud_hunger': '🍖', 'hud_stamina': '⚡', 'hud_craft': '🔨', 'hud_poi': '📍', 'hud_skull': '💀', 'hud_moon': '🌙', 'hud_sun': '☀️',
 'skill_mining': '⛏️', 'buff_rested': '😴', 'map_fragment': '🗺️',
}
tint = {'crystal_pickaxe': (90, 70, 160), 'crystal_axe': (90, 70, 160), 'crystal_blade': (90, 70, 160)}
font = ImageFont.truetype('C:/Windows/Fonts/seguiemj.ttf', 86)
for name, ch in E.items():
    im = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((4, 4, 123, 123), radius=26, fill=tint.get(name, (46, 36, 26)) + (235,), outline=(179, 113, 45, 255), width=4)
    d.text((64, 68), ch, font=font, anchor='mm', embedded_color=True)
    im.save(f'{OUT}/{name}.webp', quality=88)
print(len(E), 'icons')
