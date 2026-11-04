extends Node
## Floating virtual joystick for touch devices (and mouse drag), no textures.
## Pattern: press anywhere → that point becomes the joystick origin; dragging
## away from it produces a normalized direction in `vector`. Keyboard input
## should be combined by the consumer (see player.gd).

const MAX_RADIUS := 96.0
const DEAD_ZONE := 0.15

var vector: Vector2 = Vector2.ZERO

var _active: bool = false
var _pointer_index: int = -1
var _origin: Vector2 = Vector2.ZERO


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed and not _active:
			_begin(touch.index, touch.position)
		elif not touch.pressed and touch.index == _pointer_index:
			_end()
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if _active and drag.index == _pointer_index:
			_update(drag.position)
	elif event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed and not _active:
				_begin(-1, mb.position)
			elif not mb.pressed and _pointer_index == -1 and _active:
				_end()
	elif event is InputEventMouseMotion and _active and _pointer_index == -1:
		var mm := event as InputEventMouseMotion
		_update(mm.position)


func _begin(index: int, position: Vector2) -> void:
	_active = true
	_pointer_index = index
	_origin = position
	vector = Vector2.ZERO


func _update(position: Vector2) -> void:
	var offset := (position - _origin) / MAX_RADIUS
	if offset.length() < DEAD_ZONE:
		vector = Vector2.ZERO
	else:
		vector = offset.limit_length(1.0)


func _end() -> void:
	_active = false
	_pointer_index = -1
	vector = Vector2.ZERO
