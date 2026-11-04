class_name DoodleKit
extends RefCounted
## Notebook-doodle presentation kit, drawn entirely in code: hand-drawn wobbly
## outlines with a "boiling line" re-jitter, paper cut-outs with drop shadow and
## washi tape, marker scribble highlights, a pencil selection cursor, sketchy
## stars and the ink-wash modal veil. Presentation only.

const INK := Color("1d211f")
const PAPER := Color("fff9df")
const BLUE := Color("2f80ed")
const RED := Color("ef4d43")
const LIME := Color("c1ff2b")
const YELLOW := Color("ffd338")
const TAPE := Color(1.0, 0.93, 0.55, 0.62)
const TAPE_BLUE := Color(0.62, 0.84, 1.0, 0.6)
const BOIL_FPS := 8.0

const VEIL_SHADER := """
shader_type canvas_item;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear;
uniform vec4 tint : source_color = vec4(1.0, 0.976, 0.874, 1.0);
uniform float strength = 0.42;
uniform float blur = 2.0;
void fragment() {
	vec2 px = SCREEN_PIXEL_SIZE * blur;
	vec3 c = texture(screen_tex, SCREEN_UV).rgb * 0.2;
	c += texture(screen_tex, SCREEN_UV + vec2(px.x, 0.0)).rgb * 0.1;
	c += texture(screen_tex, SCREEN_UV - vec2(px.x, 0.0)).rgb * 0.1;
	c += texture(screen_tex, SCREEN_UV + vec2(0.0, px.y)).rgb * 0.1;
	c += texture(screen_tex, SCREEN_UV - vec2(0.0, px.y)).rgb * 0.1;
	c += texture(screen_tex, SCREEN_UV + px * 1.6).rgb * 0.1;
	c += texture(screen_tex, SCREEN_UV - px * 1.6).rgb * 0.1;
	c += texture(screen_tex, SCREEN_UV + vec2(px.x, -px.y) * 1.6).rgb * 0.1;
	c += texture(screen_tex, SCREEN_UV + vec2(-px.x, px.y) * 1.6).rgb * 0.1;
	// Pencil-grey wash towards the edges, like a smudged page.
	float v = smoothstep(0.3, 0.85, distance(UV, vec2(0.5)));
	vec3 washed = mix(c, tint.rgb, strength);
	washed = mix(washed, vec3(0.11, 0.13, 0.12), v * 0.22 + 0.08);
	COLOR = vec4(washed, COLOR.a);
}
"""

static var _veil_shader: Shader
static var _icon_cache: Dictionary = {}

static func veil_material(strength: float = 0.42) -> ShaderMaterial:
	if _veil_shader == null:
		_veil_shader = Shader.new()
		_veil_shader.code = VEIL_SHADER
	var material := ShaderMaterial.new()
	material.shader = _veil_shader
	material.set_shader_parameter("strength", strength)
	return material

## Current boiling-line frame (0..2), frozen when motion is reduced.
static func boil(reduced: bool = false) -> int:
	if reduced: return 0
	return int(Time.get_ticks_msec() / (1000.0 / BOIL_FPS)) % 3

static func scene_reduced(node: Node) -> bool:
	if node == null or not node.is_inside_tree(): return false
	var scene := node.get_tree().current_scene
	if scene != null and scene.has_method("motion_reduced"): return bool(scene.call("motion_reduced"))
	return TuningStore.get_value("reduced_motion") > 0.5

static func _hash(n: int) -> float:
	var x := sin(float(n) * 12.9898 + 78.233) * 43758.5453
	return x - floorf(x)

## Stable pseudo-random offset per (seed, index) in [-1, 1]^2.
static func jitter(seed_value: int, index: int) -> Vector2:
	return Vector2(_hash(seed_value * 131 + index * 17) * 2.0 - 1.0, _hash(seed_value * 71 + index * 29 + 5) * 2.0 - 1.0)

## Hand-drawn closed outline around a rect: points every ~22px, nudged per seed.
static func hand_rect(rect: Rect2, seed_value: int, amp: float = 1.6, radius: float = 10.0) -> PackedVector2Array:
	var r := minf(radius, minf(rect.size.x, rect.size.y) * 0.45)
	var base := PackedVector2Array()
	var corners := [
		[rect.position + Vector2(rect.size.x - r, r), -PI * 0.5],
		[rect.end - Vector2(r, r), 0.0],
		[rect.position + Vector2(r, rect.size.y - r), PI * 0.5],
		[rect.position + Vector2(r, r), PI],
	]
	for corner_index in 4:
		var corner: Array = corners[corner_index]
		for i in 4:
			var angle: float = corner[1] + PI * 0.5 * float(i) / 3.0
			base.append(corner[0] + Vector2(cos(angle), sin(angle)) * r)
		var next: Array = corners[(corner_index + 1) % 4]
		var from: Vector2 = base[base.size() - 1]
		var next_angle: float = next[1]
		var to: Vector2 = next[0] + Vector2(cos(next_angle), sin(next_angle)) * r
		var steps := int(from.distance_to(to) / 22.0)
		for s in range(1, steps):
			base.append(from.lerp(to, float(s) / steps))
	var out := PackedVector2Array()
	for i in base.size():
		out.append(base[i] + jitter(seed_value, i) * amp)
	return out

static func _closed(points: PackedVector2Array) -> PackedVector2Array:
	var copy := points.duplicate()
	copy.append(points[0])
	return copy

## Paper cut-out: offset shadow, slightly irregular fill, sketchy double outline
## (the second pass boils), optional washi tape across the top corners.
static func draw_paper(ci: CanvasItem, rect: Rect2, fill: Color, seed_value: int, boil_frame: int = 0, ink: Color = INK, width: float = 3.0, tape: int = 0, radius: float = 10.0, shadow: float = 5.0) -> void:
	var body := hand_rect(rect, seed_value, 1.2, radius)
	if shadow > 0.0:
		var shade := PackedVector2Array()
		for p in body: shade.append(p + Vector2(shadow, shadow + 1.0))
		ci.draw_colored_polygon(shade, Color(INK, 0.16))
	ci.draw_colored_polygon(body, fill)
	if ink.a > 0.0:
		ci.draw_polyline(_closed(hand_rect(rect, seed_value + boil_frame * 97, 1.4, radius)), ink, width, true)
		var sketch := hand_rect(rect.grow(1.5), seed_value + 400 + boil_frame * 53, 2.2, radius)
		ci.draw_polyline(_closed(sketch), Color(ink, 0.3), maxf(1.0, width - 1.6), true)
	if tape > 0:
		draw_tape(ci, rect.position + Vector2(16, 2), Vector2(46, 17), -0.62 + jitter(seed_value, 3).x * 0.12, TAPE)
		if tape > 1:
			draw_tape(ci, Vector2(rect.end.x - 16, rect.position.y + 2), Vector2(46, 17), 0.62 + jitter(seed_value, 4).x * 0.12, TAPE)

## A strip of translucent washi tape with torn zig-zag ends.
static func draw_tape(ci: CanvasItem, center: Vector2, size: Vector2, angle: float, color: Color = TAPE) -> void:
	var hw := size.x * 0.5
	var hh := size.y * 0.5
	var local := PackedVector2Array()
	var teeth := 4
	for i in teeth + 1:
		local.append(Vector2(-hw + (3.0 if i % 2 == 0 else 0.0), -hh + size.y * float(i) / teeth))
	for i in teeth + 1:
		local.append(Vector2(hw - (3.0 if i % 2 == 0 else 0.0), hh - size.y * float(i) / teeth))
	var points := PackedVector2Array()
	var rot := Transform2D(angle, center)
	for p in local: points.append(rot * p)
	ci.draw_colored_polygon(points, color)
	ci.draw_line(rot * Vector2(-hw + 3, -hh + 3), rot * Vector2(hw - 3, -hh + 3), Color(1, 1, 1, 0.35), 2.0)

## Felt-tip highlighter scribble filling a rect (selection / hover highlight).
static func draw_scribble_fill(ci: CanvasItem, rect: Rect2, color: Color, seed_value: int, boil_frame: int = 0, stroke: float = 0.0) -> void:
	var width := stroke if stroke > 0.0 else clampf(rect.size.y * 0.42, 8.0, 22.0)
	var points := PackedVector2Array()
	var rows := maxi(2, int(rect.size.y / (width * 0.75)))
	for i in rows + 1:
		var t := float(i) / rows
		var y := rect.position.y + width * 0.4 + (rect.size.y - width * 0.8) * t
		var j := jitter(seed_value + boil_frame * 7, i) * 3.0
		points.append(Vector2((rect.position.x + 4.0) if i % 2 == 0 else (rect.end.x - 4.0), y) + j)
	ci.draw_polyline(points, color, width, true)

## Loose pencil loop around a target (focus ring): 1.1 turns, wobbly, boiling.
static func draw_scribble_ring(ci: CanvasItem, rect: Rect2, color: Color, seed_value: int, boil_frame: int = 0, width: float = 3.0) -> void:
	var c := rect.get_center()
	var radii := rect.size * 0.5 + Vector2(10, 8)
	var points := PackedVector2Array()
	var steps := 44
	var start := -2.4 + jitter(seed_value, 1).x * 0.3
	for i in steps + 1:
		var t := float(i) / steps
		var a := start + TAU * 1.08 * t
		var wobble := 1.0 + jitter(seed_value + boil_frame * 13, i).x * 0.025 + 0.03 * t
		# Squircle-ish loop so long buttons get a hugging ring, not a huge ellipse.
		var dir := Vector2(cos(a), sin(a))
		var shaped := Vector2(signf(dir.x) * pow(absf(dir.x), 0.55), signf(dir.y) * pow(absf(dir.y), 0.55))
		points.append(c + shaped * radii * wobble)
	ci.draw_polyline(points, color, width, true)

## Hand-drawn pencil pointing at `tip` from the left (the selection cursor).
static func draw_pencil(ci: CanvasItem, tip: Vector2, angle: float = -0.35, length: float = 58.0) -> void:
	var xf := Transform2D(angle, tip)
	var w := length * 0.2
	var cone := length * 0.24
	var body_end := length * 0.82
	var poly := func(points: Array) -> PackedVector2Array:
		var out := PackedVector2Array()
		for p: Vector2 in points: out.append(xf * p)
		return out
	# Shadow, body, eraser band, eraser, sharpened cone and graphite tip.
	ci.draw_colored_polygon(poly.call([Vector2(-cone + 3, 4), Vector2(-body_end + 3, -w * 0.5 + 4), Vector2(-length + 3, -w * 0.5 + 4), Vector2(-length + 3, w * 0.5 + 4), Vector2(-body_end + 3, w * 0.5 + 4)]), Color(INK, 0.16))
	ci.draw_colored_polygon(poly.call([Vector2(-cone, -w * 0.5), Vector2(-body_end, -w * 0.5), Vector2(-body_end, w * 0.5), Vector2(-cone, w * 0.5)]), YELLOW)
	ci.draw_line(xf * Vector2(-cone, 0), xf * Vector2(-body_end, 0), Color("e6b21f"), 2.0)
	ci.draw_colored_polygon(poly.call([Vector2(-body_end, -w * 0.5), Vector2(-body_end - 5, -w * 0.5), Vector2(-body_end - 5, w * 0.5), Vector2(-body_end, w * 0.5)]), Color("b9c2c7"))
	ci.draw_colored_polygon(poly.call([Vector2(-body_end - 5, -w * 0.5), Vector2(-length, -w * 0.45), Vector2(-length, w * 0.45), Vector2(-body_end - 5, w * 0.5)]), Color("f28ba0"))
	ci.draw_colored_polygon(poly.call([Vector2(0, 0), Vector2(-cone, -w * 0.5), Vector2(-cone, w * 0.5)]), Color("f3d2a2"))
	ci.draw_colored_polygon(poly.call([Vector2(0, 0), Vector2(-cone * 0.36, -w * 0.18), Vector2(-cone * 0.36, w * 0.18)]), INK)
	var outline: PackedVector2Array = poly.call([Vector2(0, 0), Vector2(-cone, -w * 0.5), Vector2(-length, -w * 0.45), Vector2(-length, w * 0.45), Vector2(-cone, w * 0.5), Vector2(0, 0)])
	ci.draw_polyline(outline, INK, 2.0, true)

## Sketchy star: filled, with a wobbly ink outline that boils.
static func draw_star(ci: CanvasItem, c: Vector2, r: float, fill: Color, seed_value: int = 1, boil_frame: int = 0, width: float = 2.5) -> void:
	var points := PackedVector2Array()
	for i in 10:
		var a := -PI * 0.5 + i * PI / 5.0
		points.append(c + Vector2(cos(a), sin(a)) * (r if i % 2 == 0 else r * 0.46))
	ci.draw_colored_polygon(points, fill)
	var line := PackedVector2Array()
	for i in 11:
		line.append(points[i % 10] + jitter(seed_value + boil_frame * 11, i) * maxf(0.8, r * 0.06))
	ci.draw_polyline(line, INK, width, true)

## Small hand-drawn key cap (prompt hint), e.g. [SPACE].
static func draw_keycap(ci: CanvasItem, font: Font, center: Vector2, label: String, font_size: int = 13, seed_value: int = 3, boil_frame: int = 0) -> void:
	var tw := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	var rect := Rect2(center - Vector2(tw * 0.5 + 9, 12), Vector2(tw + 18, 24))
	draw_paper(ci, rect, Color(1, 1, 1, 0.85), seed_value, boil_frame, INK, 2.0, 0, 6.0, 2.0)
	ci.draw_string(font, Vector2(rect.position.x + 9, rect.position.y + 17), label, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, INK)

## Wobbly underline that "draws on" from left to right (progress 0..1).
static func draw_underline(ci: CanvasItem, from: Vector2, to: Vector2, color: Color, stroke: float, progress: float, seed_value: int = 7) -> void:
	if progress <= 0.0: return
	var end := from.lerp(to, clampf(progress, 0.0, 1.0))
	for pass_index in 2:
		var points := PackedVector2Array()
		var steps := maxi(6, int(from.distance_to(end) / 18.0))
		for i in steps + 1:
			var t := float(i) / steps
			var wobble := sin(t * 9.0 * progress + seed_value + pass_index * 1.7) * 2.2 + sin(t * 23.0 + seed_value * 0.5) * 0.9
			points.append(from.lerp(end, t) + Vector2(0, wobble + pass_index * 2.5))
		ci.draw_polyline(points, Color(color, 1.0 if pass_index == 0 else 0.55), stroke - pass_index * 2.0, true)

# --- generated icons (no binary assets) --------------------------------------------

## Hand-drawn checkbox icons for CheckButtons.
static func checkbox_icon(on: bool) -> Texture2D:
	var key := "check_%s" % on
	if _icon_cache.has(key): return _icon_cache[key]
	var s := 30
	var image := Image.create(s, s, false, Image.FORMAT_RGBA8)
	image.fill(Color(0, 0, 0, 0))
	var box := [Vector2(5, 6), Vector2(24.5, 4.5), Vector2(25.5, 24.5), Vector2(4.5, 25.5)]
	var fill := LIME if on else Color.WHITE
	for y in s:
		for x in s:
			if x >= 6 and x <= 24 and y >= 6 and y <= 24: image.set_pixel(x, y, fill)
	for i in 4:
		_stamp_line(image, box[i], box[(i + 1) % 4], 2.2, INK)
	if on:
		_stamp_line(image, Vector2(9, 15), Vector2(14, 21), 2.6, BLUE)
		_stamp_line(image, Vector2(14, 21), Vector2(27, 3), 2.6, BLUE)
	var texture := ImageTexture.create_from_image(image)
	_icon_cache[key] = texture
	return texture

## Doodle star slider grabber.
static func star_icon(size: int, fill: Color = YELLOW) -> Texture2D:
	var key := "star_%d_%s" % [size, fill.to_html()]
	if _icon_cache.has(key): return _icon_cache[key]
	var image := Image.create(size, size, false, Image.FORMAT_RGBA8)
	image.fill(Color(0, 0, 0, 0))
	var c := Vector2(size, size) * 0.5
	var r := size * 0.47
	var points := PackedVector2Array()
	for i in 10:
		var a := -PI * 0.5 + i * PI / 5.0
		points.append(c + Vector2(cos(a), sin(a)) * (r if i % 2 == 0 else r * 0.48))
	for y in size:
		for x in size:
			if Geometry2D.is_point_in_polygon(Vector2(x + 0.5, y + 0.5), points): image.set_pixel(x, y, fill)
	for i in 10:
		_stamp_line(image, points[i], points[(i + 1) % 10], 1.6, INK)
	var texture := ImageTexture.create_from_image(image)
	_icon_cache[key] = texture
	return texture

static func _stamp_line(image: Image, a: Vector2, b: Vector2, radius: float, color: Color) -> void:
	var steps := int(a.distance_to(b) * 2.0) + 1
	for i in steps + 1:
		var p := a.lerp(b, float(i) / steps)
		for dy in range(-3, 4):
			for dx in range(-3, 4):
				var q := Vector2i(int(p.x) + dx, int(p.y) + dy)
				if q.x < 0 or q.y < 0 or q.x >= image.get_width() or q.y >= image.get_height(): continue
				var d := Vector2(q.x + 0.5, q.y + 0.5).distance_to(p)
				var alpha := clampf(radius - d + 0.5, 0.0, 1.0)
				if alpha <= 0.0: continue
				var under := image.get_pixelv(q)
				image.set_pixelv(q, under.blend(Color(color, alpha)))

# --- doodle button face ---------------------------------------------------------------

## Draws a Button as a paper cut-out / sticky note / list row behind its text.
## kinds: &"sticky" (lime primary), &"paper" (white cut-out), &"row" (menu list row,
## no box until hovered/focused), &"tab" (toggle segment).
class DoodleFace extends Control:
	var button: BaseButton
	var kind: StringName
	var fill: Color
	var seed_value := 1
	var tilt := 0.0
	var tape := 0
	var key_hint := ""
	var lift := 0.0:
		set(value):
			lift = value
			queue_redraw()
	var squash := 1.0:
		set(value):
			squash = value
			queue_redraw()
	var _boil := -1
	var _tween: Tween

	func _init(target: BaseButton, face_kind: StringName, face_fill: Color) -> void:
		button = target
		kind = face_kind
		fill = face_fill
		name = "DoodleFace"
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		show_behind_parent = true
		seed_value = int(target.get_instance_id() % 997)
		tilt = (DoodleKit._hash(seed_value) - 0.5) * 0.035
		if kind == &"sticky": tape = 1

	func _ready() -> void:
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		for signal_name in ["mouse_entered", "mouse_exited", "focus_entered", "focus_exited", "button_down", "button_up"]:
			button.connect(signal_name, _on_state.bind(signal_name))
		button.toggled.connect(func(_on: bool): queue_redraw())
		button.resized.connect(queue_redraw)

	func _process(_delta: float) -> void:
		var frame := DoodleKit.boil(DoodleKit.scene_reduced(self))
		if frame != _boil:
			_boil = frame
			queue_redraw()

	func _on_state(what: String) -> void:
		queue_redraw()
		if DoodleKit.scene_reduced(self) or not is_inside_tree(): return
		match what:
			"mouse_entered", "focus_entered":
				_start().tween_property(self, "lift", 1.0, 0.14).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
			"mouse_exited", "focus_exited":
				if not button.is_hovered() and not button.has_focus():
					_start().tween_property(self, "lift", 0.0, 0.16)
			"button_down":
				_start().tween_property(self, "squash", 0.94, 0.05)
			"button_up":
				_start().tween_property(self, "squash", 1.0, 0.3).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)

	func _start() -> Tween:
		if _tween != null: _tween.kill()
		_tween = create_tween().set_parallel(true).set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
		return _tween

	func _draw() -> void:
		if button == null: return
		var mode := button.get_draw_mode()
		var pressed := mode == BaseButton.DRAW_PRESSED or mode == BaseButton.DRAW_HOVER_PRESSED
		var hovered := mode == BaseButton.DRAW_HOVER or mode == BaseButton.DRAW_HOVER_PRESSED
		var disabled := mode == BaseButton.DRAW_DISABLED
		var focused := button.has_focus()
		var on := button.toggle_mode and button.button_pressed
		var frame := maxi(_boil, 0)
		var rect := Rect2(Vector2(3, 2), size - Vector2(8, 7))
		# Hover straightens the cut-out and lifts it; press squashes it flat.
		var angle := tilt * (1.0 - lift)
		var offset := Vector2(0, -2.0 * lift + (2.0 if pressed else 0.0))
		draw_set_transform(size * 0.5 + offset, angle, Vector2(squash, 2.0 - squash) if pressed else Vector2.ONE * squash)
		rect.position -= size * 0.5
		if kind == &"row":
			if hovered or focused or pressed:
				DoodleKit.draw_scribble_fill(self, Rect2(rect.position + Vector2(6, rect.size.y * 0.18), Vector2(rect.size.x - 12, rect.size.y * 0.64)), Color(DoodleKit.LIME, 0.75), seed_value, frame)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			if focused: DoodleKit.draw_pencil(self, Vector2(34, size.y * 0.5 + 3), -0.22, 32)
			return
		var tone := fill
		if kind == &"tab" and on: tone = DoodleKit.LIME
		elif pressed: tone = fill.darkened(0.08)
		elif hovered: tone = fill.lerp(Color.WHITE, 0.25) if fill != Color.WHITE else Color("f7ffe3")
		if disabled: tone = tone.lerp(Color("e7e3d2"), 0.6)
		var shadow := 2.0 if pressed or (kind == &"tab" and on) else 4.0 + lift * 2.0
		DoodleKit.draw_paper(self, rect, tone, seed_value, frame, DoodleKit.INK, 2.6 if kind == &"sticky" else 2.2, tape, 9.0, shadow)
		if kind == &"sticky":
			# Folded corner of the sticky note.
			var corner := rect.end
			draw_colored_polygon(PackedVector2Array([corner - Vector2(16, 0), corner - Vector2(0, 16), corner]), Color(DoodleKit.INK, 0.12))
		if not key_hint.is_empty() and size.x > 200.0:
			var font := button.get_theme_font("font")
			var tw := font.get_string_size(key_hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
			DoodleKit.draw_keycap(self, font, Vector2(rect.end.x - tw * 0.5 - 22, rect.get_center().y), key_hint, 12, seed_value + 5, frame)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		if focused:
			DoodleKit.draw_scribble_ring(self, Rect2(Vector2.ZERO, size).grow(-4), DoodleKit.BLUE, seed_value + 21, frame, 3.0)

## Give a Button a doodle face; empty state boxes keep its text metrics.
static func doodle_button(button: BaseButton, kind: StringName, fill: Color, h_margin: float = 18.0, v_margin: float = 8.0) -> DoodleFace:
	var old := button.get_node_or_null("DoodleFace")
	if old != null:
		button.remove_child(old)
		old.queue_free()
	var face := DoodleFace.new(button, kind, fill)
	for state: String in ["normal", "hover", "pressed", "hover_pressed", "disabled", "focus"]:
		var box := StyleBoxEmpty.new()
		var down := state == "pressed" or state == "hover_pressed"
		box.content_margin_left = h_margin + (22.0 if kind == &"row" else 0.0)
		box.content_margin_right = h_margin
		box.content_margin_top = v_margin + (2.0 if down else 0.0)
		box.content_margin_bottom = v_margin + 3.0 - (2.0 if down else 0.0)
		button.add_theme_stylebox_override(state, box)
	button.add_child(face)
	return face

## Sheet of notebook paper for modal panels: lined, red margin, punched holes,
## sketchy border and tape. Connect to a Panel/PanelContainer's draw signal.
static func draw_sheet(ci: CanvasItem, size: Vector2, seed_value: int, boil_frame: int, lined: bool = true) -> void:
	var rect := Rect2(Vector2(4, 4), size - Vector2(12, 12))
	draw_paper(ci, rect, PAPER, seed_value, boil_frame, INK, 3.0, 2, 14.0, 8.0)
	if lined:
		var y := rect.position.y + 34.0
		while y < rect.end.y - 10.0:
			ci.draw_line(Vector2(rect.position.x + 6, y), Vector2(rect.end.x - 6, y), Color("cce6f7"), 1.4)
			y += 30.0
		ci.draw_line(Vector2(rect.position.x + 20, rect.position.y + 6), Vector2(rect.position.x + 20, rect.end.y - 6), Color(RED, 0.35), 2.0)
