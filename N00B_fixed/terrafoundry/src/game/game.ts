// Recovered TerraForge orchestrator normalized for the TerraFoundry runtime.
// @ts-nocheck
import * as THREE from 'three';
import { WU } from './materials';
import { Assets, StageLoader } from '../engine/assets';
import { Audio } from '../engine/audio';
import { Input } from '../engine/input';
import { GameLoop } from '../engine/loop';
import { QUALITY_PRESETS, Renderer } from '../engine/renderer';
import { SaveStore } from '../engine/save';
import { TouchControls } from '../ui/touch';
import { UI } from '../ui/ui';
import { Building } from './building';
import { ChunkManager } from './chunks';
import { CONFIG, SEA_LEVEL } from './config';
import { CREATURE_NAMES, Creatures } from './creatures';
import { Fx } from './fx';
import { HOTBAR, Inventory } from './inventory';
import { ITEMS } from './items';
import { seedFromString } from './noise';
import { PIECES, boxesOverlap, doorLeafBox, doorSide, pieceBox, placementBox, snapPiece } from './pieces';
import { WorldPhysics } from './physics';
import { Player, heldModel } from './player';
import { RESTED, addXp, isComfortable, newSkills, parseSkills, skillBonus, waveFor, WAVE_BURST_GAP, WAVE_BURST_SIZE, xpToNext } from './progress';
import { stageForNight, stageTasks } from './stages';
import { POI_BLURB, POI_NAMES } from './poi';
import { BUILDER_KEYS, RES, buildResource, newBuilders, rollDrops } from './resources';
import { digPower, neededTool, overlapAllowed, piecePower, regrowDelay, resourcePower, sameEdge } from './rules';
import { MAP_TILE, MapScreen, tileKey } from '../ui/map';
import { PIN_COLORS, PIN_REACH, PinBeacons, Waypoints } from './waypoints';
import { DAY_SECONDS, Environment, clockText } from './sky';
import { DIFFICULTY, MAX_STAT, eat, freshStats, hurt, tickStats } from './survival';
import { Terrain } from './terrain';
import { tuning } from './tuning';
import { deleteWorld, loadWorld, storeWorld } from './worldsave';
export const TIPS = [
	{
		id: "move",
		text: "Move with WASD and look around with the mouse.",
		touch: "Drag the left stick to move and swipe the right side to look."
	},
	{
		id: "gather",
		text: "Hold left-click to gather — punch a tree for wood and pull fiber grass.",
		touch: "Hold MINE to gather — punch a tree for wood and pull fiber grass."
	},
	{
		id: "craft",
		text: "Press E to open your pack and craft a Stone Axe or Pickaxe.",
		touch: "Tap PACK to open your pack and craft a Stone Axe or Pickaxe."
	},
	{
		id: "bench",
		text: "Craft a Workbench, pick it on the hotbar and right-click to place it.",
		touch: "Craft a Workbench, pick it on the hotbar and tap USE to place it."
	},
	{
		id: "build",
		text: "Beside the workbench, craft Foundations and Walls and raise a shelter.",
		touch: "Beside the workbench, craft Foundations and Walls and raise a shelter."
	},
	{
		id: "fire",
		text: "Place a Campfire before dark — it wards off the Hollow and sets your respawn.",
		touch: "Place a Campfire before dark — it wards off the Hollow and sets your respawn."
	}
];
const CREATIVE_HOTBAR = [
	"stone_block",
	"foundation",
	"wood_floor",
	"wood_wall",
	"wood_ramp",
	"wood_pillar",
	"campfire",
	"crystal_pickaxe",
	"stone_shovel"
];
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const scrV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const WAVE_KIND = {
	wolf: "wolf",
	ghoul: "hollow",
	werewolf: "howler"
};
const ATTACK_CAUSE = {
	wolf: "Mauled by a Grey Wolf",
	hollow: "Taken by a Hollow",
	howler: "Torn apart by the Elder Howler",
	stag: "Gored by a Great Stag"
};
/** Stuck arrows last this long (s) and at most this many stay in the world. */
const ARROW_KEEP = 180;
const ARROW_MAX_STUCK = 30;
const ARROW_PICKUP = 3.2;
const ARROW_CHEST = new THREE.Vector3();
export class Game {
	store = new SaveStore();
	renderer;
	scene = new THREE.Scene();
	input;
	audio = new Audio();
	env;
	fx = new Fx();
	building = new Building();
	creatures = new Creatures();
	player;
	inventory = new Inventory();
	stats = freshStats();
	terrain;
	chunks;
	physics;
	ui;
	touch;
	loop;
	state = "title";
	config;
	seedText = "";
	time = .3;
	day = 1;
	worldSeconds = 0;
	selected = 0;
	rotOffset = 0;
	harvested = new Map();
	extracted = new Set();
	discovered = new Set();
	/** Explored 64 m map tiles. */
	explored = new Set();
	waypoints = new Waypoints();
	beacons;
	map;
	/** Chest currently shown in the inventory screen. */
	chestUid = null;
	sheltered = false;
	mapViewT = 0;
	tipsDone = new Set();
	arrowTipShown = false;
	worldSpawn = new THREE.Vector3();
	spawnPoint = null;
	target = null;
	placement = null;
	swingCd = 0;
	impactIn = -1;
	useCd = 0;
	digAcc = 0;
	timers = {
		regrow: 0,
		discover: 0,
		tips: 0,
		save: 30,
		hud: 0,
		embers: 0
	};
	lights = [];
	wardsCache = [];
	wardsDirty = true;
	expectUnlock = false;
	titleAngle = 0;
	moved = 0;
	lastPos = new THREE.Vector3();
	counters = {
		wood: 0,
		fiber: 0,
		tools: 0
	};
	invDirty = true;
	lastCause = "";
	lastStations = new Set();
	assets = new Assets();
	stages;
	skills = newSkills();
	rested = 0;
	warm = 0;
	wave = null;
	lastWave = 0;
	nightsSurvived = 0;
	isNight = false;
	arrows = [];
	drawT = 0;
	hitStop = 0;
	shake = 0;
	frameMs = 16;
	pops = [];
	pendingEnter = null;
	fireNear = 0;
	ctx;
	fovNow = 75;
	frameN = 0;
	constructor(canvas, root) {
		const s = this.store.data;
		this.renderer = new Renderer(canvas, s.quality);
		this.input = new Input(canvas);
		this.env = new Environment(this.scene);
		this.player = new Player(s.fov);
		this.scene.add(this.fx.group, this.building.group, this.creatures.group, this.player.camera);
		this.beacons = new PinBeacons((x, z) => this.terrain?.height(x, z) ?? 0);
		this.scene.add(this.beacons.group);
		this.fx.ground = (x, z) => this.terrain ? this.terrain.height(x, z) : -1e9;
		this.fx.onPropLanded = (at, size) => this.onTreeLanded(at, size);
		this.stages = new StageLoader(stageTasks({
			assets: this.assets,
			audio: this.audio,
			onArms: (g) => this.player.setArms(g)
		}));
		this.stages.busy = () => this.isBusy();
		this.stages.onProgress((id, pr) => this.onStageProgress(id, pr));
		this.fovNow = s.fov;
		for (let i = 0; i < 6; i++) {
			const l = new THREE.PointLight(16754784, 0, 14, 1.6);
			l.castShadow = false;
			this.lights.push(l);
			this.scene.add(l);
		}
		const save = loadWorld();
		this.config = save ? {
			seed: save.seed,
			mode: save.mode,
			difficulty: save.difficulty
		} : s.sandbox;
		this.ui = new UI(root, {
			continueWorld: () => this.continueWorld(),
			newWorld: (cfg) => this.newWorld(cfg),
			resume: () => this.resume(),
			save: () => this.saveWorld(true),
			quit: () => this.quitToTitle(),
			reset: () => this.newWorld(this.config),
			respawn: () => this.respawn(),
			settings: (patch) => this.applySettings(patch),
			craft: (r, n) => this.craft(r, n),
			closeInventory: () => this.closeInventory(),
			selectSlot: (i) => this.select(i),
			invChanged: () => this.invDirty = true,
			dismissTips: () => this.store.update({ tutorialDone: true }),
			uiSound: (name) => this.audio.play(name)
		});
		this.map = new MapScreen(root, () => this.terrain ?? null, () => this.closeMap(), {
			add: (x, z) => this.addPin(x, z),
			remove: (id) => this.removePin(id),
			clear: () => this.clearPins()
		});
		this.touch = matchMedia("(pointer: coarse)").matches ? new TouchControls(root, this.input, {
			inventory: () => this.openInventory(),
			pause: () => this.pause(),
			map: () => this.state === "map" ? this.closeMap() : this.openMap()
		}) : null;
		this.setupWorld(this.config.seed);
		this.applySettings({});
		this.showTitle();
		document.addEventListener("pointerlockchange", () => this.onLockChange());
		document.addEventListener("pointerlockerror", () => this.input.freeLook = true);
		canvas.addEventListener("click", () => {
			if (this.state === "play" && !this.input.locked) this.input.lockPointer();
		});
		window.addEventListener("pagehide", () => this.autosave());
		document.addEventListener("visibilitychange", () => {
			if (document.hidden) this.autosave();
		});
		this.loop = new GameLoop({
			step: (dt) => this.step(dt),
			render: (a, f) => this.render(a, f)
		}, 60);
	}
	start() {
		this.loop.start();
	}
	/** Loads only what the title needs, then starts the first playable segment behind it. */
	async loadTitle(onProgress) {
		const off = this.stages.onProgress((id, pr) => id === "title" && onProgress(pr));
		await this.stages.require("title");
		off();
		void this.stages.require("day").then(() => this.stages.prefetch("night1"));
	}
	onStageProgress(id, pr) {
		if (id === "day" && this.pendingEnter) this.ui.setStageStatus(`Preparing the wilds… ${Math.round(pr * 100)}%`);
	}
	/** Runs `fn` once the first playable segment is loaded (shows a recoverable loading state). */
	gate(fn) {
		if (this.stages.ready("day")) {
			fn();
			return;
		}
		this.pendingEnter = fn;
		this.ui.setStageStatus(`Preparing the wilds… ${Math.round(this.stages.progress("day") * 100)}%`);
		void this.stages.require("day").then(() => {
			const f = this.pendingEnter;
			this.pendingEnter = null;
			this.ui.setStageStatus(null);
			f?.();
		});
	}
	/** Background loading yields while the game is visually busy. */
	isBusy() {
		if (this.state !== "play") return false;
		return this.fx.active > 380 || this.creatures.hostiles >= 4 || this.frameMs > 26 || !!this.wave?.def.boss;
	}
	// ─── World lifecycle ──────────────────────────────────────────────────
	setupWorld(seed) {
		if (this.chunks) {
			this.chunks.clear();
			this.scene.remove(this.chunks.group);
		}
		this.seedText = seed;
		this.terrain = new Terrain(seedFromString(seed));
		this.chunks = new ChunkManager(this.terrain);
		this.chunks.radius = this.store.data.viewDistance;
		this.chunks.grassEnabled = this.store.data.quality !== "low";
		this.chunks.hidden = (r) => this.harvested.has(r.key) || this.extracted.has(r.key);
		this.physics = new WorldPhysics(this.terrain, this.chunks, this.building);
		this.scene.add(this.chunks.group);
		this.worldSpawn = this.terrain.findSpawn();
		this.chunks.ensureNear(this.worldSpawn.x, this.worldSpawn.z, 1);
	}
	resetState(cfg) {
		this.config = cfg;
		this.harvested.clear();
		this.extracted.clear();
		this.discovered.clear();
		this.explored.clear();
		this.map?.reset(this.explored);
		this.waypoints.clear();
		this.beacons?.clear();
		this.chestUid = null;
		this.tipsDone.clear();
		this.building.clear();
		this.creatures.clear();
		this.inventory = new Inventory();
		this.inventory.infinite = cfg.mode === "creative";
		this.stats = freshStats();
		this.time = .3;
		this.day = 1;
		this.worldSeconds = 0;
		this.spawnPoint = null;
		this.selected = 0;
		this.rotOffset = 0;
		this.counters = {
			wood: 0,
			fiber: 0,
			tools: 0
		};
		this.wardsDirty = true;
		this.player.flying = false;
		this.moved = 0;
		this.skills = newSkills();
		this.rested = 0;
		this.warm = 0;
		this.wave = null;
		this.lastWave = 0;
		this.nightsSurvived = 0;
		this.isNight = false;
		for (const a of this.arrows) this.scene.remove(a.obj);
		this.arrows.length = 0;
		this.fx.clear();
	}
	creativeKit() {
		CREATIVE_HOTBAR.forEach((id, i) => this.inventory.slots[i] = {
			id,
			n: ITEMS[id].stack,
			...ITEMS[id].tool ? { dur: ITEMS[id].tool.durability } : {}
		});
		let i = HOTBAR;
		for (const id of Object.keys(ITEMS)) {
			if (CREATIVE_HOTBAR.includes(id) || i >= this.inventory.slots.length) continue;
			this.inventory.slots[i++] = {
				id,
				n: ITEMS[id].stack,
				...ITEMS[id].tool ? { dur: ITEMS[id].tool.durability } : {}
			};
		}
	}
	newWorld(cfg) {
		this.input.lockPointer();
		this.gate(() => this.newWorldNow(cfg));
	}
	newWorldNow(cfg) {
		deleteWorld();
		this.store.update({ sandbox: cfg });
		this.setupWorld(cfg.seed);
		this.resetState(cfg);
		if (cfg.mode === "creative") this.creativeKit();
		const sp = this.worldSpawn;
		this.player.teleport(tmpV.set(sp.x, sp.y + .3, sp.z));
		this.player.yaw = Math.PI * .25;
		this.player.pitch = -.08;
		this.enterPlay();
		this.saveWorld(false);
	}
	continueWorld() {
		if (!loadWorld()) return;
		this.input.lockPointer();
		this.gate(() => this.continueNow());
	}
	continueNow() {
		const save = loadWorld();
		if (!save) return;
		this.setupWorld(save.seed);
		this.resetState({
			seed: save.seed,
			mode: save.mode,
			difficulty: save.difficulty
		});
		for (const [k, v] of save.edits) this.terrain.edits.set(k, v);
		for (const [k, v] of save.harvested) this.harvested.set(k, v);
		this.building.load(save.pieces);
		this.building.loadStores(save.chests);
		for (const k of save.explored ?? []) this.explored.add(k);
		this.waypoints.load(save.pins);
		this.beacons.sync(this.waypoints.pins);
		this.inventory.load(save.inventory);
		this.inventory.infinite = save.mode === "creative";
		this.stats = {
			health: save.player.health,
			hunger: save.player.hunger,
			stamina: save.player.stamina,
			staminaWait: 0
		};
		this.time = save.time;
		this.day = save.day;
		this.worldSeconds = save.worldSeconds;
		this.selected = save.hotbar;
		for (const d of save.discovered) this.discovered.add(d);
		for (const t of save.tips) this.tipsDone.add(t);
		this.spawnPoint = save.spawn ? new THREE.Vector3(save.spawn.x, save.spawn.y, save.spawn.z) : null;
		this.chunks.clear();
		this.player.teleport(tmpV.set(save.player.x, save.player.y, save.player.z));
		this.player.yaw = save.player.yaw;
		this.player.pitch = save.player.pitch;
		this.player.flying = save.player.flying && save.mode === "creative";
		this.skills = parseSkills(save.skills);
		this.rested = save.rested ?? 0;
		this.lastWave = save.lastWave ?? 0;
		this.nightsSurvived = save.nightsSurvived ?? 0;
		this.enterPlay();
	}
	enterPlay() {
		tuning.activate("run");
		const p = this.player.body.pos;
		this.chunks.ensureNear(p.x, p.z, 1);
		const g = this.physics.groundAt(p.x, p.z, p.y + 1.5, .3);
		if (p.y < g) p.y = g + .02;
		this.player.prev.copy(p);
		this.lastPos.copy(p);
		this.state = "play";
		this.audio.unlock();
		this.isNight = this.time > .77 || this.time < .22;
		this.audio.playMusic(this.isNight ? "night" : "day");
		this.audio.startAmbient();
		this.ui.setSkills(this.skills);
		// Make sure the segment for tonight is on its way.
		void this.stages.require(stageForNight(this.day)).catch(() => undefined);
		this.ui.hideTitle();
		this.ui.setHud(true);
		this.ui.hideDeath();
		this.ui.hidePause();
		this.invDirty = true;
		this.refreshTips();
		this.timers.save = 30;
	}
	showTitle() {
		this.state = "title";
		this.audio.playMusic("title");
		this.ui.setWave(null);
		this.ui.setBossBar(null, 0);
		this.ui.setBuffs([]);
		const save = loadWorld();
		this.ui.setHud(false);
		this.ui.showTitle({
			save: save ? {
				seed: save.seed,
				mode: save.mode,
				difficulty: save.difficulty,
				day: save.day,
				savedAt: save.savedAt
			} : null,
			config: this.store.data.sandbox,
			settings: this.store.data
		});
	}
	quitToTitle() {
		this.saveWorld(false);
		this.ui.hidePause();
		this.ui.closeInventory();
		this.map.hide();
		if (this.chestUid !== null) this.building.openLids.delete(this.chestUid);
		this.chestUid = null;
		this.creatures.clear();
		this.building.showGhost(null);
		this.showTitle();
	}
	buildSave() {
		const p = this.player.body.pos;
		return {
			version: 1,
			seed: this.seedText,
			mode: this.config.mode,
			difficulty: this.config.difficulty,
			time: this.time,
			day: this.day,
			player: {
				x: p.x,
				y: p.y,
				z: p.z,
				yaw: this.player.yaw,
				pitch: this.player.pitch,
				health: Math.max(1, this.stats.health),
				hunger: this.stats.hunger,
				stamina: this.stats.stamina,
				flying: this.player.flying
			},
			spawn: this.spawnPoint ? {
				x: this.spawnPoint.x,
				y: this.spawnPoint.y,
				z: this.spawnPoint.z
			} : null,
			hotbar: this.selected,
			inventory: this.inventory.serialize(),
			pieces: this.building.serialize(),
			edits: [...this.terrain.edits.entries()].map(([k, v]) => [k, Math.round(v * 1e3) / 1e3]),
			harvested: [...this.harvested.entries()].map(([k, v]) => [k, Math.round(v)]),
			discovered: [...this.discovered],
			worldSeconds: this.worldSeconds,
			tips: [...this.tipsDone],
			savedAt: Date.now(),
			skills: this.skills,
			rested: Math.round(this.rested),
			lastWave: this.lastWave,
			nightsSurvived: this.nightsSurvived,
			chests: this.building.serializeStores(),
			explored: [...this.explored],
			pins: this.waypoints.serialize()
		};
	}
	saveWorld(announce) {
		if (this.state === "title") return;
		const ok = storeWorld(this.buildSave());
		if (announce) this.ui.toast(null, ok ? "World saved" : "Could not save — storage is full");
	}
	autosave() {
		if (this.state !== "title" && this.state !== "dead") this.saveWorld(false);
	}
	// ─── Menus & state ────────────────────────────────────────────────────
	onLockChange() {
		if (this.input.locked) return;
		if (this.expectUnlock) {
			this.expectUnlock = false;
			return;
		}
		if (this.state === "play" && !this.touch && !this.input.freeLook) this.pause();
	}
	unlock() {
		if (this.input.locked) {
			this.expectUnlock = true;
			this.input.unlockPointer();
		}
	}
	pause() {
		if (this.state !== "play") return;
		this.state = "pause";
		this.unlock();
		this.input.releaseAll();
		this.building.showGhost(null);
		this.ui.showPause();
		this.saveWorld(false);
	}
	resume() {
		if (this.state !== "pause") return;
		this.input.releaseAll();
		this.input.lockPointer();
		this.state = "play";
		this.ui.hidePause();
		this.loop.resetAccumulator();
	}
	openInventory(station) {
		if (this.state !== "play") return;
		this.state = "inventory";
		this.unlock();
		this.input.releaseAll();
		this.building.showGhost(null);
		this.lastStations = this.stations();
		this.ui.openInventory(this.inventory, this.lastStations, station);
		this.audio.play("open");
	}
	closeInventory() {
		if (this.state !== "inventory") return;
		this.inventory.stowCursor();
		this.ui.closeInventory();
		// The same key event that closed the screen must not reopen it next frame.
		this.input.releaseAll();
		this.input.lockPointer();
		this.state = "play";
		this.invDirty = true;
		if (this.chestUid !== null) {
			this.building.openLids.delete(this.chestUid);
			const c = this.building.pieces.get(this.chestUid);
			this.chestUid = null;
			this.audio.play("chestClose", c ? this.falloff(tmpV.set(c.x, c.y, c.z), 10) : 1);
			if (c) this.fx.burst("dirt", tmpV.set(c.x, c.y + .6, c.z).clone(), UP, .25);
		} else this.audio.play("close");
		this.loop.resetAccumulator();
	}
	// ─── World map ────────────────────────────────────────────────────────
	openMap() {
		if (this.state !== "play") return;
		this.state = "map";
		this.unlock();
		this.input.releaseAll();
		this.building.showGhost(null);
		this.markExplored();
		this.map.show(this.mapView());
		this.audio.play("map");
	}
	closeMap() {
		if (this.state !== "map") return;
		this.map.hide();
		this.input.releaseAll();
		this.input.lockPointer();
		this.state = "play";
		this.audio.play("close");
		this.loop.resetAccumulator();
	}
	/** Reveal map tiles within sight of the player. */
	markExplored() {
		const p = this.player.body.pos;
		const r = CONFIG.map.revealRadius;
		const tx0 = Math.floor((p.x - r) / MAP_TILE);
		const tx1 = Math.floor((p.x + r) / MAP_TILE);
		const tz0 = Math.floor((p.z - r) / MAP_TILE);
		const tz1 = Math.floor((p.z + r) / MAP_TILE);
		for (let tx = tx0; tx <= tx1; tx++) {
			for (let tz = tz0; tz <= tz1; tz++) {
				const cx = Math.max(tx * MAP_TILE, Math.min(p.x, (tx + 1) * MAP_TILE));
				const cz = Math.max(tz * MAP_TILE, Math.min(p.z, (tz + 1) * MAP_TILE));
				if (Math.hypot(cx - p.x, cz - p.z) <= r) this.explored.add(tileKey(tx, tz));
			}
		}
	}
	// ─── Waypoints ──────────────────────────────────────────────────────────
	addPin(x, z) {
		const pin = this.waypoints.add(x, z);
		this.beacons.sync(this.waypoints.pins);
		this.audio.play("place", .7);
		this.ui.toast(null, `Waypoint ${this.waypoints.label(pin)} set · ${Math.round(Math.hypot(x - this.player.body.pos.x, z - this.player.body.pos.z))} m`);
		this.map.setView(this.mapView());
	}
	removePin(id) {
		if (!this.waypoints.remove(id)) return;
		this.beacons.sync(this.waypoints.pins);
		this.audio.play("click");
		this.map.setView(this.mapView());
	}
	clearPins() {
		if (!this.waypoints.pins.length) return;
		this.waypoints.clear();
		this.beacons.sync([]);
		this.audio.play("click");
		this.map.setView(this.mapView());
	}
	/** Walking up to a waypoint pops it with a chime and a burst of its colour. */
	checkPins() {
		const p = this.player.body.pos;
		const pin = this.waypoints.near(p.x, p.z, PIN_REACH);
		if (!pin) return;
		this.waypoints.remove(pin.id);
		this.beacons.sync(this.waypoints.pins);
		const at = new THREE.Vector3(pin.x, this.terrain.height(pin.x, pin.z) + .3, pin.z);
		this.fx.ring(at, new THREE.Color(PIN_COLORS[pin.c]).getHex(), 2.2);
		this.fx.burst("place", at, UP, 1.4);
		this.fx.levelUp(at);
		this.audio.play("craft");
		this.ui.toast(null, "Waypoint reached");
	}
	mapView() {
		const p = this.player.body.pos;
		const pieces = [];
		for (const b of this.building.pieces.values()) {
			const d = PIECES[b.id];
			const [w, dd] = b.rot % 2 ? [d.size[2], d.size[0]] : [d.size[0], d.size[2]];
			pieces.push({
				x: b.x,
				z: b.z,
				w,
				d: dd,
				kind: d.light ? "light" : d.storage ? "chest" : d.station ? "station" : "build"
			});
		}
		const hours = (this.time * 24 + 24) % 24;
		const hh = Math.floor(hours);
		const mm = Math.floor((hours - hh) * 60);
		return {
			player: {
				x: p.x,
				z: p.z,
				yaw: this.player.yaw
			},
			camp: this.spawnPoint ? {
				x: this.spawnPoint.x,
				z: this.spawnPoint.z
			} : null,
			pois: this.terrain.pois.near(p.x, p.z, CONFIG.map.poiRadius).map((o) => ({
				id: o.id,
				x: o.x,
				z: o.z,
				type: o.type,
				known: this.discovered.has(o.id)
			})),
			pieces,
			pins: this.waypoints.pins.map((pin, i) => ({
				id: pin.id,
				x: pin.x,
				z: pin.z,
				color: PIN_COLORS[pin.c],
				n: i + 1
			})),
			day: this.day,
			time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
		};
	}
	// ─── Doors & chests ───────────────────────────────────────────────────
	toggleDoor(d) {
		const pos = this.player.body.pos;
		const at = tmpV.set(d.x, d.y + 1, d.z).clone();
		if (d.open) {
			if (this.overlapsPlayer(doorLeafBox(d, 0))) {
				this.ui.hint("Step out of the doorway first", true);
				this.audio.play("deny");
				return;
			}
			this.building.setDoor(d.uid, 0);
			this.audio.play("doorClose", this.falloff(at, 14));
			this.shake = Math.max(this.shake, .12);
			this.fx.burst("dirt", at.setY(d.y + .15), UP, .3);
		} else {
			// Swing away from whoever opens it, unless that side is blocked by the player's own body.
			let side = -doorSide(d, pos.x, pos.z);
			if (this.overlapsPlayer(doorLeafBox(d, side))) side = -side;
			this.building.setDoor(d.uid, side);
			this.audio.play("doorOpen", this.falloff(at, 14));
		}
		this.useCd = .35;
	}
	openChest(c) {
		if (this.state !== "play") return;
		const slots = this.building.stores.get(c.uid);
		if (!slots) return;
		this.state = "inventory";
		this.chestUid = c.uid;
		this.unlock();
		this.input.releaseAll();
		this.building.showGhost(null);
		this.building.openLids.add(c.uid);
		this.ui.openChest(this.inventory, slots);
		this.audio.play("chest");
		this.fx.glint(tmpV.set(c.x, c.y + .8, c.z).clone(), 15909995, 1.4, .4);
	}
	stations() {
		if (this.config.mode === "creative") return new Set(["workbench", "campfire"]);
		const p = this.player.body.pos;
		return this.building.stationsNear(p.x, p.y, p.z, 4.5);
	}
	craft(r, n) {
		const st = this.stations();
		if (r.station && !st.has(r.station)) {
			this.audio.play("deny");
			return;
		}
		let made = 0;
		for (let i = 0; i < n; i++) {
			if (!this.inventory.craft(r)) break;
			made++;
		}
		if (!made) {
			this.audio.play("deny");
			return;
		}
		this.audio.play("craft");
		this.ui.craftFx();
		if (ITEMS[r.out].tool) this.counters.tools++;
		this.ui.toast(r.out, `Crafted ${ITEMS[r.out].name}${made * r.n > 1 ? ` ×${made * r.n}` : ""}`);
		this.ui.refreshInventory(st);
		this.invDirty = true;
	}
	select(i) {
		const next = (i % HOTBAR + HOTBAR) % HOTBAR;
		if (next !== this.selected) {
			this.selected = next;
			this.rotOffset = 0;
			this.invDirty = true;
			this.audio.play("ui", .6);
			const s = this.inventory.slots[next];
			if (s) this.ui.itemName(ITEMS[s.id].name);
		}
	}
	applySettings(patch) {
		if (Object.keys(patch).length) this.store.update(patch);
		const s = this.store.data;
		this.input.sensitivity = s.sensitivity;
		this.input.invertY = s.invertY;
		this.audio.setVolumes(s.musicVolume, s.sfxVolume, s.muted);
		if (patch.quality) this.renderer.applyQuality(s.quality);
		const q = QUALITY_PRESETS[s.quality];
		this.env.setShadowQuality(q.shadows, q.shadowMap);
		this.chunks.grassEnabled = s.quality !== "low";
		this.chunks.radius = s.viewDistance;
		this.env.setViewDistance(s.viewDistance * 32 * .92);
		this.player.camera.fov = s.fov;
		this.player.camera.updateProjectionMatrix();
		document.documentElement.classList.toggle("reduced-motion", s.reducedMotion);
	}
	// ─── Simulation ───────────────────────────────────────────────────────
	step(dt) {
		if (this.state !== "play") return;
		// Hit-stop: freeze the simulation for a few frames on heavy impacts.
		if (this.hitStop > 0) {
			this.hitStop -= dt;
			return;
		}
		const mode = this.config.mode;
		const ev = this.player.step(dt, this.input, this.physics, this.stats, mode);
		const feet = this.player.body.pos;
		if (ev.jumped) this.audio.play("jump", .6);
		if (ev.landed !== null && ev.landed < -5) {
			this.audio.play("land", Math.min(1, -ev.landed / 14));
			this.fx.footDust(feet, this.dustColor(), Math.min(3, -ev.landed / 5));
			this.shake = Math.max(this.shake, Math.min(.5, -ev.landed / 30));
		}
		if (ev.fallDamage > 0) this.damage(ev.fallDamage, "A long fall", undefined, false);
		if (ev.splash) {
			this.audio.play("splash");
			this.fx.splash(tmpV.set(feet.x, SEA_LEVEL, feet.z).clone());
		}
		if (ev.step) {
			const surf = this.stepSurface();
			this.audio.step(surf, this.player.sprinting ? 1.2 : .9);
			if (this.player.sprinting && surf !== "water") this.fx.footDust(feet, this.dustColor(), .7);
		}
		const lowBefore = this.stats.hunger > 20;
		tickStats(this.stats, dt, this.player.sprinting, this.config.difficulty, mode);
		if (lowBefore && this.stats.hunger <= 20) this.ui.statPulse("hunger", "low");
		// Rested: faster stamina recovery.
		if (this.rested > 0) {
			this.rested = Math.max(0, this.rested - dt);
			if (this.stats.staminaWait <= 0 && this.stats.stamina < MAX_STAT) this.stats.stamina = Math.min(MAX_STAT, this.stats.stamina + CONFIG.survival.staminaRegen * (RESTED.staminaRegenMult - 1) * dt);
		}
		if (this.stats.health <= 0 && this.state === "play") this.die("Starvation");
		this.time += dt / DAY_SECONDS;
		if (this.time >= 1) {
			this.time -= 1;
			this.day++;
			this.ui.banner(`Day ${this.day}`, "A new dawn over the wild.");
		}
		this.worldSeconds += dt;
		const pos = this.player.body.pos;
		this.moved += Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z);
		this.lastPos.copy(pos);
		if (this.wardsDirty) {
			this.wardsCache = this.building.wards();
			this.wardsDirty = false;
		}
		this.ctx = {
			player: pos,
			playerMoving: Math.hypot(this.player.body.vel.x, this.player.body.vel.z) > 1,
			playerSprinting: this.player.sprinting,
			night: 1 - this.env.day,
			hostileScale: DIFFICULTY[this.config.difficulty].hostiles * (mode === "creative" ? 0 : 1),
			wards: this.wardsCache,
			physics: this.physics,
			terrain: this.terrain,
			ambientHostiles: !this.wave,
			onAttack: (c, dmg) => this.damage(dmg, ATTACK_CAUSE[c.kind] ?? "Mauled in the wild", c.body.pos),
			onSound: (c, s) => this.audio.play(s, this.falloff(c.body.pos, c.kind === "howler" ? 60 : 30)),
			onDeath: (c, cause) => this.onCreatureDeath(c, cause),
			onRoar: (c) => this.onRoar(c),
			onTelegraph: (c) => {
				this.fx.ring(c.body.pos, 16734780, Math.max(1.2, c.stat.reach), .5, .8);
				this.audio.play("growl", this.falloff(c.body.pos, 25));
			}
		};
		this.creatures.update(dt, this.ctx);
		this.updateNight(dt);
		this.updateArrows(dt);
		this.updateTarget();
		this.actions(dt);
		const t = this.timers;
		t.regrow -= dt;
		if (t.regrow <= 0) {
			t.regrow = 4;
			this.regrow();
		}
		t.discover -= dt;
		if (t.discover <= 0) {
			t.discover = .5;
			this.markExplored();
			this.checkPins();
			this.checkDiscovery();
			this.checkTips();
		}
		t.save -= dt;
		if (t.save <= 0) {
			t.save = 30;
			this.saveWorld(false);
		}
		this.comfortT -= dt;
		if (this.comfortT <= 0) {
			this.comfortT = 1;
			this.checkComfort();
		}
	}
	comfortT = 1;
	// ─── Progression: skills, rested ──────────────────────────────────────
	xp(id, amount) {
		if (this.config.mode === "creative") return;
		const gained = addXp(this.skills, id, amount * (this.rested > 0 ? RESTED.xpMult : 1));
		const s = this.skills[id];
		this.ui.skillXp(id, s.level, s.xp / xpToNext(s.level));
		if (gained > 0) {
			this.ui.levelUp(id, s.level);
			this.ui.setSkills(this.skills);
			this.fx.levelUp(this.player.body.pos.clone());
			this.audio.play("levelup");
		}
	}
	checkComfort() {
		const p = this.player.body.pos;
		const fire = this.building.lightSources().some((l) => l.id === "campfire" && Math.hypot(l.x - p.x, l.z - p.z) < RESTED.radius);
		const pieces = this.building.near(p.x, p.z, RESTED.radius).length;
		this.sheltered = this.building.near(p.x, p.z, 1.8).some((o) => PIECES[o.id].roof && o.y > p.y + 1.2 && Math.abs(o.x - p.x) < 1.2 && Math.abs(o.z - p.z) < 1.2);
		if (this.config.mode === "survival" && isComfortable(fire, pieces)) {
			this.warm += 1;
			if (this.warm >= RESTED.warmup) {
				if (this.rested <= 0) {
					this.ui.toast("buff_rested", "Rested — stamina and skills improve");
					this.fx.glint(p.clone().setY(p.y + 1.2), 16767114, 3, .6);
				}
				// A roof overhead makes the rest last longer.
				this.rested = Math.max(this.rested, RESTED.duration * (this.sheltered ? CONFIG.map.shelterBonus : 1));
			}
		} else this.warm = 0;
	}
	buffs() {
		const out = [];
		if (this.rested > 0) out.push({
			id: "rested",
			label: this.sheltered ? "Rested · Sheltered" : "Rested",
			remaining: this.rested
		});
		else if (this.warm > 0) out.push({
			id: "warming",
			label: "Warming up",
			remaining: null,
			progress: Math.min(1, this.warm / RESTED.warmup)
		});
		return out;
	}
	// ─── Night waves ──────────────────────────────────────────────────────
	updateNight(dt) {
		const night = 1 - this.env.day;
		const hostile = this.config.mode === "survival" && DIFFICULTY[this.config.difficulty].hostiles > 0;
		if (!this.isNight && night > .6) {
			this.isNight = true;
			this.audio.playMusic("night");
			if (hostile && this.lastWave < this.day) this.startWave(this.day);
		} else if (this.isNight && night < .3) {
			this.isNight = false;
			this.audio.playMusic("day");
			if (this.wave || this.lastWave === this.day - 1 || this.lastWave === this.day) {
				if (this.lastWave > 0 && hostile) {
					this.nightsSurvived++;
					this.ui.showWave(`Dawn — Night ${this.lastWave} survived`, "The night creatures burn away in the light.", false);
					this.audio.play("dawn");
					this.xp("hunting", 10);
				}
			}
			this.wave = null;
			this.ui.setWave(null);
		}
		const w = this.wave;
		if (!w) return;
		w.burstT -= dt;
		if (w.queue.length && w.burstT <= 0) {
			w.burstT = WAVE_BURST_GAP;
			for (let i = 0; i < WAVE_BURST_SIZE && w.queue.length; i++) {
				const kind = WAVE_KIND[w.queue[0]];
				const at = this.creatures.findSpot(this.ctx, this.player.body.pos, 24, 36, kind !== "howler");
				if (!at) break;
				const c = this.creatures.spawn(kind, at, true);
				if (!c) {
					// Model still streaming: fetch it now and retry on the next burst.
					void this.stages.require(kind === "howler" ? "boss" : kind === "hollow" ? "night2" : "night1");
					w.burstT = 2;
					break;
				}
				w.queue.shift();
				w.alive.add(c);
				if (kind === "howler") {
					this.audio.playMusic("boss");
					this.ui.showWave("The Elder Howler", "It has caught your scent.", true);
					this.audio.play("roar", .8);
				} else if (kind === "wolf" && Math.random() < .5) this.audio.play("howl", .6, .95 + Math.random() * .1);
			}
		}
		if (!w.queue.length && w.alive.size === 0) {
			this.ui.showWave(`Night ${w.def.night} cleared`, "The dark falls quiet. Rest by the fire.", false);
			this.audio.play("dawn", .7);
			this.give([["crystal", 1 + Math.floor(w.def.night / 2)], ["arrow", 4]], this.player.body.pos.clone().setY(this.player.body.pos.y + 1));
			this.xp("hunting", 12 + w.def.night * 3);
			this.wave = null;
			this.ui.setWave(null);
			if (this.audio.track === "boss") this.audio.playMusic("night");
		}
	}
	startWave(night) {
		const def = waveFor(night, this.config.difficulty === "hard" ? "harsh" : "normal");
		this.lastWave = night;
		this.wave = {
			def,
			queue: [...def.spawns],
			burstT: 4,
			alive: new Set(),
			total: def.spawns.length
		};
		void this.stages.require(stageForNight(night));
		this.ui.showWave(def.title, def.sub, def.boss);
		this.audio.play("horn");
		this.audio.duckMusic(.5, 2.5);
		this.shake = Math.max(this.shake, .15);
	}
	onCreatureDeath(c, cause) {
		this.wave?.alive.delete(c);
		const at = c.body.pos.clone();
		const size = Math.max(.6, c.stat.height / 1.6);
		if (cause === "killed") this.fx.death(at, c.stat.night, size);
		else this.fx.burn(at, c.stat.height);
		if (c.kind === "howler") {
			this.ui.setBossBar(null, 0);
			if (cause === "killed") {
				this.ui.showWave("The Elder Howler falls", "Its hide will make fine trophies.", true);
				this.fx.shockwave(at, 6);
				this.shake = Math.max(this.shake, .7);
				this.xp("hunting", 60);
			}
		}
	}
	onRoar(c) {
		this.fx.shockwave(c.body.pos.clone(), 9);
		const d = c.body.pos.distanceTo(this.player.body.pos);
		this.shake = Math.max(this.shake, Math.max(.15, .8 - d / 30));
		this.audio.play("roar", this.falloff(c.body.pos, 70));
		this.audio.duckMusic(.4, 1.5);
	}
	onTreeLanded(at, size) {
		at.y = this.terrain.height(at.x, at.z) + .2;
		this.fx.leaves(at.clone().setY(at.y + 1), 14 * size, 2.5);
		this.fx.footDust(at, 12101770, 3 * size);
		const k = this.falloff(at, 25);
		this.shake = Math.max(this.shake, .3 * k * size);
		this.audio.play("land", .8 * k, .6);
	}
	// ─── Bow & arrows ─────────────────────────────────────────────────────
	fireArrow(draw) {
		const stack = this.selectedStack();
		const tool = stack ? ITEMS[stack.id].tool : undefined;
		if (!tool) return;
		if (!this.inventory.infinite && !this.inventory.remove("arrow", 1)) return;
		const eye = this.player.eye(new THREE.Vector3());
		const dir = this.player.forward(new THREE.Vector3());
		const model = heldModel("arrow");
		model.rotation.set(0, 0, 0);
		model.scale.setScalar(1.3);
		const obj = new THREE.Group();
		obj.add(model);
		const pos = eye.addScaledVector(dir, .6);
		const vel = dir.clone().multiplyScalar(22 + 30 * draw);
		obj.position.copy(pos);
		obj.quaternion.setFromUnitVectors(UP, dir);
		this.scene.add(obj);
		this.arrows.push({
			obj,
			pos,
			vel,
			life: 6,
			stuck: false,
			dmg: tool.damage * (.35 + .65 * draw) * skillBonus(this.skills, "hunting"),
			dir: dir.clone(),
			wobble: 0,
			glint: .6,
			support: 1,
			falling: false,
			magnet: 0
		});
		this.audio.play("bowRelease", .9, .95 + draw * .1);
		this.player.addKick(.025 * draw, (Math.random() - .5) * .01);
		if (this.inventory.wear(this.selected)) this.ui.toast(null, "Your Hunting Bow broke");
		this.invDirty = true;
	}
	updateArrows(dt) {
		const me = this.player.body.pos;
		const chest = ARROW_CHEST.copy(me).setY(me.y + 1);
		let stuckCount = 0;
		for (let i = this.arrows.length - 1; i >= 0; i--) {
			const a = this.arrows[i];
			a.life -= dt;
			if (a.magnet > 0) {
				// Recovered: zip into the player's chest, then count it.
				a.magnet += dt;
				a.pos.lerp(chest, Math.min(1, dt * (6 + a.magnet * 18)));
				a.obj.scale.setScalar(Math.max(.2, 1 - a.magnet * 1.6));
				if (a.magnet > .32 || a.pos.distanceTo(chest) < .35) {
					this.give([["arrow", 1]], a.pos);
					a.life = 0;
				}
			} else if (a.falling) {
				a.vel.y -= 9.8 * dt;
				a.pos.addScaledVector(a.vel, dt);
				const g = this.terrain.height(a.pos.x, a.pos.z) + .04;
				if (a.pos.y <= g) {
					// Lie flat along its old heading.
					a.pos.y = g;
					a.falling = false;
					a.stuck = true;
					a.dir.set(a.dir.x, 0, a.dir.z);
					if (a.dir.lengthSq() < 1e-4) a.dir.set(1, 0, 0);
					a.dir.normalize();
					a.obj.quaternion.setFromUnitVectors(UP, a.dir);
					a.wobble = .2;
				}
			} else if (a.stuck) {
				stuckCount++;
				const d = a.pos.distanceTo(me);
				if (d < ARROW_PICKUP && Math.abs(a.pos.y - me.y - .8) < 2.4 && this.state === "play") {
					a.magnet = .001;
					a.life = 5;
					this.fx.glint(a.pos, 16773576, 3, .35);
				}
				// A soft glint every so often so missed arrows are easy to spot.
				a.glint -= dt;
				if (a.glint <= 0) {
					a.glint = 1.3 + Math.random() * .8;
					if (d < 40) this.fx.glint(a.pos, 16770736, 1, .5);
				}
				// If the thing it was stuck in is gone (tree felled, wall removed), drop it.
				a.support -= dt;
				if (a.support <= 0) {
					a.support = .8;
					const back = a.pos.clone().addScaledVector(a.dir, -.3);
					if (!this.physics.raycast(back, a.dir, .55, [])) {
						a.stuck = false;
						a.falling = true;
						a.vel.set(0, 0, 0);
					}
				}
			} else {
				a.vel.y -= 9.8 * .7 * dt;
				const step = a.vel.length() * dt;
				const dir = a.dir.copy(a.vel).normalize();
				const hit = this.physics.raycast(a.pos.clone(), dir, step, this.creatures.targets());
				if (hit) {
					if (hit.kind === "creature") {
						this.hitCreature(hit.creature, a.dmg, hit.point, hit.normal, a.pos, true);
						a.life = 0;
					} else {
						a.pos.copy(hit.point).addScaledVector(dir, .1);
						a.stuck = true;
						a.life = ARROW_KEEP;
						a.wobble = .45;
						a.support = .8;
						this.fx.burst(hit.kind === "terrain" ? "dirt" : "wood", hit.point, hit.normal, .35);
						this.audio.play("arrowHit", this.falloff(hit.point, 25) * .7);
						if (!this.arrowTipShown) {
							this.arrowTipShown = true;
							this.ui.hint("Missed arrows stay where they land — walk up to them to recover", false);
						}
					}
				} else a.pos.addScaledVector(a.vel, dt);
				a.obj.quaternion.setFromUnitVectors(UP, dir);
				if (Math.random() < .6) this.fx.trail(a.pos);
			}
			// Impact wobble: a quick decaying quiver around the embed axis.
			if (a.wobble > 0) {
				a.wobble = Math.max(0, a.wobble - dt);
				const k = a.wobble / .45;
				a.obj.quaternion.setFromUnitVectors(UP, a.dir);
				a.obj.rotateX(Math.sin(a.wobble * 70) * .09 * k);
				a.obj.rotateZ(Math.cos(a.wobble * 55) * .06 * k);
			}
			a.obj.position.copy(a.pos);
			if (a.life <= 0) {
				this.scene.remove(a.obj);
				this.arrows.splice(i, 1);
			}
		}
		// Keep the world tidy: retire the oldest stuck arrows beyond the cap.
		if (stuckCount > ARROW_MAX_STUCK) {
			for (let i = 0; i < this.arrows.length && stuckCount > ARROW_MAX_STUCK; i++) {
				const a = this.arrows[i];
				if (a.stuck && a.magnet === 0) {
					a.life = Math.min(a.life, .01);
					stuckCount--;
				}
			}
		}
	}
	hitCreature(c, base, point, normal, from, ranged) {
		const creative = this.config.mode === "creative";
		const crit = Math.random() < (ranged ? .2 : .12);
		const dmg = creative ? 999 : Math.round(base * (crit ? 1.6 : 1) * 10) / 10;
		const drops = this.creatures.hit(c, dmg, from, ranged ? .6 : 1);
		this.fx.burst(c.stat.night ? "hollow" : "blood", point, normal, crit ? 1.5 : 1);
		this.audio.play(ranged ? "arrowHit" : "hit");
		const scr = this.toScreen(point);
		const kill = !!drops;
		if (scr) this.ui.damageNumber(scr.x, scr.y, Math.round(dmg), kill ? "kill" : crit ? "crit" : "hit");
		this.ui.hitMarker(kill);
		this.hitStop = Math.max(this.hitStop, kill ? .08 : crit ? .06 : .035);
		this.shake = Math.max(this.shake, kill ? .3 : .14);
		if (drops) {
			this.audio.play("die", .8);
			this.give(drops, point);
			this.xp("hunting", c.kind === "howler" ? 0 : c.stat.night ? 8 : 5);
		} else this.xp("hunting", 1);
	}
	toScreen(p) {
		const v = scrV.copy(p).project(this.player.camera);
		if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) return null;
		return {
			x: (v.x * .5 + .5) * innerWidth,
			y: (-v.y * .5 + .5) * innerHeight
		};
	}
	dustColor() {
		const s = this.stepSurface();
		return s === "sand" ? 14206106 : s === "stone" ? 11051670 : s === "wood" ? 12098164 : 10126440;
	}
	falloff(p, range) {
		const d = p.distanceTo(this.player.body.pos);
		return Math.max(0, 1 - d / range);
	}
	stepSurface() {
		const p = this.player.body.pos;
		if (p.y < SEA_LEVEL + .2) return "water";
		const th = this.terrain.height(p.x, p.z);
		if (p.y - th > .05) {
			const under = this.building.near(p.x, p.z, .4).find((pc) => Math.abs(pieceBox(pc).maxY - p.y) < .12);
			if (under) return PIECES[under.id].mat === "stone" ? "stone" : "wood";
		}
		const s = this.terrain.surfaceAt(p.x, p.z);
		return s === "rock" || s === "stone" || s === "snow" ? "stone" : s === "sand" ? "sand" : "grass";
	}
	selectedStack() {
		return this.inventory.slots[this.selected];
	}
	updateTarget() {
		const eye = this.player.eye(tmpV);
		const dir = this.player.forward(tmpV2);
		this.target = this.physics.raycast(eye.clone(), dir.clone(), CONFIG.player.reach, this.creatures.targets());
	}
	actions(dt) {
		const input = this.input;
		this.swingCd -= dt;
		this.useCd -= dt;
		const stack = this.selectedStack();
		const def = stack ? ITEMS[stack.id] : null;
		const tool = def?.tool;
		if (tool?.kind === "bow") {
			const canDraw = this.inventory.infinite || this.inventory.count("arrow") > 0;
			if (input.held("primary") && canDraw) {
				if (this.drawT === 0) this.audio.play("bowDraw", .8);
				this.drawT += dt;
				const d = Math.min(1, this.drawT / .8);
				this.player.draw = d;
				this.ui.setCharge(d);
			} else if (this.drawT > 0) {
				const d = Math.min(1, this.drawT / .8);
				if (d > .2) this.fireArrow(d);
				this.drawT = 0;
				this.player.draw = 0;
				this.ui.setCharge(null);
			} else if (input.held("primary") && !canDraw && this.useCd <= 0) {
				this.ui.hint("You need arrows — craft them at a workbench", true);
				this.useCd = 1;
			}
		} else if (this.drawT > 0) {
			this.drawT = 0;
			this.player.draw = 0;
			this.ui.setCharge(null);
		}
		if (tool?.kind !== "bow" && input.held("primary") && this.swingCd <= 0) {
			const tired = this.config.mode === "survival" && this.stats.stamina < CONFIG.survival.staminaSwingCost;
			const dur = (tool?.swing ?? .36) * (tired ? 1.6 : 1);
			if (!tired && this.config.mode === "survival") {
				this.stats.stamina -= CONFIG.survival.staminaSwingCost;
				this.stats.staminaWait = CONFIG.survival.staminaDelay * .5;
			}
			this.swingCd = dur;
			this.impactIn = dur * .42;
			this.player.startSwing(dur);
			this.audio.play("swing", .7);
		}
		if (this.impactIn >= 0) {
			this.impactIn -= dt;
			if (this.impactIn < 0) this.impact();
		}
		if (input.consume("rotate")) {
			this.rotOffset = (this.rotOffset + 1) % 4;
			this.audio.play("ui", .5);
		}
		const wantsUse = input.consume("secondary") || input.held("secondary") && this.useCd <= -.05 && def?.place && def.place !== "campfire" && def.place !== "workbench";
		if (wantsUse && this.useCd <= 0) this.use();
	}
	impact() {
		const hit = this.target;
		if (!hit) return;
		const stack = this.selectedStack();
		const tool = stack ? ITEMS[stack.id].tool : undefined;
		const creative = this.config.mode === "creative";
		let wear = false;
		switch (hit.kind) {
			case "creature": {
				const c = hit.creature;
				const dmg = (tool ? tool.kind === "weapon" ? tool.damage : tool.damage * .6 : 2) * CONFIG.mining.power * skillBonus(this.skills, "hunting");
				this.hitCreature(c, dmg, hit.point, hit.normal, this.player.body.pos, false);
				this.player.addKick(-.015, (Math.random() - .5) * .02);
				wear = !!tool;
				break;
			}
			case "resource": {
				const r = hit.res;
				const def = RES[r.type];
				const power = resourcePower(tool, def.mat);
				if (power <= 0 && !creative) {
					this.fx.burst(def.mat === "crystal" ? "crystal" : "stone", hit.point, hit.normal, .3);
					this.audio.play("mine", .4, .7);
					const need = neededTool(def.mat);
					if (need) this.ui.hint(need, true);
					return;
				}
				const skill = def.mat === "wood" ? "woodcutting" : def.mat === "soft" ? "foraging" : "mining";
				r.hp -= creative ? 999 : power * CONFIG.mining.power * skillBonus(this.skills, skill);
				const glow = def.mat === "crystal";
				this.fx.burst(def.mat === "wood" ? "wood" : def.mat === "stone" ? "stone" : glow ? "crystal" : def.mat === "soft" ? "soft" : "wood", hit.point, hit.normal);
				if (r.type === "oak" || r.type === "pine") this.fx.leaves(tmpV.set(r.x, r.y + 4.5 * r.s, r.z).clone(), 4, 1.8);
				if (def.mat === "wood" || def.mat === "stone") {
					this.hitStop = Math.max(this.hitStop, .025);
					this.shake = Math.max(this.shake, .08);
					this.player.addKick(-.012, (Math.random() - .5) * .012);
				}
				this.audio.play(def.mat === "wood" ? "chop" : def.mat === "stone" ? "mine" : glow ? "crystal" : "soft");
				if (r.hp <= 0) this.harvest(r);
				wear = !!tool && def.mat !== "soft";
				break;
			}
			case "piece": {
				const p = hit.piece;
				const pd = PIECES[p.id];
				p.hp -= creative ? 999 : piecePower(tool, pd.mat) * CONFIG.mining.power;
				this.fx.burst(pd.mat === "stone" ? "stone" : "wood", hit.point, hit.normal, .8);
				this.audio.play(pd.mat === "stone" ? "mine" : pd.mat === "wood" ? "chop" : "soft");
				if (p.hp <= 0) this.removePiece(p);
				wear = !!tool;
				break;
			}
			case "terrain": {
				const surface = this.terrain.surfaceAt(hit.point.x, hit.point.z);
				const rock = surface === "rock" || surface === "stone" || surface === "snow";
				const k = creative ? 1.5 : digPower(tool, rock);
				const dirty = this.terrain.deform(hit.point.x, hit.point.z, CONFIG.mining.digRadius, -CONFIG.mining.digDepth * k, CONFIG.mining.maxDigDepth);
				this.map.invalidate(hit.point.x, hit.point.z);
				this.chunks.rebuild(dirty);
				this.fx.burst(rock ? "stone" : surface === "sand" ? "sand" : "dirt", hit.point, hit.normal);
				this.player.addKick(-.01);
				this.audio.play(rock ? "mine" : "dig");
				this.digAcc += k * .55;
				while (this.digAcc >= 1) {
					this.digAcc -= 1;
					this.give([[rock ? "stone" : "soil", 1]], hit.point);
				}
				wear = !!tool;
				break;
			}
		}
		if (wear && tool && this.inventory.wear(this.selected)) {
			this.audio.play("toolbreak");
			this.ui.toast(null, `Your ${ITEMS[stack.id].name} broke`);
		}
		this.invDirty = true;
	}
	give(drops, at) {
		for (const [id, n] of drops) {
			const left = this.inventory.infinite ? 0 : this.inventory.add(id, n);
			const got = n - left;
			if (got > 0) {
				this.ui.toast(id, `+${got} ${ITEMS[id].name}`);
				const scr = this.toScreen(at);
				if (scr) this.ui.pickupFly(id, scr.x, scr.y, got);
				if (id === "wood") this.counters.wood += got;
				if (id === "fiber") this.counters.fiber += got;
			}
			if (left > 0) this.ui.toast(null, "Pack is full");
			this.fx.collect(at, id === "crystal" ? 7987410 : id === "wood" ? 14201466 : 15722194, Math.min(6, 2 + n));
		}
		this.audio.play("pickup");
		this.invDirty = true;
	}
	detach(r) {
		const B = newBuilders();
		const y = r.y;
		buildResource(r, B, r.x, y, r.z);
		const g = new THREE.Group();
		g.position.set(r.x, y, r.z);
		for (const key of BUILDER_KEYS) {
			const geo = B[key].build();
			if (!geo) continue;
			const m = new THREE.Mesh(geo, this.chunks.layerMat[key]);
			m.castShadow = key !== "glow";
			m.userData.disposable = true;
			g.add(m);
		}
		return g;
	}
	harvest(r) {
		const def = RES[r.type];
		const drops = rollDrops(r, Math.random);
		if (def.mat === "soft" && drops.length && Math.random() < skillBonus(this.skills, "foraging") - 1) drops[0] = [drops[0][0], drops[0][1] + 1];
		this.xp(def.mat === "wood" ? "woodcutting" : def.mat === "soft" ? "foraging" : "mining", def.mat === "soft" ? 2 : def.mat === "crystal" ? 8 : 5);
		const center = tmpV.set(r.x, r.y + (def.shapes[0].dy + .4) * r.s, r.z).clone();
		const obj = this.detach(r);
		const delay = regrowDelay(def, r.type, !!r.poi, CONFIG.mining.regrowSeconds);
		this.harvested.set(r.key, delay < 0 ? -1 : this.worldSeconds + delay);
		const chunk = this.chunks.chunkOf(r);
		if (chunk) this.chunks.rebuildResources(chunk.key);
		if (r.type === "oak" || r.type === "pine") {
			const away = new THREE.Vector3(r.x - this.player.body.pos.x, 0, r.z - this.player.body.pos.z).normalize();
			this.fx.animateProp(obj, "fall", away, undefined, 5 * r.s);
			this.fx.leaves(tmpV.set(r.x, r.y + 4 * r.s, r.z).clone(), 10, 2);
			this.audio.play("treefall");
		} else {
			this.fx.animateProp(obj, def.mat === "soft" ? "pop" : "shrink");
			if (def.mat !== "soft") this.audio.play("break");
			this.fx.burst(def.mat === "crystal" ? "crystal" : def.mat === "soft" ? "soft" : def.mat === "wood" ? "wood" : "stone", center, UP, 1.8);
			if (def.mat === "stone" || def.mat === "crystal") this.shake = Math.max(this.shake, .18);
		}
		if (def.loot) {
			this.ui.banner("Cache opened", "Supplies recovered.");
			this.audio.play("chest");
			this.fx.glint(center, 16767114, 4, .7);
			this.fx.ring(tmpV.set(r.x, r.y, r.z).clone(), 16767114, 1.6, .7);
		}
		this.give(drops, center);
	}
	removePiece(p) {
		const store = this.building.stores.get(p.uid);
		if (store) {
			if (this.chestUid === p.uid) this.closeInventory();
			let lost = 0;
			for (const st of store) if (st) lost += this.inventory.infinite ? 0 : this.inventory.add(st.id, st.n, st.dur);
			const n = store.filter(Boolean).length;
			if (n) {
				this.ui.toast("storage_chest", lost ? `Chest emptied — ${lost} items didn't fit` : `Chest emptied into your pack`);
				this.fx.collect(tmpV.set(p.x, p.y + .5, p.z).clone(), 15909995, Math.min(8, 2 + n));
				this.invDirty = true;
			}
		}
		const obj = this.building.object(p.uid)?.clone();
		this.building.remove(p.uid);
		this.wardsDirty = true;
		if (obj) this.fx.animateProp(obj, "shrink");
		this.fx.burst("remove", tmpV.set(p.x, p.y + .5, p.z).clone(), UP);
		this.audio.play("remove");
		if (this.config.mode === "survival") this.give([[PIECES[p.id].item, 1]], tmpV.set(p.x, p.y + .5, p.z).clone());
		if (this.spawnPoint && p.id === "campfire" && Math.hypot(this.spawnPoint.x - p.x, this.spawnPoint.z - p.z) < 1) {
			this.spawnPoint = null;
			this.ui.toast(null, "Respawn point cleared");
		}
	}
	computePlacement() {
		this.placement = null;
		const stack = this.selectedStack();
		const def = stack ? ITEMS[stack.id] : null;
		const hit = this.target;
		if (!def?.place || def.place === "soil" || !hit || hit.kind === "creature") return;
		const pd = PIECES[def.place];
		let hitPiece = hit.kind === "piece" ? hit.piece ?? null : null;
		let hitPoint = hit.point;
		// Terrain poking up through (or aimed just beside) a foundation/floor: treat an edge or corner
		// piece aimed there as aimed at that piece's top, so walls snap onto its edges instead of
		// dropping to ground level and clipping into it.
		if (!hitPiece && hit.kind === "terrain" && (pd.snap === "edge" || pd.snap === "corner")) {
			const m = .5;
			for (const o of this.building.near(hit.point.x, hit.point.z, 2)) {
				if (PIECES[o.id].snap !== "cell" || !PIECES[o.id].solid) continue;
				const b = pieceBox(o);
				if (hit.point.x < b.minX - m || hit.point.x > b.maxX + m || hit.point.z < b.minZ - m || hit.point.z > b.maxZ + m) continue;
				if (hit.point.y < b.maxY + .6 && hit.point.y > b.minY - .4) {
					hitPiece = o;
					// Clamp just inside the footprint so the nearest edge is the one you aimed beside.
					hitPoint = hit.point.clone().set(Math.min(b.maxX - .02, Math.max(b.minX + .02, hit.point.x)), b.maxY, Math.min(b.maxZ - .02, Math.max(b.minZ + .02, hit.point.z)));
					break;
				}
			}
		}
		const p = snapPiece(pd, {
			point: hitPoint,
			normal: hitPiece && hitPiece !== hit.piece ? UP : hit.normal,
			piece: hitPiece
		}, this.player.yaw, this.rotOffset);
		// A 2 m grid cell aimed near your feet would overlap you; slide it one cell further out.
		if (pd.snap === "cell" && hit.kind === "terrain" && this.overlapsPlayer(placementBox(pd, p))) {
			const fx = -Math.sin(this.player.yaw);
			const fz = -Math.cos(this.player.yaw);
			if (Math.abs(fx) > Math.abs(fz)) p.x += Math.sign(fx) * 2;
			else p.z += Math.sign(fz) * 2;
			p.y += this.terrain.height(p.x, p.z) - hit.point.y;
		}
		let valid = hit.kind !== "resource";
		if (valid && pd.snap === "free" && hit.normal.y < .6) valid = false;
		if (valid) valid = this.placementValid(pd.id, p);
		this.placement = {
			id: pd.id,
			p,
			valid
		};
	}
	placementValid(id, p) {
		const pd = PIECES[id];
		const box = placementBox(pd, p);
		const eye = this.player.eye(tmpV);
		const cx = (box.minX + box.maxX) / 2;
		const cy = (box.minY + box.maxY) / 2;
		const cz = (box.minZ + box.maxZ) / 2;
		if (Math.hypot(cx - eye.x, cy - eye.y, cz - eye.z) > CONFIG.player.reach + 2) return false;
		for (const o of this.building.near(cx, cz, 3)) {
			if (sameEdge({
				id,
				x: p.x,
				y: p.y,
				z: p.z,
				rot: p.rot
			}, o)) return false;
			if (overlapAllowed(id, o.id)) continue;
			if (boxesOverlap(box, pieceBox(o))) return false;
		}
		if ((pd.solid || pd.ramp) && this.overlapsPlayer(box)) return false;
		if (this.physics.blockedByResource(box)) return false;
		return true;
	}
	overlapsPlayer(box) {
		const b = this.player.body;
		const pb = {
			minX: b.pos.x - b.radius,
			minY: b.pos.y + .05,
			minZ: b.pos.z - b.radius,
			maxX: b.pos.x + b.radius,
			maxY: b.pos.y + b.height,
			maxZ: b.pos.z + b.radius
		};
		return boxesOverlap(box, pb, 0);
	}
	use() {
		const stack = this.selectedStack();
		const def = stack ? ITEMS[stack.id] : null;
		const hit = this.target;
		// Doors and chests always respond to use, whatever is held.
		if (hit?.kind === "piece") {
			const pd = PIECES[hit.piece.id];
			if (pd.door) return this.toggleDoor(hit.piece);
			if (pd.storage) return this.openChest(hit.piece);
		}
		// Stations open the crafting screen.
		if (hit?.kind === "piece" && PIECES[hit.piece.id].station && !(def?.place && def.place !== "soil")) {
			this.openInventory(PIECES[hit.piece.id].station);
			return;
		}
		if (def?.food) {
			if (eat(this.stats, def.food)) {
				this.inventory.takeFrom(this.selected);
				this.player.startEat();
				this.audio.play("eat");
				this.ui.statPulse("hunger", "fill");
				if (def.food.health) this.ui.statPulse("health", "fill");
				this.useCd = .6;
				this.invDirty = true;
			} else this.ui.hint("You're not hungry", true);
			return;
		}
		if (def?.place === "soil") {
			if (hit?.kind !== "terrain") return;
			if (!this.inventory.takeFrom(this.selected)) return;
			const dirty = this.terrain.deform(hit.point.x, hit.point.z, CONFIG.mining.digRadius, CONFIG.mining.raiseAmount, CONFIG.mining.maxDigDepth);
			this.map.invalidate(hit.point.x, hit.point.z);
			this.chunks.rebuild(dirty);
			this.fx.burst("dirt", hit.point, hit.normal, .6);
			this.audio.play("dig", .8, 1.2);
			this.useCd = .22;
			this.invDirty = true;
			return;
		}
		if (def?.place) {
			this.computePlacement();
			const pl = this.placement;
			if (!pl || !pl.valid) {
				if (pl) this.audio.play("deny", .6);
				this.useCd = .2;
				return;
			}
			if (!this.inventory.takeFrom(this.selected)) return;
			const piece = this.building.add(pl.id, pl.p);
			this.wardsDirty = true;
			this.audio.play(PIECES[piece.id].mat === "stone" ? "placeStone" : "place");
			const obj = this.building.object(piece.uid);
			if (obj) {
				obj.scale.setScalar(.6);
				this.pops.push({
					obj,
					t: 0
				});
			}
			this.fx.burst("place", tmpV.set(pl.p.x, pl.p.y + .05, pl.p.z).clone(), UP, PIECES[piece.id].snap === "free" ? .6 : 1);
			this.shake = Math.max(this.shake, .06);
			this.xp("building", 3);
			if (this.config.mode === "survival" && Math.random() < skillBonus(this.skills, "building") - 1) {
				this.inventory.add(def.id, 1);
				this.ui.toast(def.id, "Master builder — material refunded");
			}
			if (piece.id === "campfire") {
				this.spawnPoint = new THREE.Vector3(pl.p.x + 1.2, pl.p.y + .1, pl.p.z);
				this.ui.toast("campfire", "Respawn point set");
			}
			this.tipsDone.add(piece.id === "workbench" ? "bench" : piece.id === "campfire" ? "fire" : piece.id === "foundation" || piece.id === "wood_wall" ? "build" : "");
			this.useCd = .22;
			this.invDirty = true;
		}
	}
	regrow() {
		const dirty = new Set();
		for (const [k, at] of this.harvested) {
			if (at < 0 || at > this.worldSeconds) continue;
			const [cx, cz] = k.split(",").map(Number);
			const c = this.chunks.get(cx, cz);
			if (c) {
				// Do not regrow on top of the player.
				const r = c.resources.find((res) => res.key === k);
				if (r && Math.hypot(r.x - this.player.body.pos.x, r.z - this.player.body.pos.z) < 3) continue;
				if (r) r.hp = RES[r.type].hp * (r.type === "oak" || r.type === "pine" || r.type === "boulder" ? Math.min(1.4, Math.max(.8, r.s)) : 1);
				dirty.add(c.key);
			}
			this.harvested.delete(k);
		}
		for (const key of dirty) this.chunks.rebuildResources(key);
	}
	checkDiscovery() {
		const p = this.player.body.pos;
		for (const poi of this.terrain.pois.near(p.x, p.z, 20)) {
			if (this.discovered.has(poi.id)) continue;
			this.discovered.add(poi.id);
			this.ui.banner(`Discovered: ${POI_NAMES[poi.type]}`, POI_BLURB[poi.type]);
			this.audio.play("discover");
		}
	}
	checkTips() {
		if (this.moved > 8) this.tipsDone.add("move");
		if (this.counters.wood > 0 && this.counters.fiber > 0) this.tipsDone.add("gather");
		if (this.counters.tools > 0) this.tipsDone.add("craft");
		this.refreshTips();
	}
	refreshTips() {
		const touch = this.input.method === "touch";
		const list = TIPS.map((t) => ({
			id: t.id,
			text: touch ? t.touch : t.text,
			done: this.tipsDone.has(t.id)
		}));
		this.ui.setTips(this.store.data.tutorialDone || this.config.mode === "creative" ? [] : list);
	}
	damage(amount, cause, from, scaled = true) {
		if (this.state !== "play" || this.config.mode === "creative") return;
		if (scaled && DIFFICULTY[this.config.difficulty].damage === 0) return;
		const dead = hurt(this.stats, amount, this.config.difficulty, this.config.mode, scaled);
		this.ui.flashDamage();
		this.ui.statPulse("health", "drain");
		this.audio.play("hurt");
		this.shake = Math.max(this.shake, Math.min(.6, .2 + amount / 40));
		this.player.addKick(-.04, (Math.random() - .5) * .05);
		if (from) {
			const p = this.player.body.pos;
			this.ui.hurtFrom(Math.atan2(from.x - p.x, -(from.z - p.z)) + this.player.yaw);
			const away = this.player.body.pos.clone().sub(from).setY(0).normalize();
			this.player.body.vel.addScaledVector(away, 6);
			this.player.body.vel.y = 3.5;
			this.player.body.grounded = false;
		}
		if (dead) this.die(cause);
	}
	die(cause) {
		this.state = "dead";
		this.lastCause = cause;
		this.unlock();
		this.input.releaseAll();
		this.building.showGhost(null);
		this.audio.play("death");
		this.ui.showDeath(cause, this.day);
	}
	respawn() {
		if (this.state !== "dead") return;
		this.input.lockPointer();
		let at = this.worldSpawn;
		if (this.spawnPoint) {
			const sp = this.spawnPoint;
			const fire = this.building.near(sp.x, sp.z, 2).some((p) => p.id === "campfire");
			if (fire) at = sp;
			else this.spawnPoint = null;
		}
		this.player.teleport(tmpV.set(at.x, at.y + .3, at.z));
		this.chunks.ensureNear(at.x, at.z, 1);
		const g = this.physics.groundAt(at.x, at.z, at.y + 3, .3);
		this.player.body.pos.y = Math.max(this.player.body.pos.y, g + .02);
		this.player.prev.copy(this.player.body.pos);
		this.stats = freshStats();
		this.stats.hunger = 70;
		// Clear nearby night creatures so respawning is fair.
		for (const c of this.creatures.list) if (c.stat.night && c.kind !== "howler" && c.body.pos.distanceTo(at) < 25) c.state = "dying";
		this.state = "play";
		this.ui.hideDeath();
		this.loop.resetAccumulator();
		void this.lastCause;
	}
	// ─── Rendering ────────────────────────────────────────────────────────
	render(alpha, frame) {
		const input = this.input;
		const cam = this.player.camera;
		const t = performance.now() / 1e3;
		if (this.state === "title") {
			this.titleAngle += frame * .035;
			const sp = this.worldSpawn;
			cam.position.set(sp.x + Math.cos(this.titleAngle) * 34, sp.y + 16, sp.z + Math.sin(this.titleAngle) * 34);
			cam.lookAt(sp.x, sp.y + 4, sp.z);
			this.player.hand.visible = false;
			this.chunks.update(sp.x, sp.z, 6);
			this.env.update(.31, cam.position, cam.position.y, frame);
		} else {
			this.player.hand.visible = this.state !== "dead";
			if (this.state === "play") {
				this.player.look(input);
				const slot = input.takeSlot();
				if (slot !== null) this.select(slot);
				const wheel = input.takeWheel();
				if (wheel) this.select(this.selected + wheel);
				if (input.consume("inventory")) this.openInventory();
				else if (input.consume("map")) this.openMap();
				else if (input.consume("pause") && (this.touch || this.input.freeLook || !this.input.locked)) this.pause();
			} else {
				if (this.state === "map" && (input.consume("map") || input.consume("pause") || input.consume("inventory"))) this.closeMap();
				input.takeLook();
				input.takeWheel();
				input.takeSlot();
			}
			const stack = this.selectedStack();
			this.player.setHeld(stack?.id ?? null);
			this.player.arrowReady = this.inventory.infinite || this.inventory.count("arrow") > 0;
			this.player.render(alpha, frame, this.store.data.headBob ? CONFIG.camera.bob : 0);
			this.applyCameraJuice(frame);
			const p = this.player.body.pos;
			this.chunks.update(p.x, p.z, 4);
			this.env.update(this.time, p, cam.position.y, frame);
			if (this.state === "play") {
				this.computePlacement();
				const pl = this.placement;
				this.building.showGhost(pl ? pl.id : null, pl?.p, pl?.valid);
			}
			this.hud(frame);
			const pp = this.player.body.pos;
			if (this.state === "map") {
				this.mapViewT -= frame;
				if (this.mapViewT <= 0) {
					this.mapViewT = .1;
					this.map.setView(this.mapView());
				}
				this.map.work(6, pp.x, pp.z);
				this.map.draw();
			} else if (this.state === "play" && !this.isBusy()) this.map.work(.7, pp.x, pp.z);
		}
		this.chunks.tick(frame);
		this.building.animate(t, frame);
		this.beacons.update(frame, this.player.body.pos);
		this.frameMs += (frame * 1e3 - this.frameMs) * .08;
		this.fx.setLight(.28 + .72 * this.env.day);
		WU.uFoliageFill.value = .03 + .2 * this.env.day;
		this.fx.update(frame, this.player.eye(tmpV), cam);
		this.updatePops(frame);
		this.updateLights(t, frame);
		this.audio.setAmbient(this.env.day, Math.min(1, Math.max(0, (cam.position.y - 10) / 40)), this.fireNear);
		this.ui.setUnderwater(this.env.underwater && this.state !== "title");
		this.touch?.setVisible(this.state === "play");
		// Shadows refresh at half rate: the sun moves slowly and this halves the shadow pass cost.
		this.frameN++;
		this.renderer.gl.shadowMap.autoUpdate = false;
		this.renderer.gl.shadowMap.needsUpdate = this.frameN % 2 === 0 || this.state === "title";
		this.renderer.render(this.scene, cam);
		input.endFrame();
		input.update();
	}
	/** Screen shake, sprint FOV and hit kicks layered on top of the player camera. */
	applyCameraJuice(frame) {
		const cam = this.player.camera;
		const reduced = this.store.data.reducedMotion;
		if (this.shake > .001) {
			const s = this.shake * this.shake * (reduced ? .25 : 1);
			cam.rotation.x += (Math.random() - .5) * s * .06;
			cam.rotation.y += (Math.random() - .5) * s * .06;
			cam.position.y += (Math.random() - .5) * s * .08;
			this.shake = Math.max(0, this.shake - frame * 2.2);
		}
		const want = this.store.data.fov + (this.player.sprinting && !reduced ? 7 : 0) - this.player.draw * 8;
		if (Math.abs(want - this.fovNow) > .02) {
			this.fovNow += (want - this.fovNow) * Math.min(1, frame * 8);
			cam.fov = this.fovNow;
			cam.updateProjectionMatrix();
		}
	}
	updatePops(frame) {
		for (let i = this.pops.length - 1; i >= 0; i--) {
			const p = this.pops[i];
			p.t += frame / .32;
			const k = Math.min(1, p.t);
			// Overshoot ease-out (easeOutBack).
			const c1 = 1.9;
			const e = 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
			p.obj.scale.setScalar(.6 + .4 * e);
			if (k >= 1) {
				p.obj.scale.setScalar(1);
				this.pops.splice(i, 1);
			}
		}
	}
	updateLights(t, frame) {
		const focus = this.state === "title" ? this.worldSpawn : this.player.body.pos;
		const sources = this.building.lightSources().map((p) => ({
			p,
			d: Math.hypot(p.x - focus.x, p.z - focus.z)
		})).filter((s) => s.d < 50).sort((a, b) => a.d - b.d);
		let li = 0;
		const night = 1 - this.env.day;
		const stack = this.selectedStack();
		if (this.state !== "title" && stack?.id === "torch") {
			const l = this.lights[li++];
			const cam = this.player.camera;
			l.position.copy(cam.position).add(tmpV.set(.3, -.2, 0).applyQuaternion(cam.quaternion));
			l.color.set(16754784);
			l.distance = 13;
			l.intensity = (8 + night * 10) * (.9 + Math.sin(t * 17) * .05 + Math.sin(t * 29) * .05);
		}
		this.timers.embers -= frame;
		const ember = this.timers.embers <= 0;
		if (ember) this.timers.embers = .12;
		this.fireNear = 0;
		for (const s of sources) if (s.p.id === "campfire") this.fireNear = Math.max(this.fireNear, Math.max(0, 1 - s.d / 12));
		for (const s of sources) {
			if (li >= this.lights.length) break;
			const def = PIECES[s.p.id];
			const L = def.light;
			const l = this.lights[li++];
			const a = s.p.rot * Math.PI / 2;
			l.position.set(s.p.x + Math.sin(a) * 0, s.p.y + L.y, s.p.z);
			l.color.setHex(L.color);
			l.distance = L.distance;
			const flicker = def.id === "lamp" ? 1 + Math.sin(t * 2 + s.p.uid) * .05 : .85 + Math.sin(t * 13 + s.p.uid) * .08 + Math.sin(t * 31 + s.p.uid * 3) * .07;
			l.intensity = L.intensity * (.45 + night * .9) * flicker;
			if (ember && def.id === "campfire" && s.d < 30) this.fx.fire(tmpV.set(s.p.x, s.p.y + .18, s.p.z), 1);
			else if (ember && def.id !== "campfire" && s.d < 20 && Math.random() < .3) this.fx.embers(tmpV.set(s.p.x, s.p.y + L.y, s.p.z), 1);
			if (ember && def.id === "campfire" && s.d < 12 && Math.random() < .15) this.audio.play("fire", this.falloff(tmpV.set(s.p.x, s.p.y, s.p.z), 12));
		}
		for (; li < this.lights.length; li++) this.lights[li].intensity = 0;
	}
	hud(frame) {
		this.timers.hud -= frame;
		if (this.invDirty) {
			this.ui.renderHotbar(this.inventory, this.selected);
			this.invDirty = false;
		}
		if (this.state === "inventory" && this.chestUid !== null) {
			const c = this.building.pieces.get(this.chestUid);
			const pos = this.player.body.pos;
			if (!c || Math.hypot(c.x - pos.x, c.z - pos.z) > CONFIG.player.reach + 2.5) this.closeInventory();
		}
		if (this.state === "inventory") {
			const st = this.stations();
			if ([...st].join() !== [...this.lastStations].join()) {
				this.lastStations = st;
				this.ui.refreshInventory(st);
			}
		}
		// Compass every frame (cheap transforms).
		const p = this.player.body.pos;
		const markers = [];
		if (this.timers.hud <= 0) {
			this.timers.hud = .1;
			for (const poi of this.terrain.pois.near(p.x, p.z, 320)) {
				const known = this.discovered.has(poi.id);
				markers.push({
					bearing: Math.atan2(poi.x - p.x, -(poi.z - p.z)),
					label: known ? POI_NAMES[poi.type] : "?",
					dist: Math.hypot(poi.x - p.x, poi.z - p.z),
					known
				});
			}
			if (this.spawnPoint) markers.push({
				bearing: Math.atan2(this.spawnPoint.x - p.x, -(this.spawnPoint.z - p.z)),
				label: "Camp",
				dist: this.spawnPoint.distanceTo(p),
				known: true,
				camp: true
			});
			this.waypoints.pins.forEach((pin, i) => markers.push({
				bearing: Math.atan2(pin.x - p.x, -(pin.z - p.z)),
				label: `Pin ${i + 1}`,
				dist: Math.hypot(pin.x - p.x, pin.z - p.z),
				known: true,
				pin: PIN_COLORS[pin.c]
			}));
			this.ui.setCompassMarkers(markers);
			this.ui.updateStats(this.stats, this.config.mode, MAX_STAT);
			const night = 1 - this.env.day;
			const warded = night > .5 && this.wardsCache.some((w) => Math.hypot(w.x - p.x, w.z - p.z) < w.r);
			this.ui.setClock(clockText(this.time), this.day, night > .5, warded, this.config.mode === "creative" ? this.player.flying ? "Creative · Flying" : "Creative" : DIFFICULTY[this.config.difficulty].label);
			this.targetHud();
			this.ui.setBuffs(this.buffs());
			const w = this.wave;
			this.ui.setWave(w ? {
				night: w.def.night,
				title: w.def.title,
				remaining: w.queue.length + w.alive.size,
				total: w.total,
				boss: w.def.boss
			} : null);
			const boss = this.creatures.list.find((c) => c.kind === "howler" && c.alive);
			this.ui.setBossBar(boss ? CREATURE_NAMES.howler : null, boss ? Math.max(0, boss.hp) / boss.maxHp : 0);
		}
		this.ui.setHeading(this.player.yaw);
	}
	targetHud() {
		const hit = this.target;
		const stack = this.selectedStack();
		const def = stack ? ITEMS[stack.id] : null;
		let label = null;
		let hp = null;
		if (hit?.kind === "resource") {
			const r = hit.res;
			label = RES[r.type].name;
			const max = RES[r.type].hp * (r.type === "oak" || r.type === "pine" || r.type === "boulder" ? Math.min(1.4, Math.max(.8, r.s)) : 1);
			if (Number.isFinite(max) && r.hp < max) hp = r.hp / max;
		} else if (hit?.kind === "piece") {
			const pc = hit.piece;
			label = PIECES[pc.id].name;
			if (pc.hp < PIECES[pc.id].hp) hp = pc.hp / PIECES[pc.id].hp;
		} else if (hit?.kind === "creature") {
			const c = hit.creature;
			label = CREATURE_NAMES[c.kind];
			hp = Math.max(0, c.hp) / c.maxHp;
		}
		const touch = this.input.method === "touch";
		const use = touch ? "USE" : "Right-click";
		let hint = "";
		if (hit?.kind === "piece" && PIECES[hit.piece.id].station && !(def?.place && def.place !== "soil")) hint = `${use} to use the ${PIECES[hit.piece.id].name}`;
		else if (def?.place && def.place !== "soil") hint = this.placement && !this.placement.valid ? "Blocked — try another spot" : `${use} to place · ${touch ? "ROTATE" : "R"} to rotate`;
		else if (def?.place === "soil") hint = `${use} on the ground to raise it`;
		else if (def?.food) hint = `${use} to eat`;
		else if (def?.tool?.kind === "bow") hint = this.inventory.infinite || this.inventory.count("arrow") > 0 ? `${touch ? "Hold MINE" : "Hold left-click"} to draw · release to shoot` : "No arrows — craft them at a workbench";
		else if (hit?.kind === "resource") {
			const need = neededTool(RES[hit.res.type].mat);
			const tool = def?.tool;
			if (need && !(tool?.kind === "pickaxe") && RES[hit.res.type].mat !== "none") hint = need;
			else if (RES[hit.res.type].mat === "none") hint = "";
		} else if (hit?.kind === "terrain" && def?.tool?.kind === "shovel") hint = `${touch ? "Hold MINE" : "Hold left-click"} to dig`;
		this.ui.setTarget(label, hp, hint);
	}
}

//# sourceMappingURL=data:application/json;base64,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QUcsSUFBSTtPQUN6QyxJQUFJLEtBQUssTUFBTSxPQUFPLEdBQUcsSUFBSTtPQUM3QixJQUFJLEtBQUssTUFBTSxTQUFTLE9BQU8sT0FBTyxLQUFLLFVBQVUsWUFBWSxLQUFLLFVBQVUsTUFBTSxPQUFPLElBQUksSUFBSSxHQUFHLFFBQVEsY0FBYyxrQkFBa0IsK0JBQStCO09BQy9LLElBQUksS0FBSyxTQUFTLFlBQVk7R0FDakMsTUFBTSxPQUFPLFdBQVcsSUFBSSxJQUFJLElBQUssS0FBSyxDQUFDLEdBQUc7R0FDOUMsTUFBTSxPQUFPLEtBQUs7R0FDbEIsSUFBSSxRQUFRLEVBQUUsTUFBTSxTQUFTLGNBQWMsSUFBSSxJQUFJLElBQUssS0FBSyxDQUFDLFFBQVEsUUFBUSxPQUFPO1FBQ2hGLElBQUksSUFBSSxJQUFJLElBQUssS0FBSyxDQUFDLFFBQVEsUUFBUSxPQUFPO0VBQ3JELE9BQU8sSUFBSSxLQUFLLFNBQVMsYUFBYSxLQUFLLE1BQU0sU0FBUyxVQUFVLE9BQU8sR0FBRyxRQUFRLGNBQWMsa0JBQWtCO0VBQ3RILEtBQUssR0FBRyxVQUFVLE9BQU8sSUFBSSxJQUFJO0NBQ25DO0FBQ0YiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiZ2FtZS50cyJdLCJ2ZXJzaW9uIjozLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBUSFJFRSBmcm9tICd0aHJlZSdcbmltcG9ydCB7IFdVIH0gZnJvbSAnLi9tYXRlcmlhbHMnXG5pbXBvcnQgeyBBc3NldHMsIFN0YWdlTG9hZGVyLCB0eXBlIFN0YWdlSWQgfSBmcm9tICcuLi9lbmdpbmUvYXNzZXRzJ1xuaW1wb3J0IHsgQXVkaW8sIHR5cGUgU3VyZmFjZSBhcyBTdGVwU3VyZmFjZSB9IGZyb20gJy4uL2VuZ2luZS9hdWRpbydcbmltcG9ydCB7IElucHV0IH0gZnJvbSAnLi4vZW5naW5lL2lucHV0J1xuaW1wb3J0IHsgR2FtZUxvb3AgfSBmcm9tICcuLi9lbmdpbmUvbG9vcCdcbmltcG9ydCB7IFFVQUxJVFlfUFJFU0VUUywgUmVuZGVyZXIgfSBmcm9tICcuLi9lbmdpbmUvcmVuZGVyZXInXG5pbXBvcnQgeyBTYXZlU3RvcmUsIHR5cGUgU2FuZGJveENvbmZpZywgdHlwZSBTYXZlRGF0YSB9IGZyb20gJy4uL2VuZ2luZS9zYXZlJ1xuaW1wb3J0IHsgVG91Y2hDb250cm9scyB9IGZyb20gJy4uL3VpL3RvdWNoJ1xuaW1wb3J0IHsgVUksIHR5cGUgQnVmZlZpZXcsIHR5cGUgQ29tcGFzc01hcmtlciwgdHlwZSBUaXBWaWV3IH0gZnJvbSAnLi4vdWkvdWknXG5pbXBvcnQgeyBCdWlsZGluZyB9IGZyb20gJy4vYnVpbGRpbmcnXG5pbXBvcnQgeyBDaHVua01hbmFnZXIgfSBmcm9tICcuL2NodW5rcydcbmltcG9ydCB7IENPTkZJRywgU0VBX0xFVkVMIH0gZnJvbSAnLi9jb25maWcnXG5pbXBvcnQgeyBDUkVBVFVSRV9OQU1FUywgQ3JlYXR1cmVzLCB0eXBlIENyZWF0dXJlLCB0eXBlIENyZWF0dXJlQ3R4LCB0eXBlIEtpbmQgfSBmcm9tICcuL2NyZWF0dXJlcydcbmltcG9ydCB7IEZ4IH0gZnJvbSAnLi9meCdcbmltcG9ydCB7IEhPVEJBUiwgSW52ZW50b3J5IH0gZnJvbSAnLi9pbnZlbnRvcnknXG5pbXBvcnQgeyBJVEVNUywgdHlwZSBJdGVtSWQsIHR5cGUgUmVjaXBlLCB0eXBlIFN0YXRpb24gfSBmcm9tICcuL2l0ZW1zJ1xuaW1wb3J0IHsgc2VlZEZyb21TdHJpbmcgfSBmcm9tICcuL25vaXNlJ1xuaW1wb3J0IHsgUElFQ0VTLCBib3hlc092ZXJsYXAsIGRvb3JMZWFmQm94LCBkb29yU2lkZSwgcGllY2VCb3gsIHBsYWNlbWVudEJveCwgc25hcFBpZWNlLCB0eXBlIFBpZWNlLCB0eXBlIFBsYWNlbWVudCB9IGZyb20gJy4vcGllY2VzJ1xuaW1wb3J0IHsgV29ybGRQaHlzaWNzLCB0eXBlIEhpdCB9IGZyb20gJy4vcGh5c2ljcydcbmltcG9ydCB7IFBsYXllciwgaGVsZE1vZGVsIH0gZnJvbSAnLi9wbGF5ZXInXG5pbXBvcnQgeyBSRVNURUQsIGFkZFhwLCBpc0NvbWZvcnRhYmxlLCBuZXdTa2lsbHMsIHBhcnNlU2tpbGxzLCBza2lsbEJvbnVzLCB3YXZlRm9yLCBXQVZFX0JVUlNUX0dBUCwgV0FWRV9CVVJTVF9TSVpFLCB4cFRvTmV4dCwgdHlwZSBTa2lsbElkLCB0eXBlIFNraWxscywgdHlwZSBXYXZlLCB0eXBlIFdhdmVLaW5kIH0gZnJvbSAnLi9wcm9ncmVzcydcbmltcG9ydCB7IHN0YWdlRm9yTmlnaHQsIHN0YWdlVGFza3MgfSBmcm9tICcuL3N0YWdlcydcbmltcG9ydCB7IFBPSV9CTFVSQiwgUE9JX05BTUVTIH0gZnJvbSAnLi9wb2knXG5pbXBvcnQgeyBCVUlMREVSX0tFWVMsIFJFUywgYnVpbGRSZXNvdXJjZSwgbmV3QnVpbGRlcnMsIHJvbGxEcm9wcywgdHlwZSBSZXNvdXJjZSB9IGZyb20gJy4vcmVzb3VyY2VzJ1xuaW1wb3J0IHsgZGlnUG93ZXIsIG5lZWRlZFRvb2wsIG92ZXJsYXBBbGxvd2VkLCBwaWVjZVBvd2VyLCByZWdyb3dEZWxheSwgcmVzb3VyY2VQb3dlciwgc2FtZUVkZ2UgfSBmcm9tICcuL3J1bGVzJ1xuaW1wb3J0IHsgTUFQX1RJTEUsIE1hcFNjcmVlbiwgdGlsZUtleSwgdHlwZSBNYXBWaWV3IH0gZnJvbSAnLi4vdWkvbWFwJ1xuaW1wb3J0IHsgUElOX0NPTE9SUywgUElOX1JFQUNILCBQaW5CZWFjb25zLCBXYXlwb2ludHMgfSBmcm9tICcuL3dheXBvaW50cydcbmltcG9ydCB7IERBWV9TRUNPTkRTLCBFbnZpcm9ubWVudCwgY2xvY2tUZXh0IH0gZnJvbSAnLi9za3knXG5pbXBvcnQgeyBESUZGSUNVTFRZLCBNQVhfU1RBVCwgZWF0LCBmcmVzaFN0YXRzLCBodXJ0LCB0aWNrU3RhdHMsIHR5cGUgU3RhdHMgfSBmcm9tICcuL3N1cnZpdmFsJ1xuaW1wb3J0IHsgVGVycmFpbiB9IGZyb20gJy4vdGVycmFpbidcbmltcG9ydCB7IHR1bmluZyB9IGZyb20gJy4vdHVuaW5nJ1xuaW1wb3J0IHsgZGVsZXRlV29ybGQsIGxvYWRXb3JsZCwgc3RvcmVXb3JsZCwgdHlwZSBXb3JsZFNhdmUgfSBmcm9tICcuL3dvcmxkc2F2ZSdcblxudHlwZSBTdGF0ZSA9ICd0aXRsZScgfCAncGxheScgfCAnaW52ZW50b3J5JyB8ICdtYXAnIHwgJ3BhdXNlJyB8ICdkZWFkJ1xuXG5leHBvcnQgY29uc3QgVElQUzogeyBpZDogc3RyaW5nOyB0ZXh0OiBzdHJpbmc7IHRvdWNoOiBzdHJpbmcgfVtdID0gW1xuICB7IGlkOiAnbW92ZScsIHRleHQ6ICdNb3ZlIHdpdGggV0FTRCBhbmQgbG9vayBhcm91bmQgd2l0aCB0aGUgbW91c2UuJywgdG91Y2g6ICdEcmFnIHRoZSBsZWZ0IHN0aWNrIHRvIG1vdmUgYW5kIHN3aXBlIHRoZSByaWdodCBzaWRlIHRvIGxvb2suJyB9LFxuICB7IGlkOiAnZ2F0aGVyJywgdGV4dDogJ0hvbGQgbGVmdC1jbGljayB0byBnYXRoZXIg4oCUIHB1bmNoIGEgdHJlZSBmb3Igd29vZCBhbmQgcHVsbCBmaWJlciBncmFzcy4nLCB0b3VjaDogJ0hvbGQgTUlORSB0byBnYXRoZXIg4oCUIHB1bmNoIGEgdHJlZSBmb3Igd29vZCBhbmQgcHVsbCBmaWJlciBncmFzcy4nIH0sXG4gIHsgaWQ6ICdjcmFmdCcsIHRleHQ6ICdQcmVzcyBFIHRvIG9wZW4geW91ciBwYWNrIGFuZCBjcmFmdCBhIFN0b25lIEF4ZSBvciBQaWNrYXhlLicsIHRvdWNoOiAnVGFwIFBBQ0sgdG8gb3BlbiB5b3VyIHBhY2sgYW5kIGNyYWZ0IGEgU3RvbmUgQXhlIG9yIFBpY2theGUuJyB9LFxuICB7IGlkOiAnYmVuY2gnLCB0ZXh0OiAnQ3JhZnQgYSBXb3JrYmVuY2gsIHBpY2sgaXQgb24gdGhlIGhvdGJhciBhbmQgcmlnaHQtY2xpY2sgdG8gcGxhY2UgaXQuJywgdG91Y2g6ICdDcmFmdCBhIFdvcmtiZW5jaCwgcGljayBpdCBvbiB0aGUgaG90YmFyIGFuZCB0YXAgVVNFIHRvIHBsYWNlIGl0LicgfSxcbiAgeyBpZDogJ2J1aWxkJywgdGV4dDogJ0Jlc2lkZSB0aGUgd29ya2JlbmNoLCBjcmFmdCBGb3VuZGF0aW9ucyBhbmQgV2FsbHMgYW5kIHJhaXNlIGEgc2hlbHRlci4nLCB0b3VjaDogJ0Jlc2lkZSB0aGUgd29ya2JlbmNoLCBjcmFmdCBGb3VuZGF0aW9ucyBhbmQgV2FsbHMgYW5kIHJhaXNlIGEgc2hlbHRlci4nIH0sXG4gIHsgaWQ6ICdmaXJlJywgdGV4dDogJ1BsYWNlIGEgQ2FtcGZpcmUgYmVmb3JlIGRhcmsg4oCUIGl0IHdhcmRzIG9mZiB0aGUgSG9sbG93IGFuZCBzZXRzIHlvdXIgcmVzcGF3bi4nLCB0b3VjaDogJ1BsYWNlIGEgQ2FtcGZpcmUgYmVmb3JlIGRhcmsg4oCUIGl0IHdhcmRzIG9mZiB0aGUgSG9sbG93IGFuZCBzZXRzIHlvdXIgcmVzcGF3bi4nIH0sXG5dXG5cbmNvbnN0IENSRUFUSVZFX0hPVEJBUjogSXRlbUlkW10gPSBbJ3N0b25lX2Jsb2NrJywgJ2ZvdW5kYXRpb24nLCAnd29vZF9mbG9vcicsICd3b29kX3dhbGwnLCAnd29vZF9yYW1wJywgJ3dvb2RfcGlsbGFyJywgJ2NhbXBmaXJlJywgJ2NyeXN0YWxfcGlja2F4ZScsICdzdG9uZV9zaG92ZWwnXVxuXG5jb25zdCB0bXBWID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3QgdG1wVjIgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG5jb25zdCBzY3JWID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuY29uc3QgVVAgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAxLCAwKVxuY29uc3QgV0FWRV9LSU5EOiBSZWNvcmQ8V2F2ZUtpbmQsIEtpbmQ+ID0geyB3b2xmOiAnd29sZicsIGdob3VsOiAnaG9sbG93Jywgd2VyZXdvbGY6ICdob3dsZXInIH1cbmNvbnN0IEFUVEFDS19DQVVTRTogUGFydGlhbDxSZWNvcmQ8S2luZCwgc3RyaW5nPj4gPSB7IHdvbGY6ICdNYXVsZWQgYnkgYSBHcmV5IFdvbGYnLCBob2xsb3c6ICdUYWtlbiBieSBhIEhvbGxvdycsIGhvd2xlcjogJ1Rvcm4gYXBhcnQgYnkgdGhlIEVsZGVyIEhvd2xlcicsIHN0YWc6ICdHb3JlZCBieSBhIEdyZWF0IFN0YWcnIH1cbnR5cGUgQXJyb3cgPSB7XG4gIG9iajogVEhSRUUuT2JqZWN0M0RcbiAgcG9zOiBUSFJFRS5WZWN0b3IzXG4gIHZlbDogVEhSRUUuVmVjdG9yM1xuICBsaWZlOiBudW1iZXJcbiAgc3R1Y2s6IGJvb2xlYW5cbiAgZG1nOiBudW1iZXJcbiAgLyoqIEZsaWdodC9lbWJlZCBkaXJlY3Rpb24gKHVuaXQpLiAqL1xuICBkaXI6IFRIUkVFLlZlY3RvcjNcbiAgLyoqIEltcGFjdCB3b2JibGUgdGltZSBsZWZ0IChzKS4gKi9cbiAgd29iYmxlOiBudW1iZXJcbiAgLyoqIFRpbWVycyBmb3IgdGhlIHJlY292ZXJ5IGdsaW50IGFuZCBzdXBwb3J0IHJlLWNoZWNrLiAqL1xuICBnbGludDogbnVtYmVyXG4gIHN1cHBvcnQ6IG51bWJlclxuICAvKiogS25vY2tlZCBsb29zZTogZmFsbGluZyB0byB0aGUgZ3JvdW5kLiAqL1xuICBmYWxsaW5nOiBib29sZWFuXG4gIC8qKiBCZWluZyBwdWxsZWQgdG93YXJkIHRoZSBwbGF5ZXIuICovXG4gIG1hZ25ldDogbnVtYmVyXG59XG4vKiogU3R1Y2sgYXJyb3dzIGxhc3QgdGhpcyBsb25nIChzKSBhbmQgYXQgbW9zdCB0aGlzIG1hbnkgc3RheSBpbiB0aGUgd29ybGQuICovXG5jb25zdCBBUlJPV19LRUVQID0gMTgwXG5jb25zdCBBUlJPV19NQVhfU1RVQ0sgPSAzMFxuY29uc3QgQVJST1dfUElDS1VQID0gMy4yXG5jb25zdCBBUlJPV19DSEVTVCA9IG5ldyBUSFJFRS5WZWN0b3IzKClcbnR5cGUgV2F2ZVJ1biA9IHsgZGVmOiBXYXZlOyBxdWV1ZTogV2F2ZUtpbmRbXTsgYnVyc3RUOiBudW1iZXI7IGFsaXZlOiBTZXQ8Q3JlYXR1cmU+OyB0b3RhbDogbnVtYmVyIH1cblxuZXhwb3J0IGNsYXNzIEdhbWUge1xuICByZWFkb25seSBzdG9yZSA9IG5ldyBTYXZlU3RvcmUoKVxuICByZWFkb25seSByZW5kZXJlcjogUmVuZGVyZXJcbiAgcmVhZG9ubHkgc2NlbmUgPSBuZXcgVEhSRUUuU2NlbmUoKVxuICByZWFkb25seSBpbnB1dDogSW5wdXRcbiAgcmVhZG9ubHkgYXVkaW8gPSBuZXcgQXVkaW8oKVxuICByZWFkb25seSBlbnY6IEVudmlyb25tZW50XG4gIHJlYWRvbmx5IGZ4ID0gbmV3IEZ4KClcbiAgcmVhZG9ubHkgYnVpbGRpbmcgPSBuZXcgQnVpbGRpbmcoKVxuICByZWFkb25seSBjcmVhdHVyZXMgPSBuZXcgQ3JlYXR1cmVzKClcbiAgcmVhZG9ubHkgcGxheWVyOiBQbGF5ZXJcbiAgaW52ZW50b3J5ID0gbmV3IEludmVudG9yeSgpXG4gIHN0YXRzOiBTdGF0cyA9IGZyZXNoU3RhdHMoKVxuICB0ZXJyYWluITogVGVycmFpblxuICBjaHVua3MhOiBDaHVua01hbmFnZXJcbiAgcGh5c2ljcyE6IFdvcmxkUGh5c2ljc1xuICByZWFkb25seSB1aTogVUlcbiAgcmVhZG9ubHkgdG91Y2g6IFRvdWNoQ29udHJvbHMgfCBudWxsXG4gIHByaXZhdGUgbG9vcDogR2FtZUxvb3BcbiAgc3RhdGU6IFN0YXRlID0gJ3RpdGxlJ1xuICBjb25maWc6IFNhbmRib3hDb25maWdcbiAgc2VlZFRleHQgPSAnJ1xuICB0aW1lID0gMC4zXG4gIGRheSA9IDFcbiAgd29ybGRTZWNvbmRzID0gMFxuICBzZWxlY3RlZCA9IDBcbiAgcm90T2Zmc2V0ID0gMFxuICByZWFkb25seSBoYXJ2ZXN0ZWQgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpXG4gIHByaXZhdGUgZXh0cmFjdGVkID0gbmV3IFNldDxzdHJpbmc+KClcbiAgcmVhZG9ubHkgZGlzY292ZXJlZCA9IG5ldyBTZXQ8c3RyaW5nPigpXG4gIC8qKiBFeHBsb3JlZCA2NCBtIG1hcCB0aWxlcy4gKi9cbiAgcmVhZG9ubHkgZXhwbG9yZWQgPSBuZXcgU2V0PG51bWJlcj4oKVxuICByZWFkb25seSB3YXlwb2ludHMgPSBuZXcgV2F5cG9pbnRzKClcbiAgcHJpdmF0ZSBiZWFjb25zITogUGluQmVhY29uc1xuICBwcml2YXRlIG1hcCE6IE1hcFNjcmVlblxuICAvKiogQ2hlc3QgY3VycmVudGx5IHNob3duIGluIHRoZSBpbnZlbnRvcnkgc2NyZWVuLiAqL1xuICBwcml2YXRlIGNoZXN0VWlkOiBudW1iZXIgfCBudWxsID0gbnVsbFxuICBwcml2YXRlIHNoZWx0ZXJlZCA9IGZhbHNlXG4gIHByaXZhdGUgbWFwVmlld1QgPSAwXG4gIHByaXZhdGUgdGlwc0RvbmUgPSBuZXcgU2V0PHN0cmluZz4oKVxuICBwcml2YXRlIGFycm93VGlwU2hvd24gPSBmYWxzZVxuICB3b3JsZFNwYXduID0gbmV3IFRIUkVFLlZlY3RvcjMoKVxuICBzcGF3blBvaW50OiBUSFJFRS5WZWN0b3IzIHwgbnVsbCA9IG51bGxcbiAgdGFyZ2V0OiBIaXQgfCBudWxsID0gbnVsbFxuICBwcml2YXRlIHBsYWNlbWVudDogeyBpZDogc3RyaW5nOyBwOiBQbGFjZW1lbnQ7IHZhbGlkOiBib29sZWFuIH0gfCBudWxsID0gbnVsbFxuICBwcml2YXRlIHN3aW5nQ2QgPSAwXG4gIHByaXZhdGUgaW1wYWN0SW4gPSAtMVxuICBwcml2YXRlIHVzZUNkID0gMFxuICBwcml2YXRlIGRpZ0FjYyA9IDBcbiAgcHJpdmF0ZSB0aW1lcnMgPSB7IHJlZ3JvdzogMCwgZGlzY292ZXI6IDAsIHRpcHM6IDAsIHNhdmU6IDMwLCBodWQ6IDAsIGVtYmVyczogMCB9XG4gIHByaXZhdGUgbGlnaHRzOiBUSFJFRS5Qb2ludExpZ2h0W10gPSBbXVxuICBwcml2YXRlIHdhcmRzQ2FjaGU6IHsgeDogbnVtYmVyOyB6OiBudW1iZXI7IHI6IG51bWJlciB9W10gPSBbXVxuICBwcml2YXRlIHdhcmRzRGlydHkgPSB0cnVlXG4gIHByaXZhdGUgZXhwZWN0VW5sb2NrID0gZmFsc2VcbiAgcHJpdmF0ZSB0aXRsZUFuZ2xlID0gMFxuICBwcml2YXRlIG1vdmVkID0gMFxuICBwcml2YXRlIGxhc3RQb3MgPSBuZXcgVEhSRUUuVmVjdG9yMygpXG4gIHByaXZhdGUgY291bnRlcnMgPSB7IHdvb2Q6IDAsIGZpYmVyOiAwLCB0b29sczogMCB9XG4gIHByaXZhdGUgaW52RGlydHkgPSB0cnVlXG4gIHByaXZhdGUgbGFzdENhdXNlID0gJydcbiAgcHJpdmF0ZSBsYXN0U3RhdGlvbnMgPSBuZXcgU2V0PFN0YXRpb24+KClcbiAgcmVhZG9ubHkgYXNzZXRzID0gbmV3IEFzc2V0cygpXG4gIHJlYWRvbmx5IHN0YWdlczogU3RhZ2VMb2FkZXJcbiAgc2tpbGxzOiBTa2lsbHMgPSBuZXdTa2lsbHMoKVxuICByZXN0ZWQgPSAwXG4gIHByaXZhdGUgd2FybSA9IDBcbiAgcHJpdmF0ZSB3YXZlOiBXYXZlUnVuIHwgbnVsbCA9IG51bGxcbiAgbGFzdFdhdmUgPSAwXG4gIG5pZ2h0c1N1cnZpdmVkID0gMFxuICBwcml2YXRlIGlzTmlnaHQgPSBmYWxzZVxuICBwcml2YXRlIGFycm93czogQXJyb3dbXSA9IFtdXG4gIHByaXZhdGUgZHJhd1QgPSAwXG4gIHByaXZhdGUgaGl0U3RvcCA9IDBcbiAgcHJpdmF0ZSBzaGFrZSA9IDBcbiAgcHJpdmF0ZSBmcmFtZU1zID0gMTZcbiAgcHJpdmF0ZSBwb3BzOiB7IG9iajogVEhSRUUuT2JqZWN0M0Q7IHQ6IG51bWJlciB9W10gPSBbXVxuICBwcml2YXRlIHBlbmRpbmdFbnRlcjogKCgpID0+IHZvaWQpIHwgbnVsbCA9IG51bGxcbiAgcHJpdmF0ZSBmaXJlTmVhciA9IDBcbiAgcHJpdmF0ZSBjdHghOiBDcmVhdHVyZUN0eFxuICBwcml2YXRlIGZvdk5vdyA9IDc1XG4gIHByaXZhdGUgZnJhbWVOID0gMFxuXG4gIGNvbnN0cnVjdG9yKGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQsIHJvb3Q6IEhUTUxFbGVtZW50KSB7XG4gICAgY29uc3QgcyA9IHRoaXMuc3RvcmUuZGF0YVxuICAgIHRoaXMucmVuZGVyZXIgPSBuZXcgUmVuZGVyZXIoY2FudmFzLCBzLnF1YWxpdHkpXG4gICAgdGhpcy5pbnB1dCA9IG5ldyBJbnB1dChjYW52YXMpXG4gICAgdGhpcy5lbnYgPSBuZXcgRW52aXJvbm1lbnQodGhpcy5zY2VuZSlcbiAgICB0aGlzLnBsYXllciA9IG5ldyBQbGF5ZXIocy5mb3YpXG4gICAgdGhpcy5zY2VuZS5hZGQodGhpcy5meC5ncm91cCwgdGhpcy5idWlsZGluZy5ncm91cCwgdGhpcy5jcmVhdHVyZXMuZ3JvdXAsIHRoaXMucGxheWVyLmNhbWVyYSlcbiAgICB0aGlzLmJlYWNvbnMgPSBuZXcgUGluQmVhY29ucygoeCwgeikgPT4gdGhpcy50ZXJyYWluPy5oZWlnaHQoeCwgeikgPz8gMClcbiAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmJlYWNvbnMuZ3JvdXApXG4gICAgdGhpcy5meC5ncm91bmQgPSAoeCwgeikgPT4gKHRoaXMudGVycmFpbiA/IHRoaXMudGVycmFpbi5oZWlnaHQoeCwgeikgOiAtMWU5KVxuICAgIHRoaXMuZngub25Qcm9wTGFuZGVkID0gKGF0LCBzaXplKSA9PiB0aGlzLm9uVHJlZUxhbmRlZChhdCwgc2l6ZSlcbiAgICB0aGlzLnN0YWdlcyA9IG5ldyBTdGFnZUxvYWRlcihzdGFnZVRhc2tzKHsgYXNzZXRzOiB0aGlzLmFzc2V0cywgYXVkaW86IHRoaXMuYXVkaW8sIG9uQXJtczogZyA9PiB0aGlzLnBsYXllci5zZXRBcm1zKGcpIH0pKVxuICAgIHRoaXMuc3RhZ2VzLmJ1c3kgPSAoKSA9PiB0aGlzLmlzQnVzeSgpXG4gICAgdGhpcy5zdGFnZXMub25Qcm9ncmVzcygoaWQsIHByKSA9PiB0aGlzLm9uU3RhZ2VQcm9ncmVzcyhpZCwgcHIpKVxuICAgIHRoaXMuZm92Tm93ID0gcy5mb3ZcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IDY7IGkrKykge1xuICAgICAgY29uc3QgbCA9IG5ldyBUSFJFRS5Qb2ludExpZ2h0KDB4ZmZhODYwLCAwLCAxNCwgMS42KVxuICAgICAgbC5jYXN0U2hhZG93ID0gZmFsc2VcbiAgICAgIHRoaXMubGlnaHRzLnB1c2gobClcbiAgICAgIHRoaXMuc2NlbmUuYWRkKGwpXG4gICAgfVxuICAgIGNvbnN0IHNhdmUgPSBsb2FkV29ybGQoKVxuICAgIHRoaXMuY29uZmlnID0gc2F2ZSA/IHsgc2VlZDogc2F2ZS5zZWVkLCBtb2RlOiBzYXZlLm1vZGUsIGRpZmZpY3VsdHk6IHNhdmUuZGlmZmljdWx0eSB9IDogcy5zYW5kYm94XG4gICAgdGhpcy51aSA9IG5ldyBVSShyb290LCB7XG4gICAgICBjb250aW51ZVdvcmxkOiAoKSA9PiB0aGlzLmNvbnRpbnVlV29ybGQoKSxcbiAgICAgIG5ld1dvcmxkOiBjZmcgPT4gdGhpcy5uZXdXb3JsZChjZmcpLFxuICAgICAgcmVzdW1lOiAoKSA9PiB0aGlzLnJlc3VtZSgpLFxuICAgICAgc2F2ZTogKCkgPT4gdGhpcy5zYXZlV29ybGQodHJ1ZSksXG4gICAgICBxdWl0OiAoKSA9PiB0aGlzLnF1aXRUb1RpdGxlKCksXG4gICAgICByZXNldDogKCkgPT4gdGhpcy5uZXdXb3JsZCh0aGlzLmNvbmZpZyksXG4gICAgICByZXNwYXduOiAoKSA9PiB0aGlzLnJlc3Bhd24oKSxcbiAgICAgIHNldHRpbmdzOiBwYXRjaCA9PiB0aGlzLmFwcGx5U2V0dGluZ3MocGF0Y2gpLFxuICAgICAgY3JhZnQ6IChyLCBuKSA9PiB0aGlzLmNyYWZ0KHIsIG4pLFxuICAgICAgY2xvc2VJbnZlbnRvcnk6ICgpID0+IHRoaXMuY2xvc2VJbnZlbnRvcnkoKSxcbiAgICAgIHNlbGVjdFNsb3Q6IGkgPT4gdGhpcy5zZWxlY3QoaSksXG4gICAgICBpbnZDaGFuZ2VkOiAoKSA9PiAodGhpcy5pbnZEaXJ0eSA9IHRydWUpLFxuICAgICAgZGlzbWlzc1RpcHM6ICgpID0+IHRoaXMuc3RvcmUudXBkYXRlKHsgdHV0b3JpYWxEb25lOiB0cnVlIH0pLFxuICAgICAgdWlTb3VuZDogbmFtZSA9PiB0aGlzLmF1ZGlvLnBsYXkobmFtZSksXG4gICAgfSlcbiAgICB0aGlzLm1hcCA9IG5ldyBNYXBTY3JlZW4ocm9vdCwgKCkgPT4gdGhpcy50ZXJyYWluID8/IG51bGwsICgpID0+IHRoaXMuY2xvc2VNYXAoKSwge1xuICAgICAgYWRkOiAoeCwgeikgPT4gdGhpcy5hZGRQaW4oeCwgeiksXG4gICAgICByZW1vdmU6IGlkID0+IHRoaXMucmVtb3ZlUGluKGlkKSxcbiAgICAgIGNsZWFyOiAoKSA9PiB0aGlzLmNsZWFyUGlucygpLFxuICAgIH0pXG4gICAgdGhpcy50b3VjaCA9IG1hdGNoTWVkaWEoJyhwb2ludGVyOiBjb2Fyc2UpJykubWF0Y2hlcyA/IG5ldyBUb3VjaENvbnRyb2xzKHJvb3QsIHRoaXMuaW5wdXQsIHsgaW52ZW50b3J5OiAoKSA9PiB0aGlzLm9wZW5JbnZlbnRvcnkoKSwgcGF1c2U6ICgpID0+IHRoaXMucGF1c2UoKSwgbWFwOiAoKSA9PiAodGhpcy5zdGF0ZSA9PT0gJ21hcCcgPyB0aGlzLmNsb3NlTWFwKCkgOiB0aGlzLm9wZW5NYXAoKSkgfSkgOiBudWxsXG4gICAgdGhpcy5zZXR1cFdvcmxkKHRoaXMuY29uZmlnLnNlZWQpXG4gICAgdGhpcy5hcHBseVNldHRpbmdzKHt9KVxuICAgIHRoaXMuc2hvd1RpdGxlKClcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdwb2ludGVybG9ja2NoYW5nZScsICgpID0+IHRoaXMub25Mb2NrQ2hhbmdlKCkpXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmxvY2tlcnJvcicsICgpID0+ICh0aGlzLmlucHV0LmZyZWVMb29rID0gdHJ1ZSkpXG4gICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuc3RhdGUgPT09ICdwbGF5JyAmJiAhdGhpcy5pbnB1dC5sb2NrZWQpIHRoaXMuaW5wdXQubG9ja1BvaW50ZXIoKVxuICAgIH0pXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ3BhZ2VoaWRlJywgKCkgPT4gdGhpcy5hdXRvc2F2ZSgpKVxuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3Zpc2liaWxpdHljaGFuZ2UnLCAoKSA9PiB7XG4gICAgICBpZiAoZG9jdW1lbnQuaGlkZGVuKSB0aGlzLmF1dG9zYXZlKClcbiAgICB9KVxuICAgIHRoaXMubG9vcCA9IG5ldyBHYW1lTG9vcCh7IHN0ZXA6IGR0ID0+IHRoaXMuc3RlcChkdCksIHJlbmRlcjogKGEsIGYpID0+IHRoaXMucmVuZGVyKGEsIGYpIH0sIDYwKVxuICB9XG5cbiAgc3RhcnQoKTogdm9pZCB7XG4gICAgdGhpcy5sb29wLnN0YXJ0KClcbiAgfVxuXG4gIC8qKiBMb2FkcyBvbmx5IHdoYXQgdGhlIHRpdGxlIG5lZWRzLCB0aGVuIHN0YXJ0cyB0aGUgZmlyc3QgcGxheWFibGUgc2VnbWVudCBiZWhpbmQgaXQuICovXG4gIGFzeW5jIGxvYWRUaXRsZShvblByb2dyZXNzOiAocDogbnVtYmVyKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgb2ZmID0gdGhpcy5zdGFnZXMub25Qcm9ncmVzcygoaWQsIHByKSA9PiBpZCA9PT0gJ3RpdGxlJyAmJiBvblByb2dyZXNzKHByKSlcbiAgICBhd2FpdCB0aGlzLnN0YWdlcy5yZXF1aXJlKCd0aXRsZScpXG4gICAgb2ZmKClcbiAgICB2b2lkIHRoaXMuc3RhZ2VzLnJlcXVpcmUoJ2RheScpLnRoZW4oKCkgPT4gdGhpcy5zdGFnZXMucHJlZmV0Y2goJ25pZ2h0MScpKVxuICB9XG5cbiAgcHJpdmF0ZSBvblN0YWdlUHJvZ3Jlc3MoaWQ6IFN0YWdlSWQsIHByOiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoaWQgPT09ICdkYXknICYmIHRoaXMucGVuZGluZ0VudGVyKSB0aGlzLnVpLnNldFN0YWdlU3RhdHVzKGBQcmVwYXJpbmcgdGhlIHdpbGRz4oCmICR7TWF0aC5yb3VuZChwciAqIDEwMCl9JWApXG4gIH1cblxuICAvKiogUnVucyBgZm5gIG9uY2UgdGhlIGZpcnN0IHBsYXlhYmxlIHNlZ21lbnQgaXMgbG9hZGVkIChzaG93cyBhIHJlY292ZXJhYmxlIGxvYWRpbmcgc3RhdGUpLiAqL1xuICBwcml2YXRlIGdhdGUoZm46ICgpID0+IHZvaWQpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5zdGFnZXMucmVhZHkoJ2RheScpKSB7XG4gICAgICBmbigpXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgdGhpcy5wZW5kaW5nRW50ZXIgPSBmblxuICAgIHRoaXMudWkuc2V0U3RhZ2VTdGF0dXMoYFByZXBhcmluZyB0aGUgd2lsZHPigKYgJHtNYXRoLnJvdW5kKHRoaXMuc3RhZ2VzLnByb2dyZXNzKCdkYXknKSAqIDEwMCl9JWApXG4gICAgdm9pZCB0aGlzLnN0YWdlcy5yZXF1aXJlKCdkYXknKS50aGVuKCgpID0+IHtcbiAgICAgIGNvbnN0IGYgPSB0aGlzLnBlbmRpbmdFbnRlclxuICAgICAgdGhpcy5wZW5kaW5nRW50ZXIgPSBudWxsXG4gICAgICB0aGlzLnVpLnNldFN0YWdlU3RhdHVzKG51bGwpXG4gICAgICBmPy4oKVxuICAgIH0pXG4gIH1cblxuICAvKiogQmFja2dyb3VuZCBsb2FkaW5nIHlpZWxkcyB3aGlsZSB0aGUgZ2FtZSBpcyB2aXN1YWxseSBidXN5LiAqL1xuICBwcml2YXRlIGlzQnVzeSgpOiBib29sZWFuIHtcbiAgICBpZiAodGhpcy5zdGF0ZSAhPT0gJ3BsYXknKSByZXR1cm4gZmFsc2VcbiAgICByZXR1cm4gdGhpcy5meC5hY3RpdmUgPiAzODAgfHwgdGhpcy5jcmVhdHVyZXMuaG9zdGlsZXMgPj0gNCB8fCB0aGlzLmZyYW1lTXMgPiAyNiB8fCAhIXRoaXMud2F2ZT8uZGVmLmJvc3NcbiAgfVxuXG4gIC8vIOKUgOKUgOKUgCBXb3JsZCBsaWZlY3ljbGUg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gIHByaXZhdGUgc2V0dXBXb3JsZChzZWVkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5jaHVua3MpIHtcbiAgICAgIHRoaXMuY2h1bmtzLmNsZWFyKClcbiAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKHRoaXMuY2h1bmtzLmdyb3VwKVxuICAgIH1cbiAgICB0aGlzLnNlZWRUZXh0ID0gc2VlZFxuICAgIHRoaXMudGVycmFpbiA9IG5ldyBUZXJyYWluKHNlZWRGcm9tU3RyaW5nKHNlZWQpKVxuICAgIHRoaXMuY2h1bmtzID0gbmV3IENodW5rTWFuYWdlcih0aGlzLnRlcnJhaW4pXG4gICAgdGhpcy5jaHVua3MucmFkaXVzID0gdGhpcy5zdG9yZS5kYXRhLnZpZXdEaXN0YW5jZVxuICAgIHRoaXMuY2h1bmtzLmdyYXNzRW5hYmxlZCA9IHRoaXMuc3RvcmUuZGF0YS5xdWFsaXR5ICE9PSAnbG93J1xuICAgIHRoaXMuY2h1bmtzLmhpZGRlbiA9IHIgPT4gdGhpcy5oYXJ2ZXN0ZWQuaGFzKHIua2V5KSB8fCB0aGlzLmV4dHJhY3RlZC5oYXMoci5rZXkpXG4gICAgdGhpcy5waHlzaWNzID0gbmV3IFdvcmxkUGh5c2ljcyh0aGlzLnRlcnJhaW4sIHRoaXMuY2h1bmtzLCB0aGlzLmJ1aWxkaW5nKVxuICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMuY2h1bmtzLmdyb3VwKVxuICAgIHRoaXMud29ybGRTcGF3biA9IHRoaXMudGVycmFpbi5maW5kU3Bhd24oKVxuICAgIHRoaXMuY2h1bmtzLmVuc3VyZU5lYXIodGhpcy53b3JsZFNwYXduLngsIHRoaXMud29ybGRTcGF3bi56LCAxKVxuICB9XG5cbiAgcHJpdmF0ZSByZXNldFN0YXRlKGNmZzogU2FuZGJveENvbmZpZyk6IHZvaWQge1xuICAgIHRoaXMuY29uZmlnID0gY2ZnXG4gICAgdGhpcy5oYXJ2ZXN0ZWQuY2xlYXIoKVxuICAgIHRoaXMuZXh0cmFjdGVkLmNsZWFyKClcbiAgICB0aGlzLmRpc2NvdmVyZWQuY2xlYXIoKVxuICAgIHRoaXMuZXhwbG9yZWQuY2xlYXIoKVxuICAgIHRoaXMubWFwPy5yZXNldCh0aGlzLmV4cGxvcmVkKVxuICAgIHRoaXMud2F5cG9pbnRzLmNsZWFyKClcbiAgICB0aGlzLmJlYWNvbnM/LmNsZWFyKClcbiAgICB0aGlzLmNoZXN0VWlkID0gbnVsbFxuICAgIHRoaXMudGlwc0RvbmUuY2xlYXIoKVxuICAgIHRoaXMuYnVpbGRpbmcuY2xlYXIoKVxuICAgIHRoaXMuY3JlYXR1cmVzLmNsZWFyKClcbiAgICB0aGlzLmludmVudG9yeSA9IG5ldyBJbnZlbnRvcnkoKVxuICAgIHRoaXMuaW52ZW50b3J5LmluZmluaXRlID0gY2ZnLm1vZGUgPT09ICdjcmVhdGl2ZSdcbiAgICB0aGlzLnN0YXRzID0gZnJlc2hTdGF0cygpXG4gICAgdGhpcy50aW1lID0gMC4zXG4gICAgdGhpcy5kYXkgPSAxXG4gICAgdGhpcy53b3JsZFNlY29uZHMgPSAwXG4gICAgdGhpcy5zcGF3blBvaW50ID0gbnVsbFxuICAgIHRoaXMuc2VsZWN0ZWQgPSAwXG4gICAgdGhpcy5yb3RPZmZzZXQgPSAwXG4gICAgdGhpcy5jb3VudGVycyA9IHsgd29vZDogMCwgZmliZXI6IDAsIHRvb2xzOiAwIH1cbiAgICB0aGlzLndhcmRzRGlydHkgPSB0cnVlXG4gICAgdGhpcy5wbGF5ZXIuZmx5aW5nID0gZmFsc2VcbiAgICB0aGlzLm1vdmVkID0gMFxuICAgIHRoaXMuc2tpbGxzID0gbmV3U2tpbGxzKClcbiAgICB0aGlzLnJlc3RlZCA9IDBcbiAgICB0aGlzLndhcm0gPSAwXG4gICAgdGhpcy53YXZlID0gbnVsbFxuICAgIHRoaXMubGFzdFdhdmUgPSAwXG4gICAgdGhpcy5uaWdodHNTdXJ2aXZlZCA9IDBcbiAgICB0aGlzLmlzTmlnaHQgPSBmYWxzZVxuICAgIGZvciAoY29uc3QgYSBvZiB0aGlzLmFycm93cykgdGhpcy5zY2VuZS5yZW1vdmUoYS5vYmopXG4gICAgdGhpcy5hcnJvd3MubGVuZ3RoID0gMFxuICAgIHRoaXMuZnguY2xlYXIoKVxuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGl2ZUtpdCgpOiB2b2lkIHtcbiAgICBDUkVBVElWRV9IT1RCQVIuZm9yRWFjaCgoaWQsIGkpID0+ICh0aGlzLmludmVudG9yeS5zbG90c1tpXSA9IHsgaWQsIG46IElURU1TW2lkXS5zdGFjaywgLi4uKElURU1TW2lkXS50b29sID8geyBkdXI6IElURU1TW2lkXS50b29sIS5kdXJhYmlsaXR5IH0gOiB7fSkgfSkpXG4gICAgbGV0IGkgPSBIT1RCQVJcbiAgICBmb3IgKGNvbnN0IGlkIG9mIE9iamVjdC5rZXlzKElURU1TKSBhcyBJdGVtSWRbXSkge1xuICAgICAgaWYgKENSRUFUSVZFX0hPVEJBUi5pbmNsdWRlcyhpZCkgfHwgaSA+PSB0aGlzLmludmVudG9yeS5zbG90cy5sZW5ndGgpIGNvbnRpbnVlXG4gICAgICB0aGlzLmludmVudG9yeS5zbG90c1tpKytdID0geyBpZCwgbjogSVRFTVNbaWRdLnN0YWNrLCAuLi4oSVRFTVNbaWRdLnRvb2wgPyB7IGR1cjogSVRFTVNbaWRdLnRvb2whLmR1cmFiaWxpdHkgfSA6IHt9KSB9XG4gICAgfVxuICB9XG5cbiAgbmV3V29ybGQoY2ZnOiBTYW5kYm94Q29uZmlnKTogdm9pZCB7XG4gICAgdGhpcy5pbnB1dC5sb2NrUG9pbnRlcigpXG4gICAgdGhpcy5nYXRlKCgpID0+IHRoaXMubmV3V29ybGROb3coY2ZnKSlcbiAgfVxuXG4gIHByaXZhdGUgbmV3V29ybGROb3coY2ZnOiBTYW5kYm94Q29uZmlnKTogdm9pZCB7XG4gICAgZGVsZXRlV29ybGQoKVxuICAgIHRoaXMuc3RvcmUudXBkYXRlKHsgc2FuZGJveDogY2ZnIH0pXG4gICAgdGhpcy5zZXR1cFdvcmxkKGNmZy5zZWVkKVxuICAgIHRoaXMucmVzZXRTdGF0ZShjZmcpXG4gICAgaWYgKGNmZy5tb2RlID09PSAnY3JlYXRpdmUnKSB0aGlzLmNyZWF0aXZlS2l0KClcbiAgICBjb25zdCBzcCA9IHRoaXMud29ybGRTcGF3blxuICAgIHRoaXMucGxheWVyLnRlbGVwb3J0KHRtcFYuc2V0KHNwLngsIHNwLnkgKyAwLjMsIHNwLnopKVxuICAgIHRoaXMucGxheWVyLnlhdyA9IE1hdGguUEkgKiAwLjI1XG4gICAgdGhpcy5wbGF5ZXIucGl0Y2ggPSAtMC4wOFxuICAgIHRoaXMuZW50ZXJQbGF5KClcbiAgICB0aGlzLnNhdmVXb3JsZChmYWxzZSlcbiAgfVxuXG4gIGNvbnRpbnVlV29ybGQoKTogdm9pZCB7XG4gICAgaWYgKCFsb2FkV29ybGQoKSkgcmV0dXJuXG4gICAgdGhpcy5pbnB1dC5sb2NrUG9pbnRlcigpXG4gICAgdGhpcy5nYXRlKCgpID0+IHRoaXMuY29udGludWVOb3coKSlcbiAgfVxuXG4gIHByaXZhdGUgY29udGludWVOb3coKTogdm9pZCB7XG4gICAgY29uc3Qgc2F2ZSA9IGxvYWRXb3JsZCgpXG4gICAgaWYgKCFzYXZlKSByZXR1cm5cbiAgICB0aGlzLnNldHVwV29ybGQoc2F2ZS5zZWVkKVxuICAgIHRoaXMucmVzZXRTdGF0ZSh7IHNlZWQ6IHNhdmUuc2VlZCwgbW9kZTogc2F2ZS5tb2RlLCBkaWZmaWN1bHR5OiBzYXZlLmRpZmZpY3VsdHkgfSlcbiAgICBmb3IgKGNvbnN0IFtrLCB2XSBvZiBzYXZlLmVkaXRzKSB0aGlzLnRlcnJhaW4uZWRpdHMuc2V0KGssIHYpXG4gICAgZm9yIChjb25zdCBbaywgdl0gb2Ygc2F2ZS5oYXJ2ZXN0ZWQpIHRoaXMuaGFydmVzdGVkLnNldChrLCB2KVxuICAgIHRoaXMuYnVpbGRpbmcubG9hZChzYXZlLnBpZWNlcylcbiAgICB0aGlzLmJ1aWxkaW5nLmxvYWRTdG9yZXMoc2F2ZS5jaGVzdHMpXG4gICAgZm9yIChjb25zdCBrIG9mIHNhdmUuZXhwbG9yZWQgPz8gW10pIHRoaXMuZXhwbG9yZWQuYWRkKGspXG4gICAgdGhpcy53YXlwb2ludHMubG9hZChzYXZlLnBpbnMpXG4gICAgdGhpcy5iZWFjb25zLnN5bmModGhpcy53YXlwb2ludHMucGlucylcbiAgICB0aGlzLmludmVudG9yeS5sb2FkKHNhdmUuaW52ZW50b3J5KVxuICAgIHRoaXMuaW52ZW50b3J5LmluZmluaXRlID0gc2F2ZS5tb2RlID09PSAnY3JlYXRpdmUnXG4gICAgdGhpcy5zdGF0cyA9IHsgaGVhbHRoOiBzYXZlLnBsYXllci5oZWFsdGgsIGh1bmdlcjogc2F2ZS5wbGF5ZXIuaHVuZ2VyLCBzdGFtaW5hOiBzYXZlLnBsYXllci5zdGFtaW5hLCBzdGFtaW5hV2FpdDogMCB9XG4gICAgdGhpcy50aW1lID0gc2F2ZS50aW1lXG4gICAgdGhpcy5kYXkgPSBzYXZlLmRheVxuICAgIHRoaXMud29ybGRTZWNvbmRzID0gc2F2ZS53b3JsZFNlY29uZHNcbiAgICB0aGlzLnNlbGVjdGVkID0gc2F2ZS5ob3RiYXJcbiAgICBmb3IgKGNvbnN0IGQgb2Ygc2F2ZS5kaXNjb3ZlcmVkKSB0aGlzLmRpc2NvdmVyZWQuYWRkKGQpXG4gICAgZm9yIChjb25zdCB0IG9mIHNhdmUudGlwcykgdGhpcy50aXBzRG9uZS5hZGQodClcbiAgICB0aGlzLnNwYXduUG9pbnQgPSBzYXZlLnNwYXduID8gbmV3IFRIUkVFLlZlY3RvcjMoc2F2ZS5zcGF3bi54LCBzYXZlLnNwYXduLnksIHNhdmUuc3Bhd24ueikgOiBudWxsXG4gICAgdGhpcy5jaHVua3MuY2xlYXIoKVxuICAgIHRoaXMucGxheWVyLnRlbGVwb3J0KHRtcFYuc2V0KHNhdmUucGxheWVyLngsIHNhdmUucGxheWVyLnksIHNhdmUucGxheWVyLnopKVxuICAgIHRoaXMucGxheWVyLnlhdyA9IHNhdmUucGxheWVyLnlhd1xuICAgIHRoaXMucGxheWVyLnBpdGNoID0gc2F2ZS5wbGF5ZXIucGl0Y2hcbiAgICB0aGlzLnBsYXllci5mbHlpbmcgPSBzYXZlLnBsYXllci5mbHlpbmcgJiYgc2F2ZS5tb2RlID09PSAnY3JlYXRpdmUnXG4gICAgdGhpcy5za2lsbHMgPSBwYXJzZVNraWxscyhzYXZlLnNraWxscylcbiAgICB0aGlzLnJlc3RlZCA9IHNhdmUucmVzdGVkID8/IDBcbiAgICB0aGlzLmxhc3RXYXZlID0gc2F2ZS5sYXN0V2F2ZSA/PyAwXG4gICAgdGhpcy5uaWdodHNTdXJ2aXZlZCA9IHNhdmUubmlnaHRzU3Vydml2ZWQgPz8gMFxuICAgIHRoaXMuZW50ZXJQbGF5KClcbiAgfVxuXG4gIHByaXZhdGUgZW50ZXJQbGF5KCk6IHZvaWQge1xuICAgIHR1bmluZy5hY3RpdmF0ZSgncnVuJylcbiAgICBjb25zdCBwID0gdGhpcy5wbGF5ZXIuYm9keS5wb3NcbiAgICB0aGlzLmNodW5rcy5lbnN1cmVOZWFyKHAueCwgcC56LCAxKVxuICAgIGNvbnN0IGcgPSB0aGlzLnBoeXNpY3MuZ3JvdW5kQXQocC54LCBwLnosIHAueSArIDEuNSwgMC4zKVxuICAgIGlmIChwLnkgPCBnKSBwLnkgPSBnICsgMC4wMlxuICAgIHRoaXMucGxheWVyLnByZXYuY29weShwKVxuICAgIHRoaXMubGFzdFBvcy5jb3B5KHApXG4gICAgdGhpcy5zdGF0ZSA9ICdwbGF5J1xuICAgIHRoaXMuYXVkaW8udW5sb2NrKClcbiAgICB0aGlzLmlzTmlnaHQgPSB0aGlzLnRpbWUgPiAwLjc3IHx8IHRoaXMudGltZSA8IDAuMjJcbiAgICB0aGlzLmF1ZGlvLnBsYXlNdXNpYyh0aGlzLmlzTmlnaHQgPyAnbmlnaHQnIDogJ2RheScpXG4gICAgdGhpcy5hdWRpby5zdGFydEFtYmllbnQoKVxuICAgIHRoaXMudWkuc2V0U2tpbGxzKHRoaXMuc2tpbGxzKVxuICAgIC8vIE1ha2Ugc3VyZSB0aGUgc2VnbWVudCBmb3IgdG9uaWdodCBpcyBvbiBpdHMgd2F5LlxuICAgIHZvaWQgdGhpcy5zdGFnZXMucmVxdWlyZShzdGFnZUZvck5pZ2h0KHRoaXMuZGF5KSkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKVxuICAgIHRoaXMudWkuaGlkZVRpdGxlKClcbiAgICB0aGlzLnVpLnNldEh1ZCh0cnVlKVxuICAgIHRoaXMudWkuaGlkZURlYXRoKClcbiAgICB0aGlzLnVpLmhpZGVQYXVzZSgpXG4gICAgdGhpcy5pbnZEaXJ0eSA9IHRydWVcbiAgICB0aGlzLnJlZnJlc2hUaXBzKClcbiAgICB0aGlzLnRpbWVycy5zYXZlID0gMzBcbiAgfVxuXG4gIHByaXZhdGUgc2hvd1RpdGxlKCk6IHZvaWQge1xuICAgIHRoaXMuc3RhdGUgPSAndGl0bGUnXG4gICAgdGhpcy5hdWRpby5wbGF5TXVzaWMoJ3RpdGxlJylcbiAgICB0aGlzLnVpLnNldFdhdmUobnVsbClcbiAgICB0aGlzLnVpLnNldEJvc3NCYXIobnVsbCwgMClcbiAgICB0aGlzLnVpLnNldEJ1ZmZzKFtdKVxuICAgIGNvbnN0IHNhdmUgPSBsb2FkV29ybGQoKVxuICAgIHRoaXMudWkuc2V0SHVkKGZhbHNlKVxuICAgIHRoaXMudWkuc2hvd1RpdGxlKHtcbiAgICAgIHNhdmU6IHNhdmUgPyB7IHNlZWQ6IHNhdmUuc2VlZCwgbW9kZTogc2F2ZS5tb2RlLCBkaWZmaWN1bHR5OiBzYXZlLmRpZmZpY3VsdHksIGRheTogc2F2ZS5kYXksIHNhdmVkQXQ6IHNhdmUuc2F2ZWRBdCB9IDogbnVsbCxcbiAgICAgIGNvbmZpZzogdGhpcy5zdG9yZS5kYXRhLnNhbmRib3gsXG4gICAgICBzZXR0aW5nczogdGhpcy5zdG9yZS5kYXRhLFxuICAgIH0pXG4gIH1cblxuICBxdWl0VG9UaXRsZSgpOiB2b2lkIHtcbiAgICB0aGlzLnNhdmVXb3JsZChmYWxzZSlcbiAgICB0aGlzLnVpLmhpZGVQYXVzZSgpXG4gICAgdGhpcy51aS5jbG9zZUludmVudG9yeSgpXG4gICAgdGhpcy5tYXAuaGlkZSgpXG4gICAgaWYgKHRoaXMuY2hlc3RVaWQgIT09IG51bGwpIHRoaXMuYnVpbGRpbmcub3BlbkxpZHMuZGVsZXRlKHRoaXMuY2hlc3RVaWQpXG4gICAgdGhpcy5jaGVzdFVpZCA9IG51bGxcbiAgICB0aGlzLmNyZWF0dXJlcy5jbGVhcigpXG4gICAgdGhpcy5idWlsZGluZy5zaG93R2hvc3QobnVsbClcbiAgICB0aGlzLnNob3dUaXRsZSgpXG4gIH1cblxuICBwcml2YXRlIGJ1aWxkU2F2ZSgpOiBXb3JsZFNhdmUge1xuICAgIGNvbnN0IHAgPSB0aGlzLnBsYXllci5ib2R5LnBvc1xuICAgIHJldHVybiB7XG4gICAgICB2ZXJzaW9uOiAxLFxuICAgICAgc2VlZDogdGhpcy5zZWVkVGV4dCxcbiAgICAgIG1vZGU6IHRoaXMuY29uZmlnLm1vZGUsXG4gICAgICBkaWZmaWN1bHR5OiB0aGlzLmNvbmZpZy5kaWZmaWN1bHR5LFxuICAgICAgdGltZTogdGhpcy50aW1lLFxuICAgICAgZGF5OiB0aGlzLmRheSxcbiAgICAgIHBsYXllcjogeyB4OiBwLngsIHk6IHAueSwgejogcC56LCB5YXc6IHRoaXMucGxheWVyLnlhdywgcGl0Y2g6IHRoaXMucGxheWVyLnBpdGNoLCBoZWFsdGg6IE1hdGgubWF4KDEsIHRoaXMuc3RhdHMuaGVhbHRoKSwgaHVuZ2VyOiB0aGlzLnN0YXRzLmh1bmdlciwgc3RhbWluYTogdGhpcy5zdGF0cy5zdGFtaW5hLCBmbHlpbmc6IHRoaXMucGxheWVyLmZseWluZyB9LFxuICAgICAgc3Bhd246IHRoaXMuc3Bhd25Qb2ludCA/IHsgeDogdGhpcy5zcGF3blBvaW50LngsIHk6IHRoaXMuc3Bhd25Qb2ludC55LCB6OiB0aGlzLnNwYXduUG9pbnQueiB9IDogbnVsbCxcbiAgICAgIGhvdGJhcjogdGhpcy5zZWxlY3RlZCxcbiAgICAgIGludmVudG9yeTogdGhpcy5pbnZlbnRvcnkuc2VyaWFsaXplKCksXG4gICAgICBwaWVjZXM6IHRoaXMuYnVpbGRpbmcuc2VyaWFsaXplKCksXG4gICAgICBlZGl0czogWy4uLnRoaXMudGVycmFpbi5lZGl0cy5lbnRyaWVzKCldLm1hcCgoW2ssIHZdKSA9PiBbaywgTWF0aC5yb3VuZCh2ICogMTAwMCkgLyAxMDAwXSksXG4gICAgICBoYXJ2ZXN0ZWQ6IFsuLi50aGlzLmhhcnZlc3RlZC5lbnRyaWVzKCldLm1hcCgoW2ssIHZdKSA9PiBbaywgTWF0aC5yb3VuZCh2KV0pLFxuICAgICAgZGlzY292ZXJlZDogWy4uLnRoaXMuZGlzY292ZXJlZF0sXG4gICAgICB3b3JsZFNlY29uZHM6IHRoaXMud29ybGRTZWNvbmRzLFxuICAgICAgdGlwczogWy4uLnRoaXMudGlwc0RvbmVdLFxuICAgICAgc2F2ZWRBdDogRGF0ZS5ub3coKSxcbiAgICAgIHNraWxsczogdGhpcy5za2lsbHMsXG4gICAgICByZXN0ZWQ6IE1hdGgucm91bmQodGhpcy5yZXN0ZWQpLFxuICAgICAgbGFzdFdhdmU6IHRoaXMubGFzdFdhdmUsXG4gICAgICBuaWdodHNTdXJ2aXZlZDogdGhpcy5uaWdodHNTdXJ2aXZlZCxcbiAgICAgIGNoZXN0czogdGhpcy5idWlsZGluZy5zZXJpYWxpemVTdG9yZXMoKSxcbiAgICAgIGV4cGxvcmVkOiBbLi4udGhpcy5leHBsb3JlZF0sXG4gICAgICBwaW5zOiB0aGlzLndheXBvaW50cy5zZXJpYWxpemUoKSxcbiAgICB9XG4gIH1cblxuICBzYXZlV29ybGQoYW5ub3VuY2U6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICBpZiAodGhpcy5zdGF0ZSA9PT0gJ3RpdGxlJykgcmV0dXJuXG4gICAgY29uc3Qgb2sgPSBzdG9yZVdvcmxkKHRoaXMuYnVpbGRTYXZlKCkpXG4gICAgaWYgKGFubm91bmNlKSB0aGlzLnVpLnRvYXN0KG51bGwsIG9rID8gJ1dvcmxkIHNhdmVkJyA6ICdDb3VsZCBub3Qgc2F2ZSDigJQgc3RvcmFnZSBpcyBmdWxsJylcbiAgfVxuXG4gIHByaXZhdGUgYXV0b3NhdmUoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuc3RhdGUgIT09ICd0aXRsZScgJiYgdGhpcy5zdGF0ZSAhPT0gJ2RlYWQnKSB0aGlzLnNhdmVXb3JsZChmYWxzZSlcbiAgfVxuXG4gIC8vIOKUgOKUgOKUgCBNZW51cyAmIHN0YXRlIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICBwcml2YXRlIG9uTG9ja0NoYW5nZSgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5pbnB1dC5sb2NrZWQpIHJldHVyblxuICAgIGlmICh0aGlzLmV4cGVjdFVubG9jaykge1xuICAgICAgdGhpcy5leHBlY3RVbmxvY2sgPSBmYWxzZVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmICh0aGlzLnN0YXRlID09PSAncGxheScgJiYgIXRoaXMudG91Y2ggJiYgIXRoaXMuaW5wdXQuZnJlZUxvb2spIHRoaXMucGF1c2UoKVxuICB9XG5cbiAgcHJpdmF0ZSB1bmxvY2soKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuaW5wdXQubG9ja2VkKSB7XG4gICAgICB0aGlzLmV4cGVjdFVubG9jayA9IHRydWVcbiAgICAgIHRoaXMuaW5wdXQudW5sb2NrUG9pbnRlcigpXG4gICAgfVxuICB9XG5cbiAgcGF1c2UoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuc3RhdGUgIT09ICdwbGF5JykgcmV0dXJuXG4gICAgdGhpcy5zdGF0ZSA9ICdwYXVzZSdcbiAgICB0aGlzLnVubG9jaygpXG4gICAgdGhpcy5pbnB1dC5yZWxlYXNlQWxsKClcbiAgICB0aGlzLmJ1aWxkaW5nLnNob3dHaG9zdChudWxsKVxuICAgIHRoaXMudWkuc2hvd1BhdXNlKClcbiAgICB0aGlzLnNhdmVXb3JsZChmYWxzZSlcbiAgfVxuXG4gIHJlc3VtZSgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5zdGF0ZSAhPT0gJ3BhdXNlJykgcmV0dXJuXG4gICAgdGhpcy5pbnB1dC5yZWxlYXNlQWxsKClcbiAgICB0aGlzLmlucHV0LmxvY2tQb2ludGVyKClcbiAgICB0aGlzLnN0YXRlID0gJ3BsYXknXG4gICAgdGhpcy51aS5oaWRlUGF1c2UoKVxuICAgIHRoaXMubG9vcC5yZXNldEFjY3VtdWxhdG9yKClcbiAgfVxuXG4gIG9wZW5JbnZlbnRvcnkoc3RhdGlvbj86IFN0YXRpb24pOiB2b2lkIHtcbiAgICBpZiAodGhpcy5zdGF0ZSAhPT0gJ3BsYXknKSByZXR1cm5cbiAgICB0aGlzLnN0YXRlID0gJ2ludmVudG9yeSdcbiAgICB0aGlzLnVubG9jaygpXG4gICAgdGhpcy5pbnB1dC5yZWxlYXNlQWxsKClcbiAgICB0aGlzLmJ1aWxkaW5nLnNob3dHaG9zdChudWxsKVxuICAgIHRoaXMubGFzdFN0YXRpb25zID0gdGhpcy5zdGF0aW9ucygpXG4gICAgdGhpcy51aS5vcGVuSW52ZW50b3J5KHRoaXMuaW52ZW50b3J5LCB0aGlzLmxhc3RTdGF0aW9ucywgc3RhdGlvbilcbiAgICB0aGlzLmF1ZGlvLnBsYXkoJ29wZW4nKVxuICB9XG5cbiAgY2xvc2VJbnZlbnRvcnkoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuc3RhdGUgIT09ICdpbnZlbnRvcnknKSByZXR1cm5cbiAgICB0aGlzLmludmVudG9yeS5zdG93Q3Vyc29yKClcbiAgICB0aGlzLnVpLmNsb3NlSW52ZW50b3J5KClcbiAgICAvLyBUaGUgc2FtZSBrZXkgZXZlbnQgdGhhdCBjbG9zZWQgdGhlIHNjcmVlbiBtdXN0IG5vdCByZW9wZW4gaXQgbmV4dCBmcmFtZS5cbiAgICB0aGlzLmlucHV0LnJlbGVhc2VBbGwoKVxuICAgIHRoaXMuaW5wdXQubG9ja1BvaW50ZXIoKVxuICAgIHRoaXMuc3RhdGUgPSAncGxheSdcbiAgICB0aGlzLmludkRpcnR5ID0gdHJ1ZVxuICAgIGlmICh0aGlzLmNoZXN0VWlkICE9PSBudWxsKSB7XG4gICAgICB0aGlzLmJ1aWxkaW5nLm9wZW5MaWRzLmRlbGV0ZSh0aGlzLmNoZXN0VWlkKVxuICAgICAgY29uc3QgYyA9IHRoaXMuYnVpbGRpbmcucGllY2VzLmdldCh0aGlzLmNoZXN0VWlkKVxuICAgICAgdGhpcy5jaGVzdFVpZCA9IG51bGxcbiAgICAgIHRoaXMuYXVkaW8ucGxheSgnY2hlc3RDbG9zZScsIGMgPyB0aGlzLmZhbGxvZmYodG1wVi5zZXQoYy54LCBjLnksIGMueiksIDEwKSA6IDEpXG4gICAgICBpZiAoYykgdGhpcy5meC5idXJzdCgnZGlydCcsIHRtcFYuc2V0KGMueCwgYy55ICsgMC42LCBjLnopLmNsb25lKCksIFVQLCAwLjI1KVxuICAgIH0gZWxzZSB0aGlzLmF1ZGlvLnBsYXkoJ2Nsb3NlJylcbiAgICB0aGlzLmxvb3AucmVzZXRBY2N1bXVsYXRvcigpXG4gIH1cblxuICAvLyDilIDilIDilIAgV29ybGQgbWFwIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICBvcGVuTWFwKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnN0YXRlICE9PSAncGxheScpIHJldHVyblxuICAgIHRoaXMuc3RhdGUgPSAnbWFwJ1xuICAgIHRoaXMudW5sb2NrKClcbiAgICB0aGlzLmlucHV0LnJlbGVhc2VBbGwoKVxuICAgIHRoaXMuYnVpbGRpbmcuc2hvd0dob3N0KG51bGwpXG4gICAgdGhpcy5tYXJrRXhwbG9yZWQoKVxuICAgIHRoaXMubWFwLnNob3codGhpcy5tYXBWaWV3KCkpXG4gICAgdGhpcy5hdWRpby5wbGF5KCdtYXAnKVxuICB9XG5cbiAgY2xvc2VNYXAoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuc3RhdGUgIT09ICdtYXAnKSByZXR1cm5cbiAgICB0aGlzLm1hcC5oaWRlKClcbiAgICB0aGlzLmlucHV0LnJlbGVhc2VBbGwoKVxuICAgIHRoaXMuaW5wdXQubG9ja1BvaW50ZXIoKVxuICAgIHRoaXMuc3RhdGUgPSAncGxheSdcbiAgICB0aGlzLmF1ZGlvLnBsYXkoJ2Nsb3NlJylcbiAgICB0aGlzLmxvb3AucmVzZXRBY2N1bXVsYXRvcigpXG4gIH1cblxuICAvKiogUmV2ZWFsIG1hcCB0aWxlcyB3aXRoaW4gc2lnaHQgb2YgdGhlIHBsYXllci4gKi9cbiAgcHJpdmF0ZSBtYXJrRXhwbG9yZWQoKTogdm9pZCB7XG4gICAgY29uc3QgcCA9IHRoaXMucGxheWVyLmJvZHkucG9zXG4gICAgY29uc3QgciA9IENPTkZJRy5tYXAucmV2ZWFsUmFkaXVzXG4gICAgY29uc3QgdHgwID0gTWF0aC5mbG9vcigocC54IC0gcikgLyBNQVBfVElMRSlcbiAgICBjb25zdCB0eDEgPSBNYXRoLmZsb29yKChwLnggKyByKSAvIE1BUF9USUxFKVxuICAgIGNvbnN0IHR6MCA9IE1hdGguZmxvb3IoKHAueiAtIHIpIC8gTUFQX1RJTEUpXG4gICAgY29uc3QgdHoxID0gTWF0aC5mbG9vcigocC56ICsgcikgLyBNQVBfVElMRSlcbiAgICBmb3IgKGxldCB0eCA9IHR4MDsgdHggPD0gdHgxOyB0eCsrKSB7XG4gICAgICBmb3IgKGxldCB0eiA9IHR6MDsgdHogPD0gdHoxOyB0eisrKSB7XG4gICAgICAgIGNvbnN0IGN4ID0gTWF0aC5tYXgodHggKiBNQVBfVElMRSwgTWF0aC5taW4ocC54LCAodHggKyAxKSAqIE1BUF9USUxFKSlcbiAgICAgICAgY29uc3QgY3ogPSBNYXRoLm1heCh0eiAqIE1BUF9USUxFLCBNYXRoLm1pbihwLnosICh0eiArIDEpICogTUFQX1RJTEUpKVxuICAgICAgICBpZiAoTWF0aC5oeXBvdChjeCAtIHAueCwgY3ogLSBwLnopIDw9IHIpIHRoaXMuZXhwbG9yZWQuYWRkKHRpbGVLZXkodHgsIHR6KSlcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyDilIDilIDilIAgV2F5cG9pbnRzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICBwcml2YXRlIGFkZFBpbih4OiBudW1iZXIsIHo6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHBpbiA9IHRoaXMud2F5cG9pbnRzLmFkZCh4LCB6KVxuICAgIHRoaXMuYmVhY29ucy5zeW5jKHRoaXMud2F5cG9pbnRzLnBpbnMpXG4gICAgdGhpcy5hdWRpby5wbGF5KCdwbGFjZScsIDAuNylcbiAgICB0aGlzLnVpLnRvYXN0KG51bGwsIGBXYXlwb2ludCAke3RoaXMud2F5cG9pbnRzLmxhYmVsKHBpbil9IHNldCDCtyAke01hdGgucm91bmQoTWF0aC5oeXBvdCh4IC0gdGhpcy5wbGF5ZXIuYm9keS5wb3MueCwgeiAtIHRoaXMucGxheWVyLmJvZHkucG9zLnopKX0gbWApXG4gICAgdGhpcy5tYXAuc2V0Vmlldyh0aGlzLm1hcFZpZXcoKSlcbiAgfVxuICBwcml2YXRlIHJlbW92ZVBpbihpZDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCF0aGlzLndheXBvaW50cy5yZW1vdmUoaWQpKSByZXR1cm5cbiAgICB0aGlzLmJlYWNvbnMuc3luYyh0aGlzLndheXBvaW50cy5waW5zKVxuICAgIHRoaXMuYXVkaW8ucGxheSgnY2xpY2snKVxuICAgIHRoaXMubWFwLnNldFZpZXcodGhpcy5tYXBWaWV3KCkpXG4gIH1cbiAgcHJpdmF0ZSBjbGVhclBpbnMoKTogdm9pZCB7XG4gICAgaWYgKCF0aGlzLndheXBvaW50cy5waW5zLmxlbmd0aCkgcmV0dXJuXG4gICAgdGhpcy53YXlwb2ludHMuY2xlYXIoKVxuICAgIHRoaXMuYmVhY29ucy5zeW5jKFtdKVxuICAgIHRoaXMuYXVkaW8ucGxheSgnY2xpY2snKVxuICAgIHRoaXMubWFwLnNldFZpZXcodGhpcy5tYXBWaWV3KCkpXG4gIH1cbiAgLyoqIFdhbGtpbmcgdXAgdG8gYSB3YXlwb2ludCBwb3BzIGl0IHdpdGggYSBjaGltZSBhbmQgYSBidXJzdCBvZiBpdHMgY29sb3VyLiAqL1xuICBwcml2YXRlIGNoZWNrUGlucygpOiB2b2lkIHtcbiAgICBjb25zdCBwID0gdGhpcy5wbGF5ZXIuYm9keS5wb3NcbiAgICBjb25zdCBwaW4gPSB0aGlzLndheXBvaW50cy5uZWFyKHAueCwgcC56LCBQSU5fUkVBQ0gpXG4gICAgaWYgKCFwaW4pIHJldHVyblxuICAgIHRoaXMud2F5cG9pbnRzLnJlbW92ZShwaW4uaWQpXG4gICAgdGhpcy5iZWFjb25zLnN5bmModGhpcy53YXlwb2ludHMucGlucylcbiAgICBjb25zdCBhdCA9IG5ldyBUSFJFRS5WZWN0b3IzKHBpbi54LCB0aGlzLnRlcnJhaW4uaGVpZ2h0KHBpbi54LCBwaW4ueikgKyAwLjMsIHBpbi56KVxuICAgIHRoaXMuZngucmluZyhhdCwgbmV3IFRIUkVFLkNvbG9yKFBJTl9DT0xPUlNbcGluLmNdKS5nZXRIZXgoKSwgMi4yKVxuICAgIHRoaXMuZnguYnVyc3QoJ3BsYWNlJywgYXQsIFVQLCAxLjQpXG4gICAgdGhpcy5meC5sZXZlbFVwKGF0KVxuICAgIHRoaXMuYXVkaW8ucGxheSgnY3JhZnQnKVxuICAgIHRoaXMudWkudG9hc3QobnVsbCwgJ1dheXBvaW50IHJlYWNoZWQnKVxuICB9XG5cbiAgcHJpdmF0ZSBtYXBWaWV3KCk6IE1hcFZpZXcge1xuICAgIGNvbnN0IHAgPSB0aGlzLnBsYXllci5ib2R5LnBvc1xuICAgIGNvbnN0IHBpZWNlczogTWFwVmlld1sncGllY2VzJ10gPSBbXVxuICAgIGZvciAoY29uc3QgYiBvZiB0aGlzLmJ1aWxkaW5nLnBpZWNlcy52YWx1ZXMoKSkge1xuICAgICAgY29uc3QgZCA9IFBJRUNFU1tiLmlkXVxuICAgICAgY29uc3QgW3csIGRkXSA9IGIucm90ICUgMiA/IFtkLnNpemVbMl0sIGQuc2l6ZVswXV0gOiBbZC5zaXplWzBdLCBkLnNpemVbMl1dXG4gICAgICBwaWVjZXMucHVzaCh7IHg6IGIueCwgejogYi56LCB3LCBkOiBkZCwga2luZDogZC5saWdodCA/ICdsaWdodCcgOiBkLnN0b3JhZ2UgPyAnY2hlc3QnIDogZC5zdGF0aW9uID8gJ3N0YXRpb24nIDogJ2J1aWxkJyB9KVxuICAgIH1cbiAgICBjb25zdCBob3VycyA9ICh0aGlzLnRpbWUgKiAyNCArIDI0KSAlIDI0XG4gICAgY29uc3QgaGggPSBNYXRoLmZsb29yKGhvdXJzKVxuICAgIGNvbnN0IG1tID0gTWF0aC5mbG9vcigoaG91cnMgLSBoaCkgKiA2MClcbiAgICByZXR1cm4ge1xuICAgICAgcGxheWVyOiB7IHg6IHAueCwgejogcC56LCB5YXc6IHRoaXMucGxheWVyLnlhdyB9LFxuICAgICAgY2FtcDogdGhpcy5zcGF3blBvaW50ID8geyB4OiB0aGlzLnNwYXduUG9pbnQueCwgejogdGhpcy5zcGF3blBvaW50LnogfSA6IG51bGwsXG4gICAgICBwb2lzOiB0aGlzLnRlcnJhaW4ucG9pcy5uZWFyKHAueCwgcC56LCBDT05GSUcubWFwLnBvaVJhZGl1cykubWFwKG8gPT4gKHsgaWQ6IG8uaWQsIHg6IG8ueCwgejogby56LCB0eXBlOiBvLnR5cGUsIGtub3duOiB0aGlzLmRpc2NvdmVyZWQuaGFzKG8uaWQpIH0pKSxcbiAgICAgIHBpZWNlcyxcbiAgICAgIHBpbnM6IHRoaXMud2F5cG9pbnRzLnBpbnMubWFwKChwaW4sIGkpID0+ICh7IGlkOiBwaW4uaWQsIHg6IHBpbi54LCB6OiBwaW4ueiwgY29sb3I6IFBJTl9DT0xPUlNbcGluLmNdLCBuOiBpICsgMSB9KSksXG4gICAgICBkYXk6IHRoaXMuZGF5LFxuICAgICAgdGltZTogYCR7U3RyaW5nKGhoKS5wYWRTdGFydCgyLCAnMCcpfToke1N0cmluZyhtbSkucGFkU3RhcnQoMiwgJzAnKX1gLFxuICAgIH1cbiAgfVxuXG4gIC8vIOKUgOKUgOKUgCBEb29ycyAmIGNoZXN0cyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgcHJpdmF0ZSB0b2dnbGVEb29yKGQ6IFBpZWNlKTogdm9pZCB7XG4gICAgY29uc3QgcG9zID0gdGhpcy5wbGF5ZXIuYm9keS5wb3NcbiAgICBjb25zdCBhdCA9IHRtcFYuc2V0KGQueCwgZC55ICsgMSwgZC56KS5jbG9uZSgpXG4gICAgaWYgKGQub3Blbikge1xuICAgICAgaWYgKHRoaXMub3ZlcmxhcHNQbGF5ZXIoZG9vckxlYWZCb3goZCwgMCkpKSB7XG4gICAgICAgIHRoaXMudWkuaGludCgnU3RlcCBvdXQgb2YgdGhlIGRvb3J3YXkgZmlyc3QnLCB0cnVlKVxuICAgICAgICB0aGlzLmF1ZGlvLnBsYXkoJ2RlbnknKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHRoaXMuYnVpbGRpbmcuc2V0RG9vcihkLnVpZCwgMClcbiAgICAgIHRoaXMuYXVkaW8ucGxheSgnZG9vckNsb3NlJywgdGhpcy5mYWxsb2ZmKGF0LCAxNCkpXG4gICAgICB0aGlzLnNoYWtlID0gTWF0aC5tYXgodGhpcy5zaGFrZSwgMC4xMilcbiAgICAgIHRoaXMuZnguYnVyc3QoJ2RpcnQnLCBhdC5zZXRZKGQueSArIDAuMTUpLCBVUCwgMC4zKVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBTd2luZyBhd2F5IGZyb20gd2hvZXZlciBvcGVucyBpdCwgdW5sZXNzIHRoYXQgc2lkZSBpcyBibG9ja2VkIGJ5IHRoZSBwbGF5ZXIncyBvd24gYm9keS5cbiAgICAgIGxldCBzaWRlID0gLWRvb3JTaWRlKGQsIHBvcy54LCBwb3MueilcbiAgICAgIGlmICh0aGlzLm92ZXJsYXBzUGxheWVyKGRvb3JMZWFmQm94KGQsIHNpZGUpKSkgc2lkZSA9IC1zaWRlXG4gICAgICB0aGlzLmJ1aWxkaW5nLnNldERvb3IoZC51aWQsIHNpZGUpXG4gICAgICB0aGlzLmF1ZGlvLnBsYXkoJ2Rvb3JPcGVuJywgdGhpcy5mYWxsb2ZmKGF0LCAxNCkpXG4gICAgfVxuICAgIHRoaXMudXNlQ2QgPSAwLjM1XG4gIH1cblxuICBwcml2YXRlIG9wZW5DaGVzdChjOiBQaWVjZSk6IHZvaWQge1xuICAgIGlmICh0aGlzLnN0YXRlICE9PSAncGxheScpIHJldHVyblxuICAgIGNvbnN0IHNsb3RzID0gdGhpcy5idWlsZGluZy5zdG9yZXMuZ2V0KGMudWlkKVxuICAgIGlmICghc2xvdHMpIHJldHVyblxuICAgIHRoaXMuc3RhdGUgPSAnaW52ZW50b3J5J1xuICAgIHRoaXMuY2hlc3RVaWQgPSBjLnVpZFxuICAgIHRoaXMudW5sb2NrKClcbiAgICB0aGlzLmlucHV0LnJlbGVhc2VBbGwoKVxuICAgIHRoaXMuYnVpbGRpbmcuc2hvd0dob3N0KG51bGwpXG4gICAgdGhpcy5idWlsZGluZy5vcGVuTGlkcy5hZGQoYy51aWQpXG4gICAgdGhpcy51aS5vcGVuQ2hlc3QodGhpcy5pbnZlbnRvcnksIHNsb3RzKVxuICAgIHRoaXMuYXVkaW8ucGxheSgnY2hlc3QnKVxuICAgIHRoaXMuZnguZ2xpbnQodG1wVi5zZXQoYy54LCBjLnkgKyAwLjgsIGMueikuY2xvbmUoKSwgMHhmMmM0NmIsIDEuNCwgMC40KVxuICB9XG5cbiAgcHJpdmF0ZSBzdGF0aW9ucygpOiBTZXQ8U3RhdGlvbj4ge1xuICAgIGlmICh0aGlzLmNvbmZpZy5tb2RlID09PSAnY3JlYXRpdmUnKSByZXR1cm4gbmV3IFNldDxTdGF0aW9uPihbJ3dvcmtiZW5jaCcsICdjYW1wZmlyZSddKVxuICAgIGNvbnN0IHAgPSB0aGlzLnBsYXllci5ib2R5LnBvc1xuICAgIHJldHVybiB0aGlzLmJ1aWxkaW5nLnN0YXRpb25zTmVhcihwLngsIHAueSwgcC56LCA0LjUpXG4gIH1cblxuICBjcmFmdChyOiBSZWNpcGUsIG46IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHN0ID0gdGhpcy5zdGF0aW9ucygpXG4gICAgaWYgKHIuc3RhdGlvbiAmJiAhc3QuaGFzKHIuc3RhdGlvbikpIHtcbiAgICAgIHRoaXMuYXVkaW8ucGxheSgnZGVueScpXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgbGV0IG1hZGUgPSAwXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBuOyBpKyspIHtcbiAgICAgIGlmICghdGhpcy5pbnZlbnRvcnkuY3JhZnQocikpIGJyZWFrXG4gICAgICBtYWRlKytcbiAgICB9XG4gICAgaWYgKCFtYWRlKSB7XG4gICAgICB0aGlzLmF1ZGlvLnBsYXkoJ2RlbnknKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHRoaXMuYXVkaW8ucGxheSgnY3JhZnQnKVxuICAgIHRoaXMudWkuY3JhZnRGeCgpXG4gICAgaWYgKElURU1TW3Iub3V0XS50b29sKSB0aGlzLmNvdW50ZXJzLnRvb2xzKytcbiAgICB0aGlzLnVpLnRvYXN0KHIub3V0LCBgQ3JhZnRlZCAke0lURU1TW3Iub3V0XS5uYW1lfSR7bWFkZSAqIHIubiA+IDEgPyBgIMOXJHttYWRlICogci5ufWAgOiAnJ31gKVxuICAgIHRoaXMudWkucmVmcmVzaEludmVudG9yeShzdClcbiAgICB0aGlzLmludkRpcnR5ID0gdHJ1ZVxuICB9XG5cbiAgc2VsZWN0KGk6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IG5leHQgPSAoKGkgJSBIT1RCQVIpICsgSE9UQkFSKSAlIEhPVEJBUlxuICAgIGlmIChuZXh0ICE9PSB0aGlzLnNlbGVjdGVkKSB7XG4gICAgICB0aGlzLnNlbGVjdGVkID0gbmV4dFxuICAgICAgdGhpcy5yb3RPZmZzZXQgPSAwXG4gICAgICB0aGlzLmludkRpcnR5ID0gdHJ1ZVxuICAgICAgdGhpcy5hdWRpby5wbGF5KCd1aScsIDAuNilcbiAgICAgIGNvbnN0IHMgPSB0aGlzLmludmVudG9yeS5zbG90c1tuZXh0XVxuICAgICAgaWYgKHMpIHRoaXMudWkuaXRlbU5hbWUoSVRFTVNbcy5pZF0ubmFtZSlcbiAgICB9XG4gIH1cblxuICBhcHBseVNldHRpbmdzKHBhdGNoOiBQYXJ0aWFsPFNhdmVEYXRhPik6IHZvaWQge1xuICAgIGlmIChPYmplY3Qua2V5cyhwYXRjaCkubGVuZ3RoKSB0aGlzLnN0b3JlLnVwZGF0ZShwYXRjaClcbiAgICBjb25zdCBzID0gdGhpcy5zdG9yZS5kYXRhXG4gICAgdGhpcy5pbnB1dC5zZW5zaXRpdml0eSA9IHMuc2Vuc2l0aXZpdHlcbiAgICB0aGlzLmlucHV0LmludmVydFkgPSBzLmludmVydFlcbiAgICB0aGlzLmF1ZGlvLnNldFZvbHVtZXMocy5tdXNpY1ZvbHVtZSwgcy5zZnhWb2x1bWUsIHMubXV0ZWQpXG4gICAgaWYgKHBhdGNoLnF1YWxpdHkpIHRoaXMucmVuZGVyZXIuYXBwbHlRdWFsaXR5KHMucXVhbGl0eSlcbiAgICBjb25zdCBxID0gUVVBTElUWV9QUkVTRVRTW3MucXVhbGl0eV1cbiAgICB0aGlzLmVudi5zZXRTaGFkb3dRdWFsaXR5KHEuc2hhZG93cywgcS5zaGFkb3dNYXApXG4gICAgdGhpcy5jaHVua3MuZ3Jhc3NFbmFibGVkID0gcy5xdWFsaXR5ICE9PSAnbG93J1xuICAgIHRoaXMuY2h1bmtzLnJhZGl1cyA9IHMudmlld0Rpc3RhbmNlXG4gICAgdGhpcy5lbnYuc2V0Vmlld0Rpc3RhbmNlKHMudmlld0Rpc3RhbmNlICogMzIgKiAwLjkyKVxuICAgIHRoaXMucGxheWVyLmNhbWVyYS5mb3YgPSBzLmZvdlxuICAgIHRoaXMucGxheWVyLmNhbWVyYS51cGRhdGVQcm9qZWN0aW9uTWF0cml4KClcbiAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgncmVkdWNlZC1tb3Rpb24nLCBzLnJlZHVjZWRNb3Rpb24pXG4gIH1cblxuICAvLyDilIDilIDilIAgU2ltdWxhdGlvbiDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgcHJpdmF0ZSBzdGVwKGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5zdGF0ZSAhPT0gJ3BsYXknKSByZXR1cm5cbiAgICAvLyBIaXQtc3RvcDogZnJlZXplIHRoZSBzaW11bGF0aW9uIGZvciBhIGZldyBmcmFtZXMgb24gaGVhdnkgaW1wYWN0cy5cbiAgICBpZiAodGhpcy5oaXRTdG9wID4gMCkge1xuICAgICAgdGhpcy5oaXRTdG9wIC09IGR0XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgbW9kZSA9IHRoaXMuY29uZmlnLm1vZGVcbiAgICBjb25zdCBldiA9IHRoaXMucGxheWVyLnN0ZXAoZHQsIHRoaXMuaW5wdXQsIHRoaXMucGh5c2ljcywgdGhpcy5zdGF0cywgbW9kZSlcbiAgICBjb25zdCBmZWV0ID0gdGhpcy5wbGF5ZXIuYm9keS5wb3NcbiAgICBpZiAoZXYuanVtcGVkKSB0aGlzLmF1ZGlvLnBsYXkoJ2p1bXAnLCAwLjYpXG4gICAgaWYgKGV2LmxhbmRlZCAhPT0gbnVsbCAmJiBldi5sYW5kZWQgPCAtNSkge1xuICAgICAgdGhpcy5hdWRpby5wbGF5KCdsYW5kJywgTWF0aC5taW4oMSwgLWV2LmxhbmRlZCAvIDE0KSlcbiAgICAgIHRoaXMuZnguZm9vdER1c3QoZmVldCwgdGhpcy5kdXN0Q29sb3IoKSwgTWF0aC5taW4oMywgLWV2LmxhbmRlZCAvIDUpKVxuICAgICAgdGhpcy5zaGFrZSA9IE1hdGgubWF4KHRoaXMuc2hha2UsIE1hdGgubWluKDAuNSwgLWV2LmxhbmRlZCAvIDMwKSlcbiAgICB9XG4gICAgaWYgKGV2LmZhbGxEYW1hZ2UgPiAwKSB0aGlzLmRhbWFnZShldi5mYWxsRGFtYWdlLCAnQSBsb25nIGZhbGwnLCB1bmRlZmluZWQsIGZhbHNlKVxuICAgIGlmIChldi5zcGxhc2gpIHtcbiAgICAgIHRoaXMuYXVkaW8ucGxheSgnc3BsYXNoJylcbiAgICAgIHRoaXMuZnguc3BsYXNoKHRtcFYuc2V0KGZlZXQueCwgU0VBX0xFVkVMLCBmZWV0LnopLmNsb25lKCkpXG4gICAgfVxuICAgIGlmIChldi5zdGVwKSB7XG4gICAgICBjb25zdCBzdXJmID0gdGhpcy5zdGVwU3VyZmFjZSgpXG4gICAgICB0aGlzLmF1ZGlvLnN0ZXAoc3VyZiwgdGhpcy5wbGF5ZXIuc3ByaW50aW5nID8gMS4yIDogMC45KVxuICAgICAgaWYgKHRoaXMucGxheWVyLnNwcmludGluZyAmJiBzdXJmICE9PSAnd2F0ZXInKSB0aGlzLmZ4LmZvb3REdXN0KGZlZXQsIHRoaXMuZHVzdENvbG9yKCksIDAuNylcbiAgICB9XG4gICAgY29uc3QgbG93QmVmb3JlID0gdGhpcy5zdGF0cy5odW5nZXIgPiAyMFxuICAgIHRpY2tTdGF0cyh0aGlzLnN0YXRzLCBkdCwgdGhpcy5wbGF5ZXIuc3ByaW50aW5nLCB0aGlzLmNvbmZpZy5kaWZmaWN1bHR5LCBtb2RlKVxuICAgIGlmIChsb3dCZWZvcmUgJiYgdGhpcy5zdGF0cy5odW5nZXIgPD0gMjApIHRoaXMudWkuc3RhdFB1bHNlKCdodW5nZXInLCAnbG93JylcbiAgICAvLyBSZXN0ZWQ6IGZhc3RlciBzdGFtaW5hIHJlY292ZXJ5LlxuICAgIGlmICh0aGlzLnJlc3RlZCA+IDApIHtcbiAgICAgIHRoaXMucmVzdGVkID0gTWF0aC5tYXgoMCwgdGhpcy5yZXN0ZWQgLSBkdClcbiAgICAgIGlmICh0aGlzLnN0YXRzLnN0YW1pbmFXYWl0IDw9IDAgJiYgdGhpcy5zdGF0cy5zdGFtaW5hIDwgTUFYX1NUQVQpIHRoaXMuc3RhdHMuc3RhbWluYSA9IE1hdGgubWluKE1BWF9TVEFULCB0aGlzLnN0YXRzLnN0YW1pbmEgKyBDT05GSUcuc3Vydml2YWwuc3RhbWluYVJlZ2VuICogKFJFU1RFRC5zdGFtaW5hUmVnZW5NdWx0IC0gMSkgKiBkdClcbiAgICB9XG4gICAgaWYgKHRoaXMuc3RhdHMuaGVhbHRoIDw9IDAgJiYgdGhpcy5zdGF0ZSA9PT0gJ3BsYXknKSB0aGlzLmRpZSgnU3RhcnZhdGlvbicpXG5cbiAgICB0aGlzLnRpbWUgKz0gZHQgLyBEQVlfU0VDT05EU1xuICAgIGlmICh0aGlzLnRpbWUgPj0gMSkge1xuICAgICAgdGhpcy50aW1lIC09IDFcbiAgICAgIHRoaXMuZGF5KytcbiAgICAgIHRoaXMudWkuYmFubmVyKGBEYXkgJHt0aGlzLmRheX1gLCAnQSBuZXcgZGF3biBvdmVyIHRoZSB3aWxkLicpXG4gICAgfVxuICAgIHRoaXMud29ybGRTZWNvbmRzICs9IGR0XG5cbiAgICBjb25zdCBwb3MgPSB0aGlzLnBsYXllci5ib2R5LnBvc1xuICAgIHRoaXMubW92ZWQgKz0gTWF0aC5oeXBvdChwb3MueCAtIHRoaXMubGFzdFBvcy54LCBwb3MueiAtIHRoaXMubGFzdFBvcy56KVxuICAgIHRoaXMubGFzdFBvcy5jb3B5KHBvcylcblxuICAgIGlmICh0aGlzLndhcmRzRGlydHkpIHtcbiAgICAgIHRoaXMud2FyZHNDYWNoZSA9IHRoaXMuYnVpbGRpbmcud2FyZHMoKVxuICAgICAgdGhpcy53YXJkc0RpcnR5ID0gZmFsc2VcbiAgICB9XG4gICAgdGhpcy5jdHggPSB7XG4gICAgICBwbGF5ZXI6IHBvcyxcbiAgICAgIHBsYXllck1vdmluZzogTWF0aC5oeXBvdCh0aGlzLnBsYXllci5ib2R5LnZlbC54LCB0aGlzLnBsYXllci5ib2R5LnZlbC56KSA+IDEsXG4gICAgICBwbGF5ZXJTcHJpbnRpbmc6IHRoaXMucGxheWVyLnNwcmludGluZyxcbiAgICAgIG5pZ2h0OiAxIC0gdGhpcy5lbnYuZGF5LFxuICAgICAgaG9zdGlsZVNjYWxlOiBESUZGSUNVTFRZW3RoaXMuY29uZmlnLmRpZmZpY3VsdHldLmhvc3RpbGVzICogKG1vZGUgPT09ICdjcmVhdGl2ZScgPyAwIDogMSksXG4gICAgICB3YXJkczogdGhpcy53YXJkc0NhY2hlLFxuICAgICAgcGh5c2ljczogdGhpcy5waHlzaWNzLFxuICAgICAgdGVycmFpbjogdGhpcy50ZXJyYWluLFxuICAgICAgYW1iaWVudEhvc3RpbGVzOiAhdGhpcy53YXZlLFxuICAgICAgb25BdHRhY2s6IChjLCBkbWcpID0+IHRoaXMuZGFtYWdlKGRtZywgQVRUQUNLX0NBVVNFW2Mua2luZF0gPz8gJ01hdWxlZCBpbiB0aGUgd2lsZCcsIGMuYm9keS5wb3MpLFxuICAgICAgb25Tb3VuZDogKGMsIHMpID0+IHRoaXMuYXVkaW8ucGxheShzLCB0aGlzLmZhbGxvZmYoYy5ib2R5LnBvcywgYy5raW5kID09PSAnaG93bGVyJyA/IDYwIDogMzApKSxcbiAgICAgIG9uRGVhdGg6IChjLCBjYXVzZSkgPT4gdGhpcy5vbkNyZWF0dXJlRGVhdGgoYywgY2F1c2UpLFxuICAgICAgb25Sb2FyOiBjID0+IHRoaXMub25Sb2FyKGMpLFxuICAgICAgb25UZWxlZ3JhcGg6IGMgPT4ge1xuICAgICAgICB0aGlzLmZ4LnJpbmcoYy5ib2R5LnBvcywgMHhmZjVhM2MsIE1hdGgubWF4KDEuMiwgYy5zdGF0LnJlYWNoKSwgMC41LCAwLjgpXG4gICAgICAgIHRoaXMuYXVkaW8ucGxheSgnZ3Jvd2wnLCB0aGlzLmZhbGxvZmYoYy5ib2R5LnBvcywgMjUpKVxuICAgICAgfSxcbiAgICB9XG4gICAgdGhpcy5jcmVhdHVyZXMudXBkYXRlKGR0LCB0aGlzLmN0eClcbiAgICB0aGlzLnVwZGF0ZU5pZ2h0KGR0KVxuICAgIHRoaXMudXBkYXRlQXJyb3dzKGR0KVxuXG4gICAgdGhpcy51cGRhdGVUYXJnZXQoKVxuICAgIHRoaXMuYWN0aW9ucyhkdClcblxuICAgIGNvbnN0IHQgPSB0aGlzLnRpbWVyc1xuICAgIHQucmVncm93IC09IGR0XG4gICAgaWYgKHQucmVncm93IDw9IDApIHtcbiAgICAgIHQucmVncm93ID0gNFxuICAgICAgdGhpcy5yZWdyb3coKVxuICAgIH1cbiAgICB0LmRpc2NvdmVyIC09IGR0XG4gICAgaWYgKHQuZGlzY292ZXIgPD0gMCkge1xuICAgICAgdC5kaXNjb3ZlciA9IDAuNVxuICAgICAgdGhpcy5tYXJrRXhwbG9yZWQoKVxuICAgICAgdGhpcy5jaGVja1BpbnMoKVxuICAgICAgdGhpcy5jaGVja0Rpc2NvdmVyeSgpXG4gICAgICB0aGlzLmNoZWNrVGlwcygpXG4gICAgfVxuICAgIHQuc2F2ZSAtPSBkdFxuICAgIGlmICh0LnNhdmUgPD0gMCkge1xuICAgICAgdC5zYXZlID0gMzBcbiAgICAgIHRoaXMuc2F2ZVdvcmxkKGZhbHNlKVxuICAgIH1cbiAgICB0aGlzLmNvbWZvcnRUIC09IGR0XG4gICAgaWYgKHRoaXMuY29tZm9ydFQgPD0gMCkge1xuICAgICAgdGhpcy5jb21mb3J0VCA9IDFcbiAgICAgIHRoaXMuY2hlY2tDb21mb3J0KClcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNvbWZvcnRUID0gMVxuXG4gIC8vIOKUgOKUgOKUgCBQcm9ncmVzc2lvbjogc2tpbGxzLCByZXN0ZWQg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gIHByaXZhdGUgeHAoaWQ6IFNraWxsSWQsIGFtb3VudDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuY29uZmlnLm1vZGUgPT09ICdjcmVhdGl2ZScpIHJldHVyblxuICAgIGNvbnN0IGdhaW5lZCA9IGFkZFhwKHRoaXMuc2tpbGxzLCBpZCwgYW1vdW50ICogKHRoaXMucmVzdGVkID4gMCA/IFJFU1RFRC54cE11bHQgOiAxKSlcbiAgICBjb25zdCBzID0gdGhpcy5za2lsbHNbaWRdXG4gICAgdGhpcy51aS5za2lsbFhwKGlkLCBzLmxldmVsLCBzLnhwIC8geHBUb05leHQocy5sZXZlbCkpXG4gICAgaWYgKGdhaW5lZCA+IDApIHtcbiAgICAgIHRoaXMudWkubGV2ZWxVcChpZCwgcy5sZXZlbClcbiAgICAgIHRoaXMudWkuc2V0U2tpbGxzKHRoaXMuc2tpbGxzKVxuICAgICAgdGhpcy5meC5sZXZlbFVwKHRoaXMucGxheWVyLmJvZHkucG9zLmNsb25lKCkpXG4gICAgICB0aGlzLmF1ZGlvLnBsYXkoJ2xldmVsdXAnKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY2hlY2tDb21mb3J0KCk6IHZvaWQge1xuICAgIGNvbnN0IHAgPSB0aGlzLnBsYXllci5ib2R5LnBvc1xuICAgIGNvbnN0IGZpcmUgPSB0aGlzLmJ1aWxkaW5nLmxpZ2h0U291cmNlcygpLnNvbWUobCA9PiBsLmlkID09PSAnY2FtcGZpcmUnICYmIE1hdGguaHlwb3QobC54IC0gcC54LCBsLnogLSBwLnopIDwgUkVTVEVELnJhZGl1cylcbiAgICBjb25zdCBwaWVjZXMgPSB0aGlzLmJ1aWxkaW5nLm5lYXIocC54LCBwLnosIFJFU1RFRC5yYWRpdXMpLmxlbmd0aFxuICAgIHRoaXMuc2hlbHRlcmVkID0gdGhpcy5idWlsZGluZy5uZWFyKHAueCwgcC56LCAxLjgpLnNvbWUobyA9PiBQSUVDRVNbby5pZF0ucm9vZiAmJiBvLnkgPiBwLnkgKyAxLjIgJiYgTWF0aC5hYnMoby54IC0gcC54KSA8IDEuMiAmJiBNYXRoLmFicyhvLnogLSBwLnopIDwgMS4yKVxuICAgIGlmICh0aGlzLmNvbmZpZy5tb2RlID09PSAnc3Vydml2YWwnICYmIGlzQ29tZm9ydGFibGUoZmlyZSwgcGllY2VzKSkge1xuICAgICAgdGhpcy53YXJtICs9IDFcbiAgICAgIGlmICh0aGlzLndhcm0gPj0gUkVTVEVELndhcm11cCkge1xuICAgICAgICBpZiAodGhpcy5yZXN0ZWQgPD0gMCkge1xuICAgICAgICAgIHRoaXMudWkudG9hc3QoJ2J1ZmZfcmVzdGVkJyBhcyBJdGVtSWQsICdSZXN0ZWQg4oCUIHN0YW1pbmEgYW5kIHNraWxscyBpbXByb3ZlJylcbiAgICAgICAgICB0aGlzLmZ4LmdsaW50KHAuY2xvbmUoKS5zZXRZKHAueSArIDEuMiksIDB4ZmZkODhhLCAzLCAwLjYpXG4gICAgICAgIH1cbiAgICAgICAgLy8gQSByb29mIG92ZXJoZWFkIG1ha2VzIHRoZSByZXN0IGxhc3QgbG9uZ2VyLlxuICAgICAgICB0aGlzLnJlc3RlZCA9IE1hdGgubWF4KHRoaXMucmVzdGVkLCBSRVNURUQuZHVyYXRpb24gKiAodGhpcy5zaGVsdGVyZWQgPyBDT05GSUcubWFwLnNoZWx0ZXJCb251cyA6IDEpKVxuICAgICAgfVxuICAgIH0gZWxzZSB0aGlzLndhcm0gPSAwXG4gIH1cblxuICBwcml2YXRlIGJ1ZmZzKCk6IEJ1ZmZWaWV3W10ge1xuICAgIGNvbnN0IG91dDogQnVmZlZpZXdbXSA9IFtdXG4gICAgaWYgKHRoaXMucmVzdGVkID4gMCkgb3V0LnB1c2goeyBpZDogJ3Jlc3RlZCcsIGxhYmVsOiB0aGlzLnNoZWx0ZXJlZCA/ICdSZXN0ZWQgwrcgU2hlbHRlcmVkJyA6ICdSZXN0ZWQnLCByZW1haW5pbmc6IHRoaXMucmVzdGVkIH0pXG4gICAgZWxzZSBpZiAodGhpcy53YXJtID4gMCkgb3V0LnB1c2goeyBpZDogJ3dhcm1pbmcnLCBsYWJlbDogJ1dhcm1pbmcgdXAnLCByZW1haW5pbmc6IG51bGwsIHByb2dyZXNzOiBNYXRoLm1pbigxLCB0aGlzLndhcm0gLyBSRVNURUQud2FybXVwKSB9KVxuICAgIHJldHVybiBvdXRcbiAgfVxuXG4gIC8vIOKUgOKUgOKUgCBOaWdodCB3YXZlcyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIBcbiAgcHJpdmF0ZSB1cGRhdGVOaWdodChkdDogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgbmlnaHQgPSAxIC0gdGhpcy5lbnYuZGF5XG4gICAgY29uc3QgaG9zdGlsZSA9IHRoaXMuY29uZmlnLm1vZGUgPT09ICdzdXJ2aXZhbCcgJiYgRElGRklDVUxUWVt0aGlzLmNvbmZpZy5kaWZmaWN1bHR5XS5ob3N0aWxlcyA+IDBcbiAgICBpZiAoIXRoaXMuaXNOaWdodCAmJiBuaWdodCA+IDAuNikge1xuICAgICAgdGhpcy5pc05pZ2h0ID0gdHJ1ZVxuICAgICAgdGhpcy5hdWRpby5wbGF5TXVzaWMoJ25pZ2h0JylcbiAgICAgIGlmIChob3N0aWxlICYmIHRoaXMubGFzdFdhdmUgPCB0aGlzLmRheSkgdGhpcy5zdGFydFdhdmUodGhpcy5kYXkpXG4gICAgfSBlbHNlIGlmICh0aGlzLmlzTmlnaHQgJiYgbmlnaHQgPCAwLjMpIHtcbiAgICAgIHRoaXMuaXNOaWdodCA9IGZhbHNlXG4gICAgICB0aGlzLmF1ZGlvLnBsYXlNdXNpYygnZGF5JylcbiAgICAgIGlmICh0aGlzLndhdmUgfHwgdGhpcy5sYXN0V2F2ZSA9PT0gdGhpcy5kYXkgLSAxIHx8IHRoaXMubGFzdFdhdmUgPT09IHRoaXMuZGF5KSB7XG4gICAgICAgIGlmICh0aGlzLmxhc3RXYXZlID4gMCAmJiBob3N0aWxlKSB7XG4gICAgICAgICAgdGhpcy5uaWdodHNTdXJ2aXZlZCsrXG4gICAgICAgICAgdGhpcy51aS5zaG93V2F2ZShgRGF3biDigJQgTmlnaHQgJHt0aGlzLmxhc3RXYXZlfSBzdXJ2aXZlZGAsICdUaGUgbmlnaHQgY3JlYXR1cmVzIGJ1cm4gYXdheSBpbiB0aGUgbGlnaHQuJywgZmFsc2UpXG4gICAgICAgICAgdGhpcy5hdWRpby5wbGF5KCdkYXduJylcbiAgICAgICAgICB0aGlzLnhwKCdodW50aW5nJywgMTApXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMud2F2ZSA9IG51bGxcbiAgICAgIHRoaXMudWkuc2V0V2F2ZShudWxsKVxuICAgIH1cbiAgICBjb25zdCB3ID0gdGhpcy53YXZlXG4gICAgaWYgKCF3KSByZXR1cm5cbiAgICB3LmJ1cnN0VCAtPSBkdFxuICAgIGlmICh3LnF1ZXVlLmxlbmd0aCAmJiB3LmJ1cnN0VCA8PSAwKSB7XG4gICAgICB3LmJ1cnN0VCA9IFdBVkVfQlVSU1RfR0FQXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IFdBVkVfQlVSU1RfU0laRSAmJiB3LnF1ZXVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGtpbmQgPSBXQVZFX0tJTkRbdy5xdWV1ZVswXV1cbiAgICAgICAgY29uc3QgYXQgPSB0aGlzLmNyZWF0dXJlcy5maW5kU3BvdCh0aGlzLmN0eCwgdGhpcy5wbGF5ZXIuYm9keS5wb3MsIDI0LCAzNiwga2luZCAhPT0gJ2hvd2xlcicpXG4gICAgICAgIGlmICghYXQpIGJyZWFrXG4gICAgICAgIGNvbnN0IGMgPSB0aGlzLmNyZWF0dXJlcy5zcGF3bihraW5kLCBhdCwgdHJ1ZSlcbiAgICAgICAgaWYgKCFjKSB7XG4gICAgICAgICAgLy8gTW9kZWwgc3RpbGwgc3RyZWFtaW5nOiBmZXRjaCBpdCBub3cgYW5kIHJldHJ5IG9uIHRoZSBuZXh0IGJ1cnN0LlxuICAgICAgICAgIHZvaWQgdGhpcy5zdGFnZXMucmVxdWlyZShraW5kID09PSAnaG93bGVyJyA/ICdib3NzJyA6IGtpbmQgPT09ICdob2xsb3cnID8gJ25pZ2h0MicgOiAnbmlnaHQxJylcbiAgICAgICAgICB3LmJ1cnN0VCA9IDJcbiAgICAgICAgICBicmVha1xuICAgICAgICB9XG4gICAgICAgIHcucXVldWUuc2hpZnQoKVxuICAgICAgICB3LmFsaXZlLmFkZChjKVxuICAgICAgICBpZiAoa2luZCA9PT0gJ2hvd2xlcicpIHtcbiAgICAgICAgICB0aGlzLmF1ZGlvLnBsYXlNdXNpYygnYm9zcycpXG4gICAgICAgICAgdGhpcy51aS5zaG93V2F2ZSgnVGhlIEVsZGVyIEhvd2xlcicsICdJdCBoYXMgY2F1Z2h0IHlvdXIgc2NlbnQuJywgdHJ1ZSlcbiAgICAgICAgICB0aGlzLmF1ZGlvLnBsYXkoJ3JvYXInLCAwLjgpXG4gICAgICAgIH0gZWxzZSBpZiAoa2luZCA9PT0gJ3dvbGYnICYmIE1hdGgucmFuZG9tKCkgPCAwLjUpIHRoaXMuYXVkaW8ucGxheSgnaG93bCcsIDAuNiwgMC45NSArIE1hdGgucmFuZG9tKCkgKiAwLjEpXG4gICAgICB9XG4gICAgfVxuICAgIGlmICghdy5xdWV1ZS5sZW5ndGggJiYgdy5hbGl2ZS5zaXplID09PSAwKSB7XG4gICAgICB0aGlzLnVpLnNob3dXYXZlKGBOaWdodCAke3cuZGVmLm5pZ2h0fSBjbGVhcmVkYCwgJ1RoZSBkYXJrIGZhbGxzIHF1aWV0LiBSZXN0IGJ5IHRoZSBmaXJlLicsIGZhbHNlKVxuICAgICAgdGhpcy5hdWRpby5wbGF5KCdkYXduJywgMC43KVxuICAgICAgdGhpcy5naXZlKFtbJ2NyeXN0YWwnLCAxICsgTWF0aC5mbG9vcih3LmRlZi5uaWdodCAvIDIpXSwgWydhcnJvdycsIDRdXSwgdGhpcy5wbGF5ZXIuYm9keS5wb3MuY2xvbmUoKS5zZXRZKHRoaXMucGxheWVyLmJvZHkucG9zLnkgKyAxKSlcbiAgICAgIHRoaXMueHAoJ2h1bnRpbmcnLCAxMiArIHcuZGVmLm5pZ2h0ICogMylcbiAgICAgIHRoaXMud2F2ZSA9IG51bGxcbiAgICAgIHRoaXMudWkuc2V0V2F2ZShudWxsKVxuICAgICAgaWYgKHRoaXMuYXVkaW8udHJhY2sgPT09ICdib3NzJykgdGhpcy5hdWRpby5wbGF5TXVzaWMoJ25pZ2h0JylcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHN0YXJ0V2F2ZShuaWdodDogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgZGVmID0gd2F2ZUZvcihuaWdodCwgdGhpcy5jb25maWcuZGlmZmljdWx0eSA9PT0gJ2hhcmQnID8gJ2hhcnNoJyA6ICdub3JtYWwnKVxuICAgIHRoaXMubGFzdFdhdmUgPSBuaWdodFxuICAgIHRoaXMud2F2ZSA9IHsgZGVmLCBxdWV1ZTogWy4uLmRlZi5zcGF3bnNdLCBidXJzdFQ6IDQsIGFsaXZlOiBuZXcgU2V0KCksIHRvdGFsOiBkZWYuc3Bhd25zLmxlbmd0aCB9XG4gICAgdm9pZCB0aGlzLnN0YWdlcy5yZXF1aXJlKHN0YWdlRm9yTmlnaHQobmlnaHQpKVxuICAgIHRoaXMudWkuc2hvd1dhdmUoZGVmLnRpdGxlLCBkZWYuc3ViLCBkZWYuYm9zcylcbiAgICB0aGlzLmF1ZGlvLnBsYXkoJ2hvcm4nKVxuICAgIHRoaXMuYXVkaW8uZHVja011c2ljKDAuNSwgMi41KVxuICAgIHRoaXMuc2hha2UgPSBNYXRoLm1heCh0aGlzLnNoYWtlLCAwLjE1KVxuICB9XG5cbiAgcHJpdmF0ZSBvbkNyZWF0dXJlRGVhdGgoYzogQ3JlYXR1cmUsIGNhdXNlOiAna2lsbGVkJyB8ICdkYXduJyB8ICd3YXJkJyk6IHZvaWQge1xuICAgIHRoaXMud2F2ZT8uYWxpdmUuZGVsZXRlKGMpXG4gICAgY29uc3QgYXQgPSBjLmJvZHkucG9zLmNsb25lKClcbiAgICBjb25zdCBzaXplID0gTWF0aC5tYXgoMC42LCBjLnN0YXQuaGVpZ2h0IC8gMS42KVxuICAgIGlmIChjYXVzZSA9PT0gJ2tpbGxlZCcpIHRoaXMuZnguZGVhdGgoYXQsIGMuc3RhdC5uaWdodCwgc2l6ZSlcbiAgICBlbHNlIHRoaXMuZnguYnVybihhdCwgYy5zdGF0LmhlaWdodClcbiAgICBpZiAoYy5raW5kID09PSAnaG93bGVyJykge1xuICAgICAgdGhpcy51aS5zZXRCb3NzQmFyKG51bGwsIDApXG4gICAgICBpZiAoY2F1c2UgPT09ICdraWxsZWQnKSB7XG4gICAgICAgIHRoaXMudWkuc2hvd1dhdmUoJ1RoZSBFbGRlciBIb3dsZXIgZmFsbHMnLCAnSXRzIGhpZGUgd2lsbCBtYWtlIGZpbmUgdHJvcGhpZXMuJywgdHJ1ZSlcbiAgICAgICAgdGhpcy5meC5zaG9ja3dhdmUoYXQsIDYpXG4gICAgICAgIHRoaXMuc2hha2UgPSBNYXRoLm1heCh0aGlzLnNoYWtlLCAwLjcpXG4gICAgICAgIHRoaXMueHAoJ2h1bnRpbmcnLCA2MClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlIG9uUm9hcihjOiBDcmVhdHVyZSk6IHZvaWQge1xuICAgIHRoaXMuZnguc2hvY2t3YXZlKGMuYm9keS5wb3MuY2xvbmUoKSwgOSlcbiAgICBjb25zdCBkID0gYy5ib2R5LnBvcy5kaXN0YW5jZVRvKHRoaXMucGxheWVyLmJvZHkucG9zKVxuICAgIHRoaXMuc2hha2UgPSBNYXRoLm1heCh0aGlzLnNoYWtlLCBNYXRoLm1heCgwLjE1LCAwLjggLSBkIC8gMzApKVxuICAgIHRoaXMuYXVkaW8ucGxheSgncm9hcicsIHRoaXMuZmFsbG9mZihjLmJvZHkucG9zLCA3MCkpXG4gICAgdGhpcy5hdWRpby5kdWNrTXVzaWMoMC40LCAxLjUpXG4gIH1cblxuICBwcml2YXRlIG9uVHJlZUxhbmRlZChhdDogVEhSRUUuVmVjdG9yMywgc2l6ZTogbnVtYmVyKTogdm9pZCB7XG4gICAgYXQueSA9IHRoaXMudGVycmFpbi5oZWlnaHQoYXQueCwgYXQueikgKyAwLjJcbiAgICB0aGlzLmZ4LmxlYXZlcyhhdC5jbG9uZSgpLnNldFkoYXQueSArIDEpLCAxNCAqIHNpemUsIDIuNSlcbiAgICB0aGlzLmZ4LmZvb3REdXN0KGF0LCAweGI4YTg4YSwgMyAqIHNpemUpXG4gICAgY29uc3QgayA9IHRoaXMuZmFsbG9mZihhdCwgMjUpXG4gICAgdGhpcy5zaGFrZSA9IE1hdGgubWF4KHRoaXMuc2hha2UsIDAuMyAqIGsgKiBzaXplKVxuICAgIHRoaXMuYXVkaW8ucGxheSgnbGFuZCcsIDAuOCAqIGssIDAuNilcbiAgfVxuXG4gIC8vIOKUgOKUgOKUgCBCb3cgJiBhcnJvd3Mg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAXG4gIHByaXZhdGUgZmlyZUFycm93KGRyYXc6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHN0YWNrID0gdGhpcy5zZWxlY3RlZFN0YWNrKClcbiAgICBjb25zdCB0b29sID0gc3RhY2sgPyBJVEVNU1tzdGFjay5pZF0udG9vbCA6IHVuZGVmaW5lZFxuICAgIGlmICghdG9vbCkgcmV0dXJuXG4gICAgaWYgKCF0aGlzLmludmVudG9yeS5pbmZpbml0ZSAmJiAhdGhpcy5pbnZlbnRvcnkucmVtb3ZlKCdhcnJvdycsIDEpKSByZXR1cm5cbiAgICBjb25zdCBleWUgPSB0aGlzLnBsYXllci5leWUobmV3IFRIUkVFLlZlY3RvcjMoKSlcbiAgICBjb25zdCBkaXIgPSB0aGlzLnBsYXllci5mb3J3YXJkKG5ldyBUSFJFRS5WZWN0b3IzKCkpXG4gICAgY29uc3QgbW9kZWwgPSBoZWxkTW9kZWwoJ2Fycm93JylcbiAgICBtb2RlbC5yb3RhdGlvbi5zZXQoMCwgMCwgMClcbiAgICBtb2RlbC5zY2FsZS5zZXRTY2FsYXIoMS4zKVxuICAgIGNvbnN0IG9iaiA9IG5ldyBUSFJFRS5Hcm91cCgpXG4gICAgb2JqLmFkZChtb2RlbClcbiAgICBjb25zdCBwb3MgPSBleWUuYWRkU2NhbGVkVmVjdG9yKGRpciwgMC42KVxuICAgIGNvbnN0IHZlbCA9IGRpci5jbG9uZSgpLm11bHRpcGx5U2NhbGFyKDIyICsgMzAgKiBkcmF3KVxuICAgIG9iai5wb3NpdGlvbi5jb3B5KHBvcylcbiAgICBvYmoucXVhdGVybmlvbi5zZXRGcm9tVW5pdFZlY3RvcnMoVVAsIGRpcilcbiAgICB0aGlzLnNjZW5lLmFkZChvYmopXG4gICAgdGhpcy5hcnJvd3MucHVzaCh7IG9iaiwgcG9zLCB2ZWwsIGxpZmU6IDYsIHN0dWNrOiBmYWxzZSwgZG1nOiB0b29sLmRhbWFnZSAqICgwLjM1ICsgMC42NSAqIGRyYXcpICogc2tpbGxCb251cyh0aGlzLnNraWxscywgJ2h1bnRpbmcnKSwgZGlyOiBkaXIuY2xvbmUoKSwgd29iYmxlOiAwLCBnbGludDogMC42LCBzdXBwb3J0OiAxLCBmYWxsaW5nOiBmYWxzZSwgbWFnbmV0OiAwIH0pXG4gICAgdGhpcy5hdWRpby5wbGF5KCdib3dSZWxlYXNlJywgMC45LCAwLjk1ICsgZHJhdyAqIDAuMSlcbiAgICB0aGlzLnBsYXllci5hZGRLaWNrKDAuMDI1ICogZHJhdywgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogMC4wMSlcbiAgICBpZiAodGhpcy5pbnZlbnRvcnkud2Vhcih0aGlzLnNlbGVjdGVkKSkgdGhpcy51aS50b2FzdChudWxsLCAnWW91ciBIdW50aW5nIEJvdyBicm9rZScpXG4gICAgdGhpcy5pbnZEaXJ0eSA9IHRydWVcbiAgfVxuXG4gIHByaXZhdGUgdXBkYXRlQXJyb3dzKGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBtZSA9IHRoaXMucGxheWVyLmJvZHkucG9zXG4gICAgY29uc3QgY2hlc3QgPSBBUlJPV19DSEVTVC5jb3B5KG1lKS5zZXRZKG1lLnkgKyAxLjApXG4gICAgbGV0IHN0dWNrQ291bnQgPSAwXG4gICAgZm9yIChsZXQgaSA9IHRoaXMuYXJyb3dzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICBjb25zdCBhID0gdGhpcy5hcnJvd3NbaV1cbiAgICAgIGEubGlmZSAtPSBkdFxuICAgICAgaWYgKGEubWFnbmV0ID4gMCkge1xuICAgICAgICAvLyBSZWNvdmVyZWQ6IHppcCBpbnRvIHRoZSBwbGF5ZXIncyBjaGVzdCwgdGhlbiBjb3VudCBpdC5cbiAgICAgICAgYS5tYWduZXQgKz0gZHRcbiAgICAgICAgYS5wb3MubGVycChjaGVzdCwgTWF0aC5taW4oMSwgZHQgKiAoNiArIGEubWFnbmV0ICogMTgpKSlcbiAgICAgICAgYS5vYmouc2NhbGUuc2V0U2NhbGFyKE1hdGgubWF4KDAuMiwgMSAtIGEubWFnbmV0ICogMS42KSlcbiAgICAgICAgaWYgKGEubWFnbmV0ID4gMC4zMiB8fCBhLnBvcy5kaXN0YW5jZVRvKGNoZXN0KSA8IDAuMzUpIHtcbiAgICAgICAgICB0aGlzLmdpdmUoW1snYXJyb3cnLCAxXV0sIGEucG9zKVxuICAgICAgICAgIGEubGlmZSA9IDBcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChhLmZhbGxpbmcpIHtcbiAgICAgICAgYS52ZWwueSAtPSA5LjggKiBkdFxuICAgICAgICBhLnBvcy5hZGRTY2FsZWRWZWN0b3IoYS52ZWwsIGR0KVxuICAgICAgICBjb25zdCBnID0gdGhpcy50ZXJyYWluLmhlaWdodChhLnBvcy54LCBhLnBvcy56KSArIDAuMDRcbiAgICAgICAgaWYgKGEucG9zLnkgPD0gZykge1xuICAgICAgICAgIC8vIExpZSBmbGF0IGFsb25nIGl0cyBvbGQgaGVhZGluZy5cbiAgICAgICAgICBhLnBvcy55ID0gZ1xuICAgICAgICAgIGEuZmFsbGluZyA9IGZhbHNlXG4gICAgICAgICAgYS5zdHVjayA9IHRydWVcbiAgICAgICAgICBhLmRpci5zZXQoYS5kaXIueCwgMCwgYS5kaXIueilcbiAgICAgICAgICBpZiAoYS5kaXIubGVuZ3RoU3EoKSA8IDFlLTQpIGEuZGlyLnNldCgxLCAwLCAwKVxuICAgICAgICAgIGEuZGlyLm5vcm1hbGl6ZSgpXG4gICAgICAgICAgYS5vYmoucXVhdGVybmlvbi5zZXRGcm9tVW5pdFZlY3RvcnMoVVAsIGEuZGlyKVxuICAgICAgICAgIGEud29iYmxlID0gMC4yXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoYS5zdHVjaykge1xuICAgICAgICBzdHVja0NvdW50KytcbiAgICAgICAgY29uc3QgZCA9IGEucG9zLmRpc3RhbmNlVG8obWUpXG4gICAgICAgIGlmIChkIDwgQVJST1dfUElDS1VQICYmIE1hdGguYWJzKGEucG9zLnkgLSBtZS55IC0gMC44KSA8IDIuNCAmJiB0aGlzLnN0YXRlID09PSAncGxheScpIHtcbiAgICAgICAgICBhLm1hZ25ldCA9IDAuMDAxXG4gICAgICAgICAgYS5saWZlID0gNVxuICAgICAgICAgIHRoaXMuZnguZ2xpbnQoYS5wb3MsIDB4ZmZmMWM4LCAzLCAwLjM1KVxuICAgICAgICB9XG4gICAgICAgIC8vIEEgc29mdCBnbGludCBldmVyeSBzbyBvZnRlbiBzbyBtaXNzZWQgYXJyb3dzIGFyZSBlYXN5IHRvIHNwb3QuXG4gICAgICAgIGEuZ2xpbnQgLT0gZHRcbiAgICAgICAgaWYgKGEuZ2xpbnQgPD0gMCkge1xuICAgICAgICAgIGEuZ2xpbnQgPSAxLjMgKyBNYXRoLnJhbmRvbSgpICogMC44XG4gICAgICAgICAgaWYgKGQgPCA0MCkgdGhpcy5meC5nbGludChhLnBvcywgMHhmZmU2YjAsIDEsIDAuNSlcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB0aGUgdGhpbmcgaXQgd2FzIHN0dWNrIGluIGlzIGdvbmUgKHRyZWUgZmVsbGVkLCB3YWxsIHJlbW92ZWQpLCBkcm9wIGl0LlxuICAgICAgICBhLnN1cHBvcnQgLT0gZHRcbiAgICAgICAgaWYgKGEuc3VwcG9ydCA8PSAwKSB7XG4gICAgICAgICAgYS5zdXBwb3J0ID0gMC44XG4gICAgICAgICAgY29uc3QgYmFjayA9IGEucG9zLmNsb25lKCkuYWRkU2NhbGVkVmVjdG9yKGEuZGlyLCAtMC4zKVxuICAgICAgICAgIGlmICghdGhpcy5waHlzaWNzLnJheWNhc3QoYmFjaywgYS5kaXIsIDAuNTUsIFtdKSkge1xuICAgICAgICAgICAgYS5zdHVjayA9IGZhbHNlXG4gICAgICAgICAgICBhLmZhbGxpbmcgPSB0cnVlXG4gICAgICAgICAgICBhLnZlbC5zZXQoMCwgMCwgMClcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGEudmVsLnkgLT0gOS44ICogMC43ICogZHRcbiAgICAgICAgY29uc3Qgc3RlcCA9IGEudmVsLmxlbmd0aCgpICogZHRcbiAgICAgICAgY29uc3QgZGlyID0gYS5kaXIuY29weShhLnZlbCkubm9ybWFsaXplKClcbiAgICAgICAgY29uc3QgaGl0ID0gdGhpcy5waHlzaWNzLnJheWNhc3QoYS5wb3MuY2xvbmUoKSwgZGlyLCBzdGVwLCB0aGlzLmNyZWF0dXJlcy50YXJnZXRzKCkpXG4gICAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgICBpZiAoaGl0LmtpbmQgPT09ICdjcmVhdHVyZScpIHtcbiAgICAgICAgICAgIHRoaXMuaGl0Q3JlYXR1cmUoaGl0LmNyZWF0dXJlIGFzIENyZWF0dXJlLCBhLmRtZywgaGl0LnBvaW50LCBoaXQubm9ybWFsLCBhLnBvcywgdHJ1ZSlcbiAgICAgICAgICAgIGEubGlmZSA9IDBcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYS5wb3MuY29weShoaXQucG9pbnQpLmFkZFNjYWxlZFZlY3RvcihkaXIsIDAuMSlcbiAgICAgICAgICAgIGEuc3R1Y2sgPSB0cnVlXG4gICAgICAgICAgICBhLmxpZmUgPSBBUlJPV19LRUVQXG4gICAgICAgICAgICBhLndvYmJsZSA9IDAuNDVcbiAgICAgICAgICAgIGEuc3VwcG9ydCA9IDAuOFxuICAgICAgICAgICAgdGhpcy5meC5idXJzdChoaXQua2luZCA9PT0gJ3RlcnJhaW4nID8gJ2RpcnQnIDogJ3dvb2QnLCBoaXQucG9pbnQsIGhpdC5ub3JtYWwsIDAuMzUpXG4gICAgICAgICAgICB0aGlzLmF1ZGlvLnBsYXkoJ2Fycm93SGl0JywgdGhpcy5mYWxsb2ZmKGhpdC5wb2ludCwgMjUpICogMC43KVxuICAgICAgICAgICAgaWYgKCF0aGlzLmFycm93VGlwU2hvd24pIHtcbiAgICAgICAgICAgICAgdGhpcy5hcnJvd1RpcFNob3duID0gdHJ1ZVxuICAgICAgICAgICAgICB0aGlzLnVpLmhpbnQoJ01pc3NlZCBhcnJvd3Mgc3RheSB3aGVyZSB0aGV5IGxhbmQg4oCUIHdhbGsgdXAgdG8gdGhlbSB0byByZWNvdmVyJywgZmFsc2UpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgYS5wb3MuYWRkU2NhbGVkVmVjdG9yKGEudmVsLCBkdClcbiAgICAgICAgYS5vYmoucXVhdGVybmlvbi5zZXRGcm9tVW5pdFZlY3RvcnMoVVAsIGRpcilcbiAgICAgICAgaWYgKE1hdGgucmFuZG9tKCkgPCAwLjYpIHRoaXMuZngudHJhaWwoYS5wb3MpXG4gICAgICB9XG4gICAgICAvLyBJbXBhY3Qgd29iYmxlOiBhIHF1aWNrIGRlY2F5aW5nIHF1aXZlciBhcm91bmQgdGhlIGVtYmVkIGF4aXMuXG4gICAgICBpZiAoYS53b2JibGUgPiAwKSB7XG4gICAgICAgIGEud29iYmxlID0gTWF0aC5tYXgoMCwgYS53b2JibGUgLSBkdClcbiAgICAgICAgY29uc3QgayA9IGEud29iYmxlIC8gMC40NVxuICAgICAgICBhLm9iai5xdWF0ZXJuaW9uLnNldEZyb21Vbml0VmVjdG9ycyhVUCwgYS5kaXIpXG4gICAgICAgIGEub2JqLnJvdGF0ZVgoTWF0aC5zaW4oYS53b2JibGUgKiA3MCkgKiAwLjA5ICogaylcbiAgICAgICAgYS5vYmoucm90YXRlWihNYXRoLmNvcyhhLndvYmJsZSAqIDU1KSAqIDAuMDYgKiBrKVxuICAgICAgfVxuICAgICAgYS5vYmoucG9zaXRpb24uY29weShhLnBvcylcbiAgICAgIGlmIChhLmxpZmUgPD0gMCkge1xuICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZShhLm9iailcbiAgICAgICAgdGhpcy5hcnJvd3Muc3BsaWNlKGksIDEpXG4gICAgICB9XG4gICAgfVxuICAgIC8vIEtlZXAgdGhlIHdvcmxkIHRpZHk6IHJldGlyZSB0aGUgb2xkZXN0IHN0dWNrIGFycm93cyBiZXlvbmQgdGhlIGNhcC5cbiAgICBpZiAoc3R1Y2tDb3VudCA+IEFSUk9XX01BWF9TVFVDSykge1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmFycm93cy5sZW5ndGggJiYgc3R1Y2tDb3VudCA+IEFSUk9XX01BWF9TVFVDSzsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGEgPSB0aGlzLmFycm93c1tpXVxuICAgICAgICBpZiAoYS5zdHVjayAmJiBhLm1hZ25ldCA9PT0gMCkgeyBhLmxpZmUgPSBNYXRoLm1pbihhLmxpZmUsIDAuMDEpOyBzdHVja0NvdW50LS0gfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgaGl0Q3JlYXR1cmUoYzogQ3JlYXR1cmUsIGJhc2U6IG51bWJlciwgcG9pbnQ6IFRIUkVFLlZlY3RvcjMsIG5vcm1hbDogVEhSRUUuVmVjdG9yMywgZnJvbTogVEhSRUUuVmVjdG9yMywgcmFuZ2VkOiBib29sZWFuKTogdm9pZCB7XG4gICAgY29uc3QgY3JlYXRpdmUgPSB0aGlzLmNvbmZpZy5tb2RlID09PSAnY3JlYXRpdmUnXG4gICAgY29uc3QgY3JpdCA9IE1hdGgucmFuZG9tKCkgPCAocmFuZ2VkID8gMC4yIDogMC4xMilcbiAgICBjb25zdCBkbWcgPSBjcmVhdGl2ZSA/IDk5OSA6IE1hdGgucm91bmQoYmFzZSAqIChjcml0ID8gMS42IDogMSkgKiAxMCkgLyAxMFxuICAgIGNvbnN0IGRyb3BzID0gdGhpcy5jcmVhdHVyZXMuaGl0KGMsIGRtZywgZnJvbSwgcmFuZ2VkID8gMC42IDogMSlcbiAgICB0aGlzLmZ4LmJ1cnN0KGMuc3RhdC5uaWdodCA/ICdob2xsb3cnIDogJ2Jsb29kJywgcG9pbnQsIG5vcm1hbCwgY3JpdCA/IDEuNSA6IDEpXG4gICAgdGhpcy5hdWRpby5wbGF5KHJhbmdlZCA/ICdhcnJvd0hpdCcgOiAnaGl0JylcbiAgICBjb25zdCBzY3IgPSB0aGlzLnRvU2NyZWVuKHBvaW50KVxuICAgIGNvbnN0IGtpbGwgPSAhIWRyb3BzXG4gICAgaWYgKHNjcikgdGhpcy51aS5kYW1hZ2VOdW1iZXIoc2NyLngsIHNjci55LCBNYXRoLnJvdW5kKGRtZyksIGtpbGwgPyAna2lsbCcgOiBjcml0ID8gJ2NyaXQnIDogJ2hpdCcpXG4gICAgdGhpcy51aS5oaXRNYXJrZXIoa2lsbClcbiAgICB0aGlzLmhpdFN0b3AgPSBNYXRoLm1heCh0aGlzLmhpdFN0b3AsIGtpbGwgPyAwLjA4IDogY3JpdCA/IDAuMDYgOiAwLjAzNSlcbiAgICB0aGlzLnNoYWtlID0gTWF0aC5tYXgodGhpcy5zaGFrZSwga2lsbCA/IDAuMyA6IDAuMTQpXG4gICAgaWYgKGRyb3BzKSB7XG4gICAgICB0aGlzLmF1ZGlvLnBsYXkoJ2RpZScsIDAuOClcbiAgICAgIHRoaXMuZ2l2ZShkcm9wcywgcG9pbnQpXG4gICAgICB0aGlzLnhwKCdodW50aW5nJywgYy5raW5kID09PSAnaG93bGVyJyA/IDAgOiBjLnN0YXQubmlnaHQgPyA4IDogNSlcbiAgICB9IGVsc2UgdGhpcy54cCgnaHVudGluZycsIDEpXG4gIH1cblxuICBwcml2YXRlIHRvU2NyZWVuKHA6IFRIUkVFLlZlY3RvcjMpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0gfCBudWxsIHtcbiAgICBjb25zdCB2ID0gc2NyVi5jb3B5KHApLnByb2plY3QodGhpcy5wbGF5ZXIuY2FtZXJhKVxuICAgIGlmICh2LnogPiAxIHx8IE1hdGguYWJzKHYueCkgPiAxLjIgfHwgTWF0aC5hYnModi55KSA+IDEuMikgcmV0dXJuIG51bGxcbiAgICByZXR1cm4geyB4OiAodi54ICogMC41ICsgMC41KSAqIGlubmVyV2lkdGgsIHk6ICgtdi55ICogMC41ICsgMC41KSAqIGlubmVySGVpZ2h0IH1cbiAgfVxuXG4gIHByaXZhdGUgZHVzdENvbG9yKCk6IG51bWJlciB7XG4gICAgY29uc3QgcyA9IHRoaXMuc3RlcFN1cmZhY2UoKVxuICAgIHJldHVybiBzID09PSAnc2FuZCcgPyAweGQ4YzQ5YSA6IHMgPT09ICdzdG9uZScgPyAweGE4YTI5NiA6IHMgPT09ICd3b29kJyA/IDB4Yjg5YTc0IDogMHg5YTg0NjhcbiAgfVxuXG4gIHByaXZhdGUgZmFsbG9mZihwOiBUSFJFRS5WZWN0b3IzLCByYW5nZTogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBkID0gcC5kaXN0YW5jZVRvKHRoaXMucGxheWVyLmJvZHkucG9zKVxuICAgIHJldHVybiBNYXRoLm1heCgwLCAxIC0gZCAvIHJhbmdlKVxuICB9XG5cbiAgcHJpdmF0ZSBzdGVwU3VyZmFjZSgpOiBTdGVwU3VyZmFjZSB7XG4gICAgY29uc3QgcCA9IHRoaXMucGxheWVyLmJvZHkucG9zXG4gICAgaWYgKHAueSA8IFNFQV9MRVZFTCArIDAuMikgcmV0dXJuICd3YXRlcidcbiAgICBjb25zdCB0aCA9IHRoaXMudGVycmFpbi5oZWlnaHQocC54LCBwLnopXG4gICAgaWYgKHAueSAtIHRoID4gMC4wNSkge1xuICAgICAgY29uc3QgdW5kZXIgPSB0aGlzLmJ1aWxkaW5nLm5lYXIocC54LCBwLnosIDAuNCkuZmluZChwYyA9PiBNYXRoLmFicyhwaWVjZUJveChwYykubWF4WSAtIHAueSkgPCAwLjEyKVxuICAgICAgaWYgKHVuZGVyKSByZXR1cm4gUElFQ0VTW3VuZGVyLmlkXS5tYXQgPT09ICdzdG9uZScgPyAnc3RvbmUnIDogJ3dvb2QnXG4gICAgfVxuICAgIGNvbnN0IHMgPSB0aGlzLnRlcnJhaW4uc3VyZmFjZUF0KHAueCwgcC56KVxuICAgIHJldHVybiBzID09PSAncm9jaycgfHwgcyA9PT0gJ3N0b25lJyB8fCBzID09PSAnc25vdycgPyAnc3RvbmUnIDogcyA9PT0gJ3NhbmQnID8gJ3NhbmQnIDogJ2dyYXNzJ1xuICB9XG5cbiAgcHJpdmF0ZSBzZWxlY3RlZFN0YWNrKCkge1xuICAgIHJldHVybiB0aGlzLmludmVudG9yeS5zbG90c1t0aGlzLnNlbGVjdGVkXVxuICB9XG5cbiAgcHJpdmF0ZSB1cGRhdGVUYXJnZXQoKTogdm9pZCB7XG4gICAgY29uc3QgZXllID0gdGhpcy5wbGF5ZXIuZXllKHRtcFYpXG4gICAgY29uc3QgZGlyID0gdGhpcy5wbGF5ZXIuZm9yd2FyZCh0bXBWMilcbiAgICB0aGlzLnRhcmdldCA9IHRoaXMucGh5c2ljcy5yYXljYXN0KGV5ZS5jbG9uZSgpLCBkaXIuY2xvbmUoKSwgQ09ORklHLnBsYXllci5yZWFjaCwgdGhpcy5jcmVhdHVyZXMudGFyZ2V0cygpKVxuICB9XG5cbiAgcHJpdmF0ZSBhY3Rpb25zKGR0OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBpbnB1dCA9IHRoaXMuaW5wdXRcbiAgICB0aGlzLnN3aW5nQ2QgLT0gZHRcbiAgICB0aGlzLnVzZUNkIC09IGR0XG4gICAgY29uc3Qgc3RhY2sgPSB0aGlzLnNlbGVjdGVkU3RhY2soKVxuICAgIGNvbnN0IGRlZiA9IHN0YWNrID8gSVRFTVNbc3RhY2suaWRdIDogbnVsbFxuICAgIGNvbnN0IHRvb2wgPSBkZWY/LnRvb2xcbiAgICBpZiAodG9vbD8ua2luZCA9PT0gJ2JvdycpIHtcbiAgICAgIGNvbnN0IGNhbkRyYXcgPSB0aGlzLmludmVudG9yeS5pbmZpbml0ZSB8fCB0aGlzLmludmVudG9yeS5jb3VudCgnYXJyb3cnKSA+IDBcbiAgICAgIGlmIChpbnB1dC5oZWxkKCdwcmltYXJ5JykgJiYgY2FuRHJhdykge1xuICAgICAgICBpZiAodGhpcy5kcmF3VCA9PT0gMCkgdGhpcy5hdWRpby5wbGF5KCdib3dEcmF3JywgMC44KVxuICAgICAgICB0aGlzLmRyYXdUICs9IGR0XG4gICAgICAgIGNvbnN0IGQgPSBNYXRoLm1pbigxLCB0aGlzLmRyYXdUIC8gMC44KVxuICAgICAgICB0aGlzLnBsYXllci5kcmF3ID0gZFxuICAgICAgICB0aGlzLnVpLnNldENoYXJnZShkKVxuICAgICAgfSBlbHNlIGlmICh0aGlzLmRyYXdUID4gMCkge1xuICAgICAgICBjb25zdCBkID0gTWF0aC5taW4oMSwgdGhpcy5kcmF3VCAvIDAuOClcbiAgICAgICAgaWYgKGQgPiAwLjIpIHRoaXMuZmlyZUFycm93KGQpXG4gICAgICAgIHRoaXMuZHJhd1QgPSAwXG4gICAgICAgIHRoaXMucGxheWVyLmRyYXcgPSAwXG4gICAgICAgIHRoaXMudWkuc2V0Q2hhcmdlKG51bGwpXG4gICAgICB9IGVsc2UgaWYgKGlucHV0LmhlbGQoJ3ByaW1hcnknKSAmJiAhY2FuRHJhdyAmJiB0aGlzLnVzZUNkIDw9IDApIHtcbiAgICAgICAgdGhpcy51aS5oaW50KCdZb3UgbmVlZCBhcnJvd3Mg4oCUIGNyYWZ0IHRoZW0gYXQgYSB3b3JrYmVuY2gnLCB0cnVlKVxuICAgICAgICB0aGlzLnVzZUNkID0gMVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodGhpcy5kcmF3VCA+IDApIHtcbiAgICAgIHRoaXMuZHJhd1QgPSAwXG4gICAgICB0aGlzLnBsYXllci5kcmF3ID0gMFxuICAgICAgdGhpcy51aS5zZXRDaGFyZ2UobnVsbClcbiAgICB9XG4gICAgaWYgKHRvb2w/LmtpbmQgIT09ICdib3cnICYmIGlucHV0LmhlbGQoJ3ByaW1hcnknKSAmJiB0aGlzLnN3aW5nQ2QgPD0gMCkge1xuICAgICAgY29uc3QgdGlyZWQgPSB0aGlzLmNvbmZpZy5tb2RlID09PSAnc3Vydml2YWwnICYmIHRoaXMuc3RhdHMuc3RhbWluYSA8IENPTkZJRy5zdXJ2aXZhbC5zdGFtaW5hU3dpbmdDb3N0XG4gICAgICBjb25zdCBkdXIgPSAodG9vbD8uc3dpbmcgPz8gMC4zNikgKiAodGlyZWQgPyAxLjYgOiAxKVxuICAgICAgaWYgKCF0aXJlZCAmJiB0aGlzLmNvbmZpZy5tb2RlID09PSAnc3Vydml2YWwnKSB7XG4gICAgICAgIHRoaXMuc3RhdHMuc3RhbWluYSAtPSBDT05GSUcuc3Vydml2YWwuc3RhbWluYVN3aW5nQ29zdFxuICAgICAgICB0aGlzLnN0YXRzLnN0YW1pbmFXYWl0ID0gQ09ORklHLnN1cnZpdmFsLnN0YW1pbmFEZWxheSAqIDAuNVxuICAgICAgfVxuICAgICAgdGhpcy5zd2luZ0NkID0gZHVyXG4gICAgICB0aGlzLmltcGFjdEluID0gZHVyICogMC40MlxuICAgICAgdGhpcy5wbGF5ZXIuc3RhcnRTd2luZyhkdXIpXG4gICAgICB0aGlzLmF1ZGlvLnBsYXkoJ3N3aW5nJywgMC43KVxuICAgIH1cbiAgICBpZiAodGhpcy5pbXBhY3RJbiA+PSAwKSB7XG4gICAgICB0aGlzLmltcGFjdEluIC09IGR0XG4gICAgICBpZiAodGhpcy5pbXBhY3RJbiA8IDApIHRoaXMuaW1wYWN0KClcbiAgICB9XG4gICAgaWYgKGlucHV0LmNvbnN1bWUoJ3JvdGF0ZScpKSB7XG4gICAgICB0aGlzLnJvdE9mZnNldCA9ICh0aGlzLnJvdE9mZnNldCArIDEpICUgNFxuICAgICAgdGhpcy5hdWRpby5wbGF5KCd1aScsIDAuNSlcbiAgICB9XG4gICAgY29uc3Qgd2FudHNVc2UgPSBpbnB1dC5jb25zdW1lKCdzZWNvbmRhcnknKSB8fCAoaW5wdXQuaGVsZCgnc2Vjb25kYXJ5JykgJiYgdGhpcy51c2VDZCA8PSAtMC4wNSAmJiBkZWY/LnBsYWNlICYmIGRlZi5wbGFjZSAhPT0gJ2NhbXBmaXJlJyAmJiBkZWYucGxhY2UgIT09ICd3b3JrYmVuY2gnKVxuICAgIGlmICh3YW50c1VzZSAmJiB0aGlzLnVzZUNkIDw9IDApIHRoaXMudXNlKClcbiAgfVxuXG4gIHByaXZhdGUgaW1wYWN0KCk6IHZvaWQge1xuICAgIGNvbnN0IGhpdCA9IHRoaXMudGFyZ2V0XG4gICAgaWYgKCFoaXQpIHJldHVyblxuICAgIGNvbnN0IHN0YWNrID0gdGhpcy5zZWxlY3RlZFN0YWNrKClcbiAgICBjb25zdCB0b29sID0gc3RhY2sgPyBJVEVNU1tzdGFjay5pZF0udG9vbCA6IHVuZGVmaW5lZFxuICAgIGNvbnN0IGNyZWF0aXZlID0gdGhpcy5jb25maWcubW9kZSA9PT0gJ2NyZWF0aXZlJ1xuICAgIGxldCB3ZWFyID0gZmFsc2VcbiAgICBzd2l0Y2ggKGhpdC5raW5kKSB7XG4gICAgICBjYXNlICdjcmVhdHVyZSc6IHtcbiAgICAgICAgY29uc3QgYyA9IGhpdC5jcmVhdHVyZSBhcyBDcmVhdHVyZVxuICAgICAgICBjb25zdCBkbWcgPSAodG9vbCA/ICh0b29sLmtpbmQgPT09ICd3ZWFwb24nID8gdG9vbC5kYW1hZ2UgOiB0b29sLmRhbWFnZSAqIDAuNikgOiAyKSAqIENPTkZJRy5taW5pbmcucG93ZXIgKiBza2lsbEJvbnVzKHRoaXMuc2tpbGxzLCAnaHVudGluZycpXG4gICAgICAgIHRoaXMuaGl0Q3JlYXR1cmUoYywgZG1nLCBoaXQucG9pbnQsIGhpdC5ub3JtYWwsIHRoaXMucGxheWVyLmJvZHkucG9zLCBmYWxzZSlcbiAgICAgICAgdGhpcy5wbGF5ZXIuYWRkS2ljaygtMC4wMTUsIChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIDAuMDIpXG4gICAgICAgIHdlYXIgPSAhIXRvb2xcbiAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICAgIGNhc2UgJ3Jlc291cmNlJzoge1xuICAgICAgICBjb25zdCByID0gaGl0LnJlcyFcbiAgICAgICAgY29uc3QgZGVmID0gUkVTW3IudHlwZV1cbiAgICAgICAgY29uc3QgcG93ZXIgPSByZXNvdXJjZVBvd2VyKHRvb2wsIGRlZi5tYXQpXG4gICAgICAgIGlmIChwb3dlciA8PSAwICYmICFjcmVhdGl2ZSkge1xuICAgICAgICAgIHRoaXMuZnguYnVyc3QoZGVmLm1hdCA9PT0gJ2NyeXN0YWwnID8gJ2NyeXN0YWwnIDogJ3N0b25lJywgaGl0LnBvaW50LCBoaXQubm9ybWFsLCAwLjMpXG4gICAgICAgICAgdGhpcy5hdWRpby5wbGF5KCdtaW5lJywgMC40LCAwLjcpXG4gICAgICAgICAgY29uc3QgbmVlZCA9IG5lZWRlZFRvb2woZGVmLm1hdClcbiAgICAgICAgICBpZiAobmVlZCkgdGhpcy51aS5oaW50KG5lZWQsIHRydWUpXG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2tpbGw6IFNraWxsSWQgPSBkZWYubWF0ID09PSAnd29vZCcgPyAnd29vZGN1dHRpbmcnIDogZGVmLm1hdCA9PT0gJ3NvZnQnID8gJ2ZvcmFnaW5nJyA6ICdtaW5pbmcnXG4gICAgICAgIHIuaHAgLT0gY3JlYXRpdmUgPyA5OTkgOiBwb3dlciAqIENPTkZJRy5taW5pbmcucG93ZXIgKiBza2lsbEJvbnVzKHRoaXMuc2tpbGxzLCBza2lsbClcbiAgICAgICAgY29uc3QgZ2xvdyA9IGRlZi5tYXQgPT09ICdjcnlzdGFsJ1xuICAgICAgICB0aGlzLmZ4LmJ1cnN0KGRlZi5tYXQgPT09ICd3b29kJyA/ICd3b29kJyA6IGRlZi5tYXQgPT09ICdzdG9uZScgPyAnc3RvbmUnIDogZ2xvdyA/ICdjcnlzdGFsJyA6IGRlZi5tYXQgPT09ICdzb2Z0JyA/ICdzb2Z0JyA6ICd3b29kJywgaGl0LnBvaW50LCBoaXQubm9ybWFsKVxuICAgICAgICBpZiAoci50eXBlID09PSAnb2FrJyB8fCByLnR5cGUgPT09ICdwaW5lJykgdGhpcy5meC5sZWF2ZXModG1wVi5zZXQoci54LCByLnkgKyA0LjUgKiByLnMsIHIueikuY2xvbmUoKSwgNCwgMS44KVxuICAgICAgICBpZiAoZGVmLm1hdCA9PT0gJ3dvb2QnIHx8IGRlZi5tYXQgPT09ICdzdG9uZScpIHtcbiAgICAgICAgICB0aGlzLmhpdFN0b3AgPSBNYXRoLm1heCh0aGlzLmhpdFN0b3AsIDAuMDI1KVxuICAgICAgICAgIHRoaXMuc2hha2UgPSBNYXRoLm1heCh0aGlzLnNoYWtlLCAwLjA4KVxuICAgICAgICAgIHRoaXMucGxheWVyLmFkZEtpY2soLTAuMDEyLCAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiAwLjAxMilcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmF1ZGlvLnBsYXkoZGVmLm1hdCA9PT0gJ3dvb2QnID8gJ2Nob3AnIDogZGVmLm1hdCA9PT0gJ3N0b25lJyA/ICdtaW5lJyA6IGdsb3cgPyAnY3J5c3RhbCcgOiAnc29mdCcpXG4gICAgICAgIGlmIChyLmhwIDw9IDApIHRoaXMuaGFydmVzdChyKVxuICAgICAgICB3ZWFyID0gISF0b29sICYmIGRlZi5tYXQgIT09ICdzb2Z0J1xuICAgICAgICBicmVha1xuICAgICAgfVxuICAgICAgY2FzZSAncGllY2UnOiB7XG4gICAgICAgIGNvbnN0IHAgPSBoaXQucGllY2UhXG4gICAgICAgIGNvbnN0IHBkID0gUElFQ0VTW3AuaWRdXG4gICAgICAgIHAuaHAgLT0gY3JlYXRpdmUgPyA5OTkgOiBwaWVjZVBvd2VyKHRvb2wsIHBkLm1hdCkgKiBDT05GSUcubWluaW5nLnBvd2VyXG4gICAgICAgIHRoaXMuZnguYnVyc3QocGQubWF0ID09PSAnc3RvbmUnID8gJ3N0b25lJyA6ICd3b29kJywgaGl0LnBvaW50LCBoaXQubm9ybWFsLCAwLjgpXG4gICAgICAgIHRoaXMuYXVkaW8ucGxheShwZC5tYXQgPT09ICdzdG9uZScgPyAnbWluZScgOiBwZC5tYXQgPT09ICd3b29kJyA/ICdjaG9wJyA6ICdzb2Z0JylcbiAgICAgICAgaWYgKHAuaHAgPD0gMCkgdGhpcy5yZW1vdmVQaWVjZShwKVxuICAgICAgICB3ZWFyID0gISF0b29sXG4gICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgICBjYXNlICd0ZXJyYWluJzoge1xuICAgICAgICBjb25zdCBzdXJmYWNlID0gdGhpcy50ZXJyYWluLnN1cmZhY2VBdChoaXQucG9pbnQueCwgaGl0LnBvaW50LnopXG4gICAgICAgIGNvbnN0IHJvY2sgPSBzdXJmYWNlID09PSAncm9jaycgfHwgc3VyZmFjZSA9PT0gJ3N0b25lJyB8fCBzdXJmYWNlID09PSAnc25vdydcbiAgICAgICAgY29uc3QgayA9IGNyZWF0aXZlID8gMS41IDogZGlnUG93ZXIodG9vbCwgcm9jaylcbiAgICAgICAgY29uc3QgZGlydHkgPSB0aGlzLnRlcnJhaW4uZGVmb3JtKGhpdC5wb2ludC54LCBoaXQucG9pbnQueiwgQ09ORklHLm1pbmluZy5kaWdSYWRpdXMsIC1DT05GSUcubWluaW5nLmRpZ0RlcHRoICogaywgQ09ORklHLm1pbmluZy5tYXhEaWdEZXB0aClcbiAgICAgICAgdGhpcy5tYXAuaW52YWxpZGF0ZShoaXQucG9pbnQueCwgaGl0LnBvaW50LnopXG4gICAgICAgIHRoaXMuY2h1bmtzLnJlYnVpbGQoZGlydHkpXG4gICAgICAgIHRoaXMuZnguYnVyc3Qocm9jayA/ICdzdG9uZScgOiBzdXJmYWNlID09PSAnc2FuZCcgPyAnc2FuZCcgOiAnZGlydCcsIGhpdC5wb2ludCwgaGl0Lm5vcm1hbClcbiAgICAgICAgdGhpcy5wbGF5ZXIuYWRkS2ljaygtMC4wMSlcbiAgICAgICAgdGhpcy5hdWRpby5wbGF5KHJvY2sgPyAnbWluZScgOiAnZGlnJylcbiAgICAgICAgdGhpcy5kaWdBY2MgKz0gayAqIDAuNTVcbiAgICAgICAgd2hpbGUgKHRoaXMuZGlnQWNjID49IDEpIHtcbiAgICAgICAgICB0aGlzLmRpZ0FjYyAtPSAxXG4gICAgICAgICAgdGhpcy5naXZlKFtbcm9jayA/ICdzdG9uZScgOiAnc29pbCcsIDFdXSwgaGl0LnBvaW50KVxuICAgICAgICB9XG4gICAgICAgIHdlYXIgPSAhIXRvb2xcbiAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHdlYXIgJiYgdG9vbCAmJiB0aGlzLmludmVudG9yeS53ZWFyKHRoaXMuc2VsZWN0ZWQpKSB7XG4gICAgICB0aGlzLmF1ZGlvLnBsYXkoJ3Rvb2xicmVhaycpXG4gICAgICB0aGlzLnVpLnRvYXN0KG51bGwsIGBZb3VyICR7SVRFTVNbc3RhY2shLmlkXS5uYW1lfSBicm9rZWApXG4gICAgfVxuICAgIHRoaXMuaW52RGlydHkgPSB0cnVlXG4gIH1cblxuICBwcml2YXRlIGdpdmUoZHJvcHM6IFtJdGVtSWQsIG51bWJlcl1bXSwgYXQ6IFRIUkVFLlZlY3RvcjMpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IFtpZCwgbl0gb2YgZHJvcHMpIHtcbiAgICAgIGNvbnN0IGxlZnQgPSB0aGlzLmludmVudG9yeS5pbmZpbml0ZSA/IDAgOiB0aGlzLmludmVudG9yeS5hZGQoaWQsIG4pXG4gICAgICBjb25zdCBnb3QgPSBuIC0gbGVmdFxuICAgICAgaWYgKGdvdCA+IDApIHtcbiAgICAgICAgdGhpcy51aS50b2FzdChpZCwgYCske2dvdH0gJHtJVEVNU1tpZF0ubmFtZX1gKVxuICAgICAgICBjb25zdCBzY3IgPSB0aGlzLnRvU2NyZWVuKGF0KVxuICAgICAgICBpZiAoc2NyKSB0aGlzLnVpLnBpY2t1cEZseShpZCwgc2NyLngsIHNjci55LCBnb3QpXG4gICAgICAgIGlmIChpZCA9PT0gJ3dvb2QnKSB0aGlzLmNvdW50ZXJzLndvb2QgKz0gZ290XG4gICAgICAgIGlmIChpZCA9PT0gJ2ZpYmVyJykgdGhpcy5jb3VudGVycy5maWJlciArPSBnb3RcbiAgICAgIH1cbiAgICAgIGlmIChsZWZ0ID4gMCkgdGhpcy51aS50b2FzdChudWxsLCAnUGFjayBpcyBmdWxsJylcbiAgICAgIHRoaXMuZnguY29sbGVjdChhdCwgaWQgPT09ICdjcnlzdGFsJyA/IDB4NzllMGQyIDogaWQgPT09ICd3b29kJyA/IDB4ZDhiMjdhIDogMHhlZmU2ZDIsIE1hdGgubWluKDYsIDIgKyBuKSlcbiAgICB9XG4gICAgdGhpcy5hdWRpby5wbGF5KCdwaWNrdXAnKVxuICAgIHRoaXMuaW52RGlydHkgPSB0cnVlXG4gIH1cblxuICBwcml2YXRlIGRldGFjaChyOiBSZXNvdXJjZSk6IFRIUkVFLkdyb3VwIHtcbiAgICBjb25zdCBCID0gbmV3QnVpbGRlcnMoKVxuICAgIGNvbnN0IHkgPSByLnlcbiAgICBidWlsZFJlc291cmNlKHIsIEIsIHIueCwgeSwgci56KVxuICAgIGNvbnN0IGcgPSBuZXcgVEhSRUUuR3JvdXAoKVxuICAgIGcucG9zaXRpb24uc2V0KHIueCwgeSwgci56KVxuICAgIGZvciAoY29uc3Qga2V5IG9mIEJVSUxERVJfS0VZUykge1xuICAgICAgY29uc3QgZ2VvID0gQltrZXldLmJ1aWxkKClcbiAgICAgIGlmICghZ2VvKSBjb250aW51ZVxuICAgICAgY29uc3QgbSA9IG5ldyBUSFJFRS5NZXNoKGdlbywgdGhpcy5jaHVua3MubGF5ZXJNYXRba2V5XSlcbiAgICAgIG0uY2FzdFNoYWRvdyA9IGtleSAhPT0gJ2dsb3cnXG4gICAgICBtLnVzZXJEYXRhLmRpc3Bvc2FibGUgPSB0cnVlXG4gICAgICBnLmFkZChtKVxuICAgIH1cbiAgICByZXR1cm4gZ1xuICB9XG4gIHByaXZhdGUgaGFydmVzdChyOiBSZXNvdXJjZSk6IHZvaWQge1xuICAgIGNvbnN0IGRlZiA9IFJFU1tyLnR5cGVdXG4gICAgY29uc3QgZHJvcHMgPSByb2xsRHJvcHMociwgTWF0aC5yYW5kb20pXG4gICAgaWYgKGRlZi5tYXQgPT09ICdzb2Z0JyAmJiBkcm9wcy5sZW5ndGggJiYgTWF0aC5yYW5kb20oKSA8IHNraWxsQm9udXModGhpcy5za2lsbHMsICdmb3JhZ2luZycpIC0gMSkgZHJvcHNbMF0gPSBbZHJvcHNbMF1bMF0sIGRyb3BzWzBdWzFdICsgMV1cbiAgICB0aGlzLnhwKGRlZi5tYXQgPT09ICd3b29kJyA/ICd3b29kY3V0dGluZycgOiBkZWYubWF0ID09PSAnc29mdCcgPyAnZm9yYWdpbmcnIDogJ21pbmluZycsIGRlZi5tYXQgPT09ICdzb2Z0JyA/IDIgOiBkZWYubWF0ID09PSAnY3J5c3RhbCcgPyA4IDogNSlcbiAgICBjb25zdCBjZW50ZXIgPSB0bXBWLnNldChyLngsIHIueSArIChkZWYuc2hhcGVzWzBdLmR5ICsgMC40KSAqIHIucywgci56KS5jbG9uZSgpXG4gICAgY29uc3Qgb2JqID0gdGhpcy5kZXRhY2gocilcbiAgICBjb25zdCBkZWxheSA9IHJlZ3Jvd0RlbGF5KGRlZiwgci50eXBlLCAhIXIucG9pLCBDT05GSUcubWluaW5nLnJlZ3Jvd1NlY29uZHMpXG4gICAgdGhpcy5oYXJ2ZXN0ZWQuc2V0KHIua2V5LCBkZWxheSA8IDAgPyAtMSA6IHRoaXMud29ybGRTZWNvbmRzICsgZGVsYXkpXG4gICAgY29uc3QgY2h1bmsgPSB0aGlzLmNodW5rcy5jaHVua09mKHIpXG4gICAgaWYgKGNodW5rKSB0aGlzLmNodW5rcy5yZWJ1aWxkUmVzb3VyY2VzKGNodW5rLmtleSlcbiAgICBpZiAoci50eXBlID09PSAnb2FrJyB8fCByLnR5cGUgPT09ICdwaW5lJykge1xuICAgICAgY29uc3QgYXdheSA9IG5ldyBUSFJFRS5WZWN0b3IzKHIueCAtIHRoaXMucGxheWVyLmJvZHkucG9zLngsIDAsIHIueiAtIHRoaXMucGxheWVyLmJvZHkucG9zLnopLm5vcm1hbGl6ZSgpXG4gICAgICB0aGlzLmZ4LmFuaW1hdGVQcm9wKG9iaiwgJ2ZhbGwnLCBhd2F5LCB1bmRlZmluZWQsIDUgKiByLnMpXG4gICAgICB0aGlzLmZ4LmxlYXZlcyh0bXBWLnNldChyLngsIHIueSArIDQgKiByLnMsIHIueikuY2xvbmUoKSwgMTAsIDIpXG4gICAgICB0aGlzLmF1ZGlvLnBsYXkoJ3RyZWVmYWxsJylcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5meC5hbmltYXRlUHJvcChvYmosIGRlZi5tYXQgPT09ICdzb2Z0JyA/ICdwb3AnIDogJ3NocmluaycpXG4gICAgICBpZiAoZGVmLm1hdCAhPT0gJ3NvZnQnKSB0aGlzLmF1ZGlvLnBsYXkoJ2JyZWFrJylcbiAgICAgIHRoaXMuZnguYnVyc3QoZGVmLm1hdCA9PT0gJ2NyeXN0YWwnID8gJ2NyeXN0YWwnIDogZGVmLm1hdCA9PT0gJ3NvZnQnID8gJ3NvZnQnIDogZGVmLm1hdCA9PT0gJ3dvb2QnID8gJ3dvb2QnIDogJ3N0b25lJywgY2VudGVyLCBVUCwgMS44KVxuICAgICAgaWYgKGRlZi5tYXQgPT09ICdzdG9uZScgfHwgZGVmLm1hdCA9PT0gJ2NyeXN0YWwnKSB0aGlzLnNoYWtlID0gTWF0aC5tYXgodGhpcy5zaGFrZSwgMC4xOClcbiAgICB9XG4gICAgaWYgKGRlZi5sb290KSB7XG4gICAgICB0aGlzLnVpLmJhbm5lcignQ2FjaGUgb3BlbmVkJywgJ1N1cHBsaWVzIHJlY292ZXJlZC4nKVxuICAgICAgdGhpcy5hdWRpby5wbGF5KCdjaGVzdCcpXG4gICAgICB0aGlzLmZ4LmdsaW50KGNlbnRlciwgMHhmZmQ4OGEsIDQsIDAuNylcbiAgICAgIHRoaXMuZngucmluZyh0bXBWLnNldChyLngsIHIueSwgci56KS5jbG9uZSgpLCAweGZmZDg4YSwgMS42LCAwLjcpXG4gICAgfVxuICAgIHRoaXMuZ2l2ZShkcm9wcywgY2VudGVyKVxuICB9XG5cbiAgcHJpdmF0ZSByZW1vdmVQaWVjZShwOiBQaWVjZSk6IHZvaWQge1xuICAgIGNvbnN0IHN0b3JlID0gdGhpcy5idWlsZGluZy5zdG9yZXMuZ2V0KHAudWlkKVxuICAgIGlmIChzdG9yZSkge1xuICAgICAgaWYgKHRoaXMuY2hlc3RVaWQgPT09IHAudWlkKSB0aGlzLmNsb3NlSW52ZW50b3J5KClcbiAgICAgIGxldCBsb3N0ID0gMFxuICAgICAgZm9yIChjb25zdCBzdCBvZiBzdG9yZSkgaWYgKHN0KSBsb3N0ICs9IHRoaXMuaW52ZW50b3J5LmluZmluaXRlID8gMCA6IHRoaXMuaW52ZW50b3J5LmFkZChzdC5pZCwgc3Qubiwgc3QuZHVyKVxuICAgICAgY29uc3QgbiA9IHN0b3JlLmZpbHRlcihCb29sZWFuKS5sZW5ndGhcbiAgICAgIGlmIChuKSB7XG4gICAgICAgIHRoaXMudWkudG9hc3QoJ3N0b3JhZ2VfY2hlc3QnIGFzIEl0ZW1JZCwgbG9zdCA/IGBDaGVzdCBlbXB0aWVkIOKAlCAke2xvc3R9IGl0ZW1zIGRpZG4ndCBmaXRgIDogYENoZXN0IGVtcHRpZWQgaW50byB5b3VyIHBhY2tgKVxuICAgICAgICB0aGlzLmZ4LmNvbGxlY3QodG1wVi5zZXQocC54LCBwLnkgKyAwLjUsIHAueikuY2xvbmUoKSwgMHhmMmM0NmIsIE1hdGgubWluKDgsIDIgKyBuKSlcbiAgICAgICAgdGhpcy5pbnZEaXJ0eSA9IHRydWVcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3Qgb2JqID0gdGhpcy5idWlsZGluZy5vYmplY3QocC51aWQpPy5jbG9uZSgpXG4gICAgdGhpcy5idWlsZGluZy5yZW1vdmUocC51aWQpXG4gICAgdGhpcy53YXJkc0RpcnR5ID0gdHJ1ZVxuICAgIGlmIChvYmopIHRoaXMuZnguYW5pbWF0ZVByb3Aob2JqLCAnc2hyaW5rJylcbiAgICB0aGlzLmZ4LmJ1cnN0KCdyZW1vdmUnLCB0bXBWLnNldChwLngsIHAueSArIDAuNSwgcC56KS5jbG9uZSgpLCBVUClcbiAgICB0aGlzLmF1ZGlvLnBsYXkoJ3JlbW92ZScpXG4gICAgaWYgKHRoaXMuY29uZmlnLm1vZGUgPT09ICdzdXJ2aXZhbCcpIHRoaXMuZ2l2ZShbW1BJRUNFU1twLmlkXS5pdGVtLCAxXV0sIHRtcFYuc2V0KHAueCwgcC55ICsgMC41LCBwLnopLmNsb25lKCkpXG4gICAgaWYgKHRoaXMuc3Bhd25Qb2ludCAmJiBwLmlkID09PSAnY2FtcGZpcmUnICYmIE1hdGguaHlwb3QodGhpcy5zcGF3blBvaW50LnggLSBwLngsIHRoaXMuc3Bhd25Qb2ludC56IC0gcC56KSA8IDEpIHtcbiAgICAgIHRoaXMuc3Bhd25Qb2ludCA9IG51bGxcbiAgICAgIHRoaXMudWkudG9hc3QobnVsbCwgJ1Jlc3Bhd24gcG9pbnQgY2xlYXJlZCcpXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBjb21wdXRlUGxhY2VtZW50KCk6IHZvaWQge1xuICAgIHRoaXMucGxhY2VtZW50ID0gbnVsbFxuICAgIGNvbnN0IHN0YWNrID0gdGhpcy5zZWxlY3RlZFN0YWNrKClcbiAgICBjb25zdCBkZWYgPSBzdGFjayA/IElURU1TW3N0YWNrLmlkXSA6IG51bGxcbiAgICBjb25zdCBoaXQgPSB0aGlzLnRhcmdldFxuICAgIGlmICghZGVmPy5wbGFjZSB8fCBkZWYucGxhY2UgPT09ICdzb2lsJyB8fCAhaGl0IHx8IGhpdC5raW5kID09PSAnY3JlYXR1cmUnKSByZXR1cm5cbiAgICBjb25zdCBwZCA9IFBJRUNFU1tkZWYucGxhY2VdXG4gICAgbGV0IGhpdFBpZWNlID0gaGl0LmtpbmQgPT09ICdwaWVjZScgPyBoaXQucGllY2UgPz8gbnVsbCA6IG51bGxcbiAgICBsZXQgaGl0UG9pbnQgPSBoaXQucG9pbnRcbiAgICAvLyBUZXJyYWluIHBva2luZyB1cCB0aHJvdWdoIChvciBhaW1lZCBqdXN0IGJlc2lkZSkgYSBmb3VuZGF0aW9uL2Zsb29yOiB0cmVhdCBhbiBlZGdlIG9yIGNvcm5lclxuICAgIC8vIHBpZWNlIGFpbWVkIHRoZXJlIGFzIGFpbWVkIGF0IHRoYXQgcGllY2UncyB0b3AsIHNvIHdhbGxzIHNuYXAgb250byBpdHMgZWRnZXMgaW5zdGVhZCBvZlxuICAgIC8vIGRyb3BwaW5nIHRvIGdyb3VuZCBsZXZlbCBhbmQgY2xpcHBpbmcgaW50byBpdC5cbiAgICBpZiAoIWhpdFBpZWNlICYmIGhpdC5raW5kID09PSAndGVycmFpbicgJiYgKHBkLnNuYXAgPT09ICdlZGdlJyB8fCBwZC5zbmFwID09PSAnY29ybmVyJykpIHtcbiAgICAgIGNvbnN0IG0gPSAwLjVcbiAgICAgIGZvciAoY29uc3QgbyBvZiB0aGlzLmJ1aWxkaW5nLm5lYXIoaGl0LnBvaW50LngsIGhpdC5wb2ludC56LCAyKSkge1xuICAgICAgICBpZiAoUElFQ0VTW28uaWRdLnNuYXAgIT09ICdjZWxsJyB8fCAhUElFQ0VTW28uaWRdLnNvbGlkKSBjb250aW51ZVxuICAgICAgICBjb25zdCBiID0gcGllY2VCb3gobylcbiAgICAgICAgaWYgKGhpdC5wb2ludC54IDwgYi5taW5YIC0gbSB8fCBoaXQucG9pbnQueCA+IGIubWF4WCArIG0gfHwgaGl0LnBvaW50LnogPCBiLm1pblogLSBtIHx8IGhpdC5wb2ludC56ID4gYi5tYXhaICsgbSkgY29udGludWVcbiAgICAgICAgaWYgKGhpdC5wb2ludC55IDwgYi5tYXhZICsgMC42ICYmIGhpdC5wb2ludC55ID4gYi5taW5ZIC0gMC40KSB7XG4gICAgICAgICAgaGl0UGllY2UgPSBvXG4gICAgICAgICAgLy8gQ2xhbXAganVzdCBpbnNpZGUgdGhlIGZvb3RwcmludCBzbyB0aGUgbmVhcmVzdCBlZGdlIGlzIHRoZSBvbmUgeW91IGFpbWVkIGJlc2lkZS5cbiAgICAgICAgICBoaXRQb2ludCA9IGhpdC5wb2ludC5jbG9uZSgpLnNldChcbiAgICAgICAgICAgIE1hdGgubWluKGIubWF4WCAtIDAuMDIsIE1hdGgubWF4KGIubWluWCArIDAuMDIsIGhpdC5wb2ludC54KSksIGIubWF4WSxcbiAgICAgICAgICAgIE1hdGgubWluKGIubWF4WiAtIDAuMDIsIE1hdGgubWF4KGIubWluWiArIDAuMDIsIGhpdC5wb2ludC56KSkpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBwID0gc25hcFBpZWNlKHBkLCB7IHBvaW50OiBoaXRQb2ludCwgbm9ybWFsOiBoaXRQaWVjZSAmJiBoaXRQaWVjZSAhPT0gaGl0LnBpZWNlID8gVVAgOiBoaXQubm9ybWFsLCBwaWVjZTogaGl0UGllY2UgfSwgdGhpcy5wbGF5ZXIueWF3LCB0aGlzLnJvdE9mZnNldClcbiAgICAvLyBBIDIgbSBncmlkIGNlbGwgYWltZWQgbmVhciB5b3VyIGZlZXQgd291bGQgb3ZlcmxhcCB5b3U7IHNsaWRlIGl0IG9uZSBjZWxsIGZ1cnRoZXIgb3V0LlxuICAgIGlmIChwZC5zbmFwID09PSAnY2VsbCcgJiYgaGl0LmtpbmQgPT09ICd0ZXJyYWluJyAmJiB0aGlzLm92ZXJsYXBzUGxheWVyKHBsYWNlbWVudEJveChwZCwgcCkpKSB7XG4gICAgICBjb25zdCBmeCA9IC1NYXRoLnNpbih0aGlzLnBsYXllci55YXcpXG4gICAgICBjb25zdCBmeiA9IC1NYXRoLmNvcyh0aGlzLnBsYXllci55YXcpXG4gICAgICBpZiAoTWF0aC5hYnMoZngpID4gTWF0aC5hYnMoZnopKSBwLnggKz0gTWF0aC5zaWduKGZ4KSAqIDJcbiAgICAgIGVsc2UgcC56ICs9IE1hdGguc2lnbihmeikgKiAyXG4gICAgICBwLnkgKz0gdGhpcy50ZXJyYWluLmhlaWdodChwLngsIHAueikgLSBoaXQucG9pbnQueVxuICAgIH1cbiAgICBsZXQgdmFsaWQgPSBoaXQua2luZCAhPT0gJ3Jlc291cmNlJ1xuICAgIGlmICh2YWxpZCAmJiBwZC5zbmFwID09PSAnZnJlZScgJiYgaGl0Lm5vcm1hbC55IDwgMC42KSB2YWxpZCA9IGZhbHNlXG4gICAgaWYgKHZhbGlkKSB2YWxpZCA9IHRoaXMucGxhY2VtZW50VmFsaWQocGQuaWQsIHApXG4gICAgdGhpcy5wbGFjZW1lbnQgPSB7IGlkOiBwZC5pZCwgcCwgdmFsaWQgfVxuICB9XG5cbiAgcHJpdmF0ZSBwbGFjZW1lbnRWYWxpZChpZDoga2V5b2YgdHlwZW9mIFBJRUNFUywgcDogUGxhY2VtZW50KTogYm9vbGVhbiB7XG4gICAgY29uc3QgcGQgPSBQSUVDRVNbaWRdXG4gICAgY29uc3QgYm94ID0gcGxhY2VtZW50Qm94KHBkLCBwKVxuICAgIGNvbnN0IGV5ZSA9IHRoaXMucGxheWVyLmV5ZSh0bXBWKVxuICAgIGNvbnN0IGN4ID0gKGJveC5taW5YICsgYm94Lm1heFgpIC8gMlxuICAgIGNvbnN0IGN5ID0gKGJveC5taW5ZICsgYm94Lm1heFkpIC8gMlxuICAgIGNvbnN0IGN6ID0gKGJveC5taW5aICsgYm94Lm1heFopIC8gMlxuICAgIGlmIChNYXRoLmh5cG90KGN4IC0gZXllLngsIGN5IC0gZXllLnksIGN6IC0gZXllLnopID4gQ09ORklHLnBsYXllci5yZWFjaCArIDIpIHJldHVybiBmYWxzZVxuICAgIGZvciAoY29uc3QgbyBvZiB0aGlzLmJ1aWxkaW5nLm5lYXIoY3gsIGN6LCAzKSkge1xuICAgICAgaWYgKHNhbWVFZGdlKHsgaWQsIHg6IHAueCwgeTogcC55LCB6OiBwLnosIHJvdDogcC5yb3QgfSwgbykpIHJldHVybiBmYWxzZVxuICAgICAgaWYgKG92ZXJsYXBBbGxvd2VkKGlkLCBvLmlkKSkgY29udGludWVcbiAgICAgIGlmIChib3hlc092ZXJsYXAoYm94LCBwaWVjZUJveChvKSkpIHJldHVybiBmYWxzZVxuICAgIH1cbiAgICBpZiAoKHBkLnNvbGlkIHx8IHBkLnJhbXApICYmIHRoaXMub3ZlcmxhcHNQbGF5ZXIoYm94KSkgcmV0dXJuIGZhbHNlXG4gICAgaWYgKHRoaXMucGh5c2ljcy5ibG9ja2VkQnlSZXNvdXJjZShib3gpKSByZXR1cm4gZmFsc2VcbiAgICByZXR1cm4gdHJ1ZVxuICB9XG5cbiAgcHJpdmF0ZSBvdmVybGFwc1BsYXllcihib3g6IFJldHVyblR5cGU8dHlwZW9mIHBsYWNlbWVudEJveD4pOiBib29sZWFuIHtcbiAgICBjb25zdCBiID0gdGhpcy5wbGF5ZXIuYm9keVxuICAgIGNvbnN0IHBiID0geyBtaW5YOiBiLnBvcy54IC0gYi5yYWRpdXMsIG1pblk6IGIucG9zLnkgKyAwLjA1LCBtaW5aOiBiLnBvcy56IC0gYi5yYWRpdXMsIG1heFg6IGIucG9zLnggKyBiLnJhZGl1cywgbWF4WTogYi5wb3MueSArIGIuaGVpZ2h0LCBtYXhaOiBiLnBvcy56ICsgYi5yYWRpdXMgfVxuICAgIHJldHVybiBib3hlc092ZXJsYXAoYm94LCBwYiwgMClcbiAgfVxuXG4gIHByaXZhdGUgdXNlKCk6IHZvaWQge1xuICAgIGNvbnN0IHN0YWNrID0gdGhpcy5zZWxlY3RlZFN0YWNrKClcbiAgICBjb25zdCBkZWYgPSBzdGFjayA/IElURU1TW3N0YWNrLmlkXSA6IG51bGxcbiAgICBjb25zdCBoaXQgPSB0aGlzLnRhcmdldFxuICAgIC8vIERvb3JzIGFuZCBjaGVzdHMgYWx3YXlzIHJlc3BvbmQgdG8gdXNlLCB3aGF0ZXZlciBpcyBoZWxkLlxuICAgIGlmIChoaXQ/LmtpbmQgPT09ICdwaWVjZScpIHtcbiAgICAgIGNvbnN0IHBkID0gUElFQ0VTW2hpdC5waWVjZSEuaWRdXG4gICAgICBpZiAocGQuZG9vcikgcmV0dXJuIHRoaXMudG9nZ2xlRG9vcihoaXQucGllY2UhKVxuICAgICAgaWYgKHBkLnN0b3JhZ2UpIHJldHVybiB0aGlzLm9wZW5DaGVzdChoaXQucGllY2UhKVxuICAgIH1cbiAgICAvLyBTdGF0aW9ucyBvcGVuIHRoZSBjcmFmdGluZyBzY3JlZW4uXG4gICAgaWYgKGhpdD8ua2luZCA9PT0gJ3BpZWNlJyAmJiBQSUVDRVNbaGl0LnBpZWNlIS5pZF0uc3RhdGlvbiAmJiAhKGRlZj8ucGxhY2UgJiYgZGVmLnBsYWNlICE9PSAnc29pbCcpKSB7XG4gICAgICB0aGlzLm9wZW5JbnZlbnRvcnkoUElFQ0VTW2hpdC5waWVjZSEuaWRdLnN0YXRpb24pXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKGRlZj8uZm9vZCkge1xuICAgICAgaWYgKGVhdCh0aGlzLnN0YXRzLCBkZWYuZm9vZCkpIHtcbiAgICAgICAgdGhpcy5pbnZlbnRvcnkudGFrZUZyb20odGhpcy5zZWxlY3RlZClcbiAgICAgICAgdGhpcy5wbGF5ZXIuc3RhcnRFYXQoKVxuICAgICAgICB0aGlzLmF1ZGlvLnBsYXkoJ2VhdCcpXG4gICAgICAgIHRoaXMudWkuc3RhdFB1bHNlKCdodW5nZXInLCAnZmlsbCcpXG4gICAgICAgIGlmIChkZWYuZm9vZC5oZWFsdGgpIHRoaXMudWkuc3RhdFB1bHNlKCdoZWFsdGgnLCAnZmlsbCcpXG4gICAgICAgIHRoaXMudXNlQ2QgPSAwLjZcbiAgICAgICAgdGhpcy5pbnZEaXJ0eSA9IHRydWVcbiAgICAgIH0gZWxzZSB0aGlzLnVpLmhpbnQoXCJZb3UncmUgbm90IGh1bmdyeVwiLCB0cnVlKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmIChkZWY/LnBsYWNlID09PSAnc29pbCcpIHtcbiAgICAgIGlmIChoaXQ/LmtpbmQgIT09ICd0ZXJyYWluJykgcmV0dXJuXG4gICAgICBpZiAoIXRoaXMuaW52ZW50b3J5LnRha2VGcm9tKHRoaXMuc2VsZWN0ZWQpKSByZXR1cm5cbiAgICAgIGNvbnN0IGRpcnR5ID0gdGhpcy50ZXJyYWluLmRlZm9ybShoaXQucG9pbnQueCwgaGl0LnBvaW50LnosIENPTkZJRy5taW5pbmcuZGlnUmFkaXVzLCBDT05GSUcubWluaW5nLnJhaXNlQW1vdW50LCBDT05GSUcubWluaW5nLm1heERpZ0RlcHRoKVxuICAgICAgICB0aGlzLm1hcC5pbnZhbGlkYXRlKGhpdC5wb2ludC54LCBoaXQucG9pbnQueilcbiAgICAgIHRoaXMuY2h1bmtzLnJlYnVpbGQoZGlydHkpXG4gICAgICB0aGlzLmZ4LmJ1cnN0KCdkaXJ0JywgaGl0LnBvaW50LCBoaXQubm9ybWFsLCAwLjYpXG4gICAgICB0aGlzLmF1ZGlvLnBsYXkoJ2RpZycsIDAuOCwgMS4yKVxuICAgICAgdGhpcy51c2VDZCA9IDAuMjJcbiAgICAgIHRoaXMuaW52RGlydHkgPSB0cnVlXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKGRlZj8ucGxhY2UpIHtcbiAgICAgIHRoaXMuY29tcHV0ZVBsYWNlbWVudCgpXG4gICAgICBjb25zdCBwbCA9IHRoaXMucGxhY2VtZW50XG4gICAgICBpZiAoIXBsIHx8ICFwbC52YWxpZCkge1xuICAgICAgICBpZiAocGwpIHRoaXMuYXVkaW8ucGxheSgnZGVueScsIDAuNilcbiAgICAgICAgdGhpcy51c2VDZCA9IDAuMlxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGlmICghdGhpcy5pbnZlbnRvcnkudGFrZUZyb20odGhpcy5zZWxlY3RlZCkpIHJldHVyblxuICAgICAgY29uc3QgcGllY2UgPSB0aGlzLmJ1aWxkaW5nLmFkZChwbC5pZCBhcyBrZXlvZiB0eXBlb2YgUElFQ0VTLCBwbC5wKVxuICAgICAgdGhpcy53YXJkc0RpcnR5ID0gdHJ1ZVxuICAgICAgdGhpcy5hdWRpby5wbGF5KFBJRUNFU1twaWVjZS5pZF0ubWF0ID09PSAnc3RvbmUnID8gJ3BsYWNlU3RvbmUnIDogJ3BsYWNlJylcbiAgICAgIGNvbnN0IG9iaiA9IHRoaXMuYnVpbGRpbmcub2JqZWN0KHBpZWNlLnVpZClcbiAgICAgIGlmIChvYmopIHtcbiAgICAgICAgb2JqLnNjYWxlLnNldFNjYWxhcigwLjYpXG4gICAgICAgIHRoaXMucG9wcy5wdXNoKHsgb2JqLCB0OiAwIH0pXG4gICAgICB9XG4gICAgICB0aGlzLmZ4LmJ1cnN0KCdwbGFjZScsIHRtcFYuc2V0KHBsLnAueCwgcGwucC55ICsgMC4wNSwgcGwucC56KS5jbG9uZSgpLCBVUCwgUElFQ0VTW3BpZWNlLmlkXS5zbmFwID09PSAnZnJlZScgPyAwLjYgOiAxKVxuICAgICAgdGhpcy5zaGFrZSA9IE1hdGgubWF4KHRoaXMuc2hha2UsIDAuMDYpXG4gICAgICB0aGlzLnhwKCdidWlsZGluZycsIDMpXG4gICAgICBpZiAodGhpcy5jb25maWcubW9kZSA9PT0gJ3N1cnZpdmFsJyAmJiBNYXRoLnJhbmRvbSgpIDwgc2tpbGxCb251cyh0aGlzLnNraWxscywgJ2J1aWxkaW5nJykgLSAxKSB7XG4gICAgICAgIHRoaXMuaW52ZW50b3J5LmFkZChkZWYuaWQgYXMgSXRlbUlkLCAxKVxuICAgICAgICB0aGlzLnVpLnRvYXN0KGRlZi5pZCBhcyBJdGVtSWQsICdNYXN0ZXIgYnVpbGRlciDigJQgbWF0ZXJpYWwgcmVmdW5kZWQnKVxuICAgICAgfVxuICAgICAgaWYgKHBpZWNlLmlkID09PSAnY2FtcGZpcmUnKSB7XG4gICAgICAgIHRoaXMuc3Bhd25Qb2ludCA9IG5ldyBUSFJFRS5WZWN0b3IzKHBsLnAueCArIDEuMiwgcGwucC55ICsgMC4xLCBwbC5wLnopXG4gICAgICAgIHRoaXMudWkudG9hc3QoJ2NhbXBmaXJlJywgJ1Jlc3Bhd24gcG9pbnQgc2V0JylcbiAgICAgIH1cbiAgICAgIHRoaXMudGlwc0RvbmUuYWRkKHBpZWNlLmlkID09PSAnd29ya2JlbmNoJyA/ICdiZW5jaCcgOiBwaWVjZS5pZCA9PT0gJ2NhbXBmaXJlJyA/ICdmaXJlJyA6IHBpZWNlLmlkID09PSAnZm91bmRhdGlvbicgfHwgcGllY2UuaWQgPT09ICd3b29kX3dhbGwnID8gJ2J1aWxkJyA6ICcnKVxuICAgICAgdGhpcy51c2VDZCA9IDAuMjJcbiAgICAgIHRoaXMuaW52RGlydHkgPSB0cnVlXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZWdyb3coKTogdm9pZCB7XG4gICAgY29uc3QgZGlydHkgPSBuZXcgU2V0PG51bWJlcj4oKVxuICAgIGZvciAoY29uc3QgW2ssIGF0XSBvZiB0aGlzLmhhcnZlc3RlZCkge1xuICAgICAgaWYgKGF0IDwgMCB8fCBhdCA+IHRoaXMud29ybGRTZWNvbmRzKSBjb250aW51ZVxuICAgICAgY29uc3QgW2N4LCBjel0gPSBrLnNwbGl0KCcsJykubWFwKE51bWJlcilcbiAgICAgIGNvbnN0IGMgPSB0aGlzLmNodW5rcy5nZXQoY3gsIGN6KVxuICAgICAgaWYgKGMpIHtcbiAgICAgICAgLy8gRG8gbm90IHJlZ3JvdyBvbiB0b3Agb2YgdGhlIHBsYXllci5cbiAgICAgICAgY29uc3QgciA9IGMucmVzb3VyY2VzLmZpbmQocmVzID0+IHJlcy5rZXkgPT09IGspXG4gICAgICAgIGlmIChyICYmIE1hdGguaHlwb3Qoci54IC0gdGhpcy5wbGF5ZXIuYm9keS5wb3MueCwgci56IC0gdGhpcy5wbGF5ZXIuYm9keS5wb3MueikgPCAzKSBjb250aW51ZVxuICAgICAgICBpZiAocikgci5ocCA9IFJFU1tyLnR5cGVdLmhwICogKHIudHlwZSA9PT0gJ29haycgfHwgci50eXBlID09PSAncGluZScgfHwgci50eXBlID09PSAnYm91bGRlcicgPyBNYXRoLm1pbigxLjQsIE1hdGgubWF4KDAuOCwgci5zKSkgOiAxKVxuICAgICAgICBkaXJ0eS5hZGQoYy5rZXkpXG4gICAgICB9XG4gICAgICB0aGlzLmhhcnZlc3RlZC5kZWxldGUoaylcbiAgICB9XG4gICAgZm9yIChjb25zdCBrZXkgb2YgZGlydHkpIHRoaXMuY2h1bmtzLnJlYnVpbGRSZXNvdXJjZXMoa2V5KVxuICB9XG5cbiAgcHJpdmF0ZSBjaGVja0Rpc2NvdmVyeSgpOiB2b2lkIHtcbiAgICBjb25zdCBwID0gdGhpcy5wbGF5ZXIuYm9keS5wb3NcbiAgICBmb3IgKGNvbnN0IHBvaSBvZiB0aGlzLnRlcnJhaW4ucG9pcy5uZWFyKHAueCwgcC56LCAyMCkpIHtcbiAgICAgIGlmICh0aGlzLmRpc2NvdmVyZWQuaGFzKHBvaS5pZCkpIGNvbnRpbnVlXG4gICAgICB0aGlzLmRpc2NvdmVyZWQuYWRkKHBvaS5pZClcbiAgICAgIHRoaXMudWkuYmFubmVyKGBEaXNjb3ZlcmVkOiAke1BPSV9OQU1FU1twb2kudHlwZV19YCwgUE9JX0JMVVJCW3BvaS50eXBlXSlcbiAgICAgIHRoaXMuYXVkaW8ucGxheSgnZGlzY292ZXInKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgY2hlY2tUaXBzKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLm1vdmVkID4gOCkgdGhpcy50aXBzRG9uZS5hZGQoJ21vdmUnKVxuICAgIGlmICh0aGlzLmNvdW50ZXJzLndvb2QgPiAwICYmIHRoaXMuY291bnRlcnMuZmliZXIgPiAwKSB0aGlzLnRpcHNEb25lLmFkZCgnZ2F0aGVyJylcbiAgICBpZiAodGhpcy5jb3VudGVycy50b29scyA+IDApIHRoaXMudGlwc0RvbmUuYWRkKCdjcmFmdCcpXG4gICAgdGhpcy5yZWZyZXNoVGlwcygpXG4gIH1cblxuICBwcml2YXRlIHJlZnJlc2hUaXBzKCk6IHZvaWQge1xuICAgIGNvbnN0IHRvdWNoID0gdGhpcy5pbnB1dC5tZXRob2QgPT09ICd0b3VjaCdcbiAgICBjb25zdCBsaXN0OiBUaXBWaWV3W10gPSBUSVBTLm1hcCh0ID0+ICh7IGlkOiB0LmlkLCB0ZXh0OiB0b3VjaCA/IHQudG91Y2ggOiB0LnRleHQsIGRvbmU6IHRoaXMudGlwc0RvbmUuaGFzKHQuaWQpIH0pKVxuICAgIHRoaXMudWkuc2V0VGlwcyh0aGlzLnN0b3JlLmRhdGEudHV0b3JpYWxEb25lIHx8IHRoaXMuY29uZmlnLm1vZGUgPT09ICdjcmVhdGl2ZScgPyBbXSA6IGxpc3QpXG4gIH1cblxuICBkYW1hZ2UoYW1vdW50OiBudW1iZXIsIGNhdXNlOiBzdHJpbmcsIGZyb20/OiBUSFJFRS5WZWN0b3IzLCBzY2FsZWQgPSB0cnVlKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuc3RhdGUgIT09ICdwbGF5JyB8fCB0aGlzLmNvbmZpZy5tb2RlID09PSAnY3JlYXRpdmUnKSByZXR1cm5cbiAgICBpZiAoc2NhbGVkICYmIERJRkZJQ1VMVFlbdGhpcy5jb25maWcuZGlmZmljdWx0eV0uZGFtYWdlID09PSAwKSByZXR1cm5cbiAgICBjb25zdCBkZWFkID0gaHVydCh0aGlzLnN0YXRzLCBhbW91bnQsIHRoaXMuY29uZmlnLmRpZmZpY3VsdHksIHRoaXMuY29uZmlnLm1vZGUsIHNjYWxlZClcbiAgICB0aGlzLnVpLmZsYXNoRGFtYWdlKClcbiAgICB0aGlzLnVpLnN0YXRQdWxzZSgnaGVhbHRoJywgJ2RyYWluJylcbiAgICB0aGlzLmF1ZGlvLnBsYXkoJ2h1cnQnKVxuICAgIHRoaXMuc2hha2UgPSBNYXRoLm1heCh0aGlzLnNoYWtlLCBNYXRoLm1pbigwLjYsIDAuMiArIGFtb3VudCAvIDQwKSlcbiAgICB0aGlzLnBsYXllci5hZGRLaWNrKC0wLjA0LCAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiAwLjA1KVxuICAgIGlmIChmcm9tKSB7XG4gICAgICBjb25zdCBwID0gdGhpcy5wbGF5ZXIuYm9keS5wb3NcbiAgICAgIHRoaXMudWkuaHVydEZyb20oTWF0aC5hdGFuMihmcm9tLnggLSBwLngsIC0oZnJvbS56IC0gcC56KSkgKyB0aGlzLnBsYXllci55YXcpXG4gICAgICBjb25zdCBhd2F5ID0gdGhpcy5wbGF5ZXIuYm9keS5wb3MuY2xvbmUoKS5zdWIoZnJvbSkuc2V0WSgwKS5ub3JtYWxpemUoKVxuICAgICAgdGhpcy5wbGF5ZXIuYm9keS52ZWwuYWRkU2NhbGVkVmVjdG9yKGF3YXksIDYpXG4gICAgICB0aGlzLnBsYXllci5ib2R5LnZlbC55ID0gMy41XG4gICAgICB0aGlzLnBsYXllci5ib2R5Lmdyb3VuZGVkID0gZmFsc2VcbiAgICB9XG4gICAgaWYgKGRlYWQpIHRoaXMuZGllKGNhdXNlKVxuICB9XG5cbiAgcHJpdmF0ZSBkaWUoY2F1c2U6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuc3RhdGUgPSAnZGVhZCdcbiAgICB0aGlzLmxhc3RDYXVzZSA9IGNhdXNlXG4gICAgdGhpcy51bmxvY2soKVxuICAgIHRoaXMuaW5wdXQucmVsZWFzZUFsbCgpXG4gICAgdGhpcy5idWlsZGluZy5zaG93R2hvc3QobnVsbClcbiAgICB0aGlzLmF1ZGlvLnBsYXkoJ2RlYXRoJylcbiAgICB0aGlzLnVpLnNob3dEZWF0aChjYXVzZSwgdGhpcy5kYXkpXG4gIH1cblxuICByZXNwYXduKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLnN0YXRlICE9PSAnZGVhZCcpIHJldHVyblxuICAgIHRoaXMuaW5wdXQubG9ja1BvaW50ZXIoKVxuICAgIGxldCBhdCA9IHRoaXMud29ybGRTcGF3blxuICAgIGlmICh0aGlzLnNwYXduUG9pbnQpIHtcbiAgICAgIGNvbnN0IHNwID0gdGhpcy5zcGF3blBvaW50XG4gICAgICBjb25zdCBmaXJlID0gdGhpcy5idWlsZGluZy5uZWFyKHNwLngsIHNwLnosIDIpLnNvbWUocCA9PiBwLmlkID09PSAnY2FtcGZpcmUnKVxuICAgICAgaWYgKGZpcmUpIGF0ID0gc3BcbiAgICAgIGVsc2UgdGhpcy5zcGF3blBvaW50ID0gbnVsbFxuICAgIH1cbiAgICB0aGlzLnBsYXllci50ZWxlcG9ydCh0bXBWLnNldChhdC54LCBhdC55ICsgMC4zLCBhdC56KSlcbiAgICB0aGlzLmNodW5rcy5lbnN1cmVOZWFyKGF0LngsIGF0LnosIDEpXG4gICAgY29uc3QgZyA9IHRoaXMucGh5c2ljcy5ncm91bmRBdChhdC54LCBhdC56LCBhdC55ICsgMywgMC4zKVxuICAgIHRoaXMucGxheWVyLmJvZHkucG9zLnkgPSBNYXRoLm1heCh0aGlzLnBsYXllci5ib2R5LnBvcy55LCBnICsgMC4wMilcbiAgICB0aGlzLnBsYXllci5wcmV2LmNvcHkodGhpcy5wbGF5ZXIuYm9keS5wb3MpXG4gICAgdGhpcy5zdGF0cyA9IGZyZXNoU3RhdHMoKVxuICAgIHRoaXMuc3RhdHMuaHVuZ2VyID0gNzBcbiAgICAvLyBDbGVhciBuZWFyYnkgbmlnaHQgY3JlYXR1cmVzIHNvIHJlc3Bhd25pbmcgaXMgZmFpci5cbiAgICBmb3IgKGNvbnN0IGMgb2YgdGhpcy5jcmVhdHVyZXMubGlzdCkgaWYgKGMuc3RhdC5uaWdodCAmJiBjLmtpbmQgIT09ICdob3dsZXInICYmIGMuYm9keS5wb3MuZGlzdGFuY2VUbyhhdCkgPCAyNSkgYy5zdGF0ZSA9ICdkeWluZydcbiAgICB0aGlzLnN0YXRlID0gJ3BsYXknXG4gICAgdGhpcy51aS5oaWRlRGVhdGgoKVxuICAgIHRoaXMubG9vcC5yZXNldEFjY3VtdWxhdG9yKClcbiAgICB2b2lkIHRoaXMubGFzdENhdXNlXG4gIH1cblxuICAvLyDilIDilIDilIAgUmVuZGVyaW5nIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgFxuICBwcml2YXRlIHJlbmRlcihhbHBoYTogbnVtYmVyLCBmcmFtZTogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgaW5wdXQgPSB0aGlzLmlucHV0XG4gICAgY29uc3QgY2FtID0gdGhpcy5wbGF5ZXIuY2FtZXJhXG4gICAgY29uc3QgdCA9IHBlcmZvcm1hbmNlLm5vdygpIC8gMTAwMFxuICAgIGlmICh0aGlzLnN0YXRlID09PSAndGl0bGUnKSB7XG4gICAgICB0aGlzLnRpdGxlQW5nbGUgKz0gZnJhbWUgKiAwLjAzNVxuICAgICAgY29uc3Qgc3AgPSB0aGlzLndvcmxkU3Bhd25cbiAgICAgIGNhbS5wb3NpdGlvbi5zZXQoc3AueCArIE1hdGguY29zKHRoaXMudGl0bGVBbmdsZSkgKiAzNCwgc3AueSArIDE2LCBzcC56ICsgTWF0aC5zaW4odGhpcy50aXRsZUFuZ2xlKSAqIDM0KVxuICAgICAgY2FtLmxvb2tBdChzcC54LCBzcC55ICsgNCwgc3AueilcbiAgICAgIHRoaXMucGxheWVyLmhhbmQudmlzaWJsZSA9IGZhbHNlXG4gICAgICB0aGlzLmNodW5rcy51cGRhdGUoc3AueCwgc3AueiwgNilcbiAgICAgIHRoaXMuZW52LnVwZGF0ZSgwLjMxLCBjYW0ucG9zaXRpb24sIGNhbS5wb3NpdGlvbi55LCBmcmFtZSlcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5wbGF5ZXIuaGFuZC52aXNpYmxlID0gdGhpcy5zdGF0ZSAhPT0gJ2RlYWQnXG4gICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gJ3BsYXknKSB7XG4gICAgICAgIHRoaXMucGxheWVyLmxvb2soaW5wdXQpXG4gICAgICAgIGNvbnN0IHNsb3QgPSBpbnB1dC50YWtlU2xvdCgpXG4gICAgICAgIGlmIChzbG90ICE9PSBudWxsKSB0aGlzLnNlbGVjdChzbG90KVxuICAgICAgICBjb25zdCB3aGVlbCA9IGlucHV0LnRha2VXaGVlbCgpXG4gICAgICAgIGlmICh3aGVlbCkgdGhpcy5zZWxlY3QodGhpcy5zZWxlY3RlZCArIHdoZWVsKVxuICAgICAgICBpZiAoaW5wdXQuY29uc3VtZSgnaW52ZW50b3J5JykpIHRoaXMub3BlbkludmVudG9yeSgpXG4gICAgICAgIGVsc2UgaWYgKGlucHV0LmNvbnN1bWUoJ21hcCcpKSB0aGlzLm9wZW5NYXAoKVxuICAgICAgICBlbHNlIGlmIChpbnB1dC5jb25zdW1lKCdwYXVzZScpICYmICh0aGlzLnRvdWNoIHx8IHRoaXMuaW5wdXQuZnJlZUxvb2sgfHwgIXRoaXMuaW5wdXQubG9ja2VkKSkgdGhpcy5wYXVzZSgpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZSA9PT0gJ21hcCcgJiYgKGlucHV0LmNvbnN1bWUoJ21hcCcpIHx8IGlucHV0LmNvbnN1bWUoJ3BhdXNlJykgfHwgaW5wdXQuY29uc3VtZSgnaW52ZW50b3J5JykpKSB0aGlzLmNsb3NlTWFwKClcbiAgICAgICAgaW5wdXQudGFrZUxvb2soKVxuICAgICAgICBpbnB1dC50YWtlV2hlZWwoKVxuICAgICAgICBpbnB1dC50YWtlU2xvdCgpXG4gICAgICB9XG4gICAgICBjb25zdCBzdGFjayA9IHRoaXMuc2VsZWN0ZWRTdGFjaygpXG4gICAgICB0aGlzLnBsYXllci5zZXRIZWxkKHN0YWNrPy5pZCA/PyBudWxsKVxuICAgICAgdGhpcy5wbGF5ZXIuYXJyb3dSZWFkeSA9IHRoaXMuaW52ZW50b3J5LmluZmluaXRlIHx8IHRoaXMuaW52ZW50b3J5LmNvdW50KFwiYXJyb3dcIikgPiAwXG4gICAgICB0aGlzLnBsYXllci5yZW5kZXIoYWxwaGEsIGZyYW1lLCB0aGlzLnN0b3JlLmRhdGEuaGVhZEJvYiA/IENPTkZJRy5jYW1lcmEuYm9iIDogMClcbiAgICAgIHRoaXMuYXBwbHlDYW1lcmFKdWljZShmcmFtZSlcbiAgICAgIGNvbnN0IHAgPSB0aGlzLnBsYXllci5ib2R5LnBvc1xuICAgICAgdGhpcy5jaHVua3MudXBkYXRlKHAueCwgcC56LCA0KVxuICAgICAgdGhpcy5lbnYudXBkYXRlKHRoaXMudGltZSwgcCwgY2FtLnBvc2l0aW9uLnksIGZyYW1lKVxuICAgICAgaWYgKHRoaXMuc3RhdGUgPT09ICdwbGF5Jykge1xuICAgICAgICB0aGlzLmNvbXB1dGVQbGFjZW1lbnQoKVxuICAgICAgICBjb25zdCBwbCA9IHRoaXMucGxhY2VtZW50XG4gICAgICAgIHRoaXMuYnVpbGRpbmcuc2hvd0dob3N0KHBsID8gKHBsLmlkIGFzIGtleW9mIHR5cGVvZiBQSUVDRVMpIDogbnVsbCwgcGw/LnAsIHBsPy52YWxpZClcbiAgICAgIH1cbiAgICAgIHRoaXMuaHVkKGZyYW1lKVxuICAgICAgY29uc3QgcHAgPSB0aGlzLnBsYXllci5ib2R5LnBvc1xuICAgICAgaWYgKHRoaXMuc3RhdGUgPT09ICdtYXAnKSB7XG4gICAgICAgIHRoaXMubWFwVmlld1QgLT0gZnJhbWVcbiAgICAgICAgaWYgKHRoaXMubWFwVmlld1QgPD0gMCkge1xuICAgICAgICAgIHRoaXMubWFwVmlld1QgPSAwLjFcbiAgICAgICAgICB0aGlzLm1hcC5zZXRWaWV3KHRoaXMubWFwVmlldygpKVxuICAgICAgICB9XG4gICAgICAgIHRoaXMubWFwLndvcmsoNiwgcHAueCwgcHAueilcbiAgICAgICAgdGhpcy5tYXAuZHJhdygpXG4gICAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09ICdwbGF5JyAmJiAhdGhpcy5pc0J1c3koKSkgdGhpcy5tYXAud29yaygwLjcsIHBwLngsIHBwLnopXG4gICAgfVxuICAgIHRoaXMuY2h1bmtzLnRpY2soZnJhbWUpXG4gICAgdGhpcy5idWlsZGluZy5hbmltYXRlKHQsIGZyYW1lKVxuICAgIHRoaXMuYmVhY29ucy51cGRhdGUoZnJhbWUsIHRoaXMucGxheWVyLmJvZHkucG9zKVxuICAgIHRoaXMuZnJhbWVNcyArPSAoZnJhbWUgKiAxMDAwIC0gdGhpcy5mcmFtZU1zKSAqIDAuMDhcbiAgICB0aGlzLmZ4LnNldExpZ2h0KDAuMjggKyAwLjcyICogdGhpcy5lbnYuZGF5KVxuICAgIFdVLnVGb2xpYWdlRmlsbC52YWx1ZSA9IDAuMDMgKyAwLjIgKiB0aGlzLmVudi5kYXlcbiAgICB0aGlzLmZ4LnVwZGF0ZShmcmFtZSwgdGhpcy5wbGF5ZXIuZXllKHRtcFYpLCBjYW0pXG4gICAgdGhpcy51cGRhdGVQb3BzKGZyYW1lKVxuICAgIHRoaXMudXBkYXRlTGlnaHRzKHQsIGZyYW1lKVxuICAgIHRoaXMuYXVkaW8uc2V0QW1iaWVudCh0aGlzLmVudi5kYXksIE1hdGgubWluKDEsIE1hdGgubWF4KDAsIChjYW0ucG9zaXRpb24ueSAtIDEwKSAvIDQwKSksIHRoaXMuZmlyZU5lYXIpXG4gICAgdGhpcy51aS5zZXRVbmRlcndhdGVyKHRoaXMuZW52LnVuZGVyd2F0ZXIgJiYgdGhpcy5zdGF0ZSAhPT0gJ3RpdGxlJylcbiAgICB0aGlzLnRvdWNoPy5zZXRWaXNpYmxlKHRoaXMuc3RhdGUgPT09ICdwbGF5JylcbiAgICAvLyBTaGFkb3dzIHJlZnJlc2ggYXQgaGFsZiByYXRlOiB0aGUgc3VuIG1vdmVzIHNsb3dseSBhbmQgdGhpcyBoYWx2ZXMgdGhlIHNoYWRvdyBwYXNzIGNvc3QuXG4gICAgdGhpcy5mcmFtZU4rK1xuICAgIHRoaXMucmVuZGVyZXIuZ2wuc2hhZG93TWFwLmF1dG9VcGRhdGUgPSBmYWxzZVxuICAgIHRoaXMucmVuZGVyZXIuZ2wuc2hhZG93TWFwLm5lZWRzVXBkYXRlID0gdGhpcy5mcmFtZU4gJSAyID09PSAwIHx8IHRoaXMuc3RhdGUgPT09ICd0aXRsZSdcbiAgICB0aGlzLnJlbmRlcmVyLnJlbmRlcih0aGlzLnNjZW5lLCBjYW0pXG4gICAgaW5wdXQuZW5kRnJhbWUoKVxuICAgIGlucHV0LnVwZGF0ZSgpXG4gIH1cblxuICAvKiogU2NyZWVuIHNoYWtlLCBzcHJpbnQgRk9WIGFuZCBoaXQga2lja3MgbGF5ZXJlZCBvbiB0b3Agb2YgdGhlIHBsYXllciBjYW1lcmEuICovXG4gIHByaXZhdGUgYXBwbHlDYW1lcmFKdWljZShmcmFtZTogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgY2FtID0gdGhpcy5wbGF5ZXIuY2FtZXJhXG4gICAgY29uc3QgcmVkdWNlZCA9IHRoaXMuc3RvcmUuZGF0YS5yZWR1Y2VkTW90aW9uXG4gICAgaWYgKHRoaXMuc2hha2UgPiAwLjAwMSkge1xuICAgICAgY29uc3QgcyA9IHRoaXMuc2hha2UgKiB0aGlzLnNoYWtlICogKHJlZHVjZWQgPyAwLjI1IDogMSlcbiAgICAgIGNhbS5yb3RhdGlvbi54ICs9IChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIHMgKiAwLjA2XG4gICAgICBjYW0ucm90YXRpb24ueSArPSAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiBzICogMC4wNlxuICAgICAgY2FtLnBvc2l0aW9uLnkgKz0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogcyAqIDAuMDhcbiAgICAgIHRoaXMuc2hha2UgPSBNYXRoLm1heCgwLCB0aGlzLnNoYWtlIC0gZnJhbWUgKiAyLjIpXG4gICAgfVxuICAgIGNvbnN0IHdhbnQgPSB0aGlzLnN0b3JlLmRhdGEuZm92ICsgKHRoaXMucGxheWVyLnNwcmludGluZyAmJiAhcmVkdWNlZCA/IDcgOiAwKSAtIHRoaXMucGxheWVyLmRyYXcgKiA4XG4gICAgaWYgKE1hdGguYWJzKHdhbnQgLSB0aGlzLmZvdk5vdykgPiAwLjAyKSB7XG4gICAgICB0aGlzLmZvdk5vdyArPSAod2FudCAtIHRoaXMuZm92Tm93KSAqIE1hdGgubWluKDEsIGZyYW1lICogOClcbiAgICAgIGNhbS5mb3YgPSB0aGlzLmZvdk5vd1xuICAgICAgY2FtLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgdXBkYXRlUG9wcyhmcmFtZTogbnVtYmVyKTogdm9pZCB7XG4gICAgZm9yIChsZXQgaSA9IHRoaXMucG9wcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgY29uc3QgcCA9IHRoaXMucG9wc1tpXVxuICAgICAgcC50ICs9IGZyYW1lIC8gMC4zMlxuICAgICAgY29uc3QgayA9IE1hdGgubWluKDEsIHAudClcbiAgICAgIC8vIE92ZXJzaG9vdCBlYXNlLW91dCAoZWFzZU91dEJhY2spLlxuICAgICAgY29uc3QgYzEgPSAxLjlcbiAgICAgIGNvbnN0IGUgPSAxICsgKGMxICsgMSkgKiBNYXRoLnBvdyhrIC0gMSwgMykgKyBjMSAqIE1hdGgucG93KGsgLSAxLCAyKVxuICAgICAgcC5vYmouc2NhbGUuc2V0U2NhbGFyKDAuNiArIDAuNCAqIGUpXG4gICAgICBpZiAoayA+PSAxKSB7XG4gICAgICAgIHAub2JqLnNjYWxlLnNldFNjYWxhcigxKVxuICAgICAgICB0aGlzLnBvcHMuc3BsaWNlKGksIDEpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSB1cGRhdGVMaWdodHModDogbnVtYmVyLCBmcmFtZTogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgZm9jdXMgPSB0aGlzLnN0YXRlID09PSAndGl0bGUnID8gdGhpcy53b3JsZFNwYXduIDogdGhpcy5wbGF5ZXIuYm9keS5wb3NcbiAgICBjb25zdCBzb3VyY2VzID0gdGhpcy5idWlsZGluZy5saWdodFNvdXJjZXMoKVxuICAgICAgLm1hcChwID0+ICh7IHAsIGQ6IE1hdGguaHlwb3QocC54IC0gZm9jdXMueCwgcC56IC0gZm9jdXMueikgfSkpXG4gICAgICAuZmlsdGVyKHMgPT4gcy5kIDwgNTApXG4gICAgICAuc29ydCgoYSwgYikgPT4gYS5kIC0gYi5kKVxuICAgIGxldCBsaSA9IDBcbiAgICBjb25zdCBuaWdodCA9IDEgLSB0aGlzLmVudi5kYXlcbiAgICBjb25zdCBzdGFjayA9IHRoaXMuc2VsZWN0ZWRTdGFjaygpXG4gICAgaWYgKHRoaXMuc3RhdGUgIT09ICd0aXRsZScgJiYgc3RhY2s/LmlkID09PSAndG9yY2gnKSB7XG4gICAgICBjb25zdCBsID0gdGhpcy5saWdodHNbbGkrK11cbiAgICAgIGNvbnN0IGNhbSA9IHRoaXMucGxheWVyLmNhbWVyYVxuICAgICAgbC5wb3NpdGlvbi5jb3B5KGNhbS5wb3NpdGlvbikuYWRkKHRtcFYuc2V0KDAuMywgLTAuMiwgMCkuYXBwbHlRdWF0ZXJuaW9uKGNhbS5xdWF0ZXJuaW9uKSlcbiAgICAgIGwuY29sb3Iuc2V0KDB4ZmZhODYwKVxuICAgICAgbC5kaXN0YW5jZSA9IDEzXG4gICAgICBsLmludGVuc2l0eSA9ICg4ICsgbmlnaHQgKiAxMCkgKiAoMC45ICsgTWF0aC5zaW4odCAqIDE3KSAqIDAuMDUgKyBNYXRoLnNpbih0ICogMjkpICogMC4wNSlcbiAgICB9XG4gICAgdGhpcy50aW1lcnMuZW1iZXJzIC09IGZyYW1lXG4gICAgY29uc3QgZW1iZXIgPSB0aGlzLnRpbWVycy5lbWJlcnMgPD0gMFxuICAgIGlmIChlbWJlcikgdGhpcy50aW1lcnMuZW1iZXJzID0gMC4xMlxuICAgIHRoaXMuZmlyZU5lYXIgPSAwXG4gICAgZm9yIChjb25zdCBzIG9mIHNvdXJjZXMpIGlmIChzLnAuaWQgPT09ICdjYW1wZmlyZScpIHRoaXMuZmlyZU5lYXIgPSBNYXRoLm1heCh0aGlzLmZpcmVOZWFyLCBNYXRoLm1heCgwLCAxIC0gcy5kIC8gMTIpKVxuICAgIGZvciAoY29uc3QgcyBvZiBzb3VyY2VzKSB7XG4gICAgICBpZiAobGkgPj0gdGhpcy5saWdodHMubGVuZ3RoKSBicmVha1xuICAgICAgY29uc3QgZGVmID0gUElFQ0VTW3MucC5pZF1cbiAgICAgIGNvbnN0IEwgPSBkZWYubGlnaHQhXG4gICAgICBjb25zdCBsID0gdGhpcy5saWdodHNbbGkrK11cbiAgICAgIGNvbnN0IGEgPSAocy5wLnJvdCAqIE1hdGguUEkpIC8gMlxuICAgICAgbC5wb3NpdGlvbi5zZXQocy5wLnggKyBNYXRoLnNpbihhKSAqIDAsIHMucC55ICsgTC55LCBzLnAueilcbiAgICAgIGwuY29sb3Iuc2V0SGV4KEwuY29sb3IpXG4gICAgICBsLmRpc3RhbmNlID0gTC5kaXN0YW5jZVxuICAgICAgY29uc3QgZmxpY2tlciA9IGRlZi5pZCA9PT0gJ2xhbXAnID8gMSArIE1hdGguc2luKHQgKiAyICsgcy5wLnVpZCkgKiAwLjA1IDogMC44NSArIE1hdGguc2luKHQgKiAxMyArIHMucC51aWQpICogMC4wOCArIE1hdGguc2luKHQgKiAzMSArIHMucC51aWQgKiAzKSAqIDAuMDdcbiAgICAgIGwuaW50ZW5zaXR5ID0gTC5pbnRlbnNpdHkgKiAoMC40NSArIG5pZ2h0ICogMC45KSAqIGZsaWNrZXJcbiAgICAgIGlmIChlbWJlciAmJiBkZWYuaWQgPT09ICdjYW1wZmlyZScgJiYgcy5kIDwgMzApIHRoaXMuZnguZmlyZSh0bXBWLnNldChzLnAueCwgcy5wLnkgKyAwLjE4LCBzLnAueiksIDEpXG4gICAgICBlbHNlIGlmIChlbWJlciAmJiBkZWYuaWQgIT09ICdjYW1wZmlyZScgJiYgcy5kIDwgMjAgJiYgTWF0aC5yYW5kb20oKSA8IDAuMykgdGhpcy5meC5lbWJlcnModG1wVi5zZXQocy5wLngsIHMucC55ICsgTC55LCBzLnAueiksIDEpXG4gICAgICBpZiAoZW1iZXIgJiYgZGVmLmlkID09PSAnY2FtcGZpcmUnICYmIHMuZCA8IDEyICYmIE1hdGgucmFuZG9tKCkgPCAwLjE1KSB0aGlzLmF1ZGlvLnBsYXkoJ2ZpcmUnLCB0aGlzLmZhbGxvZmYodG1wVi5zZXQocy5wLngsIHMucC55LCBzLnAueiksIDEyKSlcbiAgICB9XG4gICAgZm9yICg7IGxpIDwgdGhpcy5saWdodHMubGVuZ3RoOyBsaSsrKSB0aGlzLmxpZ2h0c1tsaV0uaW50ZW5zaXR5ID0gMFxuICB9XG5cbiAgcHJpdmF0ZSBodWQoZnJhbWU6IG51bWJlcik6IHZvaWQge1xuICAgIHRoaXMudGltZXJzLmh1ZCAtPSBmcmFtZVxuICAgIGlmICh0aGlzLmludkRpcnR5KSB7XG4gICAgICB0aGlzLnVpLnJlbmRlckhvdGJhcih0aGlzLmludmVudG9yeSwgdGhpcy5zZWxlY3RlZClcbiAgICAgIHRoaXMuaW52RGlydHkgPSBmYWxzZVxuICAgIH1cbiAgICBpZiAodGhpcy5zdGF0ZSA9PT0gJ2ludmVudG9yeScgJiYgdGhpcy5jaGVzdFVpZCAhPT0gbnVsbCkge1xuICAgICAgY29uc3QgYyA9IHRoaXMuYnVpbGRpbmcucGllY2VzLmdldCh0aGlzLmNoZXN0VWlkKVxuICAgICAgY29uc3QgcG9zID0gdGhpcy5wbGF5ZXIuYm9keS5wb3NcbiAgICAgIGlmICghYyB8fCBNYXRoLmh5cG90KGMueCAtIHBvcy54LCBjLnogLSBwb3MueikgPiBDT05GSUcucGxheWVyLnJlYWNoICsgMi41KSB0aGlzLmNsb3NlSW52ZW50b3J5KClcbiAgICB9XG4gICAgaWYgKHRoaXMuc3RhdGUgPT09ICdpbnZlbnRvcnknKSB7XG4gICAgICBjb25zdCBzdCA9IHRoaXMuc3RhdGlvbnMoKVxuICAgICAgaWYgKFsuLi5zdF0uam9pbigpICE9PSBbLi4udGhpcy5sYXN0U3RhdGlvbnNdLmpvaW4oKSkge1xuICAgICAgICB0aGlzLmxhc3RTdGF0aW9ucyA9IHN0XG4gICAgICAgIHRoaXMudWkucmVmcmVzaEludmVudG9yeShzdClcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gQ29tcGFzcyBldmVyeSBmcmFtZSAoY2hlYXAgdHJhbnNmb3JtcykuXG4gICAgY29uc3QgcCA9IHRoaXMucGxheWVyLmJvZHkucG9zXG4gICAgY29uc3QgbWFya2VyczogQ29tcGFzc01hcmtlcltdID0gW11cbiAgICBpZiAodGhpcy50aW1lcnMuaHVkIDw9IDApIHtcbiAgICAgIHRoaXMudGltZXJzLmh1ZCA9IDAuMVxuICAgICAgZm9yIChjb25zdCBwb2kgb2YgdGhpcy50ZXJyYWluLnBvaXMubmVhcihwLngsIHAueiwgMzIwKSkge1xuICAgICAgICBjb25zdCBrbm93biA9IHRoaXMuZGlzY292ZXJlZC5oYXMocG9pLmlkKVxuICAgICAgICBtYXJrZXJzLnB1c2goeyBiZWFyaW5nOiBNYXRoLmF0YW4yKHBvaS54IC0gcC54LCAtKHBvaS56IC0gcC56KSksIGxhYmVsOiBrbm93biA/IFBPSV9OQU1FU1twb2kudHlwZV0gOiAnPycsIGRpc3Q6IE1hdGguaHlwb3QocG9pLnggLSBwLngsIHBvaS56IC0gcC56KSwga25vd24gfSlcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLnNwYXduUG9pbnQpIG1hcmtlcnMucHVzaCh7IGJlYXJpbmc6IE1hdGguYXRhbjIodGhpcy5zcGF3blBvaW50LnggLSBwLngsIC0odGhpcy5zcGF3blBvaW50LnogLSBwLnopKSwgbGFiZWw6ICdDYW1wJywgZGlzdDogdGhpcy5zcGF3blBvaW50LmRpc3RhbmNlVG8ocCksIGtub3duOiB0cnVlLCBjYW1wOiB0cnVlIH0pXG4gICAgICB0aGlzLndheXBvaW50cy5waW5zLmZvckVhY2goKHBpbiwgaSkgPT4gbWFya2Vycy5wdXNoKHsgYmVhcmluZzogTWF0aC5hdGFuMihwaW4ueCAtIHAueCwgLShwaW4ueiAtIHAueikpLCBsYWJlbDogYFBpbiAke2kgKyAxfWAsIGRpc3Q6IE1hdGguaHlwb3QocGluLnggLSBwLngsIHBpbi56IC0gcC56KSwga25vd246IHRydWUsIHBpbjogUElOX0NPTE9SU1twaW4uY10gfSkpXG4gICAgICB0aGlzLnVpLnNldENvbXBhc3NNYXJrZXJzKG1hcmtlcnMpXG4gICAgICB0aGlzLnVpLnVwZGF0ZVN0YXRzKHRoaXMuc3RhdHMsIHRoaXMuY29uZmlnLm1vZGUsIE1BWF9TVEFUKVxuICAgICAgY29uc3QgbmlnaHQgPSAxIC0gdGhpcy5lbnYuZGF5XG4gICAgICBjb25zdCB3YXJkZWQgPSBuaWdodCA+IDAuNSAmJiB0aGlzLndhcmRzQ2FjaGUuc29tZSh3ID0+IE1hdGguaHlwb3Qody54IC0gcC54LCB3LnogLSBwLnopIDwgdy5yKVxuICAgICAgdGhpcy51aS5zZXRDbG9jayhjbG9ja1RleHQodGhpcy50aW1lKSwgdGhpcy5kYXksIG5pZ2h0ID4gMC41LCB3YXJkZWQsIHRoaXMuY29uZmlnLm1vZGUgPT09ICdjcmVhdGl2ZScgPyAodGhpcy5wbGF5ZXIuZmx5aW5nID8gJ0NyZWF0aXZlIMK3IEZseWluZycgOiAnQ3JlYXRpdmUnKSA6IERJRkZJQ1VMVFlbdGhpcy5jb25maWcuZGlmZmljdWx0eV0ubGFiZWwpXG4gICAgICB0aGlzLnRhcmdldEh1ZCgpXG4gICAgICB0aGlzLnVpLnNldEJ1ZmZzKHRoaXMuYnVmZnMoKSlcbiAgICAgIGNvbnN0IHcgPSB0aGlzLndhdmVcbiAgICAgIHRoaXMudWkuc2V0V2F2ZSh3ID8geyBuaWdodDogdy5kZWYubmlnaHQsIHRpdGxlOiB3LmRlZi50aXRsZSwgcmVtYWluaW5nOiB3LnF1ZXVlLmxlbmd0aCArIHcuYWxpdmUuc2l6ZSwgdG90YWw6IHcudG90YWwsIGJvc3M6IHcuZGVmLmJvc3MgfSA6IG51bGwpXG4gICAgICBjb25zdCBib3NzID0gdGhpcy5jcmVhdHVyZXMubGlzdC5maW5kKGMgPT4gYy5raW5kID09PSAnaG93bGVyJyAmJiBjLmFsaXZlKVxuICAgICAgdGhpcy51aS5zZXRCb3NzQmFyKGJvc3MgPyBDUkVBVFVSRV9OQU1FUy5ob3dsZXIgOiBudWxsLCBib3NzID8gTWF0aC5tYXgoMCwgYm9zcy5ocCkgLyBib3NzLm1heEhwIDogMClcbiAgICB9XG4gICAgdGhpcy51aS5zZXRIZWFkaW5nKHRoaXMucGxheWVyLnlhdylcbiAgfVxuXG4gIHByaXZhdGUgdGFyZ2V0SHVkKCk6IHZvaWQge1xuICAgIGNvbnN0IGhpdCA9IHRoaXMudGFyZ2V0XG4gICAgY29uc3Qgc3RhY2sgPSB0aGlzLnNlbGVjdGVkU3RhY2soKVxuICAgIGNvbnN0IGRlZiA9IHN0YWNrID8gSVRFTVNbc3RhY2suaWRdIDogbnVsbFxuICAgIGxldCBsYWJlbDogc3RyaW5nIHwgbnVsbCA9IG51bGxcbiAgICBsZXQgaHA6IG51bWJlciB8IG51bGwgPSBudWxsXG4gICAgaWYgKGhpdD8ua2luZCA9PT0gJ3Jlc291cmNlJykge1xuICAgICAgY29uc3QgciA9IGhpdC5yZXMhXG4gICAgICBsYWJlbCA9IFJFU1tyLnR5cGVdLm5hbWVcbiAgICAgIGNvbnN0IG1heCA9IFJFU1tyLnR5cGVdLmhwICogKHIudHlwZSA9PT0gJ29haycgfHwgci50eXBlID09PSAncGluZScgfHwgci50eXBlID09PSAnYm91bGRlcicgPyBNYXRoLm1pbigxLjQsIE1hdGgubWF4KDAuOCwgci5zKSkgOiAxKVxuICAgICAgaWYgKE51bWJlci5pc0Zpbml0ZShtYXgpICYmIHIuaHAgPCBtYXgpIGhwID0gci5ocCAvIG1heFxuICAgIH0gZWxzZSBpZiAoaGl0Py5raW5kID09PSAncGllY2UnKSB7XG4gICAgICBjb25zdCBwYyA9IGhpdC5waWVjZSFcbiAgICAgIGxhYmVsID0gUElFQ0VTW3BjLmlkXS5uYW1lXG4gICAgICBpZiAocGMuaHAgPCBQSUVDRVNbcGMuaWRdLmhwKSBocCA9IHBjLmhwIC8gUElFQ0VTW3BjLmlkXS5ocFxuICAgIH0gZWxzZSBpZiAoaGl0Py5raW5kID09PSAnY3JlYXR1cmUnKSB7XG4gICAgICBjb25zdCBjID0gaGl0LmNyZWF0dXJlIGFzIENyZWF0dXJlXG4gICAgICBsYWJlbCA9IENSRUFUVVJFX05BTUVTW2Mua2luZF1cbiAgICAgIGhwID0gTWF0aC5tYXgoMCwgYy5ocCkgLyBjLm1heEhwXG4gICAgfVxuICAgIGNvbnN0IHRvdWNoID0gdGhpcy5pbnB1dC5tZXRob2QgPT09ICd0b3VjaCdcbiAgICBjb25zdCB1c2UgPSB0b3VjaCA/ICdVU0UnIDogJ1JpZ2h0LWNsaWNrJ1xuICAgIGxldCBoaW50ID0gJydcbiAgICBpZiAoaGl0Py5raW5kID09PSAncGllY2UnICYmIFBJRUNFU1toaXQucGllY2UhLmlkXS5zdGF0aW9uICYmICEoZGVmPy5wbGFjZSAmJiBkZWYucGxhY2UgIT09ICdzb2lsJykpIGhpbnQgPSBgJHt1c2V9IHRvIHVzZSB0aGUgJHtQSUVDRVNbaGl0LnBpZWNlIS5pZF0ubmFtZX1gXG4gICAgZWxzZSBpZiAoZGVmPy5wbGFjZSAmJiBkZWYucGxhY2UgIT09ICdzb2lsJykgaGludCA9IHRoaXMucGxhY2VtZW50ICYmICF0aGlzLnBsYWNlbWVudC52YWxpZCA/ICdCbG9ja2VkIOKAlCB0cnkgYW5vdGhlciBzcG90JyA6IGAke3VzZX0gdG8gcGxhY2UgwrcgJHt0b3VjaCA/ICdST1RBVEUnIDogJ1InfSB0byByb3RhdGVgXG4gICAgZWxzZSBpZiAoZGVmPy5wbGFjZSA9PT0gJ3NvaWwnKSBoaW50ID0gYCR7dXNlfSBvbiB0aGUgZ3JvdW5kIHRvIHJhaXNlIGl0YFxuICAgIGVsc2UgaWYgKGRlZj8uZm9vZCkgaGludCA9IGAke3VzZX0gdG8gZWF0YFxuICAgIGVsc2UgaWYgKGRlZj8udG9vbD8ua2luZCA9PT0gJ2JvdycpIGhpbnQgPSB0aGlzLmludmVudG9yeS5pbmZpbml0ZSB8fCB0aGlzLmludmVudG9yeS5jb3VudCgnYXJyb3cnKSA+IDAgPyBgJHt0b3VjaCA/ICdIb2xkIE1JTkUnIDogJ0hvbGQgbGVmdC1jbGljayd9IHRvIGRyYXcgwrcgcmVsZWFzZSB0byBzaG9vdGAgOiAnTm8gYXJyb3dzIOKAlCBjcmFmdCB0aGVtIGF0IGEgd29ya2JlbmNoJ1xuICAgIGVsc2UgaWYgKGhpdD8ua2luZCA9PT0gJ3Jlc291cmNlJykge1xuICAgICAgY29uc3QgbmVlZCA9IG5lZWRlZFRvb2woUkVTW2hpdC5yZXMhLnR5cGVdLm1hdClcbiAgICAgIGNvbnN0IHRvb2wgPSBkZWY/LnRvb2xcbiAgICAgIGlmIChuZWVkICYmICEodG9vbD8ua2luZCA9PT0gJ3BpY2theGUnKSAmJiBSRVNbaGl0LnJlcyEudHlwZV0ubWF0ICE9PSAnbm9uZScpIGhpbnQgPSBuZWVkXG4gICAgICBlbHNlIGlmIChSRVNbaGl0LnJlcyEudHlwZV0ubWF0ID09PSAnbm9uZScpIGhpbnQgPSAnJ1xuICAgIH0gZWxzZSBpZiAoaGl0Py5raW5kID09PSAndGVycmFpbicgJiYgZGVmPy50b29sPy5raW5kID09PSAnc2hvdmVsJykgaGludCA9IGAke3RvdWNoID8gJ0hvbGQgTUlORScgOiAnSG9sZCBsZWZ0LWNsaWNrJ30gdG8gZGlnYFxuICAgIHRoaXMudWkuc2V0VGFyZ2V0KGxhYmVsLCBocCwgaGludClcbiAgfVxufVxuIl19