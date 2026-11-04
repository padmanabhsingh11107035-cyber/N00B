extends Node
## One semantic registry and a fixed voice pool for all game and UI sounds.
## Procedural cues are short cached PCM effects, never procedural music.

signal settings_changed

const SYNTH := preload("res://scripts/web/procedural_sfx.gd")
const BGM_PLAYER := preload("res://scripts/web/browser_bgm_player.gd")
const SETTINGS_PATH := "user://vertical_platformer_audio.json"
const CHANNELS := ["Master", "Music", "SFX", "UI"]
const DEFAULT_VOLUMES := {"Master": 0.8, "Music": 0.35, "SFX": 0.8, "UI": 0.65}
const SFX_VOICES := 8
const UI_VOICES := 3
# Parts are [start Hz, end Hz, seconds, gain, onset seconds]. Distinct envelopes
# make the paper-bounce, power-up, reward and UI vocabulary recognizable.
const CUES := {
	"ui_hover": {"bus": "UI", "cooldown": 0.08, "parts": [[680, 760, 0.035, 0.10, 0.0]]},
	"ui_focus": {"bus": "UI", "cooldown": 0.08, "parts": [[610, 740, 0.045, 0.11, 0.0]]},
	"ui_confirm": {"bus": "UI", "cooldown": 0.08, "parts": [[560, 840, 0.075, 0.16, 0.0], [1120, 1260, 0.055, 0.06, 0.035]]},
	"ui_back": {"bus": "UI", "cooldown": 0.08, "parts": [[680, 390, 0.09, 0.13, 0.0]]},
	"ui_invalid": {"bus": "UI", "cooldown": 0.15, "parts": [[190, 150, 0.13, 0.14, 0.0], [285, 225, 0.10, 0.05, 0.025]]},
	"ui_select": {"bus": "UI", "cooldown": 0.06, "parts": [[720, 960, 0.06, 0.13, 0.0]]},
	"ui_toggle": {"bus": "UI", "cooldown": 0.07, "parts": [[460, 690, 0.055, 0.15, 0.0]]},
	"ui_adjust": {"bus": "UI", "cooldown": 0.07, "parts": [[810, 830, 0.032, 0.10, 0.0]]},
	"ui_notify": {"bus": "UI", "cooldown": 0.20, "parts": [[780, 1040, 0.16, 0.12, 0.0], [1560, 1560, 0.09, 0.04, 0.045]]},
	"jump": {"bus": "SFX", "cooldown": 0.045, "parts": [[220, 530, 0.09, 0.15, 0.0], [440, 1060, 0.04, 0.04, 0.0]]},
	"land": {"bus": "SFX", "cooldown": 0.045, "parts": [[180, 75, 0.065, 0.19, 0.0], [640, 310, 0.025, 0.07, 0.0]]},
	"spring": {"bus": "SFX", "cooldown": 0.07, "parts": [[190, 1120, 0.17, 0.17, 0.0], [380, 1680, 0.10, 0.06, 0.025]]},
	"crumble": {"bus": "SFX", "cooldown": 0.08, "parts": [[730, 160, 0.055, 0.12, 0.0], [390, 90, 0.07, 0.10, 0.035], [890, 220, 0.045, 0.05, 0.075]]},
	"collect_star": {"bus": "SFX", "cooldown": 0.06, "parts": [[1040, 1440, 0.12, 0.17, 0.0], [2080, 2480, 0.075, 0.05, 0.015]]},
	"collect_shield": {"bus": "SFX", "cooldown": 0.12, "parts": [[440, 880, 0.22, 0.14, 0.0], [660, 1320, 0.20, 0.07, 0.025]]},
	"collect_jetpack": {"bus": "SFX", "cooldown": 0.12, "parts": [[90, 360, 0.24, 0.19, 0.0], [180, 720, 0.19, 0.07, 0.03]]},
	"jetpack_end": {"bus": "SFX", "cooldown": 0.15, "parts": [[280, 65, 0.18, 0.15, 0.0]]},
	"stomp": {"bus": "SFX", "cooldown": 0.07, "parts": [[190, 60, 0.10, 0.21, 0.0], [850, 350, 0.065, 0.08, 0.018]]},
	"shield_break": {"bus": "SFX", "cooldown": 0.10, "parts": [[1450, 280, 0.17, 0.14, 0.0], [2175, 420, 0.10, 0.07, 0.025]]},
	"monster_hit": {"bus": "SFX", "cooldown": 0.07, "parts": [[420, 100, 0.12, 0.18, 0.0], [1260, 300, 0.055, 0.06, 0.0]]},
	"wrap": {"bus": "SFX", "cooldown": 0.12, "parts": [[540, 1080, 0.075, 0.10, 0.0]]},
	"stage_clear": {"bus": "SFX", "cooldown": 0.25, "parts": [[660, 990, 0.24, 0.15, 0.0], [990, 1485, 0.20, 0.07, 0.035]]},
	"run_end": {"bus": "SFX", "cooldown": 0.30, "parts": [[350, 90, 0.36, 0.18, 0.0], [525, 135, 0.22, 0.07, 0.02]]},
}

var settings_path := SETTINGS_PATH
var volumes: Dictionary = DEFAULT_VOLUMES.duplicate()
var muted := false
var settings_saved := true
# One original game-specific composition; provenance retains the untouched source.
var music_stream: AudioStream = preload("res://assets/template/audio/vertical-platformer-paper-sky.ogg")
var _music: Node
var _music_fade: Tween
var _music_requested := false
var _unlocked := false
var _paused := false
var _streams: Dictionary = {}
var _last_played: Dictionary = {}
var _voices: Dictionary = {"SFX": [], "UI": []}
var _next_voice: Dictionary = {"SFX": 0, "UI": 0}

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_unlocked = not OS.has_feature("web")
	_ensure_buses()
	load_settings()
	_music = BGM_PLAYER.new()
	_music.name = "MusicVoice"
	_music.bus = &"Music"
	_music.force_loop = true
	add_child(_music)
	_music.stream = music_stream
	for channel: String in ["SFX", "UI"]:
		for index in range(SFX_VOICES if channel == "SFX" else UI_VOICES):
			var voice := AudioStreamPlayer.new()
			voice.name = "%sVoice%d" % [channel, index]
			voice.bus = StringName(channel)
			voice.max_polyphony = 1
			add_child(voice)
			_voices[channel].append(voice)
	for cue: String in CUES:
		_streams[cue] = _make_cue(CUES[cue].parts)
	var tuning := get_node_or_null("/root/TuningStore")
	if tuning != null:
		tuning.value_changed.connect(func(key: String, _value: float):
			if key in ["music_volume", "sfx_volume", "ui_volume"]: _apply_settings()
		)
	_apply_settings()
	get_tree().node_added.connect(_bind_control)
	bind_ui(get_tree().root)

func _ensure_buses() -> void:
	for channel: String in CHANNELS:
		if AudioServer.get_bus_index(channel) < 0:
			AudioServer.add_bus()
			var index := AudioServer.bus_count - 1
			AudioServer.set_bus_name(index, channel)
			AudioServer.set_bus_send(index, &"Master")

func _input(event: InputEvent) -> void:
	if (event is InputEventMouseButton or event is InputEventScreenTouch or event is InputEventKey or event is InputEventJoypadButton) and event.is_pressed():
		unlock()

func unlock() -> void:
	if _unlocked:
		return
	_unlocked = true
	if _music_requested:
		start_music()

func has_music() -> bool:
	return music_stream != null

func configure_music(stream: AudioStream) -> void:
	stop_music(0.0)
	music_stream = stream
	if is_instance_valid(_music):
		_music.stream = stream

func start_music() -> bool:
	_music_requested = has_music()
	if not _music_requested or not _unlocked or not is_instance_valid(_music):
		return false
	if _music_fade != null and _music_fade.is_valid():
		_music_fade.kill()
	_music.stream_paused = _paused
	if not _music.playing:
		_music.volume_linear = 0.0
		_music.play()
	_music_fade = create_tween()
	_music_fade.tween_property(_music, "volume_linear", 1.0, 0.35)
	return true

func stop_music(fade_seconds: float = 0.25) -> void:
	_music_requested = false
	if not is_instance_valid(_music):
		return
	if _music_fade != null and _music_fade.is_valid():
		_music_fade.kill()
	if fade_seconds <= 0.0 or not _music.playing:
		_music.stop()
		return
	_music_fade = create_tween()
	_music_fade.tween_property(_music, "volume_linear", 0.0, clampf(fade_seconds, 0.01, 2.0))
	_music_fade.tween_callback(_music.stop)

func set_paused(value: bool) -> void:
	if _paused == value:
		return
	_paused = value
	if is_instance_valid(_music):
		_music.stream_paused = value
	for voice: AudioStreamPlayer in _voices.SFX:
		voice.stream_paused = value

func play(cue: StringName) -> bool:
	var id := String(cue)
	if not CUES.has(id) or not _unlocked:
		return false
	var descriptor: Dictionary = CUES[id]
	var channel: String = descriptor.bus
	if _paused and channel == "SFX":
		return false
	var now := Time.get_ticks_usec() / 1000000.0
	if now - float(_last_played.get(id, -1000.0)) < float(descriptor.cooldown):
		return false
	_last_played[id] = now
	var pool: Array = _voices[channel]
	if pool.is_empty():
		return false
	var selected := int(_next_voice[channel])
	for offset in range(pool.size()):
		var candidate := (selected + offset) % pool.size()
		if not pool[candidate].playing:
			selected = candidate
			break
	var voice: AudioStreamPlayer = pool[selected]
	_next_voice[channel] = (selected + 1) % pool.size()
	voice.stop()
	voice.stream = _streams[id]
	voice.stream_paused = false
	voice.play()
	return true

func clear_run_audio() -> void:
	for voice: AudioStreamPlayer in _voices.SFX:
		voice.stop()
	for cue: String in CUES:
		if CUES[cue].bus == "SFX":
			_last_played.erase(cue)
	set_paused(false)

func get_volume(channel: String) -> float:
	return float(volumes.get(channel, 0.0))

func set_volume(channel: String, value: float) -> bool:
	if not CHANNELS.has(channel) or not is_finite(value) or value < 0.0 or value > 1.0:
		return false
	volumes[channel] = value
	_apply_settings()
	return save_settings()

func is_muted() -> bool:
	return muted

func set_muted(value: bool) -> bool:
	muted = value
	_apply_settings()
	return save_settings()

func _apply_settings() -> void:
	var tuning := get_node_or_null("/root/TuningStore")
	for channel: String in CHANNELS:
		var index := AudioServer.get_bus_index(channel)
		var preview_gain: float = tuning.get_value(channel.to_lower() + "_volume") if channel != "Master" and tuning != null else 1.0
		AudioServer.set_bus_volume_db(index, linear_to_db(maxf(get_volume(channel) * preview_gain, 0.0001)))
		AudioServer.set_bus_mute(index, (channel == "Master" and muted) or get_volume(channel) == 0.0)
	settings_changed.emit()

func load_settings() -> void:
	volumes = DEFAULT_VOLUMES.duplicate()
	muted = false
	if FileAccess.file_exists(settings_path):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(settings_path))
		if parsed is Dictionary and parsed.get("version") == 1:
			if parsed.get("muted") is bool:
				muted = parsed.muted
			var saved: Variant = parsed.get("volumes", {})
			if saved is Dictionary:
				for channel: String in CHANNELS:
					var value: Variant = saved.get(channel)
					if (value is float or value is int) and is_finite(float(value)) and float(value) >= 0.0 and float(value) <= 1.0:
						volumes[channel] = float(value)
	_apply_settings()

func save_settings() -> bool:
	var file := FileAccess.open(settings_path, FileAccess.WRITE)
	settings_saved = file != null
	if settings_saved:
		file.store_string(JSON.stringify({"version": 1, "muted": muted, "volumes": volumes}))
		file.flush()
		settings_saved = file.get_error() == OK
	return settings_saved

func bind_ui(node: Node) -> void:
	_bind_control(node)
	for child: Node in node.get_children():
		bind_ui(child)

func _bind_control(node: Node) -> void:
	if not node is Control or node.has_meta("audio_bound"):
		return
	if not (node is BaseButton or node is Range or node is TabContainer or node is LineEdit):
		return
	node.set_meta("audio_bound", true)
	node.mouse_entered.connect(_ui_cue.bind(node, &"ui_hover"))
	node.focus_entered.connect(_ui_cue.bind(node, &"ui_focus"))
	if node is OptionButton:
		node.item_selected.connect(func(_index: int): _ui_cue(node, &"ui_select"))
	elif node is BaseButton:
		node.pressed.connect(func(): _ui_cue(node, &"ui_toggle" if node.toggle_mode else &"ui_confirm"))
	elif node is Range:
		node.value_changed.connect(func(_value: float):
			if node.has_focus() or node.get_global_rect().has_point(node.get_global_mouse_position()):
				_ui_cue(node, &"ui_adjust"))
	elif node is TabContainer:
		node.tab_clicked.connect(func(_index: int): _ui_cue(node, &"ui_select"))
	elif node is LineEdit:
		node.text_submitted.connect(func(_text: String): _ui_cue(node, &"ui_confirm"))

func _ui_cue(control: Control, cue: StringName) -> void:
	if is_instance_valid(control) and control.is_visible_in_tree() and not (control is BaseButton and control.disabled):
		play(cue)

func _make_cue(parts: Array) -> AudioStreamWAV:
	var mixed := PackedFloat32Array()
	for part: Array in parts:
		var stream := SYNTH.tone(float(part[0]), float(part[2]), float(part[3]), float(part[1]))
		var offset := roundi(float(part[4]) * stream.mix_rate)
		var samples := stream.data.size() / 2
		if mixed.size() < offset + samples:
			mixed.resize(offset + samples)
		for index in range(samples):
			mixed[offset + index] += float(stream.data.decode_s16(index * 2)) / 32768.0
	var data := PackedByteArray()
	data.resize(mixed.size() * 2)
	for index in range(mixed.size()):
		data.encode_s16(index * 2, roundi(clampf(mixed[index], -0.9, 0.9) * 32767.0))
	var result := AudioStreamWAV.new()
	result.mix_rate = 22050
	result.format = AudioStreamWAV.FORMAT_16_BITS
	result.stereo = false
	result.data = data
	return result

func _exit_tree() -> void:
	stop_music(0.0)
	if is_instance_valid(_music):
		_music.stream = null
	for channel: String in _voices:
		for voice: AudioStreamPlayer in _voices[channel]:
			voice.stop()
			voice.stream = null
	_streams.clear()
