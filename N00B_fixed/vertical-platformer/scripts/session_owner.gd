extends Node2D

var overlays: Dictionary = {}
var previous_pause := false
var overlay_focus: Dictionary = {}
var session_ui: CanvasLayer
var reduced_motion := false
const SETTINGS_PATH := "user://vertical_platformer_accessibility.cfg"

func _enter_tree() -> void:
    _apply_window_design_size()
    get_window().size_changed.connect(_on_window_resized)

func _on_window_resized() -> void:
    # A run keeps its authored coordinate space when the device rotates.
    # The next scene chooses the new orientation before building its world.
    if not has_method("_finish"):
        _apply_window_design_size()

func _apply_window_design_size() -> void:
    var window := get_window()
    # Explicit no-scaling render harnesses retain their requested pixel layout.
    if window.content_scale_mode != Window.CONTENT_SCALE_MODE_CANVAS_ITEMS:
        return
    var design := Vector2i(390, 844) if window.size.y > window.size.x else Vector2i(1280, 720)
    if window.content_scale_size != design:
        window.content_scale_size = design

func setup_session_ui() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    var config := ConfigFile.new()
    if config.load(SETTINGS_PATH) == OK:
        reduced_motion = bool(config.get_value("accessibility", "reduced_motion", false))
    session_ui = load("res://scripts/session_ui.gd").new()
    add_child(session_ui)

func open_overlay(id: String) -> void:
    if overlays.is_empty():
        previous_pause = get_tree().paused
    var focus := get_viewport().gui_get_focus_owner()
    overlay_focus[id] = weakref(focus) if focus != null else null
    overlays[id] = true
    get_tree().paused = true
    AudioDirector.set_paused(true)
    if "touch_dirs" in self: get("touch_dirs").clear()

func close_overlay(id: String) -> void:
    var restore_focus: WeakRef = overlay_focus.get(id)
    overlay_focus.erase(id)
    overlays.erase(id)
    if overlays.is_empty():
        get_tree().paused = previous_pause
        AudioDirector.set_paused(previous_pause)
    if restore_focus != null:
        var focus = restore_focus.get_ref()
        if is_instance_valid(focus) and focus.is_visible_in_tree(): focus.grab_focus()

func set_reduced_motion(value: bool) -> void:
    reduced_motion = value
    var config := ConfigFile.new()
    config.set_value("accessibility", "reduced_motion", value)
    config.save(SETTINGS_PATH)

func motion_reduced() -> bool:
    return reduced_motion or TuningStore.get_value("reduced_motion") > 0.5

func return_to_title() -> void:
    overlays.clear()
    get_tree().paused = false
    AudioDirector.set_paused(false)
    AudioDirector.clear_run_audio()
    get_tree().change_scene_to_file("res://scenes/title_screen.tscn")

func _exit_tree() -> void:
    if not overlays.is_empty():
        get_tree().paused = previous_pause
        AudioDirector.set_paused(previous_pause)
