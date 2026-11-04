extends Node
## Offline standings own only terminal snapshots; gameplay owns score and finish.

signal changed

const SAVE_VERSION := 1
const TOP_COUNT := 10
const MAX_NAME_LENGTH := 24
const MAX_NAME_BYTES := 96
const MAX_FILE_BYTES := 262144
const FONT: Font = preload("res://assets/template/fonts/ui_regular.tres")

var save_path := "user://local-leaderboard-v1.json"
var records: Array[Dictionary] = []
var display_name := ""
var save_ok := true
var _recent_tokens: Array[String] = []
var _session_tokens: Dictionary = {}

func _ready() -> void:
	load_data()

func validate_name(value: String) -> String:
	var candidate := value.strip_edges()
	if candidate.is_empty():
		return "leaderboard.name.empty"
	if candidate.length() > MAX_NAME_LENGTH or candidate.to_utf8_buffer().size() > MAX_NAME_BYTES:
		return "leaderboard.name.too_long"
	for character: String in candidate:
		var codepoint := character.unicode_at(0)
		if (codepoint < 32 or codepoint == 127 or codepoint in [0x200B, 0x200C, 0x200D, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069]) or not FONT.has_char(codepoint):
			return "leaderboard.name.unsupported"
	return ""

func set_display_name(value: String) -> bool:
	if not validate_name(value).is_empty():
		return false
	display_name = value.strip_edges()
	_save()
	changed.emit()
	return true

func add_result(result: Dictionary) -> bool:
	var row := _validated_record(result, true)
	if row.is_empty():
		return false
	var token: String = row.token
	if _session_tokens.has(token) or _recent_tokens.has(token):
		return false
	_session_tokens[token] = true
	_recent_tokens.append(token)
	if _recent_tokens.size() > 256:
		_recent_tokens.pop_front()
	records.append(row)
	_sort_and_bound()
	_save()
	changed.emit()
	return true

func load_data() -> void:
	records.clear()
	_recent_tokens.clear()
	_session_tokens.clear()
	display_name = ""
	if not FileAccess.file_exists(save_path):
		return
	var file := FileAccess.open(save_path, FileAccess.READ)
	if file == null or file.get_length() > MAX_FILE_BYTES:
		return
	var parser := JSON.new()
	if parser.parse(file.get_as_text()) != OK:
		return
	var parsed: Variant = parser.data
	if not parsed is Dictionary or parsed.get("version") != SAVE_VERSION:
		return
	var saved_name: Variant = parsed.get("display_name", "")
	if saved_name is String and validate_name(saved_name).is_empty():
		display_name = saved_name.strip_edges()
	var saved_rows: Variant = parsed.get("records", [])
	if saved_rows is Array:
		for value: Variant in saved_rows.slice(0, 100):
			if not value is Dictionary:
				continue
			var row := _validated_record(value)
			if not row.is_empty() and not _session_tokens.has(row.token):
				records.append(row)
				_session_tokens[row.token] = true
	var saved_tokens: Variant = parsed.get("recent_tokens", [])
	if saved_tokens is Array:
		for value: Variant in saved_tokens.slice(-256):
			if value is String and _valid_marker(value) and not _recent_tokens.has(value):
				_recent_tokens.append(value)
	for row: Dictionary in records:
		if not _recent_tokens.has(row.token):
			_recent_tokens.append(row.token)
	while _recent_tokens.size() > 256:
		_recent_tokens.pop_front()
	_sort_and_bound()

func _validated_record(value: Dictionary, new_result := false) -> Dictionary:
	var token: Variant = value.get("token", "")
	var outcome: Variant = value.get("outcome", "")
	var marker: Variant = value.get("config_marker", "baseline")
	if not token is String or not _valid_marker(token) or not marker is String or not _valid_marker(marker):
		return {}
	if not outcome is String or outcome not in ["victory", "defeat"]:
		return {}
	for field: String in ["score", "stage", "duration", "timestamp"]:
		var number: Variant = value.get(field, Time.get_unix_time_from_system() if field == "timestamp" and new_result else null)
		if not (number is int or number is float) or not is_finite(float(number)):
			return {}
	var name_value: Variant = display_name if new_result else value.get("name", "")
	# An empty stored name represents the localized default player, never English text.
	if not name_value is String or (not name_value.is_empty() and not validate_name(name_value).is_empty()):
		return {}
	return {
		"token": token,
		"name": name_value,
		"score": clampi(int(value.score), 0, 2147483647),
		"stage": clampi(int(value.stage), 1, 10000),
		"outcome": outcome,
		"timestamp": clampi(int(value.get("timestamp", Time.get_unix_time_from_system())), 0, 4102444800),
		"duration": clampf(float(value.duration), 0.0, 86400.0),
		"config_marker": marker,
		"ranked_eligible": value.get("ranked_eligible", true) == true,
	}

func _valid_marker(value: String) -> bool:
	return not value.is_empty() and value.length() <= 96 and not value.contains("\n") and not value.contains("\r")

func _sort_and_bound() -> void:
	records.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if a.score != b.score: return a.score > b.score
		if a.stage != b.stage: return a.stage > b.stage
		if a.duration != b.duration: return a.duration < b.duration
		if a.timestamp != b.timestamp: return a.timestamp < b.timestamp
		return String(a.token) < String(b.token)
	)
	if records.size() > TOP_COUNT:
		records.resize(TOP_COUNT)

func _save() -> void:
	var file := FileAccess.open(save_path, FileAccess.WRITE)
	save_ok = file != null
	if file == null:
		return
	file.store_string(JSON.stringify({"version": SAVE_VERSION, "display_name": display_name, "records": records, "recent_tokens": _recent_tokens}))
	save_ok = file.get_error() == OK
