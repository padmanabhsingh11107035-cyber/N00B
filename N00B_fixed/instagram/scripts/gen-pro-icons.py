"""Makes the Android launcher icons of the two NOOB Pro icons (public/app-icons/pro-black.png and pro-white.png, 512 px doodle pictures) so that the phone shapes them like every other app icon.
Why: the old files were plain square pictures with white corners baked in, so a launcher drew them as hard squares. Now:
  * ADAPTIVE icons (Android 8 and newer, nearly every phone): mipmap-anydpi-v26/ic_launcher_pro_*.xml = a plain colour behind + the doodle picture in front; the phone cuts it to its own shape (circle, squircle, rounded square)
  * old phones (before Android 8): ic_launcher_pro_*.png as a rounded square and ic_launcher_pro_*_round.png as a circle, both with see-through corners
Run:  python3 scripts/gen-pro-icons.py    (needs Pillow). The build workflow copies android-overrides/icons/ into the app (step "Native parts").
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'android-overrides', 'icons')
DENSITY = {'mdpi': 1.0, 'hdpi': 1.5, 'xhdpi': 2.0, 'xxhdpi': 3.0, 'xxxhdpi': 4.0}
VARIANTS = {'pro_black': ('pro-black.png', '#000000'), 'pro_white': ('pro-white.png', '#ffffff')}
CROP = 0.07          # the source pictures have a rounded border with white corners: cut it off, keep only the doodles
FOREGROUND_DP = 76   # the doodle picture is this many dp wide inside the 108 dp adaptive canvas (the phone shows a 72 dp shape in the middle)

def load(name):
    im = Image.open(os.path.join(ROOT, 'public', 'app-icons', name)).convert('RGB')
    w, h = im.size
    k = int(w * CROP)
    return im.crop((k, k, w - k, h - k))

def rounded(im, size, radius_fraction):
    big = im.resize((size * 4, size * 4), Image.LANCZOS)
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * radius_fraction), fill=255)
    out = Image.new('RGBA', (size * 4, size * 4), (0, 0, 0, 0))
    out.paste(big, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)

def circle(im, size):
    return rounded(im, size, 0.5)

def main():
    os.makedirs(os.path.join(OUT, 'mipmap-anydpi-v26'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'values'), exist_ok=True)
    colors = []
    for key, (src, bg) in VARIANTS.items():
        art = load(src)
        for d, k in DENSITY.items():
            folder = os.path.join(OUT, f'mipmap-{d}')
            os.makedirs(folder, exist_ok=True)
            legacy = int(round(48 * k))
            rounded(art, legacy, 0.2).save(os.path.join(folder, f'ic_launcher_{key}.png'), optimize=True)
            circle(art, legacy).save(os.path.join(folder, f'ic_launcher_{key}_round.png'), optimize=True)
            canvas = int(round(108 * k)); inner = int(round(FOREGROUND_DP * k))
            fg = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
            fg.paste(art.resize((inner, inner), Image.LANCZOS).convert('RGBA'), ((canvas - inner) // 2, (canvas - inner) // 2))
            fg.save(os.path.join(folder, f'ic_launcher_{key}_foreground.png'), optimize=True)
        xml = f'''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_{key}_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_{key}_foreground"/>
</adaptive-icon>
'''
        for name in (f'ic_launcher_{key}.xml', f'ic_launcher_{key}_round.xml'):
            open(os.path.join(OUT, 'mipmap-anydpi-v26', name), 'w', encoding='utf-8', newline='\n').write(xml)
        colors.append(f'    <color name="ic_launcher_{key}_background">{bg}</color>')
    open(os.path.join(OUT, 'values', 'ic_launcher_pro_colors.xml'), 'w', encoding='utf-8', newline='\n').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n' + '\n'.join(colors) + '\n</resources>\n')
    print('NOOB Pro launcher icons written to', OUT)

if __name__ == '__main__':
    main()
