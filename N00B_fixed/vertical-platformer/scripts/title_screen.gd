extends "res://scripts/session_owner.gd"

const UI_FONT: Font = preload("res://assets/template/fonts/ui_regular.tres")
const STYLE := preload("res://scripts/doodle_style.gd")
const SKIN_PREVIEWS := {
	"lime": preload("res://assets/template/characters/hero/hero_00.webp"),
	"sea": preload("res://assets/template/characters/hero_sea/hero_sea_00.webp"),
	"sunset": preload("res://assets/template/characters/hero_sunset/hero_sunset_00.webp"),
	"ink": preload("res://assets/template/characters/hero_ink/hero_ink_00.webp"),
}
const SKINS := [
	{"id": "lime", "name": "skin.lime.name", "tag": "skin.lime.tag"},
	{"id": "sea", "name": "skin.sea.name", "tag": "skin.sea.tag"},
	{"id": "sunset", "name": "skin.sunset.name", "tag": "skin.sunset.tag"},
	{"id": "ink", "name": "skin.ink.name", "tag": "skin.ink.tag"},
]
const INK := Color("1d211f")
const PAPER := Color("fff9df")
const LIME := Color("c1ff2b")
const BLUE := Color("2f80ed")
const RED := Color("ef4d43")
const YELLOW := Color("ffd338")

var time := 0.0
var start_rect := Rect2()
var rules_rect := Rect2()
var skin_rects: Array[Rect2] = []
var hover_start := false
var hover_skin := -1
var selected_card := 0
var rules_open := false
var toast_text := ""
var toast_timer := 0.0
var language_rects: Dictionary = {}
var replay_tutorial := false
var accessible_buttons: Dictionary = {}

func _ready() -> void:
	setup_session_ui()
	_create_accessible_buttons()
	for i in range(SKINS.size()):
		if String(SKINS[i].id) == SaveStore.selected_skin:
			selected_card = i
	SaveStore.profile_changed.connect(_on_profile_changed)
	I18n.locale_changed.connect(_on_locale_changed)
	get_viewport().size_changed.connect(queue_redraw)
	queue_redraw()

func _process(delta: float) -> void:
	if not overlays.is_empty(): return
	time += delta
	toast_timer = maxf(0.0, toast_timer - delta)
	queue_redraw()

func _unhandled_input(event: InputEvent) -> void:
	if not overlays.is_empty(): return
	if event is InputEventJoypadButton and event.pressed:
		if event.button_index == JOY_BUTTON_A: _start_game(); return
		if event.button_index == JOY_BUTTON_X: _activate_skin(selected_card); return
		if event.button_index == JOY_BUTTON_DPAD_LEFT: selected_card = posmod(selected_card - 1, SKINS.size()); return
		if event.button_index == JOY_BUTTON_DPAD_RIGHT: selected_card = posmod(selected_card + 1, SKINS.size()); return
	if not rules_open and _handle_language_input(event):
		get_viewport().set_input_as_handled()
		return
	if rules_open:
		if event is InputEventKey and event.pressed and not event.echo:
			rules_open = false
		elif event is InputEventMouseButton and event.pressed:
			rules_open = false
		elif event is InputEventScreenTouch and event.pressed:
			rules_open = false
		elif event is InputEventJoypadButton and event.pressed:
			rules_open = false
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode in [KEY_ENTER, KEY_SPACE]:
			_start_game()
		elif event.keycode in [KEY_LEFT]:
			selected_card = posmod(selected_card - 1, SKINS.size())
		elif event.keycode in [KEY_RIGHT]:
			selected_card = posmod(selected_card + 1, SKINS.size())
		elif event.keycode in [KEY_E, KEY_DOWN]:
			_activate_skin(selected_card)
		elif event.keycode in [KEY_H]:
			session_ui.show_menu("help")
	elif event is InputEventMouseMotion:
		hover_start = start_rect.has_point(event.position)
		hover_skin = _skin_at(event.position)
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if rules_rect.has_point(event.position):
			session_ui.show_menu("help")
		elif start_rect.has_point(event.position):
			_start_game()
		else:
			var index := _skin_at(event.position)
			if index >= 0:
				selected_card = index
				_activate_skin(index)
	elif event is InputEventScreenTouch and event.pressed:
		if rules_rect.grow(16).has_point(event.position):
			session_ui.show_menu("help")
		elif start_rect.grow(20).has_point(event.position):
			_start_game()
		else:
			var index := _skin_at(event.position)
			if index >= 0:
				selected_card = index
				_activate_skin(index)

func _handle_language_input(event: InputEvent) -> bool:
	if (event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_L) or (event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_Y):
		_select_language("zh-CN" if I18n.get_locale() == "en" else "en")
		return true
	var point := Vector2.INF
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		point = event.position
	elif event is InputEventScreenTouch and event.pressed:
		point = event.position
	for locale: String in language_rects:
		if (language_rects[locale] as Rect2).has_point(point):
			_select_language(locale)
			return true
	return false

func _select_language(locale: String) -> void:
	AudioDirector.play(&"ui_toggle")
	if not I18n.set_locale(locale):
		_toast(I18n.t("language.save_error"))

func _on_locale_changed(_locale: String) -> void:
	toast_timer = 0.0
	queue_redraw()

func _skin_at(point: Vector2) -> int:
	for i in range(skin_rects.size()):
		if skin_rects[i].has_point(point):
			return i
	return -1

func _activate_skin(index: int) -> void:
	AudioDirector.play(&"ui_select")
	var skin_id := String(SKINS[index].id)
	if SaveStore.is_unlocked(skin_id):
		SaveStore.select_skin(skin_id)
		_toast(I18n.t("skin.equipped_toast", {"skin": I18n.t(SKINS[index].name)}))
	elif SaveStore.unlock_skin(skin_id):
		_toast(I18n.t("skin.unlocked_toast", {"skin": I18n.t(SKINS[index].name)}))
		_spark_unlock()
	else:
		_toast(I18n.t("skin.need_stars", {"count": maxi(0, SaveStore.skin_cost(skin_id) - SaveStore.star_balance)}))

func _start_game() -> void:
	if not overlays.is_empty(): return
	AudioDirector.play(&"ui_confirm")
	AudioDirector.start_music()
	get_tree().set_meta("replay_tutorial", replay_tutorial)
	get_tree().change_scene_to_file("res://scenes/game.tscn")

func _toast(message: String) -> void:
	toast_text = message
	toast_timer = 2.2

func _spark_unlock() -> void:
	time += 0.18

func _on_profile_changed() -> void:
	for i in range(SKINS.size()):
		if String(SKINS[i].id) == SaveStore.selected_skin:
			selected_card = i
	queue_redraw()

func _draw() -> void:
	var size := get_viewport_rect().size
	var still := motion_reduced()
	var boil := DoodleKit.boil(still)
	var t := 10.0 if still else time
	_draw_page(size, boil, t)

	if size.x < 850:
		_draw_portrait(size)
		_draw_focus(boil)
		_sync_accessible_buttons()
		return
	var content_w := minf(size.x - 64.0, 1180.0)
	var left := (size.x - content_w) * 0.5
	var right := left + content_w
	# Top row: language tabs + hint on the left, saved stars/best as a margin note on the right.
	_draw_text(Vector2(left + 14, 46), I18n.t("language.label"), HORIZONTAL_ALIGNMENT_LEFT, 88, 16, Color("59615d"))
	language_rects.clear()
	for index in range(2):
		var locale: String = ["en", "zh-CN"][index]
		var rect := Rect2(left + 108 + index * 62, 22, 56, 38)
		language_rects[locale] = rect
		_draw_tab(rect, I18n.t("language.option." + locale), I18n.get_locale() == locale, 31 + index, boil)
	_draw_text(Vector2(left + 244, 46), I18n.t("language.hint"), HORIZONTAL_ALIGNMENT_LEFT, 230, 13, Color("68706b"))
	var stars_text := _strip_star(I18n.t("title.stars", {"count": "%03d" % SaveStore.star_balance}))
	var stars_size := STYLE.display_size(34)
	var stars_w := minf(260.0, STYLE.width_of(STYLE.DISPLAY, stars_text, stars_size))
	DoodleKit.draw_star(self, Vector2(right - stars_w - 26, 38), 15, YELLOW, 5, boil)
	STYLE.text(self, STYLE.DISPLAY, Vector2(right - 300, 50), stars_text, HORIZONTAL_ALIGNMENT_RIGHT, 300, stars_size, RED)
	STYLE.text(self, STYLE.DISPLAY, Vector2(right - 300, 82), I18n.t("title.best", {"height": "%06d" % SaveStore.best_height}), HORIZONTAL_ALIGNMENT_RIGHT, 300, STYLE.display_size(26), INK)

	# Hand-lettered title lockup: each word is "stamped" onto the page, the
	# felt-tip underline draws itself, then the lettering boils gently.
	var title_size := int(clampf(size.x * 0.097, 84, 132))
	var line_size := STYLE.display_size(title_size)
	var pitch := line_size * (1.06 if STYLE.is_cjk() else 0.6)
	var title_y := clampf(size.y * 0.27, 170.0, 220.0)
	var word_two := I18n.t("title.word_two")
	var boil_rot: float = [0.0, 0.004, -0.003][boil]
	var boil_off: Vector2 = [Vector2.ZERO, Vector2(0.8, -0.6), Vector2(-0.6, 0.5)][boil]
	_stamp_word(Vector2(left + 40, title_y) + boil_off, -0.03 + boil_rot, I18n.t("title.word_one"), line_size, INK, (t - 0.1) / 0.45)
	_stamp_word(Vector2(left + 58, title_y + pitch) - boil_off, -0.012 - boil_rot, word_two, line_size, BLUE, (t - 0.28) / 0.45)
	var underline_w := minf(STYLE.width_of(STYLE.DISPLAY, word_two, line_size) + 30.0, content_w * 0.56)
	var underline_y := title_y + pitch + line_size * (0.2 if STYLE.is_cjk() else 0.16)
	DoodleKit.draw_underline(self, Vector2(left + 46, underline_y + 4), Vector2(left + 46 + underline_w, underline_y - 3), RED, 7.0, _ease((t - 0.62) / 0.4), 7)
	var tagline_y := underline_y + 46
	var tag_alpha := clampf((t - 0.8) / 0.3, 0.0, 1.0)
	_draw_text(Vector2(left + 58, tagline_y), I18n.t("title.tagline"), HORIZONTAL_ALIGNMENT_LEFT, content_w * 0.54, 22, Color(Color("4f5652"), tag_alpha))

	rules_rect = Rect2(left + 56, tagline_y + 22, 132, 40)
	_draw_paper_action(rules_rect, Color.WHITE, I18n.t("help.button"), 16, 43, boil, false, Vector2(0, (1.0 - _ease((t - 0.85) / 0.35)) * 30.0))

	var hero_scale := clampf(size.y / 780.0, 0.70, 0.94)
	var hero_pos := Vector2(left + content_w * 0.76, size.y * 0.36 + sin(time * 2.4) * (0.0 if still else 8.0))
	var pop := _back((t - 0.35) / 0.45)
	var preview: Texture2D = SKIN_PREVIEWS.get(SaveStore.selected_skin, SKIN_PREVIEWS.lime)
	# Pencil-hatched shadow under the hero, shrinking as it bobs up.
	var ground := Vector2(hero_pos.x, size.y * 0.36 + 80.0 * hero_scale)
	var squash := 1.0 - (hero_pos.y - size.y * 0.36) / 60.0
	for i in 5:
		var w := (58.0 - i * 9.0) * hero_scale * clampf(squash, 0.7, 1.2) * pop
		draw_line(ground + Vector2(-w, i * 3.0 - 6.0), ground + Vector2(w, i * 3.0 - 8.0), Color(INK, 0.16), 2.0, true)
	draw_set_transform(hero_pos, sin(time * 1.4) * 0.025, Vector2.ONE * hero_scale * pop)
	draw_texture_rect(preview, Rect2(-92, -145, 184, 214), false)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	_draw_doodle_cloud(hero_pos + Vector2(-170, -118) + Vector2(sin(t * 0.5) * 6.0, 0), 1.0)
	_draw_doodle_cloud(hero_pos + Vector2(120, -80) + Vector2(cos(t * 0.4) * 5.0, 0), 0.72)
	STYLE.text(self, STYLE.DISPLAY, hero_pos + Vector2(-160, 128), I18n.t("skin.current", {"skin": _skin_name(SaveStore.selected_skin)}), HORIZONTAL_ALIGNMENT_CENTER, 320, STYLE.display_size(30), Color(INK, pop))

	# Shelf: primary Start sticky note on the left, the skin shop to the right.
	var shelf_y := size.y - 262.0
	var start_w := clampf(content_w * 0.27, 236.0, 320.0)
	start_rect = Rect2(Vector2(left + 14, shelf_y + 30), Vector2(start_w, 68))
	var rise := func(delay: float) -> Vector2: return Vector2(0, (1.0 - _back((t - delay) / 0.4)) * 60.0)
	var breathe := 0.0 if still else sin(time * 3.0) * 0.012
	_draw_start(start_rect, hover_start, rise.call(0.55), breathe, boil)
	# Pencil selection cursor rests on the primary action.
	if clampf((t - 0.9) / 0.2, 0.0, 1.0) > 0.0 and accessible_focus() == "":
		var nudge := 0.0 if still else sin(time * 4.0) * 3.0
		DoodleKit.draw_pencil(self, start_rect.position + Vector2(-6 + nudge, start_rect.size.y * 0.5 + 6), -0.3, 56)

	var skins_left := left + start_w + 46.0
	var skins_width := right - skins_left
	var card_gap := 12.0
	var card_w := (skins_width - card_gap * 3.0) / 4.0
	_draw_text(Vector2(skins_left + 2, shelf_y - 14), I18n.t("title.skin_controls"), HORIZONTAL_ALIGNMENT_LEFT, skins_width, 14, Color("59615d"))
	skin_rects.clear()
	for i in range(SKINS.size()):
		var rect := Rect2(skins_left + i * (card_w + card_gap), shelf_y, card_w, 128)
		skin_rects.append(rect)
		_draw_skin_card(i, rect, i == selected_card, i == hover_skin, rise.call(0.62 + i * 0.07), boil)

	if toast_timer > 0.0:
		var toast_w := minf(430.0, size.x - 40.0)
		var toast := Rect2((size.x - toast_w) * 0.5, 28, toast_w, 46)
		DoodleKit.draw_paper(self, toast, YELLOW, 77, boil, INK, 2.5, 1, 10.0, 4.0)
		_draw_text(toast.position + Vector2(20, 30), toast_text, HORIZONTAL_ALIGNMENT_CENTER, toast.size.x - 40, 16, INK)
	if rules_open:
		_draw_rules(size)
	_draw_focus(boil)
	_draw_intro_veil(size, t)
	_sync_accessible_buttons()

## Notebook page: blue rules, red margin, punched binder holes, drifting doodles
## (sketchy stars, sparkles, a looping paper plane) in the margins.
func _draw_page(size: Vector2, boil: int, t: float) -> void:
	draw_rect(Rect2(Vector2.ZERO, size), PAPER)
	for y in range(38, int(size.y), 36):
		draw_line(Vector2(0, y), Vector2(size.x, y), Color("cce6f7"), 2.0)
	var margin_x := 78.0 if size.x >= 850 else 16.0
	draw_line(Vector2(margin_x, 0), Vector2(margin_x, size.y), Color(RED, 0.45), 3.0)
	if size.x >= 850:
		for i in 3:
			var hole := Vector2(34, size.y * (0.2 + i * 0.3))
			draw_circle(hole + Vector2(1, 2), 11, Color(INK, 0.1))
			draw_circle(hole, 11, Color("efe7c8"))
			draw_arc(hole, 11, 0, TAU, 20, Color(INK, 0.25), 1.5, true)
	var drift := 0.0 if motion_reduced() else time
	for i in 7:
		var base := Vector2(fposmod(0.18 + i * 0.137, 1.0) * size.x, fposmod(0.12 + i * 0.29, 0.9) * size.y)
		var p := base + Vector2(sin(drift * 0.4 + i) * 12.0, cos(drift * 0.35 + i * 1.3) * 9.0)
		var twinkle := 0.65 + 0.35 * sin(drift * 2.0 + i * 1.7)
		var color: Color = [YELLOW, Color("8ee9ff"), LIME, Color("ffb3c1")][i % 4]
		if i % 3 == 0:
			DoodleKit.draw_star(self, p, 8.0 + (i % 2) * 3.0, Color(color, 0.85), 60 + i, boil, 1.6)
		else:
			var r := (6.0 + (i % 3) * 2.0) * twinkle
			for k in 4:
				var a := k * PI * 0.25
				draw_line(p - Vector2(cos(a), sin(a)) * r, p + Vector2(cos(a), sin(a)) * r, Color(color.darkened(0.25), 0.7), 2.0, true)
	# Paper plane on a slow loop across the upper page, leaving a dashed trail.
	var loop := fposmod(drift * 0.07, 1.0)
	var plane := Vector2(lerpf(-80.0, size.x + 80.0, loop), size.y * 0.1 + sin(loop * TAU * 2.0) * 26.0)
	for k in 10:
		var back := loop - (k + 1) * 0.012
		var q := Vector2(lerpf(-80.0, size.x + 80.0, back), size.y * 0.1 + sin(back * TAU * 2.0) * 26.0)
		if k % 2 == 0: draw_circle(q, 1.6, Color(BLUE, 0.35))
	var heading := cos(loop * TAU * 2.0) * 0.35
	var xf := Transform2D(heading, plane)
	var wing := PackedVector2Array([xf * Vector2(18, 0), xf * Vector2(-14, -10), xf * Vector2(-8, 0), xf * Vector2(-14, 9)])
	draw_colored_polygon(wing, Color.WHITE)
	wing.append(wing[0])
	draw_polyline(wing, Color(INK, 0.8), 2.0, true)
	draw_line(xf * Vector2(18, 0), xf * Vector2(-8, 0), Color(INK, 0.6), 1.5, true)
	var _unused := t

func _draw_intro_veil(size: Vector2, t: float) -> void:
	var alpha := 1.0 - _ease(t / 0.35)
	if alpha > 0.0: draw_rect(Rect2(Vector2.ZERO, size), Color(PAPER, alpha))

static func _ease(x: float) -> float:
	return 1.0 - pow(1.0 - clampf(x, 0.0, 1.0), 3.0)

static func _back(x: float) -> float:
	var k := clampf(x, 0.0, 1.0) - 1.0
	return 1.0 + 2.70158 * k * k * k + 1.70158 * k * k

## A title word lands like a rubber stamp: big and faint -> slams to size.
func _stamp_word(pos: Vector2, angle: float, word: String, font_size: int, color: Color, x: float) -> void:
	var k := clampf(x, 0.0, 1.0)
	if k <= 0.0: return
	var scale := lerpf(1.35, 1.0, _back(k))
	draw_set_transform(pos, angle, Vector2.ONE * scale)
	draw_string(STYLE.DISPLAY, Vector2.ZERO, word, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, Color(color, clampf(k * 2.0, 0.0, 1.0)))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

## "Label  KEY" strings render the key as a hand-drawn key cap.
static func _split_key(text: String) -> PackedStringArray:
	var at := text.rfind("  ")
	if at > 0:
		var key := text.substr(at + 2).strip_edges()
		if key.length() <= 6 and not key.is_empty() and key.to_upper() == key:
			return PackedStringArray([text.substr(0, at), key])
	return PackedStringArray([text, ""])

static func _strip_star(text: String) -> String:
	return text.trim_prefix("★ ").strip_edges()

func _draw_tab(rect: Rect2, label: String, on: bool, seed_value: int, boil: int) -> void:
	DoodleKit.draw_paper(self, rect, LIME if on else Color.WHITE, seed_value, boil, INK, 2.2, 0, 8.0, 2.0 if on else 4.0)
	if on: DoodleKit.draw_tape(self, rect.position + Vector2(rect.size.x * 0.5, 0), Vector2(30, 12), 0.08, DoodleKit.TAPE)
	_draw_text(rect.position + Vector2(4, rect.size.y * 0.5 + 7), label, HORIZONTAL_ALIGNMENT_CENTER, rect.size.x - 8, 17, INK)

func _draw_paper_action(rect: Rect2, fill: Color, text: String, font_size: int, seed_value: int, boil: int, active: bool, offset: Vector2 = Vector2.ZERO) -> void:
	var shown := rect
	shown.position += offset
	DoodleKit.draw_paper(self, shown, fill.lerp(Color("f4ffd6"), 0.6) if active else fill, seed_value, boil, INK, 2.2, 0, 9.0, 4.0)
	var parts := _split_key(text)
	if parts[1].is_empty():
		_draw_text(shown.position + Vector2(0, shown.size.y * 0.5 + 6), parts[0], HORIZONTAL_ALIGNMENT_CENTER, shown.size.x, font_size, INK)
		return
	var label_w := minf(UI_FONT.get_string_size(parts[0], HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x, shown.size.x - 56)
	var key_w := UI_FONT.get_string_size(parts[1], HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x + 18
	var x0 := shown.position.x + (shown.size.x - label_w - key_w - 8) * 0.5
	_draw_text(Vector2(x0, shown.position.y + shown.size.y * 0.5 + 6), parts[0], HORIZONTAL_ALIGNMENT_LEFT, label_w, font_size, INK)
	DoodleKit.draw_keycap(self, UI_FONT, Vector2(x0 + label_w + 8 + key_w * 0.5, shown.get_center().y), parts[1], 12, seed_value + 1, boil)

## Lime sticky note Start with tape, a folded corner and a SPACE key cap.
func _draw_start(rect: Rect2, active: bool, offset: Vector2, breathe: float, boil: int) -> void:
	var c := rect.get_center() + offset + Vector2(0, -3.0 if active else 0.0)
	var scale := 1.0 + breathe + (0.02 if active else 0.0)
	draw_set_transform(c, -0.012 + breathe, Vector2.ONE * scale)
	var local := Rect2(-rect.size * 0.5, rect.size)
	DoodleKit.draw_paper(self, local, Color("d5ff55") if active else LIME, 19, boil, INK, 3.4, 2, 12.0, 7.0 if active else 5.0)
	draw_colored_polygon(PackedVector2Array([local.end - Vector2(20, 0), local.end - Vector2(0, 20), local.end]), Color(INK, 0.14))
	var parts := _split_key(I18n.t("title.start"))
	var font_size := 22
	var label_w := minf(STYLE.width_of(STYLE.BOLD, parts[0], font_size), local.size.x - 90)
	var key_w := 0.0 if parts[1].is_empty() else UI_FONT.get_string_size(parts[1], HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x + 18
	var x0 := local.position.x + (local.size.x - label_w - key_w - (10.0 if key_w > 0 else 0.0)) * 0.5
	STYLE.text(self, STYLE.BOLD, Vector2(x0, 8), parts[0], HORIZONTAL_ALIGNMENT_LEFT, label_w, font_size, INK)
	if key_w > 0.0:
		DoodleKit.draw_keycap(self, UI_FONT, Vector2(x0 + label_w + 10 + key_w * 0.5, 0), parts[1], 12, 23, boil)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func accessible_focus() -> String:
	for id: String in accessible_buttons:
		if (accessible_buttons[id] as Button).has_focus(): return id
	return ""

## Keyboard/gamepad focus on the invisible accessible buttons shows as a pencil
## loop around the drawn element.
func _draw_focus(boil: int) -> void:
	var id := accessible_focus()
	if id.is_empty(): return
	var button: Button = accessible_buttons[id]
	DoodleKit.draw_scribble_ring(self, Rect2(button.position, button.size), BLUE, id.hash() % 50, boil, 3.5)

func _draw_skin_card(index: int, rect: Rect2, selected: bool, hovered: bool, offset: Vector2 = Vector2.ZERO, boil: int = 0) -> void:
	var skin_id := String(SKINS[index].id)
	var unlocked := SaveStore.is_unlocked(skin_id)
	var equipped := SaveStore.selected_skin == skin_id
	# Polaroid-style paper cut-out, each at its own tilt, taped to the page.
	var tilt: float = [-0.035, 0.022, -0.015, 0.03][index % 4]
	var lift := -8.0 if selected else (-4.0 if hovered else 0.0)
	var c := rect.get_center() + offset + Vector2(0, lift)
	draw_set_transform(c, tilt * (0.3 if selected else 1.0), Vector2.ONE)
	var local := Rect2(-rect.size * 0.5, rect.size)
	var paper := Color.WHITE if unlocked else Color("ede9da")
	if selected or hovered: paper = Color("f4ffd0") if unlocked else Color("f4efda")
	DoodleKit.draw_paper(self, local, paper, 100 + index * 7, boil, INK, 2.4, 0, 10.0, 7.0 if selected else 4.0)
	DoodleKit.draw_tape(self, Vector2(0, local.position.y + 1), Vector2(44, 15), [0.06, -0.08, 0.1, -0.05][index % 4], DoodleKit.TAPE_BLUE if index % 2 else DoodleKit.TAPE)
	var texture: Texture2D = SKIN_PREVIEWS[skin_id]
	var tint := Color.WHITE if unlocked else Color(0.45, 0.45, 0.45, 0.48)
	draw_texture_rect(texture, Rect2(local.position + Vector2((local.size.x - 44) * 0.5, 8), Vector2(44, 51)), false, tint)
	if not unlocked:
		# Pencil hatching and a doodled padlock over locked skins.
		for k in 6:
			var x := local.position.x + 14.0 + k * (local.size.x - 28.0) / 5.0
			draw_line(Vector2(x, local.position.y + 12), Vector2(x - 16, local.position.y + 56), Color(INK, 0.1), 2.0, true)
		var lock := Vector2(local.size.x * 0.5 - 22, local.position.y + 44)
		draw_arc(lock + Vector2(0, -6), 6, PI, TAU, 10, INK, 2.2, true)
		DoodleKit.draw_paper(self, Rect2(lock + Vector2(-8, -6), Vector2(16, 13)), YELLOW, 300 + index, boil, INK, 1.8, 0, 3.0, 0.0)
	STYLE.text(self, STYLE.DISPLAY, local.position + Vector2(8, 82), I18n.t(SKINS[index].name), HORIZONTAL_ALIGNMENT_CENTER, local.size.x - 16, STYLE.display_size(24), INK)
	_draw_text(local.position + Vector2(8, 99), I18n.t(SKINS[index].tag), HORIZONTAL_ALIGNMENT_CENTER, local.size.x - 16, 12, Color("68706b"))
	var status := I18n.t("skin.equipped") if equipped else (I18n.t("skin.unlocked") if unlocked else I18n.t("skin.unlock", {"cost": SaveStore.skin_cost(skin_id)}))
	var status_color := RED if equipped else (BLUE if unlocked else INK)
	if equipped:
		DoodleKit.draw_scribble_fill(self, Rect2(local.position + Vector2(local.size.x * 0.25, 106), Vector2(local.size.x * 0.5, 16)), Color(YELLOW, 0.7), 400 + index, boil, 10.0)
	STYLE.text(self, STYLE.MEDIUM, local.position + Vector2(8, 119), status, HORIZONTAL_ALIGNMENT_CENTER, local.size.x - 16, 13, status_color)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	if selected:
		DoodleKit.draw_scribble_ring(self, Rect2(rect.position + offset + Vector2(0, lift), rect.size).grow(-6), BLUE, 500 + index, boil, 3.5)

func _draw_rules(size: Vector2) -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color(INK, 0.28), true)
	var box_w := minf(610.0, size.x - 48.0)
	var box_h := minf(470.0, size.y - 48.0)
	var box := Rect2((size.x - box_w) * 0.5, (size.y - box_h) * 0.5, box_w, box_h)
	draw_set_transform(box.position, 0.0, Vector2.ONE)
	DoodleKit.draw_sheet(self, box.size, 12, DoodleKit.boil(motion_reduced()), true)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	STYLE.text(self, STYLE.DISPLAY, box.position + Vector2(40, 58), I18n.t("help.title"), HORIZONTAL_ALIGNMENT_LEFT, -1, STYLE.display_size(44), INK)
	var lines := [
		I18n.t("help.move"),
		I18n.t("help.monsters"),
		I18n.t("help.pickups"),
		I18n.t("help.platforms"),
		I18n.t("help.stars"),
		I18n.t("help.endless"),
	]
	for i in range(lines.size()):
		var color: Color = [BLUE, RED, YELLOW, LIME][i % 4]
		DoodleKit.draw_star(self, box.position + Vector2(50, 96 + i * 50), 8, color, 70 + i)
		_draw_text(box.position + Vector2(68, 101 + i * 50), lines[i], HORIZONTAL_ALIGNMENT_LEFT, box.size.x - 98, 17, INK)
	_draw_text(box.position + Vector2(30, box.size.y - 28), I18n.t("help.close"), HORIZONTAL_ALIGNMENT_RIGHT, box.size.x - 60, 14, Color("68706b"))

func _skin_name(skin_id: String) -> String:
	for skin in SKINS:
		if String(skin.id) == skin_id:
			return I18n.t(skin.name)
	return I18n.t("skin.lime.name")

func _start_style(active: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color("d5ff55") if active else LIME
	style.border_color = INK
	style.set_border_width_all(4)
	style.corner_radius_top_left = 16
	style.corner_radius_top_right = 16
	style.corner_radius_bottom_left = 16
	style.corner_radius_bottom_right = 16
	style.shadow_color = Color(INK, 0.3)
	style.shadow_size = 7 if active else 4
	style.shadow_offset = Vector2(6, 7)
	return style

func _small_button_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color("ffffff")
	style.border_color = INK
	style.set_border_width_all(2)
	style.corner_radius_top_left = 10
	style.corner_radius_top_right = 10
	style.corner_radius_bottom_left = 10
	style.corner_radius_bottom_right = 10
	return style

func _toast_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = YELLOW
	style.border_color = INK
	style.set_border_width_all(3)
	style.corner_radius_top_left = 13
	style.corner_radius_top_right = 13
	style.corner_radius_bottom_left = 13
	style.corner_radius_bottom_right = 13
	style.shadow_color = Color(INK, 0.22)
	style.shadow_size = 7
	return style

func _modal_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = PAPER
	style.border_color = INK
	style.set_border_width_all(5)
	style.corner_radius_top_left = 22
	style.corner_radius_top_right = 22
	style.corner_radius_bottom_left = 22
	style.corner_radius_bottom_right = 22
	style.shadow_color = Color(INK, 0.32)
	style.shadow_size = 14
	style.shadow_offset = Vector2(9, 11)
	return style

func _draw_doodle_cloud(pos: Vector2, scale: float) -> void:
	var col := Color(BLUE, 0.30)
	draw_arc(pos, 28 * scale, PI, TAU, 24, col, 4)
	draw_arc(pos + Vector2(35, -9) * scale, 38 * scale, PI, TAU, 24, col, 4)
	draw_arc(pos + Vector2(82, 2) * scale, 25 * scale, PI, TAU, 24, col, 4)
	draw_line(pos + Vector2(-28, 0) * scale, pos + Vector2(107, 2) * scale, col, 4)

func _draw_text(position: Vector2, text: String, alignment: HorizontalAlignment, width: float, preferred_size: int, color: Color) -> void:
	var font_size := preferred_size
	if width > 0.0:
		while font_size > 10 and UI_FONT.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x > width:
			font_size -= 1
	draw_string(UI_FONT, position, text, alignment, width, font_size, color)

func _draw_portrait(size: Vector2) -> void:
	var left := 24.0
	var compact := size.y < 1000
	var still := motion_reduced()
	var boil := DoodleKit.boil(still)
	var t := 10.0 if still else time
	language_rects.clear()
	for index in range(2):
		var locale: String = ["en", "zh-CN"][index]
		var rect := Rect2(left + index * 68, 24, 60, 42)
		language_rects[locale] = rect
		_draw_tab(rect, I18n.t("language.option." + locale), I18n.get_locale() == locale, 31 + index, boil)
	var stars_text := _strip_star(I18n.t("title.stars", {"count": SaveStore.star_balance}))
	var stars_w := minf(190.0, STYLE.width_of(STYLE.DISPLAY, stars_text, STYLE.display_size(26)))
	DoodleKit.draw_star(self, Vector2(size.x - 24 - stars_w - 18, 40), 12, YELLOW, 5, boil)
	STYLE.text(self, STYLE.DISPLAY, Vector2(size.x - 225, 48), stars_text, HORIZONTAL_ALIGNMENT_RIGHT, 201, STYLE.display_size(26), RED)
	var word_size := STYLE.display_size(64 if compact else 72)
	var one := I18n.t("title.word_one")
	var two := I18n.t("title.word_two")
	var one_w := minf(size.x - 48, STYLE.width_of(STYLE.DISPLAY, one, word_size))
	var two_w := minf(size.x - 48, STYLE.width_of(STYLE.DISPLAY, two, word_size))
	_stamp_word(Vector2((size.x - one_w) * 0.5, 104 if compact else 133), -0.02, one, word_size, INK, (t - 0.1) / 0.45)
	_stamp_word(Vector2((size.x - two_w) * 0.5, 148 if compact else 190), -0.008, two, word_size, BLUE, (t - 0.28) / 0.45)
	var under_y := (156.0 if compact else 200.0)
	DoodleKit.draw_underline(self, Vector2((size.x - two_w) * 0.5, under_y), Vector2((size.x + two_w) * 0.5, under_y - 3), RED, 5.0, _ease((t - 0.62) / 0.4), 7)
	_draw_text(Vector2(24, 177 if compact else 225), toast_text if compact and toast_timer > 0 else I18n.t("title.tagline"), HORIZONTAL_ALIGNMENT_CENTER, size.x-48, 17, RED if compact and toast_timer > 0 else INK)
	var texture: Texture2D = SKIN_PREVIEWS[SaveStore.selected_skin]
	var hero_y := 182.0 if compact else 270.0
	var hero_size := Vector2(82, 96) if compact else Vector2(110, 128)
	var pop := _back((t - 0.35) / 0.45)
	var hero_c := Vector2(size.x * 0.5, hero_y + hero_size.y * 0.5 + (0.0 if still else sin(time * 2.4) * 4.0))
	draw_set_transform(hero_c, 0.0, Vector2.ONE * pop)
	draw_texture_rect(texture, Rect2(-hero_size * 0.5, hero_size), false)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	_draw_text(Vector2(24, hero_y + (118 if compact else 155)), I18n.t("title.best", {"height": SaveStore.best_height}), HORIZONTAL_ALIGNMENT_CENTER, size.x - 48, 18, INK)
	start_rect = Rect2(24, hero_y + (132 if compact else 177), size.x - 48, 50 if compact else 60)
	var rise := func(delay: float) -> Vector2: return Vector2(0, (1.0 - _back((t - delay) / 0.4)) * 50.0)
	_draw_start(start_rect, hover_start, rise.call(0.55), 0.0 if still else sin(time * 3.0) * 0.01, boil)
	rules_rect = Rect2(size.x * 0.5 - 70, hero_y + (190 if compact else 251), 140, 38)
	_draw_paper_action(rules_rect, Color.WHITE, I18n.t("help.button"), 16, 43, boil, false, rise.call(0.6))
	var shelf_y := hero_y + (234 if compact else 310)
	var card_w := (size.x - 60) / 2
	skin_rects.clear()
	for index in range(4):
		var rect := Rect2(24 + (index % 2) * (card_w + 12), shelf_y + (index / 2) * 140, card_w, 128)
		skin_rects.append(rect)
		_draw_skin_card(index, rect, index == selected_card, index == hover_skin, rise.call(0.62 + index * 0.07), boil)
	if toast_timer > 0 and not compact:
		_draw_text(Vector2(24, shelf_y + 296), toast_text, HORIZONTAL_ALIGNMENT_CENTER, size.x - 48, 16, RED)
	_draw_intro_veil(size, t)

func _create_accessible_buttons() -> void:
	for id: String in ["start", "help", "en", "zh-CN", "skin0", "skin1", "skin2", "skin3"]:
		var button := Button.new()
		button.action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
		button.flat = true
		button.modulate = Color(1, 1, 1, 0)
		button.focus_entered.connect(func(): button.modulate.a = 0.15)
		button.focus_exited.connect(func(): button.modulate.a = 0.0)
		button.pressed.connect(func():
			if not overlays.is_empty(): return
			if id == "start": _start_game()
			elif id == "help": session_ui.show_menu("help")
			elif id in ["en", "zh-CN"]: _select_language(id)
			else: selected_card = int(id.trim_prefix("skin")); _activate_skin(selected_card)
		)
		accessible_buttons[id] = button
		add_child(button)

func _sync_accessible_buttons() -> void:
	var rects := {"start": start_rect, "help": rules_rect}
	rects.merge(language_rects)
	for index in range(skin_rects.size()): rects["skin%d" % index] = skin_rects[index]
	for id: String in rects:
		if not accessible_buttons.has(id): continue
		var button: Button = accessible_buttons[id]
		button.position = rects[id].position
		button.size = rects[id].size
		button.tooltip_text = I18n.t("title.start" if id == "start" else "help.title") if id in ["start", "help"] else I18n.t("language.name." + id) if id in ["en", "zh-CN"] else I18n.t(SKINS[int(id.trim_prefix("skin"))].name)
