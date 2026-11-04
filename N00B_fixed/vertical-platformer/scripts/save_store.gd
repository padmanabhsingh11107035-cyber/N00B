extends Node

signal profile_changed

const SAVE_PATH := "user://vertical_platformer_score.json"
const SAVE_VERSION := 2
var save_path := SAVE_PATH
const DEFAULT_SKIN := "lime"
const SKIN_COSTS := {
    "lime": 0,
    "sea": 6,
    "sunset": 14,
    "ink": 24,
}

var best_score: int = 0
var best_height: int = 0
var star_balance: int = 0
var total_stars_earned: int = 0
var unlocked_skins: Array[String] = [DEFAULT_SKIN]
var selected_skin: String = DEFAULT_SKIN
var last_settlement_token: String = ""

func _ready() -> void:
    load_data()

func load_data() -> void:
    if not FileAccess.file_exists(save_path):
        return
    var file := FileAccess.open(save_path, FileAccess.READ)
    if file == null:
        return
    var parsed: Variant = JSON.parse_string(file.get_as_text())
    if typeof(parsed) != TYPE_DICTIONARY:
        return
    var version := int(parsed.get("version", 1))
    best_score = int(parsed.get("best_score", 0))
    best_height = int(parsed.get("best_height", 0))
    if version >= 2:
        star_balance = maxi(0, int(parsed.get("star_balance", 0)))
        total_stars_earned = maxi(star_balance, int(parsed.get("total_stars_earned", star_balance)))
        unlocked_skins.clear()
        var saved_skins: Variant = parsed.get("unlocked_skins", [DEFAULT_SKIN])
        if typeof(saved_skins) == TYPE_ARRAY:
            for skin in saved_skins:
                var skin_id := String(skin)
                if SKIN_COSTS.has(skin_id) and not unlocked_skins.has(skin_id):
                    unlocked_skins.append(skin_id)
        if not unlocked_skins.has(DEFAULT_SKIN):
            unlocked_skins.push_front(DEFAULT_SKIN)
        selected_skin = String(parsed.get("selected_skin", DEFAULT_SKIN))
        if not unlocked_skins.has(selected_skin):
            selected_skin = DEFAULT_SKIN
    _save()

func settle_run(score: int, height: int, stars: int, token: String) -> Dictionary:
    var improved := score > best_score or height > best_height
    best_score = maxi(best_score, score)
    best_height = maxi(best_height, height)
    var awarded := 0
    if not token.is_empty() and token != last_settlement_token:
        awarded = maxi(0, stars)
        star_balance += awarded
        total_stars_earned += awarded
        last_settlement_token = token
    _save()
    profile_changed.emit()
    return {"improved": improved, "awarded": awarded, "balance": star_balance}

func submit(score: int, height: int) -> bool:
    return bool(settle_run(score, height, 0, "legacy-%d-%d" % [score, height]).improved)

func is_unlocked(skin_id: String) -> bool:
    return unlocked_skins.has(skin_id)

func skin_cost(skin_id: String) -> int:
    return int(SKIN_COSTS.get(skin_id, 9999))

func unlock_skin(skin_id: String) -> bool:
    if not SKIN_COSTS.has(skin_id) or is_unlocked(skin_id):
        return false
    var cost := skin_cost(skin_id)
    if star_balance < cost:
        return false
    star_balance -= cost
    unlocked_skins.append(skin_id)
    selected_skin = skin_id
    _save()
    profile_changed.emit()
    return true

func select_skin(skin_id: String) -> bool:
    if not is_unlocked(skin_id):
        return false
    selected_skin = skin_id
    _save()
    profile_changed.emit()
    return true

func _save() -> void:
    var file := FileAccess.open(save_path, FileAccess.WRITE)
    if file == null:
        return
    file.store_string(JSON.stringify({
        "version": SAVE_VERSION,
        "best_score": best_score,
        "best_height": best_height,
        "star_balance": star_balance,
        "total_stars_earned": total_stars_earned,
        "unlocked_skins": unlocked_skins,
        "selected_skin": selected_skin,
    }))
