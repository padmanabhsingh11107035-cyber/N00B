extends Node
## Bind imported UI font composites (NoobSans + Noto Sans SC) at runtime, after the editor's first import pass.
const GameFonts = preload("res://scripts/web/game_fonts.gd")
var _regular: Font
var _theme: Theme

func _enter_tree() -> void:
	_regular = load("res://assets/template/fonts/ui_regular.tres") as Font
	assert(_regular != null, "Bundled UI font failed to import")
	_theme = GameFonts.create_theme(_regular, load("res://assets/template/fonts/ui_medium.tres") as Font, load("res://assets/template/fonts/ui_bold.tres") as Font)
	_style_controls(_theme)
	get_tree().node_added.connect(_bind_node)
	_bind_tree(get_tree().root)

func _bind_tree(node: Node) -> void:
	_bind_node(node)
	for child in node.get_children():
		_bind_tree(child)

func _bind_node(node: Node) -> void:
	if node is Control:
		if node.theme != null:
			if node.theme.default_font == null:
				node.theme = node.theme.duplicate()
				node.theme.default_font = _regular
		elif node.get_parent_control() == null:
			node.theme = _theme
		if node.theme != null: _style_controls(node.theme)
	elif node is Label3D and node.font == null:
		GameFonts.apply_world_label(node, _regular)

func _style_controls(theme: Theme) -> void:
	for type: String in ["Button", "OptionButton", "CheckButton", "LineEdit", "PopupMenu"]:
		for color: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_selected_color"]:
			theme.set_color(color, type, Color("1d211f"))
		for state: String in ["normal", "hover", "pressed", "focus"]:
			var style := StyleBoxFlat.new()
			style.bg_color = Color("c1ff2b") if state == "pressed" else Color("f1ffd5") if state == "hover" else Color("ffffff")
			if state == "focus": style.bg_color = Color(0,0,0,0)
			style.border_color = Color("2f80ed") if state == "focus" else Color("1d211f")
			style.set_border_width_all(3 if state == "focus" else 2)
			style.set_corner_radius_all(8)
			style.content_margin_left = 12
			style.content_margin_right = 12
			style.content_margin_top = 7
			style.content_margin_bottom = 7
			theme.set_stylebox(state, type, style)
	theme.set_color("font_placeholder_color", "LineEdit", Color("68706b"))
	theme.set_color("font_color", "Label", Color("1d211f"))
