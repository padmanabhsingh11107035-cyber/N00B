# The raw art of Underhall

Everything the game needs to **run and rebuild** is in this repository. The raw material the game's models were made from is large (about 220 MB) and is only needed to make new models, so it is kept as one file in the repository's Releases instead of in every clone and every deploy:

- Release: `underhall-source-art` (file `underhall-source-art.zip`)
- Contents (paths are the same as they were in the project, under `vendor/super-dungeon/`):
  - `assets/build/chars/` and `assets/build/props/`: the models before they were optimised for the game (`.glb`) and the baked character data (`.npz`)
  - `assets/source/`: the original Blender files, textures and animation libraries from Quaternius, Poly Haven and Kenney (all CC0)

To use it, unzip it into `N00B_fixed/underhall/vendor/super-dungeon/` so the folders line up. The licences of these files stay in the repository under `vendor/super-dungeon/assets/source/**/License*.txt`.
