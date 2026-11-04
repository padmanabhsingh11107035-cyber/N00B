extends CanvasLayer

const OpenSourceLicenses = preload("res://scripts/web/open_source_licenses.gd")

const FONT = preload("res://assets/template/fonts/ui_regular.tres")
const STYLE := preload("res://scripts/doodle_style.gd")
var owner_scene: Node
var toolbar: HFlowContainer
var modal: Control
var modal_kind := ""
var menu_history: Array[String] = []
var leaderboard: CanvasLayer
var end_actions: HBoxContainer
var _boil := -1
var _opened_at := 0.0
const NOTE_COLORS := [Color("fff3a8"), Color("d8ecff"), Color("ffd9d2")]

func _ready() -> void:
    owner_scene = get_parent()
    layer = 25
    process_mode = Node.PROCESS_MODE_ALWAYS
    toolbar = HFlowContainer.new()
    toolbar.add_theme_constant_override("h_separation", 10)
    toolbar.add_theme_constant_override("v_separation", 8)
    add_child(toolbar)
    _build_toolbar()
    get_viewport().size_changed.connect(_layout)
    I18n.locale_changed.connect(func(_locale):
        _build_toolbar()
        if not modal_kind.is_empty(): _build_modal(modal_kind)
        if end_actions != null: show_result_actions()
    )
    _layout()

func _button(key: String, callback: Callable, primary := false) -> Button:
    var button := Button.new()
    button.text = I18n.t(key)
    button.custom_minimum_size = Vector2(0, 40)
    STYLE.style_button(button, primary, 16)
    button.pressed.connect(callback)
    return button

func _toolbar_button(key: String, callback: Callable) -> Button:
    var button := _button(key, callback)
    button.custom_minimum_size = Vector2(0, 40)
    # Pastel sticky notes taped to the page, each a different paper colour.
    STYLE.style_note(button, NOTE_COLORS[toolbar.get_child_count() % NOTE_COLORS.size()], 15)
    return button

func _process(_delta: float) -> void:
    # Boiling-line redraw for the paper sheet and its underline (8 fps).
    if modal == null or not is_instance_valid(modal): return
    var frame := DoodleKit.boil(owner_scene.motion_reduced())
    var panel := modal.get_node_or_null("Panel") as Control
    var fresh := Time.get_ticks_msec() / 1000.0 - _opened_at < 0.8
    if panel != null and (frame != _boil or fresh):
        _boil = frame
        panel.queue_redraw()
        var heading := panel.get_node_or_null("Scroll/Rows/Heading") as Control
        if heading != null: heading.queue_redraw()

func _build_toolbar() -> void:
    for child in toolbar.get_children(): child.free()
    if owner_scene.has_method("_finish"):
        toolbar.add_child(_toolbar_button("menu.pause", func(): show_menu("pause")))
        toolbar.add_child(_toolbar_button("help.button", func(): show_menu("help")))
    else:
        toolbar.add_child(_toolbar_button("leaderboard.open", show_leaderboard))
        toolbar.add_child(_toolbar_button("tutorial.replay", func():
            owner_scene.replay_tutorial = true
            owner_scene._start_game()
        ))
        toolbar.add_child(_toolbar_button("menu.settings", func(): show_menu("settings")))
        var licenses := _button("ui.open_source_licenses", OpenSourceLicenses.open.bind(owner_scene))
        # Licenses stay reachable but read as a quiet footer link, not a menu action.
        licenses.custom_minimum_size = Vector2(0, 38)
        STYLE.style_quiet(licenses)
        licenses.name = "OpenSourceLicensesButton"
        licenses.action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
        toolbar.add_child(licenses)
    _layout()

func _layout() -> void:
    var size := get_viewport().get_visible_rect().size
    toolbar.size = Vector2(maxf(0, size.x - 48), 0)
    toolbar.position = Vector2(22, 92 if size.x < 850 else 82) if owner_scene.has_method("_finish") else Vector2(24, size.y - (156 if size.x < 700 else 60))
    if modal != null:
        modal.size = size
        var panel: PanelContainer = modal.get_node("Panel")
        # Hug the content (pause/help/settings) instead of a fixed tall sheet.
        var rows: Control = panel.get_node("Scroll/Rows")
        var natural := rows.get_combined_minimum_size().y + 48.0
        panel.custom_minimum_size = Vector2.ZERO
        panel.size = Vector2(minf(500, size.x - 40), minf(natural, size.y - 48))
        panel.position = (size - panel.size) * 0.5
    if end_actions != null:
        end_actions.position = Vector2((size.x - end_actions.size.x) * 0.5, size.y * 0.5 + 190)

func show_menu(kind: String) -> void:
    if kind == "pause" and owner_scene.has_method("_finish"):
        owner_scene.tutorial.notify_event("paused")
    if modal_kind.is_empty(): owner_scene.open_overlay("menu")
    elif kind != modal_kind: menu_history.append(modal_kind)
    modal_kind = kind
    _build_modal(kind)

func _build_modal(kind: String) -> void:
    if modal != null: modal.free()
    modal = Control.new()
    modal.name = "Modal"
    add_child(modal)
    # Blurred pencil-wash veil over the page instead of a flat grey dim.
    var shade := ColorRect.new()
    shade.color = Color(1, 1, 1, 1)
    shade.material = DoodleKit.veil_material(0.4)
    shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
    modal.add_child(shade)
    var panel := PanelContainer.new()
    panel.name = "Panel"
    # A torn-out notebook sheet: lined paper, red margin, sketchy border, tape.
    var style := StyleBoxEmpty.new()
    style.content_margin_left = 40
    style.content_margin_right = 30
    style.content_margin_top = 24
    style.content_margin_bottom = 30
    panel.add_theme_stylebox_override("panel", style)
    var sheet_seed := kind.hash() % 97
    panel.draw.connect(func(): DoodleKit.draw_sheet(panel, panel.size, sheet_seed, maxi(_boil, 0), kind == "help"))
    var theme := Theme.new()
    theme.default_font = FONT
    theme.default_font_size = 18
    theme.set_color("font_color", "Label", Color("1d211f"))
    panel.theme = theme
    modal.add_child(panel)
    var scroll := ScrollContainer.new()
    scroll.name = "Scroll"
    scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
    panel.add_child(scroll)
    var rows := VBoxContainer.new()
    rows.name = "Rows"
    rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
    rows.add_theme_constant_override("separation", 12)
    scroll.add_child(rows)
    var heading := Label.new()
    heading.text = I18n.t("menu." + kind if kind != "help" else "help.title")
    heading.add_theme_font_override("font", STYLE.DISPLAY)
    heading.add_theme_font_size_override("font_size", STYLE.display_size(52))
    heading.add_theme_constant_override("line_spacing", -8)
    heading.name = "Heading"
    heading.draw.connect(func():
        var font: Font = heading.get_theme_font("font")
        var width := minf(heading.size.x, font.get_string_size(heading.text, HORIZONTAL_ALIGNMENT_LEFT, -1, heading.get_theme_font_size("font_size")).x)
        var progress := 1.0 if owner_scene.motion_reduced() else clampf((Time.get_ticks_msec() / 1000.0 - _opened_at - 0.12) / 0.4, 0.0, 1.0)
        DoodleKit.draw_underline(heading, Vector2(2, heading.size.y - 6), Vector2(width + 6, heading.size.y - 9), Color(DoodleKit.YELLOW, 0.95), 7.0, progress, sheet_seed))
    rows.add_child(heading)
    if kind == "help":
        for key in ["help.move", "help.monsters", "help.pickups", "help.platforms", "help.stars", "help.endless", "help.pause"]:
            var line := Label.new()
            line.text = I18n.t(key)
            line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
            rows.add_child(line)
    if kind == "pause":
        rows.add_child(_button("menu.resume", close_menu, true))
        # Secondary actions are a hand-lettered list under the pencil cursor.
        for pair: Array in [["menu.restart", func(): show_menu("confirm_restart")], ["leaderboard.open", show_leaderboard], ["menu.settings", func(): show_menu("settings")], ["menu.title", func(): show_menu("confirm_title")]]:
            var row := _button(pair[0], pair[1])
            STYLE.style_row(row, 18)
            rows.add_child(row)
    elif kind in ["confirm_restart", "confirm_title"]:
        var description := Label.new()
        description.text = I18n.t("menu.lose_progress")
        description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
        rows.add_child(description)
        rows.add_child(_button("menu.confirm", func():
            menu_history.clear()
            close_menu()
            if kind == "confirm_restart": owner_scene._restart()
            else: owner_scene.return_to_title()
        ))
    elif kind == "settings":
        var mute := CheckButton.new()
        STYLE.style_check(mute)
        mute.text = I18n.t("audio.muted")
        mute.button_pressed = AudioDirector.is_muted()
        mute.toggled.connect(func(value): AudioDirector.set_muted(value))
        rows.add_child(mute)
        for channel: String in ["Master", "Music", "SFX", "UI"]:
            var label := Label.new()
            label.text = I18n.t("audio." + channel.to_lower())
            label.add_theme_font_override("font", STYLE.MEDIUM)
            label.add_theme_font_size_override("font_size", 16)
            rows.add_child(label)
            var slider := HSlider.new()
            slider.min_value = 0.0; slider.max_value = 1.0; slider.step = 0.05
            slider.value = AudioDirector.get_volume(channel)
            slider.custom_minimum_size.y = 32
            STYLE.style_slider(slider)
            slider.value_changed.connect(func(value): AudioDirector.set_volume(channel, value))
            rows.add_child(slider)
        var motion := CheckButton.new()
        STYLE.style_check(motion)
        motion.text = I18n.t("settings.reduced_motion")
        motion.button_pressed = owner_scene.reduced_motion
        motion.toggled.connect(func(value): owner_scene.set_reduced_motion(value))
        rows.add_child(motion)
        rows.add_child(_button("language.switch", func(): I18n.toggle_locale()))
    var back := _button("menu.back", close_menu)
    STYLE.style_row(back, 17)
    rows.add_child(back)
    rows.minimum_size_changed.connect(func(): _layout.call_deferred())
    _layout()
    _layout.call_deferred()
    _toss_in(panel, shade)
    for child in rows.get_children():
        if child is Button:
            child.grab_focus()
            break

## The sheet is tossed onto the page: slight spin, drop and settle; veil fades in.
func _toss_in(panel: Control, shade: CanvasItem) -> void:
    _opened_at = Time.get_ticks_msec() / 1000.0
    if owner_scene.motion_reduced(): return
    panel.modulate.a = 0.0
    shade.modulate.a = 0.0
    panel.rotation = -0.06
    panel.scale = Vector2(0.9, 0.9)
    var tween := panel.create_tween().set_parallel(true).set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
    tween.tween_property(shade, "modulate:a", 1.0, 0.16)
    tween.tween_property(panel, "modulate:a", 1.0, 0.12)
    tween.tween_property(panel, "rotation", 0.0, 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
    tween.tween_property(panel, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
    tween.tween_method(func(_v: float): panel.pivot_offset = panel.size * 0.5, 0.0, 1.0, 0.32)

func close_menu() -> void:
    if not menu_history.is_empty():
        modal_kind = menu_history.pop_back()
        _build_modal(modal_kind)
        return
    if modal != null: modal.queue_free(); modal = null
    modal_kind = ""
    owner_scene.close_overlay("menu")

func show_leaderboard() -> void:
    if leaderboard != null: return
    owner_scene.open_overlay("leaderboard")
    leaderboard = load("res://scripts/leaderboard_panel.gd").new()
    add_child(leaderboard)
    leaderboard.closed.connect(func():
        owner_scene.close_overlay("leaderboard")
        leaderboard.queue_free()
        leaderboard = null
    )
    leaderboard.open(LeaderboardStore)

func show_result_actions() -> void:
    if end_actions != null: end_actions.queue_free()
    end_actions = HBoxContainer.new()
    end_actions.add_theme_constant_override("separation", 12)
    end_actions.add_child(_button("leaderboard.open", show_leaderboard))
    end_actions.add_child(_button("menu.title", owner_scene.return_to_title))
    add_child(end_actions)
    _layout.call_deferred()

func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("ui_cancel") and not modal_kind.is_empty():
        close_menu()
        get_viewport().set_input_as_handled()
