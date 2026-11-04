extends CanvasLayer
## Nonblocking callouts observe gameplay; they never own pause or player state.

signal finished(skipped: bool)

const TUTORIAL_VERSION := 1
const STEPS := [
	{"id": "move", "trigger": "move_available", "complete": ["moved"], "timeout": 20.0},
	{"id": "pickup", "trigger": "pickup_visible", "complete": ["pickup_collected"], "timeout": 16.0},
	{"id": "hazard", "trigger": "hazard_visible", "complete": ["hazard_avoided", "damaged"], "timeout": 16.0},
	{"id": "pause", "trigger": "pause_available", "complete": ["paused"], "timeout": 12.0},
]

var save_path := "user://tutorial-v1.json"
var active := false
var current_step := -1
var completed := false
var input_method := "keyboard"
var _run_active := false
var _events: Dictionary = {}
var _elapsed := 0.0
var _waiting := 0.0
var _showing_step := false
var _card: PanelContainer
var _title: Label
var _body: Label
var _skip_button: Button

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	layer = 35
	load_data()
	_build()
	_card.hide()
	I18n.locale_changed.connect(_on_locale_changed)
	get_viewport().size_changed.connect(_layout)

func load_data() -> void:
	completed = false
	if not FileAccess.file_exists(save_path):
		return
	var file := FileAccess.open(save_path, FileAccess.READ)
	if file == null or file.get_length() > 4096:
		return
	var parser := JSON.new()
	if parser.parse(file.get_as_text()) != OK:
		return
	var value: Variant = parser.data
	if value is Dictionary:
		completed = value.get("version") == TUTORIAL_VERSION and value.get("completed") == true

func begin_run(replay_requested := false) -> void:
	end_run()
	if replay_requested:
		completed = false
		_save(false)
	if completed:
		return
	_run_active = true
	active = true
	current_step = 0
	notify_event("move_available")

func replay() -> void:
	begin_run(true)

func notify_event(event: String, method := "") -> void:
	if not method.is_empty() and method in ["keyboard", "touch", "gamepad"]:
		input_method = method
		_refresh()
	if not _run_active:
		return
	_events[event] = true
	_evaluate()

func skip() -> void:
	if _run_active:
		_complete(true)

func end_run() -> void:
	_run_active = false
	active = false
	current_step = -1
	_events.clear()
	_elapsed = 0.0
	_waiting = 0.0
	_showing_step = false
	if _card != null:
		_card.hide()

func _process(delta: float) -> void:
	if _card != null: _card.visible = active and not get_tree().paused
	if not _run_active or get_tree().paused:
		return
	if _showing_step:
		_elapsed += delta
		if _elapsed >= float(STEPS[current_step].timeout):
			_next_step()
	else:
		_waiting += delta
		# An unreachable trigger cannot leave the tutorial pending forever.
		if _waiting >= 30.0:
			_next_step()

func _input(event: InputEvent) -> void:
	if get_tree().paused: return
	if event is InputEventScreenTouch and event.pressed:
		_set_input_method("touch")
	elif event is InputEventJoypadButton or event is InputEventJoypadMotion:
		_set_input_method("gamepad")
	elif event is InputEventKey and event.pressed:
		_set_input_method("keyboard")
	if not active:
		return
	if (event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_BACKSPACE) or (event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_X):
		skip()
		get_viewport().set_input_as_handled()

func _set_input_method(method: String) -> void:
	if input_method != method:
		input_method = method
		_refresh()

func _evaluate() -> void:
	if not _run_active or current_step < 0 or current_step >= STEPS.size():
		return
	var step: Dictionary = STEPS[current_step]
	for event: String in step.complete:
		if _events.has(event):
			_next_step()
			return
	if _events.has(step.trigger):
		_showing_step = true
	_card.show()
	_refresh()

func _next_step() -> void:
	_showing_step = false
	_elapsed = 0.0
	_waiting = 0.0
	current_step += 1
	if current_step >= STEPS.size():
		_complete(false)
	else:
		_evaluate()

func _complete(skipped: bool) -> void:
	completed = true
	_save(skipped)
	end_run()
	finished.emit(skipped)

func _save(skipped: bool) -> void:
	var file := FileAccess.open(save_path, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify({"version": TUTORIAL_VERSION, "completed": completed, "skipped": skipped}))

func _build() -> void:
	_card = PanelContainer.new()
	_card.mouse_filter = Control.MOUSE_FILTER_STOP
	var style := StyleBoxFlat.new()
	style.bg_color = Color("fff9df")
	style.border_color = Color("2f80ed")
	style.set_border_width_all(3)
	style.set_corner_radius_all(13)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	_card.add_theme_stylebox_override("panel", style)
	_card.minimum_size_changed.connect(func(): _layout.call_deferred())
	add_child(_card)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", 6)
	_card.add_child(content)
	_title = Label.new()
	_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_title.add_theme_color_override("font_color", Color("1d211f"))
	_title.add_theme_font_size_override("font_size", 19)
	_title.add_theme_font_override("font", load("res://assets/template/fonts/ui_bold.tres"))
	content.add_child(_title)
	_body = Label.new()
	_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_body.add_theme_color_override("font_color", Color("1d211f"))
	_body.add_theme_font_size_override("font_size", 16)
	content.add_child(_body)
	_skip_button = Button.new()
	_skip_button.custom_minimum_size.y = 40
	_skip_button.add_theme_font_size_override("font_size", 16)
	preload("res://scripts/doodle_style.gd").style_button(_skip_button, false, 15)
	_skip_button.pressed.connect(skip)
	content.add_child(_skip_button)
	_layout()

func _refresh() -> void:
	if not active or current_step < 0 or _title == null:
		return
	var step: Dictionary = STEPS[current_step]
	_title.text = I18n.t("tutorial.heading", {"step": current_step + 1, "total": STEPS.size(), "title": I18n.t("tutorial." + step.id + ".title" if _showing_step else "tutorial.waiting.title")})
	_body.text = I18n.t("tutorial." + step.id + ".body." + input_method if _showing_step else "tutorial.waiting.body")
	_skip_button.text = I18n.t("tutorial.skip." + input_method)
	_skip_button.tooltip_text = I18n.t("tutorial.skip.hint")
	_layout()

func _layout() -> void:
	if _card == null:
		return
	var viewport_size := get_viewport().get_visible_rect().size
	var width := minf(440.0, viewport_size.x - 32.0)
	_card.size = Vector2(width, 0)
	_card.position = Vector2((viewport_size.x - width) * 0.5, 145 if viewport_size.x < viewport_size.y else 130)

func _on_locale_changed(_locale: String) -> void:
	_refresh()
