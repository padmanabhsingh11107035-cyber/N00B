# Vertical Platformer (NOOB Games page)

Endless vertical climber made with Godot 4.7.2 (web export, single-thread). Made by NOOB developers. Built copy: `instagram/public/games/vertical-platformer/` (card id `vertical_platformer`). Note: the zip was named "Aetherbound Academy" but its project is the generic "Vertical Platformer" (no Aetherbound text in it), so it is shown under its real name.

Cleaned: the maker's helper folders renamed (`scripts/web`, `autoload/font_theme.gd`), dev-only tuning bridge removed, font renamed `NoobSans`, window title "Made by NOOB developers".

Build: copy this folder to `D:\noob-aether\game`; templates are in `D:\n00b-ports\godot\templates.tpz` (extract `templates/web_nothreads_release.zip` next to it); `Godot_v4.7.2-stable_win64_console.exe --headless --path <game> --import`, then `--export-release Web <out>/index.html`; then `python pack-web-export.py` (gzips the 39 MB engine file, because the host accepts files up to 25 MB, and patches the loader to read `index.wasm.gz`); copy the output over the built copy.

Policy: this game needs `unsafe-inline` and `unsafe-eval` scripts (Godot's page and its JavaScript bridge), only inside its own frame, own files only. `public/_headers` may hold at most 100 rules.
