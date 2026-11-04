extends RefCounted

# One source for validation, presentation, persistence, timing and run integrity.
const CATEGORIES := ["UI", "GAMEPLAY", "AUDIO", "PLAYER", "ENEMIES", "ENVIRONMENT"]
const SCHEMA_VERSION := 2

static func descriptors() -> Array[Dictionary]:
    return [
        _spec("hud_opacity", "UI", 1.0, 0.5, 1.0, 0.05, "LIVE", "COSMETIC", "ratio"),
        _spec("reduced_motion", "UI", 0.0, 0.0, 1.0, 1.0, "LIVE", "COSMETIC", "", "boolean"),
        _spec("platform_gap", "GAMEPLAY", 128.0, 102.0, 158.0, 2.0, "NEXT_STAGE", "GAMEPLAY", "px"),
        _spec("jetpack_duration", "GAMEPLAY", 0.80, 0.45, 1.25, 0.05, "NEXT_ACTION", "GAMEPLAY", "seconds"),
        _spec("music_volume", "AUDIO", 1.0, 0.0, 1.0, 0.05, "LIVE", "COSMETIC", "ratio"),
        _spec("sfx_volume", "AUDIO", 1.0, 0.0, 1.0, 0.05, "LIVE", "COSMETIC", "ratio"),
        _spec("ui_volume", "AUDIO", 1.0, 0.0, 1.0, 0.05, "LIVE", "COSMETIC", "ratio"),
        _spec("move_speed", "PLAYER", 500.0, 280.0, 760.0, 20.0, "LIVE", "GAMEPLAY", "speed"),
        _spec("move_accel", "PLAYER", 2100.0, 1000.0, 3600.0, 100.0, "LIVE", "GAMEPLAY", "acceleration"),
        _spec("air_drag", "PLAYER", 8.0, 2.0, 14.0, 0.5, "LIVE", "GAMEPLAY", "ratio"),
        _spec("gravity", "PLAYER", 1780.0, 1100.0, 2500.0, 50.0, "LIVE", "GAMEPLAY", "acceleration"),
        _spec("jump_speed", "PLAYER", 820.0, 620.0, 1050.0, 20.0, "NEXT_ACTION", "GAMEPLAY", "speed"),
        _spec("spring_speed", "PLAYER", 1060.0, 850.0, 1350.0, 25.0, "NEXT_ACTION", "GAMEPLAY", "speed"),
        _spec("enemy_speed_multiplier", "ENEMIES", 1.0, 0.5, 1.5, 0.1, "NEXT_SPAWN", "GAMEPLAY", "ratio"),
        _spec("camera_follow", "ENVIRONMENT", 6.5, 2.0, 12.0, 0.5, "LIVE", "COSMETIC", "ratio"),
        _spec("effects_intensity", "ENVIRONMENT", 1.0, 0.0, 1.0, 0.1, "LIVE", "COSMETIC", "ratio"),
        _spec("filter_enabled", "ENVIRONMENT", 1.0, 0.0, 1.0, 1.0, "LIVE", "COSMETIC", "", "boolean"),
        _spec("filter_intensity", "ENVIRONMENT", 0.15, 0.0, 0.5, 0.05, "LIVE", "COSMETIC", "ratio"),
    ]

static func _spec(id: String, category: String, baseline: float, minimum: float, maximum: float, step: float, mode: String, integrity: String, unit: String, type := "float") -> Dictionary:
    return {"id": id, "category": category, "type": type, "default": baseline,
        "min": minimum, "max": maximum, "step": step, "options": [], "unit": unit,
        "apply_mode": mode, "integrity": integrity, "label_key": "tweak." + id + ".label",
        "description_key": "tweak." + id + ".description", "tags": [category.to_lower(), id]}
