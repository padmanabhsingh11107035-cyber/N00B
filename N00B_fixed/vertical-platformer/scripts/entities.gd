extends Node

class Coin:
	extends Area2D
	signal collected
	var t := 0.0
	func _ready() -> void:
		collision_layer = 0
		collision_mask = 2
		var shape := CollisionShape2D.new()
		var circle := CircleShape2D.new()
		circle.radius = 14
		shape.shape = circle
		add_child(shape)
		body_entered.connect(_on_body)
		queue_redraw()
	func _process(delta: float) -> void:
		t += delta
		position.y += sin(t * 4.0) * 0.12
		queue_redraw()
	func _on_body(body: Node) -> void:
		if body is CharacterBody2D:
			collected.emit()
			queue_free()
	func _draw() -> void:
		var width := 6.0 + absf(sin(t * 5.0)) * 9.0
		draw_ellipse(Vector2.ZERO, width, 18.0, Color("#ffc928"))
		draw_arc(Vector2.ZERO, Vector2(width, 18).x, 0, TAU, 18, Color("#fff28a"), 3)
		draw_line(Vector2(0, -10), Vector2(0, 10), Color("#db8d16"), 3)

class Walker:
	extends CharacterBody2D
	var alive := true
	var t := 0.0
	var direction := -1.0
	var floor_probe: RayCast2D
	func _ready() -> void:
		add_to_group("enemy")
		collision_layer = 4
		collision_mask = 1 | 2
		var shape := CollisionShape2D.new()
		var rect := RectangleShape2D.new()
		rect.size = Vector2(42, 36)
		shape.shape = rect
		shape.position = Vector2(0, 1)
		add_child(shape)
		floor_probe = RayCast2D.new()
		floor_probe.collision_mask = 1
		floor_probe.enabled = true
		floor_probe.target_position = Vector2(direction * 32.0, 42.0)
		add_child(floor_probe)
		velocity.x = direction * TuningStore.get_value("enemy_speed")
		queue_redraw()
	func _physics_process(delta: float) -> void:
		if not alive:
			return
		t += delta
		velocity.x = direction * TuningStore.get_value("enemy_speed")
		if not is_on_floor():
			velocity.y += TuningStore.get_value("enemy_gravity") * delta
		else:
			floor_probe.target_position.x = direction * 32.0
			floor_probe.force_raycast_update()
			if not floor_probe.is_colliding():
				direction *= -1.0
				velocity.x = direction * TuningStore.get_value("enemy_speed")
		move_and_slide()
		if is_on_wall():
			direction *= -1.0
		for i in get_slide_collision_count():
			var hit := get_slide_collision(i)
			var collider := hit.get_collider()
			if collider == null or not collider.is_in_group("player"):
				continue
			var player_body := collider as CharacterBody2D
			var player_is_stomping := player_body != null and player_body.global_position.y < global_position.y - 8.0 and player_body.velocity.y >= 0.0
			if not player_is_stomping and collider.has_method("die"):
				collider.die()
		if global_position.y > 900.0:
			queue_free()
		queue_redraw()
	func stomp() -> void:
		if not alive:
			return
		alive = false
		collision_layer = 0
		collision_mask = 0
		var tween := create_tween()
		tween.tween_property(self, "scale", Vector2(1.25, 0.2), 0.12)
		tween.tween_interval(0.18)
		tween.tween_callback(queue_free)
	func _draw() -> void:
		var bob := sin(t * 12.0) * 1.5
		draw_circle(Vector2(0, bob - 6), 22, Color("#8b4b32"))
		draw_rect(Rect2(-22, bob - 5, 44, 19), Color("#a95b38"), true)
		draw_circle(Vector2(-10, bob + 13), 10, Color("#f1c49d"))
		draw_circle(Vector2(10, bob + 13), 10, Color("#f1c49d"))
		draw_circle(Vector2(-8, bob - 8), 4, Color.WHITE)
		draw_circle(Vector2(8, bob - 8), 4, Color.WHITE)
		draw_circle(Vector2(-7, bob - 7), 2, Color("#172c3c"))
		draw_circle(Vector2(7, bob - 7), 2, Color("#172c3c"))
		draw_line(Vector2(-15, bob - 17), Vector2(-3, bob - 13), Color("#41271f"), 3)
		draw_line(Vector2(15, bob - 17), Vector2(3, bob - 13), Color("#41271f"), 3)

class QuestionBlock:
	extends StaticBody2D
	signal activated(position: Vector2)
	var active := true
	func _ready() -> void:
		add_to_group("question_block")
		collision_layer = 1
		collision_mask = 2
		var shape := CollisionShape2D.new()
		var rect := RectangleShape2D.new()
		rect.size = Vector2(52, 52)
		shape.shape = rect
		add_child(shape)
		queue_redraw()
	func activate() -> void:
		if not active:
			return
		active = false
		activated.emit(global_position - Vector2(0, 54))
		var tween := create_tween()
		tween.tween_property(self, "position:y", position.y - 10.0, 0.08)
		tween.tween_property(self, "position:y", position.y, 0.1)
		queue_redraw()
	func _draw() -> void:
		var fill := Color("#efad2f") if active else Color("#9d7650")
		draw_rect(Rect2(-26, -26, 52, 52), fill, true)
		draw_rect(Rect2(-26, -26, 52, 52), Color("#6f442a"), false, 4)
		draw_circle(Vector2(-18, -18), 3, Color("#ffe27a"))
		draw_circle(Vector2(18, -18), 3, Color("#ffe27a"))
		draw_circle(Vector2(-18, 18), 3, Color("#ffe27a"))
		draw_circle(Vector2(18, 18), 3, Color("#ffe27a"))
		if active:
			draw_string(preload("res://assets/template/fonts/ui_regular.tres"), Vector2(-10, 12), "?", HORIZONTAL_ALIGNMENT_LEFT, -1, 34, Color("#fff6c9"))

class GoalFlag:
	extends Area2D
	signal reached
	func _ready() -> void:
		collision_layer = 0
		collision_mask = 2
		var shape := CollisionShape2D.new()
		var rect := RectangleShape2D.new()
		rect.size = Vector2(70, 300)
		shape.shape = rect
		shape.position = Vector2(0, -120)
		add_child(shape)
		body_entered.connect(_on_body)
		queue_redraw()
	func _on_body(body: Node) -> void:
		if body.is_in_group("player"):
			reached.emit()
	func _draw() -> void:
		draw_rect(Rect2(-5, -290, 10, 310), Color("#f4efe2"), true)
		draw_circle(Vector2(0, -294), 12, Color("#ffd84d"))
		var flag := PackedVector2Array([Vector2(5, -270), Vector2(80, -245), Vector2(5, -215)])
		draw_colored_polygon(flag, Color("#ef4d37"))
		draw_polyline(flag, Color("#8f2b28"), 4)
