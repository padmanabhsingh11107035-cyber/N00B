extends CanvasLayer
## Caller owns simulation pause. This modal owns focus/input only.

signal closed

const STYLE := preload("res://scripts/doodle_style.gd")
const INK := Color("1d211f")
const PAPER := Color("fff9df")
var is_open := false
var _store: Node
var _overlay: Control
var _panel: PanelContainer
var _heading: Label
var _name_label: Label
var _entry: LineEdit
var _save_button: Button
var _hint: Label
var _status: Label
var _rows: VBoxContainer
var _close_button: Button
var _scroll: ScrollContainer
var _previous_focus: WeakRef
var _boil := -1
var _opened_at := 0.0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	layer = 60
	_build()
	_overlay.hide()
	I18n.locale_changed.connect(_on_locale_changed)
	get_viewport().size_changed.connect(_layout)

func open(store: Node) -> void:
	if is_open:
		return
	_store = store
	var focus := get_viewport().gui_get_focus_owner()
	_previous_focus = weakref(focus) if focus != null else null
	is_open = true
	_overlay.show()
	_entry.text = String(_store.display_name)
	_refresh()
	_layout()
	_layout.call_deferred()
	_close_button.grab_focus()
	_opened_at = Time.get_ticks_msec() / 1000.0
	if not DoodleKit.scene_reduced(self):
		# Toss the sheet onto the desk: veil fades, page spins in and settles.
		_overlay.modulate.a = 0.0
		_panel.rotation = 0.05
		_panel.scale = Vector2(0.9, 0.9)
		var tween := _panel.create_tween().set_parallel(true).set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
		tween.tween_property(_overlay, "modulate:a", 1.0, 0.16)
		tween.tween_property(_panel, "rotation", 0.0, 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tween.tween_property(_panel, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tween.tween_method(func(_v: float): _panel.pivot_offset = _panel.size * 0.5, 0.0, 1.0, 0.32)

func _process(_delta: float) -> void:
	if not is_open: return
	var frame := DoodleKit.boil(DoodleKit.scene_reduced(self))
	if frame != _boil or Time.get_ticks_msec() / 1000.0 - _opened_at < 0.8:
		_boil = frame
		_panel.queue_redraw()
		_heading.queue_redraw()

func close() -> void:
	if not is_open:
		return
	is_open = false
	_overlay.hide()
	if _previous_focus != null and is_instance_valid(_previous_focus.get_ref()):
		(_previous_focus.get_ref() as Control).grab_focus()
	closed.emit()

func _input(event: InputEvent) -> void:
	if not is_open:
		return
	if (event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE) or (event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_B):
		close()
		get_viewport().set_input_as_handled()

func _build() -> void:
	_overlay = Control.new()
	add_child(_overlay)
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	var shade := ColorRect.new()
	shade.color = Color(1, 1, 1, 1)
	shade.material = DoodleKit.veil_material(0.4)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.add_child(shade)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_panel = PanelContainer.new()
	var sheet := StyleBoxEmpty.new()
	sheet.content_margin_left = 14
	sheet.content_margin_right = 6
	sheet.content_margin_top = 6
	sheet.content_margin_bottom = 8
	_panel.add_theme_stylebox_override("panel", sheet)
	_panel.draw.connect(func(): DoodleKit.draw_sheet(_panel, _panel.size, 41, maxi(_boil, 0), false))
	_panel.minimum_size_changed.connect(func(): _layout.call_deferred())
	_overlay.add_child(_panel)
	var margin := MarginContainer.new()
	for side: String in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 22)
	_panel.add_child(margin)
	var body := VBoxContainer.new()
	body.add_theme_constant_override("separation", 10)
	margin.add_child(body)
	_heading = _label(28)
	_heading.add_theme_font_override("font", STYLE.DISPLAY)
	_heading.autowrap_mode = TextServer.AUTOWRAP_OFF
	_heading.draw.connect(func():
		var font: Font = _heading.get_theme_font("font")
		var width := minf(_heading.size.x, font.get_string_size(_heading.text, HORIZONTAL_ALIGNMENT_LEFT, -1, _heading.get_theme_font_size("font_size")).x)
		var progress := 1.0 if DoodleKit.scene_reduced(self) else clampf((Time.get_ticks_msec() / 1000.0 - _opened_at - 0.12) / 0.4, 0.0, 1.0)
		DoodleKit.draw_underline(_heading, Vector2(2, _heading.size.y - 8), Vector2(width + 6, _heading.size.y - 11), Color(DoodleKit.LIME, 0.95), 8.0, progress, 11))
	body.add_child(_heading)
	_hint = _label(15)
	_hint.add_theme_color_override("font_color", STYLE.MUTED)
	body.add_child(_hint)
	_name_label = _label(16)
	_name_label.add_theme_font_override("font", STYLE.MEDIUM)
	body.add_child(_name_label)
	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 8)
	body.add_child(name_row)
	_entry = LineEdit.new()
	_entry.max_length = 24
	_entry.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_entry.custom_minimum_size.y = 46
	_entry.add_theme_font_size_override("font_size", 19)
	_entry.add_theme_color_override("font_color", INK)
	_entry.add_theme_color_override("font_placeholder_color", Color("59615d"))
	# A written-on line instead of a form box: white slip + pencil underline.
	_entry.add_theme_stylebox_override("normal", _style(Color(1, 1, 1, 0.75), 6, 0))
	_entry.add_theme_stylebox_override("focus", _style(Color(1, 1, 1, 0.95), 6, 0))
	_entry.draw.connect(func():
		var frame := maxi(_boil, 0)
		var y := _entry.size.y - 4.0
		var color := STYLE.BLUE if _entry.has_focus() else INK
		DoodleKit.draw_underline(_entry, Vector2(4, y), Vector2(_entry.size.x - 4, y - 2), color, 3.0 if _entry.has_focus() else 2.4, 1.0, 5 + frame))
	_entry.focus_entered.connect(_entry.queue_redraw)
	_entry.focus_exited.connect(_entry.queue_redraw)
	_entry.text_submitted.connect(func(_value: String): _save_name())
	name_row.add_child(_entry)
	_save_button = _button()
	STYLE.style_button(_save_button, false, 16)
	_save_button.pressed.connect(_save_name)
	name_row.add_child(_save_button)
	_status = _label(14)
	body.add_child(_status)
	var scroll := ScrollContainer.new()
	_scroll = scroll
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(scroll)
	_rows = VBoxContainer.new()
	_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rows.add_theme_constant_override("separation", 8)
	scroll.add_child(_rows)
	_close_button = _button()
	STYLE.style_button(_close_button, true, 18)
	_close_button.pressed.connect(close)
	body.add_child(_close_button)

func _layout() -> void:
	if _panel == null:
		return
	var viewport_size := get_viewport().get_visible_rect().size
	_heading.add_theme_font_size_override("font_size", STYLE.display_size(52))
	# Hug the list: chrome + rows, capped to the viewport (rows scroll beyond that).
	var natural := _panel.get_combined_minimum_size().y + _rows.get_combined_minimum_size().y + 6.0
	var panel_size := Vector2(minf(620, viewport_size.x - 32), minf(minf(natural, 640.0), viewport_size.y - 32))
	_panel.position = (viewport_size - panel_size) * 0.5
	_panel.size = panel_size

func _save_name() -> void:
	var error_key: String = _store.validate_name(_entry.text)
	if not error_key.is_empty():
		_status.text = I18n.t(error_key)
		_status.modulate = Color("b9302b")
		return
	_store.set_display_name(_entry.text)
	_entry.text = _store.display_name
	_status.text = I18n.t("leaderboard.name.saved" if _store.save_ok else "leaderboard.save_error")
	_status.modulate = Color("1c603c") if _store.save_ok else Color("b9302b")

func _refresh() -> void:
	_heading.text = I18n.t("leaderboard.title")
	_hint.text = I18n.t("leaderboard.offline")
	_name_label.text = I18n.t("leaderboard.name.label")
	_entry.placeholder_text = I18n.t("leaderboard.name.placeholder")
	_entry.tooltip_text = I18n.t("leaderboard.name.hint")
	_save_button.text = I18n.t("leaderboard.name.save")
	_close_button.text = I18n.t("leaderboard.close")
	_status.text = I18n.t("leaderboard.name.hint" if _store.save_ok else "leaderboard.save_error")
	_status.modulate = Color.WHITE
	for row: Node in _rows.get_children():
		_rows.remove_child(row)
		row.queue_free()
	if _store.records.is_empty():
		var empty := _label(19)
		empty.text = I18n.t("leaderboard.empty")
		empty.custom_minimum_size.y = 72
		empty.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_rows.add_child(empty)
	var rank := 0
	for row: Dictionary in _store.records:
		rank += 1
		# Each record is a paper slip; the podium gets gold/silver/bronze star stickers.
		var card := PanelContainer.new()
		var slip := _style(Color(0, 0, 0, 0), 10, 0)
		slip.content_margin_right = 54
		card.add_theme_stylebox_override("panel", slip)
		var slip_seed := rank * 13
		var sticker: Color = [DoodleKit.YELLOW, Color("d6dde2"), Color("f0a36b")][rank - 1] if rank <= 3 else Color.TRANSPARENT
		var paper := Color("f4ffd6") if rank == 1 else Color.WHITE
		card.draw.connect(func():
			DoodleKit.draw_paper(card, Rect2(Vector2(2, 2), card.size - Vector2(8, 7)), paper, slip_seed, maxi(_boil, 0), INK, 1.8, 0, 8.0, 3.0)
			if sticker.a > 0.0:
				DoodleKit.draw_star(card, Vector2(card.size.x - 32, card.size.y * 0.5 - 2), 17, sticker, slip_seed, maxi(_boil, 0), 2.2))
		_rows.add_child(card)
		var text := _label(16)
		text.add_theme_font_override("font", STYLE.MEDIUM)
		var player_name: String = row.name if not String(row.name).is_empty() else I18n.t("leaderboard.name.default")
		text.text = I18n.t("leaderboard.row", {"rank": rank, "name": player_name, "score": row.score, "stage": row.stage, "outcome": I18n.t("leaderboard.outcome." + row.outcome), "duration": "%.1f" % float(row.duration), "config": I18n.t("leaderboard.config.baseline" if bool(row.ranked_eligible) else "leaderboard.config.custom")})
		card.add_child(text)

func _on_locale_changed(_locale: String) -> void:
	if is_open:
		_refresh()

func _label(font_size: int) -> Label:
	var label := Label.new()
	label.add_theme_color_override("font_color", INK)
	label.add_theme_font_size_override("font_size", font_size)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label

func _button() -> Button:
	var button := Button.new()
	button.custom_minimum_size.y = 46
	button.add_theme_font_size_override("font_size", 18)
	for state: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(state, INK)
	button.add_theme_stylebox_override("normal", _style(Color("c1ff2b"), 10, 2))
	button.add_theme_stylebox_override("hover", _style(Color("d9ff7a"), 10, 2))
	button.add_theme_stylebox_override("pressed", _style(Color("ffd338"), 10, 2))
	button.add_theme_stylebox_override("focus", _style(Color(0, 0, 0, 0), 10, 4, Color("2f80ed")))
	return button

func _style(color: Color, radius: int, border: int, border_color := INK) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border_color
	style.set_border_width_all(border)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	return style
