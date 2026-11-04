extends CharacterBody2D

signal died
signal stomped

const HERO_TEXTURE = preload("res://assets/template/generated/hero_sprite_cutout.webp")
const RUN_FRAMES: Array[Texture2D] = [
	preload("res://assets/template/generated/run_frames/run_00.webp"),
	preload("res://assets/template/generated/run_frames/run_01.webp"),
	preload("res://assets/template/generated/run_frames/run_02.webp"),
	preload("res://assets/template/generated/run_frames/run_03.webp"),
	preload("res://assets/template/generated/run_frames/run_04.webp"),
	preload("res://assets/template/generated/run_frames/run_05.webp"),
	preload("res://assets/template/generated/run_frames/run_06.webp"),
	preload("res://assets/template/generated/run_frames/run_07.webp"),
	preload("res://assets/template/generated/run_frames/run_08.webp"),
	preload("res://assets/template/generated/run_frames/run_09.webp"),
	preload("res://assets/template/generated/run_frames/run_10.webp"),
	preload("res://assets/template/generated/run_frames/run_11.webp"),
	preload("res://assets/template/generated/run_frames/run_12.webp"),
	preload("res://assets/template/generated/run_frames/run_13.webp"),
	preload("res://assets/template/generated/run_frames/run_14.webp"),
	preload("res://assets/template/generated/run_frames/run_15.webp"),
	preload("res://assets/template/generated/run_frames/run_16.webp")
]

var alive := true
var facing := 1.0
var spawn_position := Vector2.ZERO
var coyote_time := 0.0
var jump_buffer := 0.0
var anim_time := 0.0
var touch_input: Node = null
var touch_jump_was_pressed := false

func _ready() -> void:
	collision_layer = 2
	collision_mask = 1 | 4
	spawn_position = global_position
	var shape := CollisionShape2D.new()
	var capsule := CapsuleShape2D.new()
	capsule.radius = 18
	capsule.height = 52
	shape.shape = capsule
	shape.position = Vector2(0, -2)
	add_child(shape)
	queue_redraw()

func _physics_process(delta: float) -> void:
	var gravity := TuningStore.get_value("gravity")
	if not alive:
		velocity.y += gravity * delta
		move_and_slide()
		queue_redraw()
		return

	anim_time += delta
	if is_on_floor():
		coyote_time = TuningStore.get_value("coyote_time")
	else:
		coyote_time = maxf(coyote_time - delta, 0.0)
		velocity.y += gravity * delta

	var touch_vector := Vector2.ZERO
	if touch_input != null:
		touch_vector = touch_input.vector
	var touch_jump_pressed := touch_vector.y < -0.35
	var jump_started := Input.is_action_just_pressed("jump") or (touch_jump_pressed and not touch_jump_was_pressed)
	var jump_released := Input.is_action_just_released("jump") or (not touch_jump_pressed and touch_jump_was_pressed)
	touch_jump_was_pressed = touch_jump_pressed

	if jump_started:
		jump_buffer = TuningStore.get_value("jump_buffer")
	else:
		jump_buffer = maxf(jump_buffer - delta, 0.0)

	var direction := Input.get_axis("move_left", "move_right")
	if absf(direction) <= 0.05:
		direction = touch_vector.x
	if absf(direction) > 0.05:
		velocity.x = move_toward(velocity.x, direction * TuningStore.get_value("move_speed"), TuningStore.get_value("acceleration") * delta)
		facing = signf(direction)
	else:
		velocity.x = move_toward(velocity.x, 0.0, TuningStore.get_value("friction") * delta)

	if jump_buffer > 0.0 and coyote_time > 0.0:
		velocity.y = -TuningStore.get_value("jump_power")
		jump_buffer = 0.0
		coyote_time = 0.0
	if jump_released and velocity.y < -230.0:
		velocity.y = -230.0

	move_and_slide()
	for index in get_slide_collision_count():
		var hit := get_slide_collision(index)
		var collider := hit.get_collider()
		if collider == null:
			continue
		if collider.is_in_group("enemy"):
			if hit.get_normal().y < -0.55 and velocity.y >= 0.0:
				if collider.has_method("stomp"):
					collider.stomp()
				velocity.y = -TuningStore.get_value("stomp_bounce")
				stomped.emit()
			else:
				die()
		elif collider.is_in_group("question_block") and hit.get_normal().y > 0.55:
			if collider.has_method("activate"):
				collider.activate()

	if global_position.y > 820.0:
		die()
	queue_redraw()

func die() -> void:
	if not alive:
		return
	alive = false
	collision_mask = 0
	velocity = Vector2(0, -430)
	died.emit()

func _draw() -> void:
	var run_bob := 0.0
	var is_running := is_on_floor() and absf(velocity.x) > 40.0
	if is_running:
		run_bob = sin(anim_time * 18.0) * 2.0
	var squash := Vector2.ONE
	if not alive:
		squash = Vector2(1.22, 0.78)
	var draw_scale := Vector2(0.48 * facing, 0.48) * squash
	draw_set_transform(Vector2(0, run_bob - 18), 0.0, draw_scale)
	var texture := HERO_TEXTURE
	if is_running and alive:
		texture = RUN_FRAMES[int(anim_time * 12.0) % RUN_FRAMES.size()]
	draw_texture(texture, Vector2(-96, -96))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
