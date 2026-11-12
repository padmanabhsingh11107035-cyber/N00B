# Blinkit design round (read fully; it REPLACES the palette section of DESIGN-BRIEF.md, everything else in DESIGN-BRIEF.md still applies: no glass/blur/glow/gradient text, strict grid, data safety, full screen from above the notch with `edge-own` + `--sat`, harness workflow, tests, no git)

The owner wants these pages redesigned "into Blinkit design", for both white (light) and dark mode, and checked so that **every button and every text is visibly different from the colour behind it**. Blinkit (the Indian quick-commerce app) is: bright, confident, friendly, extremely legible. White pages, a bold yellow header band, strong green call-to-action buttons, heavy dark type, rounded 12 px cards with a hairline border, light-grey section backgrounds, small yellow/green pill chips, big bold numbers, compact rows with icons at the left and a chevron at the right, a sticky bottom action bar for the main action, lots of white space between groups.

## Palette (shared by all pages; tune by eye but keep the roles)
Light mode:
- page `#FFFFFF`, section/soft background `#F5F5F5`, card `#FFFFFF` with 1 px `#E8E8E8` border (optional very soft shadow `0 1px 2px rgba(0,0,0,.06)`)
- header band: yellow `#F8CB46` with black text/icons (back button = black icon on a white/yellow-light circle)
- text: primary `#1C1C1C`, secondary `#666666` (>= 4.5:1 on white), disabled `#9E9E9E` (only for truly disabled things)
- primary button: green `#0C831F` fill, white bold text; secondary button: white fill, 1.5 px green border, green text `#0C831F`; tertiary: text-only green
- chips: soft yellow `#FFF3C4` fill + `#1C1C1C` text; selected chip: yellow `#F8CB46` + black text, or green fill + white text for filters
- success `#0C831F`, warning `#B26A00` on `#FFF3C4`, error `#D32F2F` on `#FDECEA`
Dark mode:
- page `#121212`, soft background `#1A1A1A`, card `#1E1E1E` with 1 px `#2E2E2E` border
- header band: stays yellow `#F8CB46` with black text (Blinkit keeps the yellow), or `#1E1E1E` with yellow title text if the yellow band looks too loud on that screen; be consistent across all pages
- text: primary `#F5F5F5`, secondary `#B5B5B5`
- primary button: green `#0C831F` (or `#118A25`) with white text; secondary: transparent with 1.5 px `#3DBE55` border and `#3DBE55` text; chips: `#2A2410` fill + `#F8CB46` text; selected chip: `#F8CB46` + black text
- success `#3DBE55`, warning `#F8CB46`, error `#FF6B6B`
Never put grey text on a similar grey, never yellow text on white, never white text on yellow. Icons follow the same rules as text.

## Layout language
- Header: yellow band that starts at the very top of the screen (above the notch), back button at the left, title in 18-20 px weight 800, optional small subtitle; the status-bar area is part of the band.
- Content: white sheet with a rounded top (16-20 px radius) overlapping the band by ~12 px is allowed, or flat; sections separated by 8 px `#F5F5F5` gaps; 16 px side margin; section titles 16-17 px weight 800 with an optional "See all" in green.
- Lists: rows 56-72 px high, icon tile (40 px, soft yellow or soft grey) at the left, title + secondary line, trailing value/chevron.
- Main action of a screen: a full-width green button in a sticky bottom bar with safe-area padding (shadow-less, top hairline).
- Numbers/prices/balances in weight 800, larger than labels.
- No gradients (flat yellow, green, white, greys), no blur, no glow, no emoji decoration.

## Mandatory contrast audit (do this before finishing)
In the harness page, run in the Browser pane `javascript_tool` a script that walks every visible element with text (and every button/icon-button/input/chip), resolves its effective foreground colour (computed `color`) and the effective background (walk up ancestors until a non-transparent `background-color`, composite alpha over the page colour, treat `background-image` as unknown and report it), and computes the WCAG contrast ratio. Report every text < 4.5:1 (large/bold text >= 18.66 px bold or 24 px: < 3:1) and every button/input/border-less control whose fill has < 1.5:1 against the surface behind it AND no visible border. Fix them all, in BOTH themes and in every state/screen of the page (scroll, open sheets/dialogs, empty/loading/error). Paste the final audit result (counts, zero failures) in your report.
