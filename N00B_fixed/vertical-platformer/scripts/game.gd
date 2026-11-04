extends "res://scripts/session_owner.gd"

const UI_FONT: Font = preload("res://assets/template/fonts/ui_regular.tres")
const STYLE := preload("res://scripts/doodle_style.gd")
const SKIN_FRAMES := {
    "lime": [
        preload("res://assets/template/characters/hero/hero_00.webp"), preload("res://assets/template/characters/hero/hero_01.webp"), preload("res://assets/template/characters/hero/hero_02.webp"), preload("res://assets/template/characters/hero/hero_03.webp"), preload("res://assets/template/characters/hero/hero_04.webp"), preload("res://assets/template/characters/hero/hero_05.webp"), preload("res://assets/template/characters/hero/hero_06.webp"), preload("res://assets/template/characters/hero/hero_07.webp"), preload("res://assets/template/characters/hero/hero_08.webp"), preload("res://assets/template/characters/hero/hero_09.webp"), preload("res://assets/template/characters/hero/hero_10.webp"), preload("res://assets/template/characters/hero/hero_11.webp")],
    "sea": [
        preload("res://assets/template/characters/hero_sea/hero_sea_00.webp"), preload("res://assets/template/characters/hero_sea/hero_sea_01.webp"), preload("res://assets/template/characters/hero_sea/hero_sea_02.webp"), preload("res://assets/template/characters/hero_sea/hero_sea_03.webp"), preload("res://assets/template/characters/hero_sea/hero_sea_04.webp"), preload("res://assets/template/characters/hero_sea/hero_sea_05.webp"), preload("res://assets/template/characters/hero_sea/hero_sea_06.webp"), preload("res://assets/template/characters/hero_sea/hero_sea_07.webp"), preload("res://assets/template/characters/hero_sea/hero_sea_08.webp"), preload("res://assets/template/characters/hero_sea/hero_sea_09.webp"), preload("res://assets/template/characters/hero_sea/hero_sea_10.webp"), preload("res://assets/template/characters/hero_sea/hero_sea_11.webp")],
    "sunset": [
        preload("res://assets/template/characters/hero_sunset/hero_sunset_00.webp"), preload("res://assets/template/characters/hero_sunset/hero_sunset_01.webp"), preload("res://assets/template/characters/hero_sunset/hero_sunset_02.webp"), preload("res://assets/template/characters/hero_sunset/hero_sunset_03.webp"), preload("res://assets/template/characters/hero_sunset/hero_sunset_04.webp"), preload("res://assets/template/characters/hero_sunset/hero_sunset_05.webp"), preload("res://assets/template/characters/hero_sunset/hero_sunset_06.webp"), preload("res://assets/template/characters/hero_sunset/hero_sunset_07.webp"), preload("res://assets/template/characters/hero_sunset/hero_sunset_08.webp"), preload("res://assets/template/characters/hero_sunset/hero_sunset_09.webp"), preload("res://assets/template/characters/hero_sunset/hero_sunset_10.webp"), preload("res://assets/template/characters/hero_sunset/hero_sunset_11.webp")],
    "ink": [
        preload("res://assets/template/characters/hero_ink/hero_ink_00.webp"), preload("res://assets/template/characters/hero_ink/hero_ink_01.webp"), preload("res://assets/template/characters/hero_ink/hero_ink_02.webp"), preload("res://assets/template/characters/hero_ink/hero_ink_03.webp"), preload("res://assets/template/characters/hero_ink/hero_ink_04.webp"), preload("res://assets/template/characters/hero_ink/hero_ink_05.webp"), preload("res://assets/template/characters/hero_ink/hero_ink_06.webp"), preload("res://assets/template/characters/hero_ink/hero_ink_07.webp"), preload("res://assets/template/characters/hero_ink/hero_ink_08.webp"), preload("res://assets/template/characters/hero_ink/hero_ink_09.webp"), preload("res://assets/template/characters/hero_ink/hero_ink_10.webp"), preload("res://assets/template/characters/hero_ink/hero_ink_11.webp")],
}
const STAGES := [
    {"name": "stage.paper", "from": 0, "to": 1249, "accent": Color("c1ff2b"), "gap": -8.0, "wmin": 142.0, "wmax": 188.0, "step": 205.0, "move": 0.08, "crumble": 0.05, "enemy": 0.04},
    {"name": "stage.pencil", "from": 1250, "to": 2499, "accent": Color("2f80ed"), "gap": 0.0, "wmin": 126.0, "wmax": 174.0, "step": 232.0, "move": 0.18, "crumble": 0.12, "enemy": 0.13},
    {"name": "stage.eraser", "from": 2500, "to": 3749, "accent": Color("ef4d43"), "gap": 9.0, "wmin": 112.0, "wmax": 158.0, "step": 260.0, "move": 0.25, "crumble": 0.20, "enemy": 0.22},
    {"name": "stage.cloud", "from": 3750, "to": 5000, "accent": Color("ffd338"), "gap": 15.0, "wmin": 98.0, "wmax": 146.0, "step": 286.0, "move": 0.32, "crumble": 0.27, "enemy": 0.31},
]
const INK := Color("1d211f")
const PAPER := Color("fff9df")
const BLUE := Color("2f80ed")
const RED := Color("ef4d43")
const LIME := Color("c1ff2b")
const YELLOW := Color("ffd338")
const GOAL_HEIGHT := 5000
const PLAYER_BOTTOM := 40.0
const PLAYER_HALF_WIDTH := 28.0
const PLAYER_DRAW_SIZE := Vector2(110, 128)
const MONSTER_BOTTOM := 26.0 # Polygon support (24) plus its 4px outline radius.
const MONSTER_HALF_WIDTH := 27.0

var _frame_ground_rects: Dictionary = {}

enum RunState { PLAYING, GAME_OVER }
enum PlatformType { NORMAL, MOVING, CRUMBLE, SPRING, GOAL }
enum PickupType { SHIELD, JETPACK }

var state := RunState.PLAYING
var player_pos := Vector2.ZERO
var player_velocity := Vector2.ZERO
var facing := 1.0
var start_world_y := 575.0
var camera_top := 0.0
var platforms: Array[Dictionary] = []
var stars: Array[Dictionary] = []
var monsters: Array[Dictionary] = []
var pickups: Array[Dictionary] = []
var particles: Array[Dictionary] = []
var trails: Array[Dictionary] = []
var selected_frames: Array = []
var trail_clock := 0.0
var total_time := 0.0
var bounce_timer := 0.62
var last_platform := 0
var score := 0
var height_m := 0
var stars_collected := 0
var monster_bonus := 0
var max_height := 0
var level_number := 1
var attempt_number := 1
var current_stage := 0
var stage_banner_time := 1.8
var shield_charges := 0
var jetpack_time := 0.0
var jetpack_just_ended := false
var shake_time := 0.0
var shake_strength := 0.0
var hit_flash := 0.0
var status_text := ""
var status_time := 0.0
var fail_reason := ""
var fail_reason_key := ""
var touch_dirs: Dictionary = {}
var hover_action := false
var action_rect := Rect2()
var rules_rect := Rect2()
var rules_open := false
var gameplay_rng := RandomNumberGenerator.new()
var fx_rng := RandomNumberGenerator.new()
var run_token := ""
var settled := false
var tutorial: CanvasLayer
var run_result: Dictionary = {}
var input_method := "keyboard"
const MAX_PARTICLES := 192
const MAX_TRAILS := 24

func _ready() -> void:
    gameplay_rng.seed = 841729
    fx_rng.seed = 1933441
    run_token = "%d-%d" % [Time.get_unix_time_from_system(), Time.get_ticks_usec()]
    selected_frames = SKIN_FRAMES.get(SaveStore.selected_skin, SKIN_FRAMES.lime)
    TuningStore.begin_run()
    _build_world()
    setup_session_ui()
    tutorial = load("res://scripts/tutorial_director.gd").new()
    add_child(tutorial)
    tutorial.begin_run(bool(get_tree().get_meta("replay_tutorial", false)))
    if get_tree().has_meta("replay_tutorial"): get_tree().remove_meta("replay_tutorial")
    tutorial.notify_event("move_available", input_method)
    AudioDirector.start_music()
    get_viewport().size_changed.connect(queue_redraw)
    I18n.locale_changed.connect(func(_locale: String):
        fail_reason = I18n.t(fail_reason_key)
        queue_redraw()
    )
    queue_redraw()

func _build_world() -> void:
    TuningStore.apply_boundary("NEXT_STAGE")
    TuningStore.apply_boundary("NEXT_SPAWN")
    gameplay_rng.seed = 841729 + (level_number - 1) * 7919
    var width := get_viewport_rect().size.x
    platforms.clear(); stars.clear(); monsters.clear(); pickups.clear()
    var x := width * 0.5 - 84.0
    var floor_y := maxf(630.0, get_viewport_rect().size.y - 150.0)
    start_world_y = floor_y - 55.0
    var y := floor_y
    platforms.append(_platform(x, y, 168.0, PlatformType.NORMAL, 0, 0))
    var index := 1
    while start_world_y - y < GOAL_HEIGHT - 120:
        var height := int(start_world_y - y)
        var stage_index := _stage_for_height(height)
        var stage: Dictionary = STAGES[stage_index]
        var gap := TuningStore.get_value("platform_gap") + float(stage.gap) + _level_gap_bonus() + gameplay_rng.randf_range(-14.0, 16.0)
        y -= gap
        var horizontal_step := float(stage.step) + _level_step_bonus()
        x = clampf(x + gameplay_rng.randf_range(-horizontal_step, horizontal_step), 64.0, width - 220.0)
        var kind := _choose_platform_kind(stage, index)
        var width_penalty := _level_width_penalty()
        var platform_width := gameplay_rng.randf_range(maxf(78.0, float(stage.wmin) - width_penalty), maxf(106.0, float(stage.wmax) - width_penalty))
        platforms.append(_platform(x, y, platform_width, kind, index, stage_index))
        var has_pickup := false
        if index in [8, 25]:
            pickups.append(_pickup(x + platform_width * 0.5, y - 62.0, PickupType.SHIELD))
            has_pickup = true
        elif index in [16, 32]:
            pickups.append(_pickup(x + platform_width * 0.5, y - 62.0, PickupType.JETPACK))
            has_pickup = true
        elif stage_index >= 2 and index % 13 == 4:
            pickups.append(_pickup(x + platform_width * 0.5, y - 62.0, PickupType.SHIELD if index % 2 == 0 else PickupType.JETPACK))
            has_pickup = true
        if not has_pickup and index > 5 and kind != PlatformType.CRUMBLE and gameplay_rng.randf() < minf(0.48, float(stage.enemy) + _level_enemy_bonus()):
            monsters.append(_monster(x + platform_width * 0.5, y - MONSTER_BOTTOM, minf(68.0, platform_width * 0.34), stage_index, index))
        if index % 3 == 2:
            stars.append({"pos": Vector2(x + platform_width * 0.5, y - 57.0), "taken": false, "phase": gameplay_rng.randf_range(0.0, TAU)})
        index += 1
    y = start_world_y - GOAL_HEIGHT
    x = width * 0.5 - 104.0
    platforms.append(_platform(x, y, 208.0, PlatformType.GOAL, index, 3))
    player_pos = Vector2(width * 0.5, floor_y - PLAYER_BOTTOM)
    player_velocity = Vector2.ZERO
    camera_top = 0.0

func _total_height() -> int:
    return (level_number - 1) * GOAL_HEIGHT + max_height

func _choose_platform_kind(stage: Dictionary, index: int) -> int:
    if index % 11 == 0:
        return PlatformType.SPRING
    if index % 5 == 0:
        return PlatformType.NORMAL
    var roll := gameplay_rng.randf()
    var crumble_chance := minf(0.38, float(stage.crumble) + _level_crumble_bonus())
    var moving_chance := minf(0.42, float(stage.move) + _level_move_bonus())
    if roll < crumble_chance:
        return PlatformType.CRUMBLE
    if roll < crumble_chance + moving_chance:
        return PlatformType.MOVING
    return PlatformType.NORMAL

func _level_gap_bonus() -> float:
    return minf(20.0, float(level_number - 1) * 4.0)

func _level_width_penalty() -> float:
    return minf(28.0, float(level_number - 1) * 5.0)

func _level_step_bonus() -> float:
    return minf(70.0, float(level_number - 1) * 10.0)

func _level_move_bonus() -> float:
    return minf(0.12, float(level_number - 1) * 0.02)

func _level_crumble_bonus() -> float:
    return minf(0.10, float(level_number - 1) * 0.018)

func _level_enemy_bonus() -> float:
    return minf(0.15, float(level_number - 1) * 0.025)

func _platform(x: float, y: float, width: float, kind: int, index: int, stage: int) -> Dictionary:
    return {"base_x": x, "y": y, "w": width, "kind": kind, "index": index, "stage": stage, "active": true, "crumble": -1.0, "phase": gameplay_rng.randf_range(0.0, TAU)}

func _monster(x: float, y: float, patrol: float, stage: int, platform_index: int = -1) -> Dictionary:
    return {"base_x": x, "y": y, "range": patrol, "platform_index": platform_index, "stage": stage, "speed": 1.25 + stage * 0.22 + minf(0.6, float(level_number - 1) * 0.1), "phase": gameplay_rng.randf_range(0.0, TAU), "alive": true, "squash": 0.0}

func _pickup(x: float, y: float, kind: int) -> Dictionary:
    return {"pos": Vector2(x, y), "kind": kind, "taken": false, "phase": gameplay_rng.randf_range(0.0, TAU)}

func _physics_process(delta: float) -> void:
    if not overlays.is_empty() or get_tree().paused: return
    var previous_time := total_time
    total_time += delta
    stage_banner_time = maxf(0.0, stage_banner_time - delta)
    status_time = maxf(0.0, status_time - delta)
    hit_flash = maxf(0.0, hit_flash - delta)
    if state != RunState.PLAYING:
        _update_effects(delta); queue_redraw(); return

    var input_dir := Input.get_axis("ui_left", "ui_right")
    if Input.is_key_pressed(KEY_A): input_dir -= 1.0
    if Input.is_key_pressed(KEY_D): input_dir += 1.0
    for value in touch_dirs.values(): input_dir += float(value)
    input_dir = clampf(input_dir, -1.0, 1.0)
    if absf(input_dir) > 0.01:
        facing = signf(input_dir)
        tutorial.notify_event("moved", input_method)
    for star in stars:
        if not star.taken and absf(Vector2(star.pos).y - player_pos.y) < 250:
            tutorial.notify_event("pickup_visible", input_method)
            break
    for monster in monsters:
        if monster.alive and absf(float(monster.y) - player_pos.y) < 240:
            tutorial.notify_event("hazard_visible", input_method)
            break
    if total_time > 8.0: tutorial.notify_event("pause_available", input_method)
    var target_vx := input_dir * TuningStore.get_value("move_speed") * (1.12 if jetpack_time > 0.0 else 1.0)
    player_velocity.x = move_toward(player_velocity.x, target_vx, TuningStore.get_value("move_accel") * delta)
    if absf(input_dir) < 0.01:
        player_velocity.x = lerpf(player_velocity.x, 0.0, clampf(TuningStore.get_value("air_drag") * delta, 0.0, 1.0))

    var previous_bottom := player_pos.y + PLAYER_BOTTOM
    if jetpack_time > 0.0:
        jetpack_time -= delta
        player_velocity.y = move_toward(player_velocity.y, -TuningStore.get_value("jump_speed") * 1.02, 1900.0 * delta)
        player_pos += player_velocity * delta
        _jetpack_particles()
        if jetpack_time <= 0.0:
            player_velocity.y = -300.0
            jetpack_just_ended = true
            _set_status(I18n.t("status.fuel_empty"))
    elif bounce_timer > 0.0:
        _carry_planted_player(previous_time)
        bounce_timer -= delta
        player_velocity.y = 0.0
        if bounce_timer <= 0.0:
            TuningStore.apply_boundary("NEXT_ACTION")
            player_velocity.y = -TuningStore.get_value("jump_speed")
            AudioDirector.play(&"jump")
    else:
        player_velocity.y += TuningStore.get_value("gravity") * delta
        player_pos += player_velocity * delta
        if player_velocity.y > 0.0: _check_platform_landing(previous_bottom)
    _wrap_player()
    _update_moving_and_crumble(delta)
    _collect_stars(); _collect_pickups(); _check_monsters(previous_bottom)
    if state != RunState.PLAYING:
        queue_redraw()
        return
    height_m = maxi(0, int(start_world_y - player_pos.y))
    max_height = maxi(max_height, height_m)
    var new_stage := _stage_for_height(max_height)
    if new_stage != current_stage:
        current_stage = new_stage; stage_banner_time = 2.0
        _set_status(I18n.t("status.stage", {"stage": current_stage + 1, "name": I18n.t(STAGES[current_stage].name)}))
        shake_time = 0.18; shake_strength = 5.0
    score = _total_height() + stars_collected * 250 + monster_bonus
    _update_camera(delta); _update_effects(delta)
    if player_pos.y - camera_top > get_viewport_rect().size.y + 170.0:
        _finish(false, "failure.fall")
    queue_redraw()

func _check_platform_landing(previous_bottom: float) -> void:
    var current_bottom := player_pos.y + PLAYER_BOTTOM
    for platform in platforms:
        if not bool(platform.active): continue
        var rect := _platform_rect(platform)
        if previous_bottom <= rect.position.y + 6.0 and current_bottom >= rect.position.y and player_pos.x + PLAYER_HALF_WIDTH > rect.position.x and player_pos.x - PLAYER_HALF_WIDTH < rect.end.x:
            player_pos.y = rect.position.y - PLAYER_BOTTOM
            player_velocity.y = 0.0; bounce_timer = 0.105; last_platform = int(platform.index)
            shake_time = 0.12; shake_strength = 4.5 if int(platform.kind) != PlatformType.SPRING else 8.0
            _land_particles(Vector2(player_pos.x, rect.position.y), int(platform.kind))
            if int(platform.kind) == PlatformType.SPRING:
                bounce_timer = 0.0; player_velocity.y = -TuningStore.get_value("spring_speed")
                _set_status(I18n.t("status.spring")); AudioDirector.play(&"spring")
            elif int(platform.kind) == PlatformType.CRUMBLE:
                platform.crumble = 0.48; AudioDirector.play(&"crumble")
            else:
                AudioDirector.play(&"land")
            if int(platform.kind) == PlatformType.GOAL: _advance_level()
            return

func _check_monsters(previous_bottom: float) -> void:
    var current_bottom := player_pos.y + PLAYER_BOTTOM
    for monster in monsters:
        if not bool(monster.alive): continue
        var pos := _monster_pos(monster)
        if player_pos.distance_to(pos) > 55.0: continue
        if jetpack_time > 0.0:
            _defeat_monster(monster, I18n.t("status.jet_hit"), 200); continue
        if player_velocity.y > 160.0 and previous_bottom <= pos.y - 5.0 and current_bottom >= pos.y - 12.0:
            player_pos.y = pos.y - PLAYER_BOTTOM - 13.0; player_velocity.y = -660.0; bounce_timer = 0.0
            _defeat_monster(monster, I18n.t("status.stomp"), 350); continue
        if shield_charges > 0:
            shield_charges -= 1; hit_flash = 0.24; player_velocity = Vector2(-facing * 300.0, -620.0); bounce_timer = 0.0
            _defeat_monster(monster, I18n.t("status.shield_break"), 120)
            _burst(player_pos, BLUE, 22, 240.0); AudioDirector.play(&"shield_break")
        else:
            _finish(false, "failure.monster")
        return

func _defeat_monster(monster: Dictionary, message: String, bonus: int) -> void:
    tutorial.notify_event("hazard_avoided", input_method)
    monster.alive = false; monster_bonus += bonus
    _burst(_monster_pos(monster), RED, 18, 210.0)
    shake_time = 0.16; shake_strength = 6.0; _set_status(message); AudioDirector.play(&"stomp")

func _update_moving_and_crumble(delta: float) -> void:
    for platform in platforms:
        if float(platform.crumble) >= 0.0:
            platform.crumble = float(platform.crumble) - delta
            if float(platform.crumble) <= 0.0:
                platform.active = false
                _burst(Vector2(float(platform.base_x) + float(platform.w) * 0.5, float(platform.y)), RED, 10, 150.0)

func _platform_rect(platform: Dictionary, sample_time: float = -1.0) -> Rect2:
    var x := float(platform.base_x)
    var clock := total_time if sample_time < 0.0 else sample_time
    if int(platform.kind) == PlatformType.MOVING:
        x += sin(clock * (1.45 + int(platform.stage) * 0.12) + float(platform.phase)) * (62.0 + int(platform.stage) * 9.0)
    return Rect2(x, float(platform.y), float(platform.w), 18.0)

func _carry_planted_player(previous_time: float) -> void:
    if last_platform < 0 or last_platform >= platforms.size():
        return
    var support: Dictionary = platforms[last_platform]
    if not bool(support.active):
        return
    var previous := _platform_rect(support, previous_time)
    # A debug restore or jetpack may have moved the hero away from this support.
    if not is_equal_approx(player_pos.y + PLAYER_BOTTOM, previous.position.y):
        return
    var current := _platform_rect(support)
    player_pos += current.position - previous.position
    player_pos.y = current.position.y - PLAYER_BOTTOM

func _monster_pos(monster: Dictionary) -> Vector2:
    var center := Vector2(float(monster.base_x), float(monster.y))
    var patrol_range := float(monster.range)
    var support_index := int(monster.get("platform_index", -1))
    if support_index >= 0 and support_index < platforms.size():
        var support := _platform_rect(platforms[support_index])
        center = Vector2(support.get_center().x, support.position.y - MONSTER_BOTTOM)
        patrol_range = minf(patrol_range, maxf(0.0, support.size.x * 0.5 - MONSTER_HALF_WIDTH))
    center.x += sin(total_time * float(monster.speed) * TuningStore.get_value("enemy_speed_multiplier") + float(monster.phase)) * patrol_range
    return center

func _collect_stars() -> void:
    for star in stars:
        if bool(star.taken): continue
        if player_pos.distance_to(Vector2(star.pos)) < 62.0:
            tutorial.notify_event("pickup_collected", input_method)
            star.taken = true; stars_collected += 1; shake_time = 0.07; shake_strength = 2.5
            _burst(Vector2(star.pos), YELLOW, 14, 190.0); AudioDirector.play(&"collect_star")

func _collect_pickups() -> void:
    for pickup in pickups:
        if bool(pickup.taken): continue
        if player_pos.distance_to(Vector2(pickup.pos)) < 62.0:
            TuningStore.apply_boundary("NEXT_ACTION")
            tutorial.notify_event("pickup_collected", input_method)
            pickup.taken = true
            if int(pickup.kind) == PickupType.SHIELD:
                shield_charges = mini(2, shield_charges + 1); _set_status(I18n.t("status.shield"))
                _burst(Vector2(pickup.pos), BLUE, 18, 180.0); AudioDirector.play(&"collect_shield")
            else:
                jetpack_time = TuningStore.get_value("jetpack_duration"); player_velocity.y = -TuningStore.get_value("jump_speed") * 0.92; bounce_timer = 0.0; _set_status(I18n.t("status.jetpack"))
                _burst(Vector2(pickup.pos), YELLOW, 20, 220.0); AudioDirector.play(&"collect_jetpack")

func _stage_for_height(height: int) -> int:
    if height >= 3750: return 3
    if height >= 2500: return 2
    if height >= 1250: return 1
    return 0

func _land_particles(pos: Vector2, kind: int) -> void:
    var color := LIME
    if kind == PlatformType.SPRING: color = BLUE
    elif kind == PlatformType.CRUMBLE: color = RED
    _burst(pos, color, 9, 155.0)

func _jetpack_particles() -> void:
    if motion_reduced() or TuningStore.get_value("effects_intensity") <= 0: return
    for i in range(mini(2, MAX_PARTICLES - particles.size())):
        particles.append({"pos": player_pos + Vector2(-facing * 12.0 + fx_rng.randf_range(-5.0, 5.0), 44.0), "vel": Vector2(fx_rng.randf_range(-70.0, 70.0), fx_rng.randf_range(170.0, 310.0)), "life": fx_rng.randf_range(0.25, 0.5), "size": fx_rng.randf_range(3.0, 7.0), "color": YELLOW if i == 0 else RED})

func _burst(pos: Vector2, color: Color, count: int, speed: float) -> void:
    count = mini(MAX_PARTICLES - particles.size(), int(count * TuningStore.get_value("effects_intensity") * (0.35 if motion_reduced() else 1.0)))
    for i in range(count):
        var angle := TAU * float(i) / maxf(1.0, float(count)) + fx_rng.randf_range(-0.2, 0.2)
        particles.append({"pos": pos, "vel": Vector2.from_angle(angle) * fx_rng.randf_range(speed * 0.35, speed), "life": fx_rng.randf_range(0.32, 0.72), "size": fx_rng.randf_range(2.0, 6.0), "color": color})

func _update_effects(delta: float) -> void:
    shake_time = maxf(0.0, shake_time - delta); shake_strength = lerpf(shake_strength, 0.0, 9.0 * delta)
    trail_clock -= delta
    if not motion_reduced() and trails.size() < MAX_TRAILS and state == RunState.PLAYING and (jetpack_time > 0.0 or (bounce_timer <= 0.0 and player_velocity.length() > 420.0)) and trail_clock <= 0.0:
        trail_clock = 0.04 if jetpack_time > 0.0 else 0.055
        trails.append({"pos": player_pos, "life": 0.24, "frame": _current_frame()})
    for trail in trails: trail.life = float(trail.life) - delta
    trails = trails.filter(func(item): return float(item.life) > 0.0)
    for particle in particles:
        particle.life = float(particle.life) - delta; particle.pos = Vector2(particle.pos) + Vector2(particle.vel) * delta; particle.vel = Vector2(particle.vel) + Vector2(0, 420.0) * delta
    particles = particles.filter(func(item): return float(item.life) > 0.0)

func _update_camera(delta: float) -> void:
    var target := minf(camera_top, player_pos.y - get_viewport_rect().size.y * 0.43)
    camera_top = lerpf(camera_top, target, clampf(TuningStore.get_value("camera_follow") * delta, 0.0, 1.0))

func _wrap_player() -> void:
    var width := get_viewport_rect().size.x
    if player_pos.x < -36.0:
        player_pos.x = width + 36.0; _burst(Vector2(width - 10.0, player_pos.y), BLUE, 8, 110.0)
    elif player_pos.x > width + 36.0:
        player_pos.x = -36.0; _burst(Vector2(10.0, player_pos.y), BLUE, 8, 110.0)

func _finish(won: bool, reason: String = "") -> void:
    if state != RunState.PLAYING: return
    if won:
        _advance_level()
        return
    _refresh_score()
    state = RunState.GAME_OVER; fail_reason_key = reason; fail_reason = I18n.t(reason)
    tutorial.end_run()
    run_result = {"token": run_token, "score": score, "stage": (level_number - 1) * 4 + current_stage + 1, "outcome": "defeat", "timestamp": int(Time.get_unix_time_from_system()), "duration": total_time, "config_marker": TuningStore.configuration_marker(), "ranked_eligible": not TuningStore.is_run_tainted()}
    if not settled:
        SaveStore.settle_run(score, _total_height(), stars_collected, "%s-END" % run_token)
        LeaderboardStore.add_result(run_result)
        settled = true
    TuningStore.end_run()
    session_ui.show_result_actions()
    shake_time = 0.28; shake_strength = 8.0
    AudioDirector.play(&"run_end")

func _advance_level() -> void:
    level_number += 1
    state = RunState.PLAYING
    height_m = 0
    max_height = 0
    current_stage = 0
    stage_banner_time = 2.8
    bounce_timer = 0.18
    particles.clear()
    trails.clear()
    touch_dirs.clear()
    _build_world()
    _burst(player_pos, YELLOW, 26, 230.0)
    shake_time = 0.32
    shake_strength = 7.0
    hit_flash = 0.28
    AudioDirector.play(&"stage_clear")
    _set_status(I18n.t("status.milestone", {"zone": level_number}))

func _activate_end_action() -> void:
    if state == RunState.GAME_OVER:
        _restart()

func _set_status(message: String) -> void:
    status_text = message; status_time = 2.1

func _refresh_score() -> void:
    height_m = maxi(0, int(start_world_y - player_pos.y))
    max_height = maxi(max_height, height_m)
    score = clampi(_total_height() + stars_collected * 250 + monster_bonus, 0, 2147483647)

func _input(event: InputEvent) -> void:
    # Release existing movement before GUI can consume the pointer event.
    if event is InputEventScreenTouch and not event.pressed: touch_dirs.erase(event.index)
    elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed: touch_dirs.erase(-1)

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventScreenTouch or event is InputEventScreenDrag: input_method = "touch"
    elif event is InputEventJoypadButton or event is InputEventJoypadMotion: input_method = "gamepad"
    elif event is InputEventKey: input_method = "keyboard"
    if not overlays.is_empty(): return
    if event.is_action_pressed("ui_cancel") or (event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_START):
        if state == RunState.PLAYING:
            session_ui.show_menu("pause")
        else: return_to_title()
        get_viewport().set_input_as_handled()
        return
    if event is InputEventKey and event.pressed and not event.echo:
        if event.keycode == KEY_H: session_ui.show_menu("help"); return
        if event.keycode in [KEY_SPACE, KEY_ENTER] and state != RunState.PLAYING: _activate_end_action(); return
    if event is InputEventJoypadButton and event.pressed and event.button_index == JOY_BUTTON_A and state != RunState.PLAYING:
        _activate_end_action(); return
    if event is InputEventScreenTouch:
        if event.pressed:
            if state != RunState.PLAYING and action_rect.has_point(event.position): _activate_end_action()
            elif state == RunState.PLAYING: touch_dirs[event.index] = -1.0 if event.position.x < get_viewport_rect().size.x * 0.5 else 1.0
        else: touch_dirs.erase(event.index)
    elif event is InputEventScreenDrag and touch_dirs.has(event.index):
        touch_dirs[event.index] = -1.0 if event.position.x < get_viewport_rect().size.x * 0.5 else 1.0
    elif event is InputEventMouseMotion:
        hover_action = action_rect.has_point(event.position)
    elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        if event.pressed:
            if state != RunState.PLAYING and action_rect.has_point(event.position): _activate_end_action()
            elif state == RunState.PLAYING: touch_dirs[-1] = -1.0 if event.position.x < get_viewport_rect().size.x * 0.5 else 1.0
        else: touch_dirs.erase(-1)

func _restart() -> void:
    overlays.clear()
    get_tree().paused = false
    AudioDirector.set_paused(false)
    AudioDirector.clear_run_audio()
    get_tree().reload_current_scene()

func _current_frame() -> int:
    if jetpack_time > 0.0: return 6 if int(total_time * 12.0) % 2 == 0 else 7
    if bounce_timer > 0.22: return int(total_time * 7.0) % 3
    if bounce_timer > 0.0: return 10 if bounce_timer > 0.065 else 3
    if player_velocity.y < -600.0: return 4
    if player_velocity.y < -330.0: return 5
    if player_velocity.y < -100.0: return 6
    if player_velocity.y < 100.0: return 7
    if player_velocity.y < 520.0: return 8
    return 9

func _screen(world: Vector2) -> Vector2:
    var shake := Vector2.ZERO
    if not motion_reduced() and shake_time > 0.0: shake = Vector2(fx_rng.randf_range(-shake_strength, shake_strength), fx_rng.randf_range(-shake_strength, shake_strength))
    return Vector2(world.x, world.y - camera_top) + shake

func _draw() -> void:
    var size := get_viewport_rect().size
    _draw_paper(size); _draw_world(); _draw_player()
    if TuningStore.get_value("filter_enabled") > 0.5:
        draw_rect(Rect2(Vector2.ZERO, size), Color(0.94, 0.77, 0.4, TuningStore.get_value("filter_intensity") * 0.3))
    _draw_hud(size)
    if not motion_reduced() and hit_flash > 0.0: draw_rect(Rect2(Vector2.ZERO, size), Color(BLUE, hit_flash * 0.35), true)
    if state != RunState.PLAYING: _draw_end_overlay(size)
    if rules_open: _draw_rules(size)

func _draw_paper(size: Vector2) -> void:
    draw_rect(Rect2(Vector2.ZERO, size), PAPER)
    var line_offset := fposmod(-camera_top * 0.12, 34.0)
    for y in range(-34, int(size.y) + 40, 34): draw_line(Vector2(0, y + line_offset), Vector2(size.x, y + line_offset), Color("cce6f7"), 1.8)
    draw_line(Vector2(clampf(size.x * 0.075, 46.0, 92.0), 0), Vector2(clampf(size.x * 0.075, 46.0, 92.0), size.y), Color(RED, 0.38), 3.0)
    for i in range(7):
        var x := fposmod(180.0 + i * 311.0 - camera_top * (0.05 + i * 0.004), size.x + 220.0) - 110.0
        var y := fposmod(130.0 + i * 149.0 - camera_top * 0.08, size.y + 260.0) - 120.0
        draw_arc(Vector2(x, y), 30 + (i % 3) * 9, 0, TAU, 32, Color(Color(STAGES[current_stage].accent), 0.13), 3.0)

func _draw_world() -> void:
    for platform in platforms:
        if not bool(platform.active): continue
        var rect := _platform_rect(platform); rect.position.y -= camera_top
        if rect.position.y > -70.0 and rect.position.y < get_viewport_rect().size.y + 70.0: _draw_platform(rect, int(platform.kind), float(platform.crumble))
    for star in stars:
        if bool(star.taken): continue
        var pos := _screen(Vector2(star.pos) + Vector2(0, sin(total_time * 3.0 + float(star.phase)) * 7.0))
        if pos.y > -30 and pos.y < get_viewport_rect().size.y + 30: _draw_star(pos, 14.0 + sin(total_time * 4.0) * 1.5, YELLOW)
    for pickup in pickups:
        if bool(pickup.taken): continue
        var pos := _screen(Vector2(pickup.pos) + Vector2(0, sin(total_time * 3.3 + float(pickup.phase)) * 6.0))
        if pos.y > -45 and pos.y < get_viewport_rect().size.y + 45: _draw_pickup(pos, int(pickup.kind))
    for monster in monsters:
        if not bool(monster.alive): continue
        var pos := _screen(_monster_pos(monster))
        if pos.y > -50 and pos.y < get_viewport_rect().size.y + 50: _draw_monster(pos, int(monster.stage), float(monster.phase))
    for trail in trails:
        var frame: Texture2D = selected_frames[int(trail.frame)]
        draw_texture_rect(frame, Rect2(_screen(Vector2(trail.pos)) + _player_frame_rect(frame).position, PLAYER_DRAW_SIZE), false, Color(0.35, 0.7, 1.0, clampf(float(trail.life) / 0.24, 0.0, 1.0) * 0.24))
    for particle in particles:
        var pos := _screen(Vector2(particle.pos)); var alpha := clampf(float(particle.life) / 0.68, 0.0, 1.0)
        draw_circle(pos, float(particle.size), Color(Color(particle.color), alpha)); draw_line(pos + Vector2(-4, 0), pos + Vector2(4, 0), Color(INK, alpha * 0.65), 1.3)

func _draw_platform(rect: Rect2, kind: int, crumble: float) -> void:
    var color := LIME
    if kind == PlatformType.MOVING: color = BLUE
    elif kind == PlatformType.CRUMBLE: color = RED
    elif kind == PlatformType.SPRING: color = YELLOW
    elif kind == PlatformType.GOAL: color = Color("8ee9ff")
    var body := rect # The drawn support surface shares the landing plane.
    draw_rect(body, color, true); draw_polyline(PackedVector2Array([body.position + Vector2(0,2), body.position + Vector2(body.size.x*.32,2), body.position + Vector2(body.size.x*.66,2), body.position + Vector2(body.size.x,2)]), INK, 4.0); draw_line(body.position + Vector2(0, body.size.y), body.end, INK, 4.0)
    for x in range(12, int(body.size.x) - 8, 22): draw_line(body.position + Vector2(x, 7), body.position + Vector2(x + 10, 12), Color(INK, 0.28), 2.0)
    if kind == PlatformType.MOVING:
        draw_line(body.position + Vector2(-22,-12), body.position + Vector2(-6,-12), BLUE, 4); draw_line(body.end + Vector2(6,-body.size.y-12), body.end + Vector2(22,-body.size.y-12), BLUE, 4)
    elif kind == PlatformType.CRUMBLE:
        draw_line(body.position + Vector2(body.size.x*.45,0), body.position + Vector2(body.size.x*.55,17), INK, 3)
    elif kind == PlatformType.SPRING:
        var c := body.position + Vector2(body.size.x*.5,-4); draw_polyline(PackedVector2Array([c+Vector2(-22,0),c+Vector2(-12,-14),c,c+Vector2(12,-14),c+Vector2(22,0)]), BLUE, 4)
    elif kind == PlatformType.GOAL:
        draw_line(body.position + Vector2(body.size.x*.5,0), body.position + Vector2(body.size.x*.5,-92), INK, 5); _draw_star(body.position + Vector2(body.size.x*.5,-116),24,YELLOW)

func _draw_monster(pos: Vector2, stage: int, phase: float) -> void:
    var squash := sin(total_time * 5.0 + phase) * 2.0
    var color: Color = [Color("ff785e"), Color("ff5c85"), Color("f04444"), Color("332f49")][stage]
    var points := PackedVector2Array([pos+Vector2(-25,14),pos+Vector2(-22,-12+squash),pos+Vector2(-10,-25),pos+Vector2(5,-23-squash),pos+Vector2(24,-10),pos+Vector2(25,16),pos+Vector2(12,24),pos+Vector2(-12,23)])
    draw_colored_polygon(points,color); points.append(points[0]); draw_polyline(points,INK,4)
    draw_circle(pos+Vector2(-8,-5),4,INK); draw_circle(pos+Vector2(9,-5),4,INK)
    draw_line(pos+Vector2(-12,11),pos+Vector2(0,6),INK,3); draw_line(pos+Vector2(0,6),pos+Vector2(12,11),INK,3)
    draw_line(pos+Vector2(-13,-22),pos+Vector2(-20,-34),INK,4); draw_line(pos+Vector2(12,-21),pos+Vector2(20,-33),INK,4)

func _draw_pickup(pos: Vector2, kind: int) -> void:
    if kind == PickupType.SHIELD:
        draw_circle(pos,25,Color(BLUE,0.16)); draw_arc(pos,25,0,TAU,32,BLUE,5); draw_arc(pos,17,-2.8,-0.3,18,Color("8ee9ff"),4); draw_line(pos+Vector2(-7,-5),pos+Vector2(0,8),INK,3); draw_line(pos+Vector2(0,8),pos+Vector2(13,-11),INK,3)
    else:
        draw_rect(Rect2(pos+Vector2(-16,-23),Vector2(32,38)),RED,true); draw_arc(pos+Vector2(0,-23),16,PI,TAU,18,INK,4); draw_line(pos+Vector2(-16,-22),pos+Vector2(-16,15),INK,4); draw_line(pos+Vector2(16,-22),pos+Vector2(16,15),INK,4); draw_line(pos+Vector2(-16,15),pos+Vector2(16,15),INK,4)
        draw_circle(pos+Vector2(0,-4),6,YELLOW); draw_polyline(PackedVector2Array([pos+Vector2(-10,16),pos+Vector2(-5,30),pos+Vector2(0,20),pos+Vector2(5,32),pos+Vector2(11,16)]),YELLOW,5)

func _player_frame_rect(frame: Texture2D) -> Rect2:
    var key := frame.get_instance_id()
    if _frame_ground_rects.has(key):
        return _frame_ground_rects[key]
    var image := frame.get_image()
    var bottom := frame.get_height()
    if image != null and not image.is_empty():
        # Ignore faint matte residue; cache once, never scan pixels while drawing.
        for y in range(image.get_height() - 1, -1, -1):
            var opaque := false
            for x in range(image.get_width()):
                if image.get_pixel(x, y).a >= 0.125:
                    opaque = true
                    break
            if opaque:
                bottom = y + 1
                break
    var rect := Rect2(Vector2(-PLAYER_DRAW_SIZE.x * 0.5,
        PLAYER_BOTTOM - float(bottom) * PLAYER_DRAW_SIZE.y / frame.get_height()), PLAYER_DRAW_SIZE)
    _frame_ground_rects[key] = rect
    return rect

func _draw_player() -> void:
    var pos := _screen(player_pos); var frame: Texture2D = selected_frames[_current_frame()]
    draw_set_transform(pos,0.0,Vector2(facing,1.0)); draw_texture_rect(frame,_player_frame_rect(frame),false); draw_set_transform(Vector2.ZERO,0.0,Vector2.ONE)
    if shield_charges > 0:
        draw_circle(pos,58,Color(BLUE,0.10)); draw_arc(pos,58,total_time*1.4,total_time*1.4+5.5,42,Color(BLUE,0.82),4); draw_circle(pos+Vector2.from_angle(total_time*1.4)*58,5,YELLOW)
    if jetpack_time > 0.0:
        draw_rect(Rect2(pos+Vector2(-facing*43,-23),Vector2(22,42)),RED,true); draw_arc(pos+Vector2(-facing*32,-23),11,PI,TAU,14,INK,3)

func _draw_hud(size: Vector2) -> void:
    var strip_h := 82.0 if size.x < 850 else 72.0
    var hud_alpha: float = TuningStore.get_value("hud_opacity")
    draw_rect(Rect2(0, 0, size.x, strip_h), Color(PAPER, 0.94 * hud_alpha))
    STYLE.scribble(self, Vector2(0, strip_h), Vector2(size.x, strip_h), Color(INK, 0.35 * hud_alpha), 3.0, 3)
    # Big hand-lettered numbers; captions stay in the body family.
    var score_text: String = I18n.t("hud.score_value", {"score": "%05d" % score})
    STYLE.text(self, STYLE.DISPLAY, Vector2(24, 44), score_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 44, INK)
    _draw_text(Vector2(26, 63), I18n.t("hud.score"), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color("68706b"))
    var stars_x := 40.0 + STYLE.width_of(STYLE.DISPLAY, score_text, 44)
    STYLE.text(self, STYLE.DISPLAY, Vector2(stars_x, 42), I18n.t("hud.stars_value", {"count": "%02d" % stars_collected}), HORIZONTAL_ALIGNMENT_LEFT, -1, 32, RED)
    STYLE.text(self, STYLE.DISPLAY, Vector2(size.x - 344, 46), I18n.t("hud.height_value", {"height": "%06d" % _total_height()}), HORIZONTAL_ALIGNMENT_RIGHT, 320, 40, INK)
    _draw_text(Vector2(size.x*.5-190,76 if size.x < 850 else 42),I18n.t("hud.stage", {"zone": level_number, "stage": current_stage + 1, "name": I18n.t(STAGES[current_stage].name)}),HORIZONTAL_ALIGNMENT_CENTER,380,16,Color(STAGES[current_stage].accent).darkened(0.42))
    var bar := Rect2(size.x-34,76,8,size.y-142); draw_rect(bar,Color(INK,0.12),true); var progress := clampf(float(max_height)/GOAL_HEIGHT,0,1); draw_rect(Rect2(bar.position+Vector2(0,bar.size.y*(1-progress)),Vector2(8,bar.size.y*progress)),Color(STAGES[current_stage].accent),true); draw_circle(bar.position+Vector2(4,bar.size.y*(1-progress)),8,LIME); draw_arc(bar.position+Vector2(4,bar.size.y*(1-progress)),8,0,TAU,18,INK,2)
    rules_rect = Rect2()
    if shield_charges>0: STYLE.text(self, STYLE.DISPLAY, Vector2(24,146),I18n.t("hud.shield"),HORIZONTAL_ALIGNMENT_LEFT,-1,STYLE.display_size(26),BLUE)
    if jetpack_time>0: STYLE.text(self, STYLE.DISPLAY, Vector2(24,174),I18n.t("hud.jetpack", {"seconds": "%0.1f" % jetpack_time}),HORIZONTAL_ALIGNMENT_LEFT,-1,STYLE.display_size(26),RED)
    if status_time>0:
        var w:=minf(420,size.x-60); var r:=Rect2((size.x-w)*.5,66,w,43); draw_style_box(_chip_style(YELLOW),r); _draw_text(r.position+Vector2(16,28),status_text,HORIZONTAL_ALIGNMENT_CENTER,r.size.x-32,16,INK)
    if stage_banner_time>0:
        var alpha:=clampf(stage_banner_time,0,1)
        var banner_width := minf(460, size.x - 48)
        draw_rect(Rect2((size.x-banner_width)*.5 - 8, size.y*.28 - 32, banner_width + 16, 43), Color(PAPER, .94 * alpha))
        STYLE.text(self, STYLE.DISPLAY, Vector2((size.x-banner_width)*.5,size.y*.28 + 2),I18n.t("hud.banner", {"zone": level_number, "stage": current_stage + 1, "name": I18n.t(STAGES[current_stage].name)}),HORIZONTAL_ALIGNMENT_CENTER,banner_width,STYLE.display_size(40),Color(Color(STAGES[current_stage].accent).darkened(.42),alpha))
    draw_circle(Vector2(66,size.y-126),40,Color(BLUE,0.16)); draw_circle(Vector2(size.x-66,size.y-126),40,Color(RED,0.16)); _draw_text(Vector2(50,size.y-115),I18n.t("input.left"),HORIZONTAL_ALIGNMENT_LEFT,-1,27,Color(INK,0.45)); _draw_text(Vector2(size.x-78,size.y-115),I18n.t("input.right"),HORIZONTAL_ALIGNMENT_LEFT,-1,27,Color(INK,0.45))

func _draw_end_overlay(size: Vector2) -> void:
    draw_rect(Rect2(Vector2.ZERO,size),Color(INK,0.22),true); var box_w:=minf(490,size.x-48); var box:=Rect2((size.x-box_w)*.5,size.y*.5-175,box_w,350); draw_style_box(_modal_style(),box)
    var inner := box.size.x - 72
    STYLE.text(self, STYLE.DISPLAY, box.position+Vector2(34,66), I18n.t("result.title"), HORIZONTAL_ALIGNMENT_LEFT, inner, STYLE.display_size(54), INK)
    STYLE.scribble(self, box.position+Vector2(36,80), box.position+Vector2(36+minf(inner, STYLE.width_of(STYLE.DISPLAY, I18n.t("result.title"), STYLE.display_size(54))), 78), YELLOW, 6.0, 5)
    _draw_text(box.position+Vector2(36,108),fail_reason,HORIZONTAL_ALIGNMENT_LEFT,inner,17,Color("565e59"))
    STYLE.text(self, STYLE.DISPLAY, box.position+Vector2(36,148), I18n.t("result.height", {"zone": level_number, "height": "%06d" % _total_height()}), HORIZONTAL_ALIGNMENT_LEFT, inner, STYLE.display_size(30), BLUE)
    STYLE.text(self, STYLE.DISPLAY, box.position+Vector2(36,182), I18n.t("result.score", {"score": "%05d" % score, "stars": "%02d" % stars_collected}), HORIZONTAL_ALIGNMENT_LEFT, inner, STYLE.display_size(30), RED)
    _draw_text(box.position+Vector2(36,210),I18n.t("result.balance", {"count": "%03d" % SaveStore.star_balance}),HORIZONTAL_ALIGNMENT_LEFT,inner,16,INK)
    action_rect=Rect2(box.position+Vector2(34,238),Vector2(box.size.x-68,66)); draw_style_box(_start_style(hover_action),action_rect); STYLE.text(self, STYLE.BOLD, action_rect.position+Vector2(0,42),I18n.t("result.retry"),HORIZONTAL_ALIGNMENT_CENTER,action_rect.size.x,21,INK); _draw_text(box.position+Vector2(36,328),I18n.t("result.menu"),HORIZONTAL_ALIGNMENT_CENTER,inner,13,Color("68706b"))

func _draw_rules(size: Vector2) -> void:
    draw_rect(Rect2(Vector2.ZERO,size),Color(INK,0.28),true); var box_w:=minf(610,size.x-48); var box:=Rect2((size.x-box_w)*.5,82,box_w,minf(500,size.y-120)); draw_style_box(_modal_style(),box); STYLE.text(self, STYLE.DISPLAY, box.position+Vector2(28,52),I18n.t("help.title"),HORIZONTAL_ALIGNMENT_LEFT,-1,STYLE.display_size(44),INK)
    var lines := [
        I18n.t("help.move"),
        I18n.t("help.monsters"),
        I18n.t("help.pickups"),
        I18n.t("help.platforms"),
        I18n.t("help.stars"),
        I18n.t("help.endless"),
    ]
    for i in range(lines.size()): draw_circle(box.position+Vector2(39,88+i*51),6,[LIME,RED,BLUE,YELLOW][i%4]); _draw_text(box.position+Vector2(56,95+i*51),lines[i],HORIZONTAL_ALIGNMENT_LEFT,box.size.x-86,16,INK)
    _draw_text(box.position+Vector2(28,box.size.y-24),I18n.t("help.close"),HORIZONTAL_ALIGNMENT_RIGHT,box.size.x-56,13,Color("68706b"))

func _draw_star(center: Vector2,radius: float,color: Color) -> void:
    var points := PackedVector2Array()
    for i in range(10):
        points.append(center + Vector2.from_angle(-PI * 0.5 + i * PI / 5.0) * (radius if i % 2 == 0 else radius * 0.44))
    draw_colored_polygon(points, color)
    points.append(points[0])
    draw_polyline(points, INK, 2.5)

func _chip_style(color: Color) -> StyleBoxFlat:
    var s:=StyleBoxFlat.new(); s.bg_color=color; s.border_color=INK; s.set_border_width_all(2); s.corner_radius_top_left=10; s.corner_radius_top_right=10; s.corner_radius_bottom_left=10; s.corner_radius_bottom_right=10; return s
func _start_style(active: bool) -> StyleBoxFlat:
    var s:=StyleBoxFlat.new(); s.bg_color=Color("d5ff55") if active else LIME; s.border_color=INK; s.set_border_width_all(4); s.corner_radius_top_left=15; s.corner_radius_top_right=15; s.corner_radius_bottom_left=15; s.corner_radius_bottom_right=15; s.shadow_color=Color(INK,.25); s.shadow_size=6; s.shadow_offset=Vector2(5,6); return s
func _modal_style() -> StyleBoxFlat:
    var s:=StyleBoxFlat.new(); s.bg_color=PAPER; s.border_color=INK; s.set_border_width_all(5); s.corner_radius_top_left=22; s.corner_radius_top_right=22; s.corner_radius_bottom_left=22; s.corner_radius_bottom_right=22; s.shadow_color=Color(INK,.32); s.shadow_size=14; s.shadow_offset=Vector2(9,11); return s

func _draw_text(position: Vector2, text: String, alignment: HorizontalAlignment, width: float, preferred_size: int, color: Color) -> void:
    var font_size := preferred_size
    if width > 0.0:
        while font_size > 10 and UI_FONT.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x > width:
            font_size -= 1
    draw_string(UI_FONT, position, text, alignment, width, font_size, color)
