extends Node

signal value_changed(key: String, value: float)
signal requested_changed(key: String, value: float)

const Catalog = preload("res://scripts/tweak_catalog.gd")
# Tests may suppress preview access; a release build can never enable it.
var preview_enabled := true
var values: Dictionary = {}
var requested: Dictionary = {}
var _specs: Dictionary = {}
var _run_active := false
var _run_tainted := false

func _init() -> void:
    for spec: Dictionary in Catalog.descriptors():
        var id := String(spec.id)
        _specs[id] = spec
        values[id] = float(spec.default)
        requested[id] = float(spec.default)

func _ready() -> void:
    pass


func is_available() -> bool:
    return preview_enabled and OS.is_debug_build() and not OS.has_feature("release") and not OS.has_feature("checkpoint")

func descriptors() -> Array[Dictionary]:
    return Catalog.descriptors()

func get_value(key: String) -> float:
    if not _specs.has(key):
        return 0.0
    if not is_available():
        return float(_specs[key].default)
    return float(values[key])

func get_requested_value(key: String) -> float:
    return float(requested.get(key, 0.0)) if is_available() else get_value(key)

func set_value(key: String, value: Variant) -> bool:
    if not is_available() or not _specs.has(key):
        return false
    var validated: Variant = _validate(_specs[key], value)
    if validated == null:
        return false
    requested[key] = validated
    requested_changed.emit(key, float(validated))
    if _specs[key].apply_mode == "LIVE":
        _apply(key)
    return true

func _validate(spec: Dictionary, value: Variant) -> Variant:
    if not (value is float or value is int or (spec.type == "boolean" and value is bool)):
        return null
    var number := float(value)
    if not is_finite(number):
        return null
    number = clampf(number, float(spec.min), float(spec.max))
    # Quantize around the authored default so existing baselines never move.
    number = float(spec.default) + snappedf(number - float(spec.default), float(spec.step))
    return clampf(number, float(spec.min), float(spec.max))

func _apply(key: String) -> void:
    var value := float(requested[key])
    if _run_active and _specs[key].integrity != "COSMETIC" and not is_equal_approx(value, float(_specs[key].default)):
        _run_tainted = true
    if not is_equal_approx(float(values[key]), value):
        values[key] = value
        value_changed.emit(key, value)

func apply_boundary(mode: String) -> void:
    if not is_available():
        return
    for key: String in _specs:
        if String(_specs[key].apply_mode) == mode:
            _apply(key)

func begin_run() -> void:
    _run_tainted = false
    _run_active = true
    if not is_available():
        return
    for key: String in _specs:
        _apply(key)

func end_run() -> void:
    _run_active = false

func is_run_tainted() -> bool:
    return _run_tainted and is_available()

func configuration_marker() -> String:
    var gameplay: Dictionary = {"schema": Catalog.SCHEMA_VERSION}
    for key: String in _specs:
        if _specs[key].integrity != "COSMETIC":
            gameplay[key] = get_value(key)
    return JSON.stringify(gameplay).sha256_text().substr(0, 12)

func reset_value(key: String) -> void:
    if _specs.has(key):
        set_value(key, _specs[key].default)

func reset() -> void:
    for key: String in _specs:
        reset_value(key)

func has_pending_values() -> bool:
    for key: String in _specs:
        if not is_equal_approx(get_value(key), get_requested_value(key)):
            return true
    return false

func apply_preview_patch(patch: Dictionary) -> bool:
    if not is_available(): return false
    for id: String in patch:
        if not _specs.has(id) or _validate(_specs[id],patch[id]) == null: return false
    var changed: Array[String] = []
    var activated: Array[String] = []
    for id: String in patch:
        var next := float(patch[id])
        if requested[id] == next: continue
        changed.append(id)
        requested[id] = next
        if _specs[id].apply_mode == "LIVE":
            values[id] = next
            activated.append(id)
            if _run_active and _specs[id].integrity != "COSMETIC" and next != _specs[id].default: _run_tainted = true
    for id: String in changed: requested_changed.emit(id,requested[id])
    for id: String in activated: value_changed.emit(id,values[id])
    return true
