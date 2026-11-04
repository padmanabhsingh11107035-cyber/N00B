extends Node

signal locale_changed(locale: String)

const DEFAULT_LOCALE := "en"
const PREFERENCE_PATH := "user://language.cfg"
const CATALOG_PATHS := {
	"en": "res://localization/en.json",
	"zh-CN": "res://localization/zh-CN.json",
}

var preference_path := PREFERENCE_PATH
var _catalogs: Dictionary = {}
var _locale := DEFAULT_LOCALE

func _ready() -> void:
	for locale: String in CATALOG_PATHS:
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(CATALOG_PATHS[locale]))
		assert(parsed is Dictionary, "I18n: invalid catalog " + locale)
		_catalogs[locale] = parsed
	_locale = _initial_locale()
	_update_window_title()

func _initial_locale() -> String:
	var config := ConfigFile.new()
	if config.load(preference_path) == OK:
		var saved: Variant = config.get_value("language", "locale", "")
		if saved is String and CATALOG_PATHS.has(saved):
			return saved
	if OS.has_feature("web"):
		var browser_saved: Variant = JavaScriptBridge.eval("(() => { try { return localStorage.getItem('vertical-platformer.locale') || ''; } catch { return ''; } })()", true)
		if browser_saved is String and CATALOG_PATHS.has(browser_saved):
			return browser_saved
	return locale_for_system(_system_locale())

## First-launch language follows the OS/browser language (on Web, OS.get_locale()
## reflects navigator.language). Overridable seam so tests never read the machine locale.
func _system_locale() -> String:
	return OS.get_locale()

## Any Chinese system locale (zh, zh_CN, zh-TW, zh_Hans…) maps to Simplified Chinese; all else to English.
static func locale_for_system(system_locale: String) -> String:
	return "zh-CN" if system_locale.strip_edges().to_lower().begins_with("zh") else DEFAULT_LOCALE

func t(key: String, placeholders: Dictionary = {}) -> String:
	var active: Dictionary = _catalogs.get(_locale, {})
	var fallback: Dictionary = _catalogs.get(DEFAULT_LOCALE, {})
	return str(active.get(key, fallback.get(key, key))).format(placeholders)

func get_locale() -> String:
	return _locale

func set_locale(locale: String, persist := true) -> bool:
	if not CATALOG_PATHS.has(locale):
		return false
	if persist:
		var config := ConfigFile.new()
		config.set_value("language", "locale", locale)
		if config.save(preference_path) != OK:
			push_warning("I18n: unable to save language preference; keeping the selection for this session")
		if OS.has_feature("web"):
			JavaScriptBridge.eval("try { localStorage.setItem('vertical-platformer.locale', %s); } catch {}" % JSON.stringify(locale), true)
	if _locale != locale:
		_locale = locale
		_update_window_title()
		locale_changed.emit(locale)
	return true

func toggle_locale() -> bool:
	return set_locale("zh-CN" if _locale == "en" else "en")

func catalog_keys(locale: String) -> Array:
	return (_catalogs.get(locale, {}) as Dictionary).keys()

func _update_window_title() -> void:
	if is_inside_tree():
		get_window().title = t("app.title")
