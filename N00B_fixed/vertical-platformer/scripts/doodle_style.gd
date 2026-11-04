extends RefCounted
## Notebook-doodle type kit (materials/motion drawn by doodle_kit.gd).
## NoobSans supplies Latin display and body text; the existing CJK fallback faces are retained.

const DISPLAY: Font = preload("res://assets/template/fonts/display/display_doodle.tres")
const BODY: Font = preload("res://assets/template/fonts/ui_regular.tres")
const MEDIUM: Font = preload("res://assets/template/fonts/ui_medium.tres")
const BOLD: Font = preload("res://assets/template/fonts/ui_bold.tres")
const INK := Color("1d211f")
const MUTED := Color("5d655f")
const PAPER := Color("fff9df")
const BLUE := Color("2f80ed")
const RED := Color("ef4d43")
const LIME := Color("c1ff2b")

static func is_cjk() -> bool:
	return I18n.get_locale().begins_with("zh")

## Preserve the existing locale-specific display sizing when switching Latin fonts.
static func display_size(latin_size: int) -> int:
	if not is_cjk():
		return latin_size
	# Small labels need relatively more size than hero titles to stay legible.
	# Never below 18px: ZCOOL KuaiLe gets crunchy under that.
	return maxi(roundi(latin_size * clampf(0.9 - latin_size * 0.004, 0.62, 0.82)), mini(latin_size, 18))

## Shrink-to-fit string drawing with any font (mirrors the scenes' _draw_text).
static func text(ci: CanvasItem, font: Font, position: Vector2, value: String, alignment: HorizontalAlignment, width: float, preferred_size: int, color: Color) -> void:
	var font_size := preferred_size
	if width > 0.0:
		while font_size > 10 and font.get_string_size(value, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x > width:
			font_size -= 1
	ci.draw_string(font, position, value, alignment, width, font_size, color)

static func width_of(font: Font, value: String, font_size: int) -> float:
	return font.get_string_size(value, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x

## Deterministic wobbly marker stroke (two passes, like a felt-tip underline).
static func scribble(ci: CanvasItem, from: Vector2, to: Vector2, color: Color, stroke: float, seed_value: int = 7) -> void:
	for pass_index in range(2):
		var points := PackedVector2Array()
		var steps := maxi(6, int(from.distance_to(to) / 28.0))
		for i in range(steps + 1):
			var t := float(i) / steps
			var wobble := sin(t * 9.0 + seed_value + pass_index * 1.7) * 2.2 + sin(t * 23.0 + seed_value * 0.5) * 0.9
			points.append(from.lerp(to, t) + Vector2(0, wobble + pass_index * 2.5))
		ci.draw_polyline(points, Color(color, 1.0 if pass_index == 0 else 0.55), stroke - pass_index * 2.0, true)

static func paper_button_face(fill: Color, border: Color = INK, depth: int = 3) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(2)
	style.border_width_bottom = 2 + depth
	style.set_corner_radius_all(12)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 6 + (3 - depth)
	style.content_margin_bottom = 6 + depth
	return style

static func focus_ring() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.draw_center = false
	style.border_color = BLUE
	style.set_border_width_all(3)
	style.set_corner_radius_all(15)
	style.set_expand_margin_all(3)
	return style

## Notebook sticker button used across menus; primary is a lime sticky note with
## tape, secondary a white paper cut-out (both drawn by DoodleKit.DoodleFace).
static func style_button(button: Button, primary: bool = false, font_size: int = 18) -> void:
	DoodleKit.doodle_button(button, &"sticky" if primary else &"paper", LIME if primary else Color.WHITE, 16.0, 7.0)
	button.add_theme_font_override("font", BOLD if primary else MEDIUM)
	button.add_theme_font_size_override("font_size", font_size)
	for key in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(key, INK)

## Menu list row: plain hand-lettered text; hover/focus scribbles a lime marker
## highlight under it and the pencil cursor points at it.
static func style_row(button: Button, font_size: int = 18) -> void:
	DoodleKit.doodle_button(button, &"row", Color.WHITE, 16.0, 7.0)
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.add_theme_font_override("font", BOLD)
	button.add_theme_font_size_override("font_size", font_size)
	for key in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(key, INK)

## Sticky note in a pastel paper colour (title toolbar actions).
static func style_note(button: Button, paper: Color, font_size: int = 15) -> void:
	var face := DoodleKit.doodle_button(button, &"paper", paper, 14.0, 6.0)
	face.tape = 1
	button.add_theme_font_override("font", MEDIUM)
	button.add_theme_font_size_override("font_size", font_size)
	for key in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(key, INK)

## Hand-drawn checkbox for CheckButtons (settings toggles).
static func style_check(toggle: CheckButton, font_size: int = 17) -> void:
	for icon in ["checked", "checked_disabled", "unchecked", "unchecked_disabled", "checked_mirrored", "unchecked_mirrored", "checked_disabled_mirrored", "unchecked_disabled_mirrored"]:
		toggle.add_theme_icon_override(icon, DoodleKit.checkbox_icon(icon.begins_with("checked")))
	for state in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
		var box := StyleBoxEmpty.new()
		box.content_margin_left = 6
		box.content_margin_right = 6
		box.content_margin_top = 4
		box.content_margin_bottom = 4
		toggle.add_theme_stylebox_override(state, box)
	toggle.add_theme_stylebox_override("focus", focus_ring())
	toggle.add_theme_font_override("font", MEDIUM)
	toggle.add_theme_font_size_override("font_size", font_size)
	for key in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		toggle.add_theme_color_override(key, INK)

## Quiet footer link (licenses): no box until hovered/focused.
static func style_quiet(button: Button) -> void:
	var face := button.get_node_or_null("DoodleFace")
	if face != null:
		button.remove_child(face)
		face.queue_free()
	for state: String in ["normal", "hover", "pressed", "hover_pressed"]:
		var style := StyleBoxFlat.new()
		style.bg_color = Color(INK, 0.0 if state == "normal" else 0.07)
		style.set_corner_radius_all(10)
		style.content_margin_left = 10
		style.content_margin_right = 10
		style.content_margin_top = 6
		style.content_margin_bottom = 6
		button.add_theme_stylebox_override(state, style)
	button.add_theme_stylebox_override("focus", focus_ring())
	button.add_theme_font_override("font", BODY)
	button.add_theme_font_size_override("font_size", 14)
	for key in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(key, MUTED)

## Pencil-line track, lime marker fill and a doodle star as the grabber.
static func style_slider(slider: HSlider) -> void:
	var track := StyleBoxFlat.new()
	track.bg_color = Color.WHITE
	track.border_color = INK
	track.set_border_width_all(2)
	track.set_corner_radius_all(4)
	track.content_margin_top = 4
	track.content_margin_bottom = 4
	track.shadow_color = Color(INK, 0.14)
	track.shadow_size = 1
	track.shadow_offset = Vector2(2, 2)
	slider.add_theme_stylebox_override("slider", track)
	var fill := track.duplicate() as StyleBoxFlat
	fill.bg_color = LIME
	fill.shadow_size = 0
	slider.add_theme_stylebox_override("grabber_area", fill)
	var fill_hover := fill.duplicate() as StyleBoxFlat
	fill_hover.bg_color = Color("d9ff7a")
	slider.add_theme_stylebox_override("grabber_area_highlight", fill_hover)
	slider.add_theme_icon_override("grabber", DoodleKit.star_icon(28))
	slider.add_theme_icon_override("grabber_highlight", DoodleKit.star_icon(32))
	slider.add_theme_icon_override("grabber_disabled", DoodleKit.star_icon(28, Color("e7e3d2")))
	slider.add_theme_stylebox_override("focus", focus_ring())
