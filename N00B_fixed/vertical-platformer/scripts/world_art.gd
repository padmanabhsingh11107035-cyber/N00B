extends Node2D

const SKY_TEXTURE = preload("res://assets/template/generated/sky_far.webp")
const HILLS_TEXTURE = preload("res://assets/template/generated/hills_mid.webp")
const FOLIAGE_TEXTURE = preload("res://assets/template/generated/foliage_near.webp")

var world_width := 7800.0
var parallax_layers: Array[Parallax2D] = []
var layer_sprites: Array[Sprite2D] = []
var layer_offsets: Array[float] = []

func _ready() -> void:
	z_index = -50
	create_parallax_layer(SKY_TEXTURE, 0.04, -30, 0.0, Color.WHITE)
	create_parallax_layer(HILLS_TEXTURE, 0.18, -20, 0.0, Color(1, 1, 1, 0.96))
	create_parallax_layer(FOLIAGE_TEXTURE, 0.42, -5, 32.0, Color(0.92, 1.0, 0.97, 0.93))
	get_viewport().size_changed.connect(layout_layers)
	layout_layers()

func create_parallax_layer(texture: Texture2D, speed: float, depth: int, vertical_offset: float, tint: Color) -> void:
	var parallax := Parallax2D.new()
	parallax.scroll_scale = Vector2(speed, 1.0)
	parallax.repeat_times = 3
	parallax.z_index = depth
	add_child(parallax)
	var sprite := Sprite2D.new()
	sprite.texture = texture
	sprite.centered = true
	sprite.modulate = tint
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	parallax.add_child(sprite)
	parallax_layers.append(parallax)
	layer_sprites.append(sprite)
	layer_offsets.append(vertical_offset)

func layout_layers() -> void:
	var viewport_size := get_viewport_rect().size
	for index in range(layer_sprites.size()):
		var sprite := layer_sprites[index]
		var texture_size := sprite.texture.get_size()
		var scale_factor := maxf(1.0, viewport_size.y / texture_size.y)
		var repeat_width := texture_size.x * scale_factor
		sprite.scale = Vector2.ONE * scale_factor
		sprite.position = Vector2(repeat_width * 0.5, viewport_size.y * 0.5 + layer_offsets[index] * scale_factor)
		parallax_layers[index].repeat_size = Vector2(repeat_width, 0)
