// Recovered TerraForge preview module normalized for the TerraFoundry runtime.
// @ts-nocheck
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';
export const MODELS = {
	deer: {
		url: "./assets/models/deer.glb",
		height: 1.55,
		yaw: 0,
		smooth: true,
		walkRate: .62,
		runRate: .16,
		tint: 14271144,
		soften: .12,
		rim: {
			color: 16766893,
			strength: .09
		},
		clips: {
			idle: "Idle",
			walk: "Walk",
			run: "Gallop",
			attack: "Attack_Kick",
			death: "Death",
			hit: "Idle_HitReact1",
			eat: "Eating"
		}
	},
	stag: {
		url: "./assets/models/stag.glb",
		height: 2.05,
		yaw: 0,
		smooth: true,
		walkRate: .55,
		runRate: .15,
		tint: 13218714,
		soften: .12,
		rim: {
			color: 16767155,
			strength: .1
		},
		clips: {
			idle: "Idle",
			walk: "Walk",
			run: "Gallop",
			attack: "Attack_Headbutt",
			death: "Death",
			hit: "Idle_HitReact1",
			eat: "Eating"
		}
	},
	fox: {
		url: "./assets/models/fox.glb",
		height: .72,
		yaw: 0,
		smooth: true,
		walkRate: .95,
		runRate: .2,
		tint: 15255728,
		soften: .1,
		rim: {
			color: 16766896,
			strength: .1
		},
		clips: {
			idle: "Idle",
			walk: "Walk",
			run: "Gallop",
			attack: "Attack",
			death: "Death",
			hit: "Idle_HitReact1",
			eat: "Eating"
		}
	},
	wolf: {
		url: "./assets/models/wolf.glb",
		height: 1.05,
		yaw: 0,
		smooth: true,
		gain: 1.15,
		walkRate: .8,
		runRate: .18,
		tint: 12827058,
		soften: .14,
		rim: {
			color: 13620715,
			strength: .1
		},
		clips: {
			idle: "Idle",
			walk: "Walk",
			run: "Gallop",
			attack: "Attack",
			death: "Death",
			hit: "Idle_HitReact1",
			eat: "Eating"
		}
	},
	ghoul: {
		url: "./assets/models/ghoul.glb",
		height: 1.82,
		yaw: 0,
		smooth: false,
		gain: 1.14,
		tint: 7760269,
		soften: .32,
		rim: {
			color: 11454439,
			strength: .22
		},
		eyeGlow: 1.65,
		lod: {
			ratio: .25,
			distance: 16,
			shadowOff: 40
		},
		walkRate: .7,
		runRate: .3,
		clips: {
			idle: "Idle",
			walk: "Walk",
			run: "Run",
			attack: "Attack"
		}
	},
	werewolf: {
		url: "./assets/models/werewolf.glb",
		height: 3.3,
		yaw: 0,
		smooth: false,
		gain: 1.55,
		tint: 4933209,
		soften: .35,
		rim: {
			color: 13212266,
			strength: .24
		},
		eyeGlow: 1.85,
		lod: {
			ratio: .14,
			distance: 20,
			shadowOff: 55
		},
		walkRate: .42,
		runRate: .2,
		clips: {
			idle: "Idle",
			walk: "Walk",
			run: "Run",
			attack: "Attack"
		}
	}
};
export type ModelId = keyof typeof MODELS

const templates = new Map();
export function modelReady(id) {
	return templates.has(id);
}
/** Debug switches for the model lab. */
export const MODEL_DEBUG = {
	noMerge: false,
	noSmooth: false
};
/** Prepares a loaded GLTF as a reusable template (idempotent). */
export function registerModel(id, gltf) {
	if (templates.has(id)) return;
	const def = MODELS[id];
	const root = gltf.scene;
	root.updateMatrixWorld(true);
	if (!MODEL_DEBUG.noMerge) mergeSkinnedMeshes(root);
	root.traverse((o) => {
		const m = o;
		if (!m.isMesh) return;
		m.castShadow = true;
		m.receiveShadow = true;
		m.frustumCulled = false;
		if (def.smooth && !MODEL_DEBUG.noSmooth) smoothNormals(m.geometry);
		const mats = Array.isArray(m.material) ? m.material : [m.material];
		m.material = mats.length === 1 ? tameMaterial(mats[0], def) : mats.map((x) => tameMaterial(x, def));
	});
	if (def.lod) buildLod(root, def.lod.ratio);
	const box = new THREE.Box3().setFromObject(root);
	const native = Math.max(.01, box.max.y - box.min.y);
	const scale = def.height / native;
	const clips = new Map(gltf.animations.map((c) => [c.name, c]));
	templates.set(id, {
		root,
		clips,
		scale,
		def,
		eyeY: def.height * .85
	});
}
const tamed = new WeakMap();
/** Low-glare, world-graded material: no metalness, high roughness, subtle env response. */
function tameMaterial(src, def) {
	const hit = tamed.get(src);
	if (hit) return hit;
	let out = src;
	if (src.isMeshStandardMaterial) {
		const m = src.clone();
		m.metalness = 0;
		m.roughness = Math.max(m.roughness, def.smooth ? .86 : .72);
		m.envMapIntensity = .35;
		m.emissiveIntensity = Math.min(m.emissiveIntensity, .4);
		if (def.tint !== undefined) m.color.multiply(new THREE.Color(def.tint));
		if (def.gain) m.color.multiplyScalar(def.gain);
		const isEye = !!def.eyeGlow && /eye|iris|pupil|cloud/i.test(src.name);
		if (isEye) {
			// Preserve the authored eye mesh while making it the one clean bloom source on each enemy.
			m.color.set(10286847);
			m.emissive.set(8385535);
			m.emissiveIntensity = def.eyeGlow;
		}
		m.flatShading = false;
		applySoftCreatureShader(m, def);
		out = m;
	}
	tamed.set(src, out);
	return out;
}
/**
* Adds a restrained view-space fresnel lift and mutes source texture contrast. It leaves all of
* MeshStandardMaterial's skinning, maps, lights, fog and transparency chunks intact, which is why
* it is safe for the merged skinned meshes and their LOD twins.
*/
function applySoftCreatureShader(m, def) {
	const rim = def.rim;
	const soften = def.soften ?? 0;
	if (!rim && !soften) return;
	m.onBeforeCompile = (shader) => {
		shader.uniforms.uSoftRimColor = { value: new THREE.Color(rim?.color ?? 16777215) };
		shader.uniforms.uSoftRimStrength = { value: rim?.strength ?? 0 };
		shader.uniforms.uSoftTextureSoften = { value: soften };
		shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vSoftRimNormal;").replace("#include <defaultnormal_vertex>", "#include <defaultnormal_vertex>\nvSoftRimNormal = normalize( transformedNormal );");
		shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vSoftRimNormal;\nuniform vec3 uSoftRimColor;\nuniform float uSoftRimStrength;\nuniform float uSoftTextureSoften;").replace("#include <map_fragment>", `#include <map_fragment>
// Pull noisy source photography toward its local value rather than erasing the painted albedo.
float softLuma = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( softLuma ), uSoftTextureSoften * 0.32 );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.58 ), uSoftTextureSoften * 0.14 );`).replace("#include <output_fragment>", `
// A broad, matte rim reads in foggy dusk without adding sharp specular glare.
float softRim = pow( 1.0 - clamp( dot( normalize( vViewPosition ), normalize( vSoftRimNormal ) ), 0.0, 1.0 ), 2.5 );
outgoingLight += uSoftRimColor * softRim * uSoftRimStrength;
#include <output_fragment>`);
	};
	m.customProgramCacheKey = () => `terraforge-soft-creature-${rim?.color ?? 0}-${rim?.strength ?? 0}-${soften}`;
	m.needsUpdate = true;
}
function smoothNormals(g) {
	// Quaternius exports duplicate vertices per face; weld (ignoring normals) then recompute.
	if (g.userData.smoothed) return;
	g.deleteAttribute("normal");
	// Meshopt output is interleaved/quantized; mergeVertices needs plain attributes.
	for (const name of Object.keys(g.attributes)) {
		const a = g.getAttribute(name);
		if (!a.isInterleavedBufferAttribute && !a.normalized) continue;
		const keepInt = name === "skinIndex";
		const out = keepInt ? new Uint16Array(a.count * a.itemSize) : new Float32Array(a.count * a.itemSize);
		for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
		g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
	}
	const welded = mergeVertices(g, 1e-4);
	g.setIndex(welded.getIndex());
	for (const name of Object.keys(welded.attributes)) g.setAttribute(name, welded.getAttribute(name));
	g.computeVertexNormals();
	g.userData.smoothed = true;
}
/**
* Merges many skinned meshes sharing one armature into one skinned mesh per material. The
* Castle-of-the-Dead characters ship as 50–70 separate skinned parts; merging cuts each
* creature to ~10 draw calls. Geometry is moved into bind space (bindMatrix applied), skin
* indices are remapped onto a unified skeleton, and the mesh binds with an identity matrix.
*/
function mergeSkinnedMeshes(root) {
	const skinned = [];
	root.traverse((o) => {
		if (o.isSkinnedMesh) skinned.push(o);
	});
	if (skinned.length < 5) return;
	try {
		const bones = [];
		const inverses = [];
		const index = new Map();
		for (const m of skinned) {
			m.skeleton.bones.forEach((b, i) => {
				if (index.has(b)) return;
				index.set(b, bones.length);
				bones.push(b);
				inverses.push(m.skeleton.boneInverses[i].clone());
			});
		}
		const byMat = new Map();
		const common = [
			"position",
			"normal",
			"uv",
			"color",
			"skinIndex",
			"skinWeight"
		];
		const refInvInverse = new THREE.Matrix4();
		const q = new THREE.Matrix4();
		const q2 = new THREE.Matrix4();
		for (const m of skinned) {
			const mat = Array.isArray(m.material) ? m.material[0] : m.material;
			// Quantised exports give each part its own inverse bind matrices. Move the part's
			// geometry into the reference skin space: Q = refInv⁻¹ · partInv (identical for all bones).
			const sb = m.skeleton.bones;
			const i0 = index.get(sb[0]);
			q.copy(refInvInverse.copy(inverses[i0]).invert()).multiply(m.skeleton.boneInverses[0]);
			for (let k = 1; k < sb.length; k += Math.max(1, Math.floor(sb.length / 6))) {
				q2.copy(refInvInverse.copy(inverses[index.get(sb[k])]).invert()).multiply(m.skeleton.boneInverses[k]);
				for (let e = 0; e < 16; e++) if (Math.abs(q2.elements[e] - q.elements[e]) > .001 * Math.max(1, Math.abs(q.elements[e]))) throw new Error("inconsistent skin");
			}
			const g = m.geometry.clone();
			for (const name of Object.keys(g.attributes)) if (!common.includes(name)) g.deleteAttribute(name);
			g.morphAttributes = {};
			const count = g.getAttribute("position").count;
			if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
			if (!g.getAttribute("normal")) g.computeVertexNormals();
			// Dequantize so attributes merge consistently (colours normalised to RGBA, white if absent).
			for (const name of common) {
				const a = g.getAttribute(name);
				if (name === "color") {
					const out = new Float32Array(count * 4).fill(1);
					if (a) for (let i = 0; i < count; i++) for (let k = 0; k < Math.min(4, a.itemSize); k++) out[i * 4 + k] = a.getComponent(i, k);
					g.setAttribute("color", new THREE.Float32BufferAttribute(out, 4));
					continue;
				}
				if (!a) continue;
				if (name === "skinIndex") {
					const out = new Uint16Array(a.count * 4);
					for (let i = 0; i < a.count; i++) for (let k = 0; k < 4; k++) out[i * 4 + k] = index.get(sb[a.getComponent(i, k)]) ?? 0;
					g.setAttribute(name, new THREE.Uint16BufferAttribute(out, 4));
				} else {
					const out = new Float32Array(a.count * a.itemSize);
					for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
					g.setAttribute(name, new THREE.Float32BufferAttribute(out, a.itemSize));
				}
			}
			g.applyMatrix4(q.clone().multiply(m.bindMatrix));
			const list = byMat.get(mat) ?? [];
			list.push(g);
			byMat.set(mat, list);
		}
		const skeleton = new THREE.Skeleton(bones, inverses);
		const parent = skinned[0].parent ?? root;
		const identity = new THREE.Matrix4();
		for (const [mat, geos] of byMat) {
			const allIndexed = geos.every((g) => g.index);
			const merged = mergeGeometries(allIndexed ? geos : geos.map((g) => g.index ? g.toNonIndexed() : g), false);
			if (!merged) throw new Error("merge failed");
			const mesh = new THREE.SkinnedMesh(merged, mat);
			mesh.name = `merged:${mat.name}`;
			parent.add(mesh);
			mesh.bind(skeleton, identity);
		}
		for (const m of skinned) m.removeFromParent();
	} catch (err) {
		console.warn("[models] skinned merge skipped", err);
	}
}
/** Warm the simplifier's WASM early so the first boss registration never waits on it. */
export const lodReady = MeshoptSimplifier.ready.catch(() => undefined);
let simplifierOk = false;
lodReady.then(() => simplifierOk = MeshoptSimplifier.supported);
/** Triangle totals of the full and LOD meshes (for the model lab and tests). */
export const LOD_STATS = new Map();
/**
* Adds a simplified twin next to every skinned mesh. The simplifier only rewrites the index
* buffer, so the twin shares the original vertex buffers (skin weights included) and binds to the
* same skeleton — no second download, no second skeleton, a few hundred KB of indices.
*/
function buildLod(root, ratio) {
	if (!simplifierOk) return;
	const meshes = [];
	root.traverse((o) => {
		if (o.isSkinnedMesh && !o.userData.lod) meshes.push(o);
	});
	let full = 0;
	let lod = 0;
	meshes.forEach((m, k) => {
		let g = m.geometry;
		if (!g.index) {
			// Weld exact duplicates so the simplifier sees connected topology.
			g = mergeVertices(g, 1e-6);
			m.geometry = g;
		}
		const pos = g.getAttribute("position");
		const positions = new Float32Array(pos.count * 3);
		for (let i = 0; i < pos.count; i++) {
			positions[i * 3] = pos.getX(i);
			positions[i * 3 + 1] = pos.getY(i);
			positions[i * 3 + 2] = pos.getZ(i);
		}
		const src = g.index.array;
		const indices = src instanceof Uint32Array ? src : new Uint32Array(src);
		const target = Math.max(3, Math.floor(indices.length * ratio / 3) * 3);
		const [out] = MeshoptSimplifier.simplify(indices, positions, 3, target, .02, ["Prune"]);
		full += indices.length / 3;
		lod += out.length / 3;
		const lg = new THREE.BufferGeometry();
		for (const name of Object.keys(g.attributes)) lg.setAttribute(name, g.getAttribute(name));
		lg.setIndex(new THREE.BufferAttribute(out, 1));
		const twin = new THREE.SkinnedMesh(lg, m.material);
		twin.name = `${m.name}:lod`;
		twin.userData.lod = true;
		twin.userData.pair = k;
		twin.visible = false;
		twin.castShadow = true;
		twin.receiveShadow = true;
		twin.frustumCulled = false;
		m.userData.full = true;
		m.userData.pair = k;
		(m.parent ?? root).add(twin);
		twin.bind(m.skeleton, m.bindMatrix);
	});
	LOD_STATS.set(root.uuid, {
		full,
		lod
	});
	root.userData.lodStats = {
		full,
		lod
	};
}
/** One animated creature instance. */
export class ModelInstance {
	id;
	object = new THREE.Group();
	mixer;
	actions = new Map();
	current = null;
	oneShot = null;
	def;
	materials = [];
	baseEmissive = new Map();
	flashColor = new THREE.Color();
	eyeGlows = [];
	eyeGlowTime = 0;
	eyeOpacity = 1;
	fullMeshes = [];
	lodMeshes = [];
	/** 0 = full detail, 1 = simplified. */
	lodLevel = 0;
	shadows = true;
	constructor(id, t) {
		this.id = id;
		this.def = t.def;
		const inner = cloneSkinned(t.root);
		inner.scale.setScalar(t.scale);
		inner.rotation.y = t.def.yaw;
		this.object.add(inner);
		if (t.def.eyeGlow) this.addEyeGlows(inner, t.scale);
		// Per-instance materials so hit flashes / dissolves don't bleed across the pack.
		inner.traverse((o) => {
			const m = o;
			if (!m.isMesh) return;
			const clone = (x) => {
				const c = x.clone();
				this.materials.push(c);
				this.baseEmissive.set(c, {
					color: c.emissive.clone(),
					intensity: c.emissiveIntensity
				});
				return c;
			};
			m.material = Array.isArray(m.material) ? m.material.map(clone) : clone(m.material);
			if (m.userData.lod) this.lodMeshes.push(m);
			else if (m.userData.full) this.fullMeshes.push(m);
		});
		// LOD twins must share the per-instance material of their full-detail sibling so flashes and
		// dissolves stay in sync.
		for (const lm of this.lodMeshes) {
			const base = this.fullMeshes.find((f) => f.userData.pair === lm.userData.pair);
			if (base) lm.material = base.material;
		}
		this.mixer = new THREE.AnimationMixer(inner);
		for (const [clip, name] of Object.entries(t.def.clips)) {
			const c = t.clips.get(name);
			if (!c) continue;
			const a = this.mixer.clipAction(c);
			if (clip === "death" || clip === "hit" || clip === "attack") {
				a.setLoop(THREE.LoopOnce, 1);
				a.clampWhenFinished = clip === "death";
			}
			this.actions.set(clip, a);
		}
		this.mixer.addEventListener("finished", (e) => {
			if (e.action === this.oneShot && this.current !== "death") {
				this.oneShot?.fadeOut(.15);
				this.oneShot = null;
			}
		});
		this.loop("idle");
	}
	/** Pin tiny additive glows to the exported eye bones; they follow head animation and survive texture LOD. */
	addEyeGlows(inner, scale) {
		for (const name of ["DEF-eye.L", "DEF-eye.R"]) {
			const eye = inner.getObjectByName(name);
			if (!eye) continue;
			const mat = new THREE.SpriteMaterial({
				color: 8385535,
				transparent: true,
				opacity: .82,
				depthWrite: false,
				depthTest: true,
				blending: THREE.AdditiveBlending,
				toneMapped: false
			});
			const sprite = new THREE.Sprite(mat);
			const size = .095 / scale;
			sprite.scale.setScalar(size);
			sprite.renderOrder = 4;
			sprite.userData.baseScale = size;
			eye.add(sprite);
			this.eyeGlows.push(mat);
		}
	}
	/** Picks the detail level from the camera distance (with hysteresis so it doesn't flicker). */
	setDistance(d) {
		const lod = this.def.lod;
		if (!lod || !this.lodMeshes.length) return;
		const want = this.lodLevel === 0 ? d > lod.distance + 1.5 ? 1 : 0 : d < lod.distance - 1.5 ? 0 : 1;
		if (want !== this.lodLevel) {
			this.lodLevel = want;
			for (const m of this.fullMeshes) m.visible = want === 0;
			for (const m of this.lodMeshes) m.visible = want === 1;
		}
		const sh = d < lod.shadowOff;
		if (sh !== this.shadows) {
			this.shadows = sh;
			for (const m of this.lodMeshes) m.castShadow = sh;
		}
	}
	has(clip) {
		return this.actions.has(clip);
	}
	/** Crossfades the looping locomotion clip. */
	loop(clip, rate = 1) {
		const a = this.actions.get(clip) ?? this.actions.get("idle");
		if (!a) return;
		a.timeScale = rate;
		if (this.current === clip) return;
		const prev = this.current ? this.actions.get(this.current) : null;
		a.reset().setEffectiveWeight(1).fadeIn(.22).play();
		prev?.fadeOut(.22);
		this.current = clip;
	}
	/** Plays a one-shot clip over locomotion (attack / hit / death). Returns its duration. */
	once(clip, rate = 1) {
		const a = this.actions.get(clip);
		if (!a) return 0;
		this.oneShot?.fadeOut(.1);
		a.reset();
		a.timeScale = rate;
		a.setEffectiveWeight(1).fadeIn(.08).play();
		this.oneShot = a;
		if (clip === "death") {
			for (const [k, x] of this.actions) if (k !== "death") x.fadeOut(.15);
			this.current = "death";
		}
		return a.getClip().duration / rate;
	}
	update(dt) {
		this.mixer.update(dt);
		if (this.eyeGlows.length) {
			this.eyeGlowTime += dt;
			const pulse = .66 + (Math.sin(this.eyeGlowTime * 3.4) * .5 + .5) * .26;
			for (const m of this.eyeGlows) m.opacity = this.eyeOpacity * pulse;
		}
	}
	/** Hit flash (emissive) and dissolve/fade support. */
	setFlash(k, color = 16734780) {
		this.flashColor.setHex(color);
		for (const m of this.materials) {
			if (!m.emissive) continue;
			const base = this.baseEmissive.get(m);
			if (k > 0) {
				// Keep eye glow visibly cyan under a hit flash instead of replacing it with a flat red.
				if (base) m.emissive.copy(base.color);
				else m.emissive.setRGB(0, 0, 0);
				m.emissive.lerp(this.flashColor, Math.min(.8, k));
				m.emissiveIntensity = (base?.intensity ?? 0) + k;
			} else {
				if (base) m.emissive.copy(base.color);
				else m.emissive.setRGB(0, 0, 0);
				m.emissiveIntensity = base?.intensity ?? 0;
			}
		}
	}
	setOpacity(a) {
		for (const m of this.materials) {
			const t = a < .999;
			if (m.transparent !== t) {
				m.transparent = t;
				m.needsUpdate = true;
			}
			m.opacity = a;
			m.depthWrite = !t;
		}
		this.eyeOpacity = a;
		for (const m of this.eyeGlows) m.opacity = a * .82;
	}
	/** Tints eyes/skin for night variants (e.g. ember-eyed wolves). */
	grade(color, amount) {
		const c = new THREE.Color(color);
		for (const m of this.materials) m.color.lerp(c, amount);
	}
	dispose() {
		this.mixer.stopAllAction();
		for (const m of this.materials) m.dispose();
		for (const m of this.eyeGlows) m.dispose();
	}
}
export function createModel(id) {
	const t = templates.get(id);
	return t ? new ModelInstance(id, t) : null;
}
export function modelHeight(id) {
	return MODELS[id].height;
}

//# sourceMappingURL=data:application/json;base64,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QUFZLElBQXFCO0NBQy9DLE9BQU8sT0FBTyxHQUFHLENBQUM7QUFDcEIiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsibW9kZWxzLnRzIl0sInZlcnNpb24iOjMsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIFRIUkVFIGZyb20gJ3RocmVlJ1xuaW1wb3J0IHR5cGUgeyBHTFRGIH0gZnJvbSAndGhyZWUvZXhhbXBsZXMvanNtL2xvYWRlcnMvR0xURkxvYWRlci5qcydcbmltcG9ydCB7IG1lcmdlR2VvbWV0cmllcywgbWVyZ2VWZXJ0aWNlcyB9IGZyb20gJ3RocmVlL2V4YW1wbGVzL2pzbS91dGlscy9CdWZmZXJHZW9tZXRyeVV0aWxzLmpzJ1xuaW1wb3J0IHsgY2xvbmUgYXMgY2xvbmVTa2lubmVkIH0gZnJvbSAndGhyZWUvZXhhbXBsZXMvanNtL3V0aWxzL1NrZWxldG9uVXRpbHMuanMnXG5pbXBvcnQgeyBNZXNob3B0U2ltcGxpZmllciB9IGZyb20gJ21lc2hvcHRpbWl6ZXIvc2ltcGxpZmllcidcblxuZXhwb3J0IHR5cGUgTW9kZWxJZCA9ICdkZWVyJyB8ICdzdGFnJyB8ICdmb3gnIHwgJ3dvbGYnIHwgJ2dob3VsJyB8ICd3ZXJld29sZidcbmV4cG9ydCB0eXBlIENsaXAgPSAnaWRsZScgfCAnd2FsaycgfCAncnVuJyB8ICdhdHRhY2snIHwgJ2RlYXRoJyB8ICdoaXQnIHwgJ2VhdCdcblxuZXhwb3J0IHR5cGUgTW9kZWxEZWYgPSB7XG4gIHVybDogc3RyaW5nXG4gIC8qKiBBbGJlZG8gbXVsdGlwbGllciBmb3IgZGFyayBzb3VyY2UgdGV4dHVyZXMgKDEgPSB1bmNoYW5nZWQpLiAqL1xuICBnYWluPzogbnVtYmVyXG4gIC8qKiBUYXJnZXQgc3RhbmRpbmcgaGVpZ2h0IGluIG1ldHJlcyAodGhlIG1vZGVsIGlzIHVuaWZvcm1seSBzY2FsZWQgdG8gaXQpLiAqL1xuICBoZWlnaHQ6IG51bWJlclxuICAvKiogTmF0aXZlIGZvcndhcmQgaXMgK1ogZm9yIGV2ZXJ5IG1vZGVsOyBleHRyYSB5YXcgaWYgYSBtb2RlbCBuZWVkcyBpdC4gKi9cbiAgeWF3OiBudW1iZXJcbiAgY2xpcHM6IFBhcnRpYWw8UmVjb3JkPENsaXAsIHN0cmluZz4+XG4gIC8qKiBXYWxrL3J1biBjbGlwIHBsYXliYWNrIHNwZWVkIHBlciBtL3Mgb2YgZ3JvdW5kIHNwZWVkIChmb290LXNsaWRpbmcgY29udHJvbCkuICovXG4gIHdhbGtSYXRlOiBudW1iZXJcbiAgcnVuUmF0ZTogbnVtYmVyXG4gIC8qKiBGbGF0LXNoYWRlZCB2ZXJ0ZXgtY29sb3VyIG1vZGVscyBnZXQgc21vb3RoZWQgbm9ybWFscyArIG1hdHRlIGxvb2suICovXG4gIHNtb290aDogYm9vbGVhblxuICAvKiogQWxiZWRvIG11bHRpcGxpZXIgZm9yIGNvbG91ciBncmFkaW5nIGludG8gdGhlIHdvcmxkIHBhbGV0dGUuICovXG4gIHRpbnQ/OiBudW1iZXJcbiAgLyoqIEdlbnRsZSBzaWxob3VldHRlIGxpZnQsIGFwcGxpZWQgaW4gdGhlIHN0YW5kYXJkLW1hdGVyaWFsIHNoYWRlciByYXRoZXIgdGhhbiBhcyBoYXJkIHNwZWN1bGFyLiAqL1xuICByaW0/OiB7IGNvbG9yOiBudW1iZXI7IHN0cmVuZ3RoOiBudW1iZXIgfVxuICAvKiogUmVkdWNlcyBwaG90b2dyYXBoaWMgdGV4dHVyZSBjb250cmFzdCBmb3IgYSBwYWludGVybHksIGxvdy1kZXRhaWwgcmVhZC4gKi9cbiAgc29mdGVuPzogbnVtYmVyXG4gIC8qKiBFbmFibGVzIGEgYmxvb20tc2FmZSBjeWFuIGdsb3cgb24gbmFtZWQgZXllL2lyaXMgbWF0ZXJpYWxzLiAqL1xuICBleWVHbG93PzogbnVtYmVyXG4gIC8qKlxuICAgKiBEaXN0YW5jZSBMT0Q6IGJleW9uZCBgZGlzdGFuY2VgIG1ldHJlcyBhIHNpbXBsaWZpZWQgbWVzaCAoYHJhdGlvYCBvZiB0aGUgdHJpYW5nbGVzKSBpcyBzaG93blxuICAgKiBpbnN0ZWFkOyBiZXlvbmQgYHNoYWRvd09mZmAgaXQgc3RvcHMgY2FzdGluZyBzaGFkb3dzLiBIZWF2eSBoZXJvIG1vZGVscyBvbmx5LlxuICAgKi9cbiAgbG9kPzogeyByYXRpbzogbnVtYmVyOyBkaXN0YW5jZTogbnVtYmVyOyBzaGFkb3dPZmY6IG51bWJlciB9XG59XG5cbmV4cG9ydCBjb25zdCBNT0RFTFM6IFJlY29yZDxNb2RlbElkLCBNb2RlbERlZj4gPSB7XG4gIGRlZXI6IHsgdXJsOiAnL2Fzc2V0cy9tb2RlbHMvZGVlci5nbGInLCBoZWlnaHQ6IDEuNTUsIHlhdzogMCwgc21vb3RoOiB0cnVlLCB3YWxrUmF0ZTogMC42MiwgcnVuUmF0ZTogMC4xNiwgdGludDogMHhkOWMyYTgsIHNvZnRlbjogMC4xMiwgcmltOiB7IGNvbG9yOiAweGZmZDdhZCwgc3RyZW5ndGg6IDAuMDkgfSwgY2xpcHM6IHsgaWRsZTogJ0lkbGUnLCB3YWxrOiAnV2FsaycsIHJ1bjogJ0dhbGxvcCcsIGF0dGFjazogJ0F0dGFja19LaWNrJywgZGVhdGg6ICdEZWF0aCcsIGhpdDogJ0lkbGVfSGl0UmVhY3QxJywgZWF0OiAnRWF0aW5nJyB9IH0sXG4gIHN0YWc6IHsgdXJsOiAnL2Fzc2V0cy9tb2RlbHMvc3RhZy5nbGInLCBoZWlnaHQ6IDIuMDUsIHlhdzogMCwgc21vb3RoOiB0cnVlLCB3YWxrUmF0ZTogMC41NSwgcnVuUmF0ZTogMC4xNSwgdGludDogMHhjOWIzOWEsIHNvZnRlbjogMC4xMiwgcmltOiB7IGNvbG9yOiAweGZmZDhiMywgc3RyZW5ndGg6IDAuMSB9LCBjbGlwczogeyBpZGxlOiAnSWRsZScsIHdhbGs6ICdXYWxrJywgcnVuOiAnR2FsbG9wJywgYXR0YWNrOiAnQXR0YWNrX0hlYWRidXR0JywgZGVhdGg6ICdEZWF0aCcsIGhpdDogJ0lkbGVfSGl0UmVhY3QxJywgZWF0OiAnRWF0aW5nJyB9IH0sXG4gIGZveDogeyB1cmw6ICcvYXNzZXRzL21vZGVscy9mb3guZ2xiJywgaGVpZ2h0OiAwLjcyLCB5YXc6IDAsIHNtb290aDogdHJ1ZSwgd2Fsa1JhdGU6IDAuOTUsIHJ1blJhdGU6IDAuMiwgdGludDogMHhlOGM4YjAsIHNvZnRlbjogMC4xLCByaW06IHsgY29sb3I6IDB4ZmZkN2IwLCBzdHJlbmd0aDogMC4xIH0sIGNsaXBzOiB7IGlkbGU6ICdJZGxlJywgd2FsazogJ1dhbGsnLCBydW46ICdHYWxsb3AnLCBhdHRhY2s6ICdBdHRhY2snLCBkZWF0aDogJ0RlYXRoJywgaGl0OiAnSWRsZV9IaXRSZWFjdDEnLCBlYXQ6ICdFYXRpbmcnIH0gfSxcbiAgd29sZjogeyB1cmw6ICcvYXNzZXRzL21vZGVscy93b2xmLmdsYicsIGhlaWdodDogMS4wNSwgeWF3OiAwLCBzbW9vdGg6IHRydWUsIGdhaW46IDEuMTUsIHdhbGtSYXRlOiAwLjgsIHJ1blJhdGU6IDAuMTgsIHRpbnQ6IDB4YzNiOWIyLCBzb2Z0ZW46IDAuMTQsIHJpbTogeyBjb2xvcjogMHhjZmQ1ZWIsIHN0cmVuZ3RoOiAwLjEgfSwgY2xpcHM6IHsgaWRsZTogJ0lkbGUnLCB3YWxrOiAnV2FsaycsIHJ1bjogJ0dhbGxvcCcsIGF0dGFjazogJ0F0dGFjaycsIGRlYXRoOiAnRGVhdGgnLCBoaXQ6ICdJZGxlX0hpdFJlYWN0MScsIGVhdDogJ0VhdGluZycgfSB9LFxuICBnaG91bDogeyB1cmw6ICcvYXNzZXRzL21vZGVscy9naG91bC5nbGInLCBoZWlnaHQ6IDEuODIsIHlhdzogMCwgc21vb3RoOiBmYWxzZSwgZ2FpbjogMS4xNCwgdGludDogMHg3NjY5OGQsIHNvZnRlbjogMC4zMiwgcmltOiB7IGNvbG9yOiAweGFlYzdlNywgc3RyZW5ndGg6IDAuMjIgfSwgZXllR2xvdzogMS42NSwgbG9kOiB7IHJhdGlvOiAwLjI1LCBkaXN0YW5jZTogMTYsIHNoYWRvd09mZjogNDAgfSwgd2Fsa1JhdGU6IDAuNywgcnVuUmF0ZTogMC4zLCBjbGlwczogeyBpZGxlOiAnSWRsZScsIHdhbGs6ICdXYWxrJywgcnVuOiAnUnVuJywgYXR0YWNrOiAnQXR0YWNrJyB9IH0sXG4gIHdlcmV3b2xmOiB7IHVybDogJy9hc3NldHMvbW9kZWxzL3dlcmV3b2xmLmdsYicsIGhlaWdodDogMy4zLCB5YXc6IDAsIHNtb290aDogZmFsc2UsIGdhaW46IDEuNTUsIHRpbnQ6IDB4NGI0NjU5LCBzb2Z0ZW46IDAuMzUsIHJpbTogeyBjb2xvcjogMHhjOTlhNmEsIHN0cmVuZ3RoOiAwLjI0IH0sIGV5ZUdsb3c6IDEuODUsIGxvZDogeyByYXRpbzogMC4xNCwgZGlzdGFuY2U6IDIwLCBzaGFkb3dPZmY6IDU1IH0sIHdhbGtSYXRlOiAwLjQyLCBydW5SYXRlOiAwLjIsIGNsaXBzOiB7IGlkbGU6ICdJZGxlJywgd2FsazogJ1dhbGsnLCBydW46ICdSdW4nLCBhdHRhY2s6ICdBdHRhY2snIH0gfSxcbn1cblxudHlwZSBUZW1wbGF0ZSA9IHsgcm9vdDogVEhSRUUuT2JqZWN0M0Q7IGNsaXBzOiBNYXA8c3RyaW5nLCBUSFJFRS5BbmltYXRpb25DbGlwPjsgc2NhbGU6IG51bWJlcjsgZGVmOiBNb2RlbERlZjsgZXllWTogbnVtYmVyIH1cbmNvbnN0IHRlbXBsYXRlcyA9IG5ldyBNYXA8TW9kZWxJZCwgVGVtcGxhdGU+KClcblxuZXhwb3J0IGZ1bmN0aW9uIG1vZGVsUmVhZHkoaWQ6IE1vZGVsSWQpOiBib29sZWFuIHtcbiAgcmV0dXJuIHRlbXBsYXRlcy5oYXMoaWQpXG59XG5cbi8qKiBEZWJ1ZyBzd2l0Y2hlcyBmb3IgdGhlIG1vZGVsIGxhYi4gKi9cbmV4cG9ydCBjb25zdCBNT0RFTF9ERUJVRyA9IHsgbm9NZXJnZTogZmFsc2UsIG5vU21vb3RoOiBmYWxzZSB9XG5cbi8qKiBQcmVwYXJlcyBhIGxvYWRlZCBHTFRGIGFzIGEgcmV1c2FibGUgdGVtcGxhdGUgKGlkZW1wb3RlbnQpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyTW9kZWwoaWQ6IE1vZGVsSWQsIGdsdGY6IEdMVEYpOiB2b2lkIHtcbiAgaWYgKHRlbXBsYXRlcy5oYXMoaWQpKSByZXR1cm5cbiAgY29uc3QgZGVmID0gTU9ERUxTW2lkXVxuICBjb25zdCByb290ID0gZ2x0Zi5zY2VuZVxuICByb290LnVwZGF0ZU1hdHJpeFdvcmxkKHRydWUpXG4gIGlmICghTU9ERUxfREVCVUcubm9NZXJnZSkgbWVyZ2VTa2lubmVkTWVzaGVzKHJvb3QpXG4gIHJvb3QudHJhdmVyc2UoKG8pID0+IHtcbiAgICBjb25zdCBtID0gbyBhcyBUSFJFRS5NZXNoXG4gICAgaWYgKCFtLmlzTWVzaCkgcmV0dXJuXG4gICAgbS5jYXN0U2hhZG93ID0gdHJ1ZVxuICAgIG0ucmVjZWl2ZVNoYWRvdyA9IHRydWVcbiAgICBtLmZydXN0dW1DdWxsZWQgPSBmYWxzZSAvLyBza2lubmVkIGJvdW5kcyBhcmUgYmluZC1wb3NlIG9ubHk7IGNyZWF0dXJlcyBhcmUgZmV3LlxuICAgIGlmIChkZWYuc21vb3RoICYmICFNT0RFTF9ERUJVRy5ub1Ntb290aCkgc21vb3RoTm9ybWFscyhtLmdlb21ldHJ5KVxuICAgIGNvbnN0IG1hdHMgPSBBcnJheS5pc0FycmF5KG0ubWF0ZXJpYWwpID8gbS5tYXRlcmlhbCA6IFttLm1hdGVyaWFsXVxuICAgIG0ubWF0ZXJpYWwgPSBtYXRzLmxlbmd0aCA9PT0gMSA/IHRhbWVNYXRlcmlhbChtYXRzWzBdLCBkZWYpIDogbWF0cy5tYXAoKHgpID0+IHRhbWVNYXRlcmlhbCh4LCBkZWYpKVxuICB9KVxuICBpZiAoZGVmLmxvZCkgYnVpbGRMb2Qocm9vdCwgZGVmLmxvZC5yYXRpbylcbiAgY29uc3QgYm94ID0gbmV3IFRIUkVFLkJveDMoKS5zZXRGcm9tT2JqZWN0KHJvb3QpXG4gIGNvbnN0IG5hdGl2ZSA9IE1hdGgubWF4KDAuMDEsIGJveC5tYXgueSAtIGJveC5taW4ueSlcbiAgY29uc3Qgc2NhbGUgPSBkZWYuaGVpZ2h0IC8gbmF0aXZlXG4gIGNvbnN0IGNsaXBzID0gbmV3IE1hcChnbHRmLmFuaW1hdGlvbnMubWFwKChjKSA9PiBbYy5uYW1lLCBjXSkpXG4gIHRlbXBsYXRlcy5zZXQoaWQsIHsgcm9vdCwgY2xpcHMsIHNjYWxlLCBkZWYsIGV5ZVk6IGRlZi5oZWlnaHQgKiAwLjg1IH0pXG59XG5cbmNvbnN0IHRhbWVkID0gbmV3IFdlYWtNYXA8VEhSRUUuTWF0ZXJpYWwsIFRIUkVFLk1hdGVyaWFsPigpXG4vKiogTG93LWdsYXJlLCB3b3JsZC1ncmFkZWQgbWF0ZXJpYWw6IG5vIG1ldGFsbmVzcywgaGlnaCByb3VnaG5lc3MsIHN1YnRsZSBlbnYgcmVzcG9uc2UuICovXG5mdW5jdGlvbiB0YW1lTWF0ZXJpYWwoc3JjOiBUSFJFRS5NYXRlcmlhbCwgZGVmOiBNb2RlbERlZik6IFRIUkVFLk1hdGVyaWFsIHtcbiAgY29uc3QgaGl0ID0gdGFtZWQuZ2V0KHNyYylcbiAgaWYgKGhpdCkgcmV0dXJuIGhpdFxuICBsZXQgb3V0ID0gc3JjXG4gIGlmICgoc3JjIGFzIFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsKS5pc01lc2hTdGFuZGFyZE1hdGVyaWFsKSB7XG4gICAgY29uc3QgbSA9IChzcmMgYXMgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwpLmNsb25lKClcbiAgICBtLm1ldGFsbmVzcyA9IDBcbiAgICBtLnJvdWdobmVzcyA9IE1hdGgubWF4KG0ucm91Z2huZXNzLCBkZWYuc21vb3RoID8gMC44NiA6IDAuNzIpXG4gICAgbS5lbnZNYXBJbnRlbnNpdHkgPSAwLjM1XG4gICAgbS5lbWlzc2l2ZUludGVuc2l0eSA9IE1hdGgubWluKG0uZW1pc3NpdmVJbnRlbnNpdHksIDAuNClcbiAgICBpZiAoZGVmLnRpbnQgIT09IHVuZGVmaW5lZCkgbS5jb2xvci5tdWx0aXBseShuZXcgVEhSRUUuQ29sb3IoZGVmLnRpbnQpKVxuICAgIGlmIChkZWYuZ2FpbikgbS5jb2xvci5tdWx0aXBseVNjYWxhcihkZWYuZ2FpbilcbiAgICBjb25zdCBpc0V5ZSA9ICEhZGVmLmV5ZUdsb3cgJiYgL2V5ZXxpcmlzfHB1cGlsfGNsb3VkL2kudGVzdChzcmMubmFtZSlcbiAgICBpZiAoaXNFeWUpIHtcbiAgICAgIC8vIFByZXNlcnZlIHRoZSBhdXRob3JlZCBleWUgbWVzaCB3aGlsZSBtYWtpbmcgaXQgdGhlIG9uZSBjbGVhbiBibG9vbSBzb3VyY2Ugb24gZWFjaCBlbmVteS5cbiAgICAgIG0uY29sb3Iuc2V0KDB4OWNmNmZmKVxuICAgICAgbS5lbWlzc2l2ZS5zZXQoMHg3ZmYzZmYpXG4gICAgICBtLmVtaXNzaXZlSW50ZW5zaXR5ID0gZGVmLmV5ZUdsb3chXG4gICAgfVxuICAgIG0uZmxhdFNoYWRpbmcgPSBmYWxzZVxuICAgIGFwcGx5U29mdENyZWF0dXJlU2hhZGVyKG0sIGRlZilcbiAgICBvdXQgPSBtXG4gIH1cbiAgdGFtZWQuc2V0KHNyYywgb3V0KVxuICByZXR1cm4gb3V0XG59XG5cbi8qKlxuICogQWRkcyBhIHJlc3RyYWluZWQgdmlldy1zcGFjZSBmcmVzbmVsIGxpZnQgYW5kIG11dGVzIHNvdXJjZSB0ZXh0dXJlIGNvbnRyYXN0LiBJdCBsZWF2ZXMgYWxsIG9mXG4gKiBNZXNoU3RhbmRhcmRNYXRlcmlhbCdzIHNraW5uaW5nLCBtYXBzLCBsaWdodHMsIGZvZyBhbmQgdHJhbnNwYXJlbmN5IGNodW5rcyBpbnRhY3QsIHdoaWNoIGlzIHdoeVxuICogaXQgaXMgc2FmZSBmb3IgdGhlIG1lcmdlZCBza2lubmVkIG1lc2hlcyBhbmQgdGhlaXIgTE9EIHR3aW5zLlxuICovXG5mdW5jdGlvbiBhcHBseVNvZnRDcmVhdHVyZVNoYWRlcihtOiBUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCwgZGVmOiBNb2RlbERlZik6IHZvaWQge1xuICBjb25zdCByaW0gPSBkZWYucmltXG4gIGNvbnN0IHNvZnRlbiA9IGRlZi5zb2Z0ZW4gPz8gMFxuICBpZiAoIXJpbSAmJiAhc29mdGVuKSByZXR1cm5cbiAgbS5vbkJlZm9yZUNvbXBpbGUgPSAoc2hhZGVyKSA9PiB7XG4gICAgc2hhZGVyLnVuaWZvcm1zLnVTb2Z0UmltQ29sb3IgPSB7IHZhbHVlOiBuZXcgVEhSRUUuQ29sb3IocmltPy5jb2xvciA/PyAweGZmZmZmZikgfVxuICAgIHNoYWRlci51bmlmb3Jtcy51U29mdFJpbVN0cmVuZ3RoID0geyB2YWx1ZTogcmltPy5zdHJlbmd0aCA/PyAwIH1cbiAgICBzaGFkZXIudW5pZm9ybXMudVNvZnRUZXh0dXJlU29mdGVuID0geyB2YWx1ZTogc29mdGVuIH1cbiAgICBzaGFkZXIudmVydGV4U2hhZGVyID0gc2hhZGVyLnZlcnRleFNoYWRlclxuICAgICAgLnJlcGxhY2UoJyNpbmNsdWRlIDxjb21tb24+JywgJyNpbmNsdWRlIDxjb21tb24+XFxudmFyeWluZyB2ZWMzIHZTb2Z0UmltTm9ybWFsOycpXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPGRlZmF1bHRub3JtYWxfdmVydGV4PicsICcjaW5jbHVkZSA8ZGVmYXVsdG5vcm1hbF92ZXJ0ZXg+XFxudlNvZnRSaW1Ob3JtYWwgPSBub3JtYWxpemUoIHRyYW5zZm9ybWVkTm9ybWFsICk7JylcbiAgICBzaGFkZXIuZnJhZ21lbnRTaGFkZXIgPSBzaGFkZXIuZnJhZ21lbnRTaGFkZXJcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8Y29tbW9uPicsICcjaW5jbHVkZSA8Y29tbW9uPlxcbnZhcnlpbmcgdmVjMyB2U29mdFJpbU5vcm1hbDtcXG51bmlmb3JtIHZlYzMgdVNvZnRSaW1Db2xvcjtcXG51bmlmb3JtIGZsb2F0IHVTb2Z0UmltU3RyZW5ndGg7XFxudW5pZm9ybSBmbG9hdCB1U29mdFRleHR1cmVTb2Z0ZW47JylcbiAgICAgIC5yZXBsYWNlKCcjaW5jbHVkZSA8bWFwX2ZyYWdtZW50PicsIGAjaW5jbHVkZSA8bWFwX2ZyYWdtZW50PlxuLy8gUHVsbCBub2lzeSBzb3VyY2UgcGhvdG9ncmFwaHkgdG93YXJkIGl0cyBsb2NhbCB2YWx1ZSByYXRoZXIgdGhhbiBlcmFzaW5nIHRoZSBwYWludGVkIGFsYmVkby5cbmZsb2F0IHNvZnRMdW1hID0gZG90KCBkaWZmdXNlQ29sb3IucmdiLCB2ZWMzKCAwLjI5OSwgMC41ODcsIDAuMTE0ICkgKTtcbmRpZmZ1c2VDb2xvci5yZ2IgPSBtaXgoIGRpZmZ1c2VDb2xvci5yZ2IsIHZlYzMoIHNvZnRMdW1hICksIHVTb2Z0VGV4dHVyZVNvZnRlbiAqIDAuMzIgKTtcbmRpZmZ1c2VDb2xvci5yZ2IgPSBtaXgoIGRpZmZ1c2VDb2xvci5yZ2IsIHZlYzMoIDAuNTggKSwgdVNvZnRUZXh0dXJlU29mdGVuICogMC4xNCApO2ApXG4gICAgICAucmVwbGFjZSgnI2luY2x1ZGUgPG91dHB1dF9mcmFnbWVudD4nLCBgXG4vLyBBIGJyb2FkLCBtYXR0ZSByaW0gcmVhZHMgaW4gZm9nZ3kgZHVzayB3aXRob3V0IGFkZGluZyBzaGFycCBzcGVjdWxhciBnbGFyZS5cbmZsb2F0IHNvZnRSaW0gPSBwb3coIDEuMCAtIGNsYW1wKCBkb3QoIG5vcm1hbGl6ZSggdlZpZXdQb3NpdGlvbiApLCBub3JtYWxpemUoIHZTb2Z0UmltTm9ybWFsICkgKSwgMC4wLCAxLjAgKSwgMi41ICk7XG5vdXRnb2luZ0xpZ2h0ICs9IHVTb2Z0UmltQ29sb3IgKiBzb2Z0UmltICogdVNvZnRSaW1TdHJlbmd0aDtcbiNpbmNsdWRlIDxvdXRwdXRfZnJhZ21lbnQ+YClcbiAgfVxuICBtLmN1c3RvbVByb2dyYW1DYWNoZUtleSA9ICgpID0+IGB0ZXJyYWZvcmdlLXNvZnQtY3JlYXR1cmUtJHtyaW0/LmNvbG9yID8/IDB9LSR7cmltPy5zdHJlbmd0aCA/PyAwfS0ke3NvZnRlbn1gXG4gIG0ubmVlZHNVcGRhdGUgPSB0cnVlXG59XG5cbmZ1bmN0aW9uIHNtb290aE5vcm1hbHMoZzogVEhSRUUuQnVmZmVyR2VvbWV0cnkpOiB2b2lkIHtcbiAgLy8gUXVhdGVybml1cyBleHBvcnRzIGR1cGxpY2F0ZSB2ZXJ0aWNlcyBwZXIgZmFjZTsgd2VsZCAoaWdub3Jpbmcgbm9ybWFscykgdGhlbiByZWNvbXB1dGUuXG4gIGlmIChnLnVzZXJEYXRhLnNtb290aGVkKSByZXR1cm5cbiAgZy5kZWxldGVBdHRyaWJ1dGUoJ25vcm1hbCcpXG4gIC8vIE1lc2hvcHQgb3V0cHV0IGlzIGludGVybGVhdmVkL3F1YW50aXplZDsgbWVyZ2VWZXJ0aWNlcyBuZWVkcyBwbGFpbiBhdHRyaWJ1dGVzLlxuICBmb3IgKGNvbnN0IG5hbWUgb2YgT2JqZWN0LmtleXMoZy5hdHRyaWJ1dGVzKSkge1xuICAgIGNvbnN0IGEgPSBnLmdldEF0dHJpYnV0ZShuYW1lKSBhcyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGUgfCBUSFJFRS5JbnRlcmxlYXZlZEJ1ZmZlckF0dHJpYnV0ZVxuICAgIGlmICghKGEgYXMgVEhSRUUuSW50ZXJsZWF2ZWRCdWZmZXJBdHRyaWJ1dGUpLmlzSW50ZXJsZWF2ZWRCdWZmZXJBdHRyaWJ1dGUgJiYgIWEubm9ybWFsaXplZCkgY29udGludWVcbiAgICBjb25zdCBrZWVwSW50ID0gbmFtZSA9PT0gJ3NraW5JbmRleCdcbiAgICBjb25zdCBvdXQgPSBrZWVwSW50ID8gbmV3IFVpbnQxNkFycmF5KGEuY291bnQgKiBhLml0ZW1TaXplKSA6IG5ldyBGbG9hdDMyQXJyYXkoYS5jb3VudCAqIGEuaXRlbVNpemUpXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmNvdW50OyBpKyspIGZvciAobGV0IGsgPSAwOyBrIDwgYS5pdGVtU2l6ZTsgaysrKSBvdXRbaSAqIGEuaXRlbVNpemUgKyBrXSA9IGEuZ2V0Q29tcG9uZW50KGksIGspXG4gICAgZy5zZXRBdHRyaWJ1dGUobmFtZSwgbmV3IFRIUkVFLkJ1ZmZlckF0dHJpYnV0ZShvdXQsIGEuaXRlbVNpemUpKVxuICB9XG4gIGNvbnN0IHdlbGRlZCA9IG1lcmdlVmVydGljZXMoZywgMWUtNClcbiAgZy5zZXRJbmRleCh3ZWxkZWQuZ2V0SW5kZXgoKSlcbiAgZm9yIChjb25zdCBuYW1lIG9mIE9iamVjdC5rZXlzKHdlbGRlZC5hdHRyaWJ1dGVzKSkgZy5zZXRBdHRyaWJ1dGUobmFtZSwgd2VsZGVkLmdldEF0dHJpYnV0ZShuYW1lKSlcbiAgZy5jb21wdXRlVmVydGV4Tm9ybWFscygpXG4gIGcudXNlckRhdGEuc21vb3RoZWQgPSB0cnVlXG59XG5cbi8qKlxuICogTWVyZ2VzIG1hbnkgc2tpbm5lZCBtZXNoZXMgc2hhcmluZyBvbmUgYXJtYXR1cmUgaW50byBvbmUgc2tpbm5lZCBtZXNoIHBlciBtYXRlcmlhbC4gVGhlXG4gKiBDYXN0bGUtb2YtdGhlLURlYWQgY2hhcmFjdGVycyBzaGlwIGFzIDUw4oCTNzAgc2VwYXJhdGUgc2tpbm5lZCBwYXJ0czsgbWVyZ2luZyBjdXRzIGVhY2hcbiAqIGNyZWF0dXJlIHRvIH4xMCBkcmF3IGNhbGxzLiBHZW9tZXRyeSBpcyBtb3ZlZCBpbnRvIGJpbmQgc3BhY2UgKGJpbmRNYXRyaXggYXBwbGllZCksIHNraW5cbiAqIGluZGljZXMgYXJlIHJlbWFwcGVkIG9udG8gYSB1bmlmaWVkIHNrZWxldG9uLCBhbmQgdGhlIG1lc2ggYmluZHMgd2l0aCBhbiBpZGVudGl0eSBtYXRyaXguXG4gKi9cbmZ1bmN0aW9uIG1lcmdlU2tpbm5lZE1lc2hlcyhyb290OiBUSFJFRS5PYmplY3QzRCk6IHZvaWQge1xuICBjb25zdCBza2lubmVkOiBUSFJFRS5Ta2lubmVkTWVzaFtdID0gW11cbiAgcm9vdC50cmF2ZXJzZSgobykgPT4ge1xuICAgIGlmICgobyBhcyBUSFJFRS5Ta2lubmVkTWVzaCkuaXNTa2lubmVkTWVzaCkgc2tpbm5lZC5wdXNoKG8gYXMgVEhSRUUuU2tpbm5lZE1lc2gpXG4gIH0pXG4gIGlmIChza2lubmVkLmxlbmd0aCA8IDUpIHJldHVyblxuICB0cnkge1xuICAgIGNvbnN0IGJvbmVzOiBUSFJFRS5Cb25lW10gPSBbXVxuICAgIGNvbnN0IGludmVyc2VzOiBUSFJFRS5NYXRyaXg0W10gPSBbXVxuICAgIGNvbnN0IGluZGV4ID0gbmV3IE1hcDxUSFJFRS5Cb25lLCBudW1iZXI+KClcbiAgICBmb3IgKGNvbnN0IG0gb2Ygc2tpbm5lZCkge1xuICAgICAgbS5za2VsZXRvbi5ib25lcy5mb3JFYWNoKChiLCBpKSA9PiB7XG4gICAgICAgIGlmIChpbmRleC5oYXMoYikpIHJldHVyblxuICAgICAgICBpbmRleC5zZXQoYiwgYm9uZXMubGVuZ3RoKVxuICAgICAgICBib25lcy5wdXNoKGIpXG4gICAgICAgIGludmVyc2VzLnB1c2gobS5za2VsZXRvbi5ib25lSW52ZXJzZXNbaV0uY2xvbmUoKSlcbiAgICAgIH0pXG4gICAgfVxuICAgIGNvbnN0IGJ5TWF0ID0gbmV3IE1hcDxUSFJFRS5NYXRlcmlhbCwgVEhSRUUuQnVmZmVyR2VvbWV0cnlbXT4oKVxuICAgIGNvbnN0IGNvbW1vbiA9IFsncG9zaXRpb24nLCAnbm9ybWFsJywgJ3V2JywgJ2NvbG9yJywgJ3NraW5JbmRleCcsICdza2luV2VpZ2h0J11cbiAgICBjb25zdCByZWZJbnZJbnZlcnNlID0gbmV3IFRIUkVFLk1hdHJpeDQoKVxuICAgIGNvbnN0IHEgPSBuZXcgVEhSRUUuTWF0cml4NCgpXG4gICAgY29uc3QgcTIgPSBuZXcgVEhSRUUuTWF0cml4NCgpXG4gICAgZm9yIChjb25zdCBtIG9mIHNraW5uZWQpIHtcbiAgICAgIGNvbnN0IG1hdCA9IEFycmF5LmlzQXJyYXkobS5tYXRlcmlhbCkgPyBtLm1hdGVyaWFsWzBdIDogbS5tYXRlcmlhbFxuICAgICAgLy8gUXVhbnRpc2VkIGV4cG9ydHMgZ2l2ZSBlYWNoIHBhcnQgaXRzIG93biBpbnZlcnNlIGJpbmQgbWF0cmljZXMuIE1vdmUgdGhlIHBhcnQnc1xuICAgICAgLy8gZ2VvbWV0cnkgaW50byB0aGUgcmVmZXJlbmNlIHNraW4gc3BhY2U6IFEgPSByZWZJbnbigbvCuSDCtyBwYXJ0SW52IChpZGVudGljYWwgZm9yIGFsbCBib25lcykuXG4gICAgICBjb25zdCBzYiA9IG0uc2tlbGV0b24uYm9uZXNcbiAgICAgIGNvbnN0IGkwID0gaW5kZXguZ2V0KHNiWzBdKSFcbiAgICAgIHEuY29weShyZWZJbnZJbnZlcnNlLmNvcHkoaW52ZXJzZXNbaTBdKS5pbnZlcnQoKSkubXVsdGlwbHkobS5za2VsZXRvbi5ib25lSW52ZXJzZXNbMF0pXG4gICAgICBmb3IgKGxldCBrID0gMTsgayA8IHNiLmxlbmd0aDsgayArPSBNYXRoLm1heCgxLCBNYXRoLmZsb29yKHNiLmxlbmd0aCAvIDYpKSkge1xuICAgICAgICBxMi5jb3B5KHJlZkludkludmVyc2UuY29weShpbnZlcnNlc1tpbmRleC5nZXQoc2Jba10pIV0pLmludmVydCgpKS5tdWx0aXBseShtLnNrZWxldG9uLmJvbmVJbnZlcnNlc1trXSlcbiAgICAgICAgZm9yIChsZXQgZSA9IDA7IGUgPCAxNjsgZSsrKSBpZiAoTWF0aC5hYnMocTIuZWxlbWVudHNbZV0gLSBxLmVsZW1lbnRzW2VdKSA+IDFlLTMgKiBNYXRoLm1heCgxLCBNYXRoLmFicyhxLmVsZW1lbnRzW2VdKSkpIHRocm93IG5ldyBFcnJvcignaW5jb25zaXN0ZW50IHNraW4nKVxuICAgICAgfVxuICAgICAgY29uc3QgZyA9IG0uZ2VvbWV0cnkuY2xvbmUoKVxuICAgICAgZm9yIChjb25zdCBuYW1lIG9mIE9iamVjdC5rZXlzKGcuYXR0cmlidXRlcykpIGlmICghY29tbW9uLmluY2x1ZGVzKG5hbWUpKSBnLmRlbGV0ZUF0dHJpYnV0ZShuYW1lKVxuICAgICAgZy5tb3JwaEF0dHJpYnV0ZXMgPSB7fVxuICAgICAgY29uc3QgY291bnQgPSBnLmdldEF0dHJpYnV0ZSgncG9zaXRpb24nKS5jb3VudFxuICAgICAgaWYgKCFnLmdldEF0dHJpYnV0ZSgndXYnKSkgZy5zZXRBdHRyaWJ1dGUoJ3V2JywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUobmV3IEZsb2F0MzJBcnJheShjb3VudCAqIDIpLCAyKSlcbiAgICAgIGlmICghZy5nZXRBdHRyaWJ1dGUoJ25vcm1hbCcpKSBnLmNvbXB1dGVWZXJ0ZXhOb3JtYWxzKClcbiAgICAgIC8vIERlcXVhbnRpemUgc28gYXR0cmlidXRlcyBtZXJnZSBjb25zaXN0ZW50bHkgKGNvbG91cnMgbm9ybWFsaXNlZCB0byBSR0JBLCB3aGl0ZSBpZiBhYnNlbnQpLlxuICAgICAgZm9yIChjb25zdCBuYW1lIG9mIGNvbW1vbikge1xuICAgICAgICBjb25zdCBhID0gZy5nZXRBdHRyaWJ1dGUobmFtZSkgYXMgVEhSRUUuQnVmZmVyQXR0cmlidXRlXG4gICAgICAgIGlmIChuYW1lID09PSAnY29sb3InKSB7XG4gICAgICAgICAgY29uc3Qgb3V0ID0gbmV3IEZsb2F0MzJBcnJheShjb3VudCAqIDQpLmZpbGwoMSlcbiAgICAgICAgICBpZiAoYSkgZm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSBmb3IgKGxldCBrID0gMDsgayA8IE1hdGgubWluKDQsIGEuaXRlbVNpemUpOyBrKyspIG91dFtpICogNCArIGtdID0gYS5nZXRDb21wb25lbnQoaSwgaylcbiAgICAgICAgICBnLnNldEF0dHJpYnV0ZSgnY29sb3InLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShvdXQsIDQpKVxuICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFhKSBjb250aW51ZVxuICAgICAgICBpZiAobmFtZSA9PT0gJ3NraW5JbmRleCcpIHtcbiAgICAgICAgICBjb25zdCBvdXQgPSBuZXcgVWludDE2QXJyYXkoYS5jb3VudCAqIDQpXG4gICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmNvdW50OyBpKyspIGZvciAobGV0IGsgPSAwOyBrIDwgNDsgaysrKSBvdXRbaSAqIDQgKyBrXSA9IGluZGV4LmdldChzYlthLmdldENvbXBvbmVudChpLCBrKV0pID8/IDBcbiAgICAgICAgICBnLnNldEF0dHJpYnV0ZShuYW1lLCBuZXcgVEhSRUUuVWludDE2QnVmZmVyQXR0cmlidXRlKG91dCwgNCkpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3Qgb3V0ID0gbmV3IEZsb2F0MzJBcnJheShhLmNvdW50ICogYS5pdGVtU2l6ZSlcbiAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGEuY291bnQ7IGkrKykgZm9yIChsZXQgayA9IDA7IGsgPCBhLml0ZW1TaXplOyBrKyspIG91dFtpICogYS5pdGVtU2l6ZSArIGtdID0gYS5nZXRDb21wb25lbnQoaSwgaylcbiAgICAgICAgICBnLnNldEF0dHJpYnV0ZShuYW1lLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShvdXQsIGEuaXRlbVNpemUpKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBnLmFwcGx5TWF0cml4NChxLmNsb25lKCkubXVsdGlwbHkobS5iaW5kTWF0cml4KSlcbiAgICAgIGNvbnN0IGxpc3QgPSBieU1hdC5nZXQobWF0KSA/PyBbXVxuICAgICAgbGlzdC5wdXNoKGcpXG4gICAgICBieU1hdC5zZXQobWF0LCBsaXN0KVxuICAgIH1cbiAgICBjb25zdCBza2VsZXRvbiA9IG5ldyBUSFJFRS5Ta2VsZXRvbihib25lcywgaW52ZXJzZXMpXG4gICAgY29uc3QgcGFyZW50ID0gc2tpbm5lZFswXS5wYXJlbnQgPz8gcm9vdFxuICAgIGNvbnN0IGlkZW50aXR5ID0gbmV3IFRIUkVFLk1hdHJpeDQoKVxuICAgIGZvciAoY29uc3QgW21hdCwgZ2Vvc10gb2YgYnlNYXQpIHtcbiAgICAgIGNvbnN0IGFsbEluZGV4ZWQgPSBnZW9zLmV2ZXJ5KChnKSA9PiBnLmluZGV4KVxuICAgICAgY29uc3QgbWVyZ2VkID0gbWVyZ2VHZW9tZXRyaWVzKGFsbEluZGV4ZWQgPyBnZW9zIDogZ2Vvcy5tYXAoKGcpID0+IChnLmluZGV4ID8gZy50b05vbkluZGV4ZWQoKSA6IGcpKSwgZmFsc2UpXG4gICAgICBpZiAoIW1lcmdlZCkgdGhyb3cgbmV3IEVycm9yKCdtZXJnZSBmYWlsZWQnKVxuICAgICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5Ta2lubmVkTWVzaChtZXJnZWQsIG1hdClcbiAgICAgIG1lc2gubmFtZSA9IGBtZXJnZWQ6JHttYXQubmFtZX1gXG4gICAgICBwYXJlbnQuYWRkKG1lc2gpXG4gICAgICBtZXNoLmJpbmQoc2tlbGV0b24sIGlkZW50aXR5KVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IG0gb2Ygc2tpbm5lZCkgbS5yZW1vdmVGcm9tUGFyZW50KClcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS53YXJuKCdbbW9kZWxzXSBza2lubmVkIG1lcmdlIHNraXBwZWQnLCBlcnIpXG4gIH1cbn1cblxuLyoqIFdhcm0gdGhlIHNpbXBsaWZpZXIncyBXQVNNIGVhcmx5IHNvIHRoZSBmaXJzdCBib3NzIHJlZ2lzdHJhdGlvbiBuZXZlciB3YWl0cyBvbiBpdC4gKi9cbmV4cG9ydCBjb25zdCBsb2RSZWFkeTogUHJvbWlzZTx2b2lkPiA9IE1lc2hvcHRTaW1wbGlmaWVyLnJlYWR5LmNhdGNoKCgpID0+IHVuZGVmaW5lZClcbmxldCBzaW1wbGlmaWVyT2sgPSBmYWxzZVxubG9kUmVhZHkudGhlbigoKSA9PiAoc2ltcGxpZmllck9rID0gTWVzaG9wdFNpbXBsaWZpZXIuc3VwcG9ydGVkKSlcblxuLyoqIFRyaWFuZ2xlIHRvdGFscyBvZiB0aGUgZnVsbCBhbmQgTE9EIG1lc2hlcyAoZm9yIHRoZSBtb2RlbCBsYWIgYW5kIHRlc3RzKS4gKi9cbmV4cG9ydCBjb25zdCBMT0RfU1RBVFMgPSBuZXcgTWFwPE1vZGVsSWQgfCBzdHJpbmcsIHsgZnVsbDogbnVtYmVyOyBsb2Q6IG51bWJlciB9PigpXG5cbi8qKlxuICogQWRkcyBhIHNpbXBsaWZpZWQgdHdpbiBuZXh0IHRvIGV2ZXJ5IHNraW5uZWQgbWVzaC4gVGhlIHNpbXBsaWZpZXIgb25seSByZXdyaXRlcyB0aGUgaW5kZXhcbiAqIGJ1ZmZlciwgc28gdGhlIHR3aW4gc2hhcmVzIHRoZSBvcmlnaW5hbCB2ZXJ0ZXggYnVmZmVycyAoc2tpbiB3ZWlnaHRzIGluY2x1ZGVkKSBhbmQgYmluZHMgdG8gdGhlXG4gKiBzYW1lIHNrZWxldG9uIOKAlCBubyBzZWNvbmQgZG93bmxvYWQsIG5vIHNlY29uZCBza2VsZXRvbiwgYSBmZXcgaHVuZHJlZCBLQiBvZiBpbmRpY2VzLlxuICovXG5mdW5jdGlvbiBidWlsZExvZChyb290OiBUSFJFRS5PYmplY3QzRCwgcmF0aW86IG51bWJlcik6IHZvaWQge1xuICBpZiAoIXNpbXBsaWZpZXJPaykgcmV0dXJuXG4gIGNvbnN0IG1lc2hlczogVEhSRUUuU2tpbm5lZE1lc2hbXSA9IFtdXG4gIHJvb3QudHJhdmVyc2UoKG8pID0+IHtcbiAgICBpZiAoKG8gYXMgVEhSRUUuU2tpbm5lZE1lc2gpLmlzU2tpbm5lZE1lc2ggJiYgIW8udXNlckRhdGEubG9kKSBtZXNoZXMucHVzaChvIGFzIFRIUkVFLlNraW5uZWRNZXNoKVxuICB9KVxuICBsZXQgZnVsbCA9IDBcbiAgbGV0IGxvZCA9IDBcbiAgbWVzaGVzLmZvckVhY2goKG0sIGspID0+IHtcbiAgICBsZXQgZyA9IG0uZ2VvbWV0cnlcbiAgICBpZiAoIWcuaW5kZXgpIHtcbiAgICAgIC8vIFdlbGQgZXhhY3QgZHVwbGljYXRlcyBzbyB0aGUgc2ltcGxpZmllciBzZWVzIGNvbm5lY3RlZCB0b3BvbG9neS5cbiAgICAgIGcgPSBtZXJnZVZlcnRpY2VzKGcsIDFlLTYpXG4gICAgICBtLmdlb21ldHJ5ID0gZ1xuICAgIH1cbiAgICBjb25zdCBwb3MgPSBnLmdldEF0dHJpYnV0ZSgncG9zaXRpb24nKSBhcyBUSFJFRS5CdWZmZXJBdHRyaWJ1dGVcbiAgICBjb25zdCBwb3NpdGlvbnMgPSBuZXcgRmxvYXQzMkFycmF5KHBvcy5jb3VudCAqIDMpXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBwb3MuY291bnQ7IGkrKykge1xuICAgICAgcG9zaXRpb25zW2kgKiAzXSA9IHBvcy5nZXRYKGkpXG4gICAgICBwb3NpdGlvbnNbaSAqIDMgKyAxXSA9IHBvcy5nZXRZKGkpXG4gICAgICBwb3NpdGlvbnNbaSAqIDMgKyAyXSA9IHBvcy5nZXRaKGkpXG4gICAgfVxuICAgIGNvbnN0IHNyYyA9IGcuaW5kZXghLmFycmF5XG4gICAgY29uc3QgaW5kaWNlcyA9IHNyYyBpbnN0YW5jZW9mIFVpbnQzMkFycmF5ID8gc3JjIDogbmV3IFVpbnQzMkFycmF5KHNyYylcbiAgICBjb25zdCB0YXJnZXQgPSBNYXRoLm1heCgzLCBNYXRoLmZsb29yKChpbmRpY2VzLmxlbmd0aCAqIHJhdGlvKSAvIDMpICogMylcbiAgICBjb25zdCBbb3V0XSA9IE1lc2hvcHRTaW1wbGlmaWVyLnNpbXBsaWZ5KGluZGljZXMsIHBvc2l0aW9ucywgMywgdGFyZ2V0LCAwLjAyLCBbJ1BydW5lJ10pXG4gICAgZnVsbCArPSBpbmRpY2VzLmxlbmd0aCAvIDNcbiAgICBsb2QgKz0gb3V0Lmxlbmd0aCAvIDNcbiAgICBjb25zdCBsZyA9IG5ldyBUSFJFRS5CdWZmZXJHZW9tZXRyeSgpXG4gICAgZm9yIChjb25zdCBuYW1lIG9mIE9iamVjdC5rZXlzKGcuYXR0cmlidXRlcykpIGxnLnNldEF0dHJpYnV0ZShuYW1lLCBnLmdldEF0dHJpYnV0ZShuYW1lKSlcbiAgICBsZy5zZXRJbmRleChuZXcgVEhSRUUuQnVmZmVyQXR0cmlidXRlKG91dCwgMSkpXG4gICAgY29uc3QgdHdpbiA9IG5ldyBUSFJFRS5Ta2lubmVkTWVzaChsZywgbS5tYXRlcmlhbClcbiAgICB0d2luLm5hbWUgPSBgJHttLm5hbWV9OmxvZGBcbiAgICB0d2luLnVzZXJEYXRhLmxvZCA9IHRydWVcbiAgICB0d2luLnVzZXJEYXRhLnBhaXIgPSBrXG4gICAgdHdpbi52aXNpYmxlID0gZmFsc2VcbiAgICB0d2luLmNhc3RTaGFkb3cgPSB0cnVlXG4gICAgdHdpbi5yZWNlaXZlU2hhZG93ID0gdHJ1ZVxuICAgIHR3aW4uZnJ1c3R1bUN1bGxlZCA9IGZhbHNlXG4gICAgbS51c2VyRGF0YS5mdWxsID0gdHJ1ZVxuICAgIG0udXNlckRhdGEucGFpciA9IGtcbiAgICA7KG0ucGFyZW50ID8/IHJvb3QpLmFkZCh0d2luKVxuICAgIHR3aW4uYmluZChtLnNrZWxldG9uLCBtLmJpbmRNYXRyaXgpXG4gIH0pXG4gIExPRF9TVEFUUy5zZXQocm9vdC51dWlkLCB7IGZ1bGwsIGxvZCB9KVxuICByb290LnVzZXJEYXRhLmxvZFN0YXRzID0geyBmdWxsLCBsb2QgfVxufVxuXG4vKiogT25lIGFuaW1hdGVkIGNyZWF0dXJlIGluc3RhbmNlLiAqL1xuZXhwb3J0IGNsYXNzIE1vZGVsSW5zdGFuY2Uge1xuICByZWFkb25seSBvYmplY3QgPSBuZXcgVEhSRUUuR3JvdXAoKVxuICByZWFkb25seSBtaXhlcjogVEhSRUUuQW5pbWF0aW9uTWl4ZXJcbiAgcHJpdmF0ZSBhY3Rpb25zID0gbmV3IE1hcDxDbGlwLCBUSFJFRS5BbmltYXRpb25BY3Rpb24+KClcbiAgcHJpdmF0ZSBjdXJyZW50OiBDbGlwIHwgbnVsbCA9IG51bGxcbiAgcHJpdmF0ZSBvbmVTaG90OiBUSFJFRS5BbmltYXRpb25BY3Rpb24gfCBudWxsID0gbnVsbFxuICByZWFkb25seSBkZWY6IE1vZGVsRGVmXG4gIHJlYWRvbmx5IG1hdGVyaWFsczogVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWxbXSA9IFtdXG4gIHByaXZhdGUgYmFzZUVtaXNzaXZlID0gbmV3IE1hcDxUSFJFRS5NZXNoU3RhbmRhcmRNYXRlcmlhbCwgeyBjb2xvcjogVEhSRUUuQ29sb3I7IGludGVuc2l0eTogbnVtYmVyIH0+KClcbiAgcHJpdmF0ZSBmbGFzaENvbG9yID0gbmV3IFRIUkVFLkNvbG9yKClcbiAgcHJpdmF0ZSBleWVHbG93czogVEhSRUUuU3ByaXRlTWF0ZXJpYWxbXSA9IFtdXG4gIHByaXZhdGUgZXllR2xvd1RpbWUgPSAwXG4gIHByaXZhdGUgZXllT3BhY2l0eSA9IDFcbiAgcHJpdmF0ZSBmdWxsTWVzaGVzOiBUSFJFRS5NZXNoW10gPSBbXVxuICBwcml2YXRlIGxvZE1lc2hlczogVEhSRUUuTWVzaFtdID0gW11cbiAgLyoqIDAgPSBmdWxsIGRldGFpbCwgMSA9IHNpbXBsaWZpZWQuICovXG4gIGxvZExldmVsID0gMFxuICBwcml2YXRlIHNoYWRvd3MgPSB0cnVlXG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IGlkOiBNb2RlbElkLCB0OiBUZW1wbGF0ZSkge1xuICAgIHRoaXMuZGVmID0gdC5kZWZcbiAgICBjb25zdCBpbm5lciA9IGNsb25lU2tpbm5lZCh0LnJvb3QpXG4gICAgaW5uZXIuc2NhbGUuc2V0U2NhbGFyKHQuc2NhbGUpXG4gICAgaW5uZXIucm90YXRpb24ueSA9IHQuZGVmLnlhd1xuICAgIHRoaXMub2JqZWN0LmFkZChpbm5lcilcbiAgICBpZiAodC5kZWYuZXllR2xvdykgdGhpcy5hZGRFeWVHbG93cyhpbm5lciwgdC5zY2FsZSlcbiAgICAvLyBQZXItaW5zdGFuY2UgbWF0ZXJpYWxzIHNvIGhpdCBmbGFzaGVzIC8gZGlzc29sdmVzIGRvbid0IGJsZWVkIGFjcm9zcyB0aGUgcGFjay5cbiAgICBpbm5lci50cmF2ZXJzZSgobykgPT4ge1xuICAgICAgY29uc3QgbSA9IG8gYXMgVEhSRUUuTWVzaFxuICAgICAgaWYgKCFtLmlzTWVzaCkgcmV0dXJuXG4gICAgICBjb25zdCBjbG9uZSA9ICh4OiBUSFJFRS5NYXRlcmlhbCkgPT4ge1xuICAgICAgICBjb25zdCBjID0geC5jbG9uZSgpIGFzIFRIUkVFLk1lc2hTdGFuZGFyZE1hdGVyaWFsXG4gICAgICAgIHRoaXMubWF0ZXJpYWxzLnB1c2goYylcbiAgICAgICAgdGhpcy5iYXNlRW1pc3NpdmUuc2V0KGMsIHsgY29sb3I6IGMuZW1pc3NpdmUuY2xvbmUoKSwgaW50ZW5zaXR5OiBjLmVtaXNzaXZlSW50ZW5zaXR5IH0pXG4gICAgICAgIHJldHVybiBjXG4gICAgICB9XG4gICAgICBtLm1hdGVyaWFsID0gQXJyYXkuaXNBcnJheShtLm1hdGVyaWFsKSA/IG0ubWF0ZXJpYWwubWFwKGNsb25lKSA6IGNsb25lKG0ubWF0ZXJpYWwpXG4gICAgICBpZiAobS51c2VyRGF0YS5sb2QpIHRoaXMubG9kTWVzaGVzLnB1c2gobSlcbiAgICAgIGVsc2UgaWYgKG0udXNlckRhdGEuZnVsbCkgdGhpcy5mdWxsTWVzaGVzLnB1c2gobSlcbiAgICB9KVxuICAgIC8vIExPRCB0d2lucyBtdXN0IHNoYXJlIHRoZSBwZXItaW5zdGFuY2UgbWF0ZXJpYWwgb2YgdGhlaXIgZnVsbC1kZXRhaWwgc2libGluZyBzbyBmbGFzaGVzIGFuZFxuICAgIC8vIGRpc3NvbHZlcyBzdGF5IGluIHN5bmMuXG4gICAgZm9yIChjb25zdCBsbSBvZiB0aGlzLmxvZE1lc2hlcykge1xuICAgICAgY29uc3QgYmFzZSA9IHRoaXMuZnVsbE1lc2hlcy5maW5kKChmKSA9PiBmLnVzZXJEYXRhLnBhaXIgPT09IGxtLnVzZXJEYXRhLnBhaXIpXG4gICAgICBpZiAoYmFzZSkgbG0ubWF0ZXJpYWwgPSBiYXNlLm1hdGVyaWFsXG4gICAgfVxuICAgIHRoaXMubWl4ZXIgPSBuZXcgVEhSRUUuQW5pbWF0aW9uTWl4ZXIoaW5uZXIpXG4gICAgZm9yIChjb25zdCBbY2xpcCwgbmFtZV0gb2YgT2JqZWN0LmVudHJpZXModC5kZWYuY2xpcHMpIGFzIFtDbGlwLCBzdHJpbmddW10pIHtcbiAgICAgIGNvbnN0IGMgPSB0LmNsaXBzLmdldChuYW1lKVxuICAgICAgaWYgKCFjKSBjb250aW51ZVxuICAgICAgY29uc3QgYSA9IHRoaXMubWl4ZXIuY2xpcEFjdGlvbihjKVxuICAgICAgaWYgKGNsaXAgPT09ICdkZWF0aCcgfHwgY2xpcCA9PT0gJ2hpdCcgfHwgY2xpcCA9PT0gJ2F0dGFjaycpIHtcbiAgICAgICAgYS5zZXRMb29wKFRIUkVFLkxvb3BPbmNlLCAxKVxuICAgICAgICBhLmNsYW1wV2hlbkZpbmlzaGVkID0gY2xpcCA9PT0gJ2RlYXRoJ1xuICAgICAgfVxuICAgICAgdGhpcy5hY3Rpb25zLnNldChjbGlwLCBhKVxuICAgIH1cbiAgICB0aGlzLm1peGVyLmFkZEV2ZW50TGlzdGVuZXIoJ2ZpbmlzaGVkJywgKGUpID0+IHtcbiAgICAgIGlmICgoZSBhcyB1bmtub3duIGFzIHsgYWN0aW9uOiBUSFJFRS5BbmltYXRpb25BY3Rpb24gfSkuYWN0aW9uID09PSB0aGlzLm9uZVNob3QgJiYgdGhpcy5jdXJyZW50ICE9PSAnZGVhdGgnKSB7XG4gICAgICAgIHRoaXMub25lU2hvdD8uZmFkZU91dCgwLjE1KVxuICAgICAgICB0aGlzLm9uZVNob3QgPSBudWxsXG4gICAgICB9XG4gICAgfSlcbiAgICB0aGlzLmxvb3AoJ2lkbGUnKVxuICB9XG4gIC8qKiBQaW4gdGlueSBhZGRpdGl2ZSBnbG93cyB0byB0aGUgZXhwb3J0ZWQgZXllIGJvbmVzOyB0aGV5IGZvbGxvdyBoZWFkIGFuaW1hdGlvbiBhbmQgc3Vydml2ZSB0ZXh0dXJlIExPRC4gKi9cbiAgcHJpdmF0ZSBhZGRFeWVHbG93cyhpbm5lcjogVEhSRUUuT2JqZWN0M0QsIHNjYWxlOiBudW1iZXIpOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IG5hbWUgb2YgWydERUYtZXllLkwnLCAnREVGLWV5ZS5SJ10pIHtcbiAgICAgIGNvbnN0IGV5ZSA9IGlubmVyLmdldE9iamVjdEJ5TmFtZShuYW1lKVxuICAgICAgaWYgKCFleWUpIGNvbnRpbnVlXG4gICAgICBjb25zdCBtYXQgPSBuZXcgVEhSRUUuU3ByaXRlTWF0ZXJpYWwoeyBjb2xvcjogMHg3ZmYzZmYsIHRyYW5zcGFyZW50OiB0cnVlLCBvcGFjaXR5OiAwLjgyLCBkZXB0aFdyaXRlOiBmYWxzZSwgZGVwdGhUZXN0OiB0cnVlLCBibGVuZGluZzogVEhSRUUuQWRkaXRpdmVCbGVuZGluZywgdG9uZU1hcHBlZDogZmFsc2UgfSlcbiAgICAgIGNvbnN0IHNwcml0ZSA9IG5ldyBUSFJFRS5TcHJpdGUobWF0KVxuICAgICAgY29uc3Qgc2l6ZSA9IDAuMDk1IC8gc2NhbGVcbiAgICAgIHNwcml0ZS5zY2FsZS5zZXRTY2FsYXIoc2l6ZSlcbiAgICAgIHNwcml0ZS5yZW5kZXJPcmRlciA9IDRcbiAgICAgIHNwcml0ZS51c2VyRGF0YS5iYXNlU2NhbGUgPSBzaXplXG4gICAgICBleWUuYWRkKHNwcml0ZSlcbiAgICAgIHRoaXMuZXllR2xvd3MucHVzaChtYXQpXG4gICAgfVxuICB9XG4gIC8qKiBQaWNrcyB0aGUgZGV0YWlsIGxldmVsIGZyb20gdGhlIGNhbWVyYSBkaXN0YW5jZSAod2l0aCBoeXN0ZXJlc2lzIHNvIGl0IGRvZXNuJ3QgZmxpY2tlcikuICovXG4gIHNldERpc3RhbmNlKGQ6IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IGxvZCA9IHRoaXMuZGVmLmxvZFxuICAgIGlmICghbG9kIHx8ICF0aGlzLmxvZE1lc2hlcy5sZW5ndGgpIHJldHVyblxuICAgIGNvbnN0IHdhbnQgPSB0aGlzLmxvZExldmVsID09PSAwID8gKGQgPiBsb2QuZGlzdGFuY2UgKyAxLjUgPyAxIDogMCkgOiBkIDwgbG9kLmRpc3RhbmNlIC0gMS41ID8gMCA6IDFcbiAgICBpZiAod2FudCAhPT0gdGhpcy5sb2RMZXZlbCkge1xuICAgICAgdGhpcy5sb2RMZXZlbCA9IHdhbnRcbiAgICAgIGZvciAoY29uc3QgbSBvZiB0aGlzLmZ1bGxNZXNoZXMpIG0udmlzaWJsZSA9IHdhbnQgPT09IDBcbiAgICAgIGZvciAoY29uc3QgbSBvZiB0aGlzLmxvZE1lc2hlcykgbS52aXNpYmxlID0gd2FudCA9PT0gMVxuICAgIH1cbiAgICBjb25zdCBzaCA9IGQgPCBsb2Quc2hhZG93T2ZmXG4gICAgaWYgKHNoICE9PSB0aGlzLnNoYWRvd3MpIHtcbiAgICAgIHRoaXMuc2hhZG93cyA9IHNoXG4gICAgICBmb3IgKGNvbnN0IG0gb2YgdGhpcy5sb2RNZXNoZXMpIG0uY2FzdFNoYWRvdyA9IHNoXG4gICAgfVxuICB9XG4gIGhhcyhjbGlwOiBDbGlwKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuYWN0aW9ucy5oYXMoY2xpcClcbiAgfVxuICAvKiogQ3Jvc3NmYWRlcyB0aGUgbG9vcGluZyBsb2NvbW90aW9uIGNsaXAuICovXG4gIGxvb3AoY2xpcDogQ2xpcCwgcmF0ZSA9IDEpOiB2b2lkIHtcbiAgICBjb25zdCBhID0gdGhpcy5hY3Rpb25zLmdldChjbGlwKSA/PyB0aGlzLmFjdGlvbnMuZ2V0KCdpZGxlJylcbiAgICBpZiAoIWEpIHJldHVyblxuICAgIGEudGltZVNjYWxlID0gcmF0ZVxuICAgIGlmICh0aGlzLmN1cnJlbnQgPT09IGNsaXApIHJldHVyblxuICAgIGNvbnN0IHByZXYgPSB0aGlzLmN1cnJlbnQgPyB0aGlzLmFjdGlvbnMuZ2V0KHRoaXMuY3VycmVudCkgOiBudWxsXG4gICAgYS5yZXNldCgpLnNldEVmZmVjdGl2ZVdlaWdodCgxKS5mYWRlSW4oMC4yMikucGxheSgpXG4gICAgcHJldj8uZmFkZU91dCgwLjIyKVxuICAgIHRoaXMuY3VycmVudCA9IGNsaXBcbiAgfVxuICAvKiogUGxheXMgYSBvbmUtc2hvdCBjbGlwIG92ZXIgbG9jb21vdGlvbiAoYXR0YWNrIC8gaGl0IC8gZGVhdGgpLiBSZXR1cm5zIGl0cyBkdXJhdGlvbi4gKi9cbiAgb25jZShjbGlwOiBDbGlwLCByYXRlID0gMSk6IG51bWJlciB7XG4gICAgY29uc3QgYSA9IHRoaXMuYWN0aW9ucy5nZXQoY2xpcClcbiAgICBpZiAoIWEpIHJldHVybiAwXG4gICAgdGhpcy5vbmVTaG90Py5mYWRlT3V0KDAuMSlcbiAgICBhLnJlc2V0KClcbiAgICBhLnRpbWVTY2FsZSA9IHJhdGVcbiAgICBhLnNldEVmZmVjdGl2ZVdlaWdodCgxKS5mYWRlSW4oMC4wOCkucGxheSgpXG4gICAgdGhpcy5vbmVTaG90ID0gYVxuICAgIGlmIChjbGlwID09PSAnZGVhdGgnKSB7XG4gICAgICBmb3IgKGNvbnN0IFtrLCB4XSBvZiB0aGlzLmFjdGlvbnMpIGlmIChrICE9PSAnZGVhdGgnKSB4LmZhZGVPdXQoMC4xNSlcbiAgICAgIHRoaXMuY3VycmVudCA9ICdkZWF0aCdcbiAgICB9XG4gICAgcmV0dXJuIGEuZ2V0Q2xpcCgpLmR1cmF0aW9uIC8gcmF0ZVxuICB9XG4gIHVwZGF0ZShkdDogbnVtYmVyKTogdm9pZCB7XG4gICAgdGhpcy5taXhlci51cGRhdGUoZHQpXG4gICAgaWYgKHRoaXMuZXllR2xvd3MubGVuZ3RoKSB7XG4gICAgICB0aGlzLmV5ZUdsb3dUaW1lICs9IGR0XG4gICAgICBjb25zdCBwdWxzZSA9IDAuNjYgKyAoTWF0aC5zaW4odGhpcy5leWVHbG93VGltZSAqIDMuNCkgKiAwLjUgKyAwLjUpICogMC4yNlxuICAgICAgZm9yIChjb25zdCBtIG9mIHRoaXMuZXllR2xvd3MpIG0ub3BhY2l0eSA9IHRoaXMuZXllT3BhY2l0eSAqIHB1bHNlXG4gICAgfVxuICB9XG4gIC8qKiBIaXQgZmxhc2ggKGVtaXNzaXZlKSBhbmQgZGlzc29sdmUvZmFkZSBzdXBwb3J0LiAqL1xuICBzZXRGbGFzaChrOiBudW1iZXIsIGNvbG9yID0gMHhmZjVhM2MpOiB2b2lkIHtcbiAgICB0aGlzLmZsYXNoQ29sb3Iuc2V0SGV4KGNvbG9yKVxuICAgIGZvciAoY29uc3QgbSBvZiB0aGlzLm1hdGVyaWFscykge1xuICAgICAgaWYgKCFtLmVtaXNzaXZlKSBjb250aW51ZVxuICAgICAgY29uc3QgYmFzZSA9IHRoaXMuYmFzZUVtaXNzaXZlLmdldChtKVxuICAgICAgaWYgKGsgPiAwKSB7XG4gICAgICAgIC8vIEtlZXAgZXllIGdsb3cgdmlzaWJseSBjeWFuIHVuZGVyIGEgaGl0IGZsYXNoIGluc3RlYWQgb2YgcmVwbGFjaW5nIGl0IHdpdGggYSBmbGF0IHJlZC5cbiAgICAgICAgaWYgKGJhc2UpIG0uZW1pc3NpdmUuY29weShiYXNlLmNvbG9yKVxuICAgICAgICBlbHNlIG0uZW1pc3NpdmUuc2V0UkdCKDAsIDAsIDApXG4gICAgICAgIG0uZW1pc3NpdmUubGVycCh0aGlzLmZsYXNoQ29sb3IsIE1hdGgubWluKDAuOCwgaykpXG4gICAgICAgIG0uZW1pc3NpdmVJbnRlbnNpdHkgPSAoYmFzZT8uaW50ZW5zaXR5ID8/IDApICsga1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGJhc2UpIG0uZW1pc3NpdmUuY29weShiYXNlLmNvbG9yKVxuICAgICAgICBlbHNlIG0uZW1pc3NpdmUuc2V0UkdCKDAsIDAsIDApXG4gICAgICAgIG0uZW1pc3NpdmVJbnRlbnNpdHkgPSBiYXNlPy5pbnRlbnNpdHkgPz8gMFxuICAgICAgfVxuICAgIH1cbiAgfVxuICBzZXRPcGFjaXR5KGE6IG51bWJlcik6IHZvaWQge1xuICAgIGZvciAoY29uc3QgbSBvZiB0aGlzLm1hdGVyaWFscykge1xuICAgICAgY29uc3QgdCA9IGEgPCAwLjk5OVxuICAgICAgaWYgKG0udHJhbnNwYXJlbnQgIT09IHQpIHtcbiAgICAgICAgbS50cmFuc3BhcmVudCA9IHRcbiAgICAgICAgbS5uZWVkc1VwZGF0ZSA9IHRydWVcbiAgICAgIH1cbiAgICAgIG0ub3BhY2l0eSA9IGFcbiAgICAgIG0uZGVwdGhXcml0ZSA9ICF0XG4gICAgfVxuICAgIHRoaXMuZXllT3BhY2l0eSA9IGFcbiAgICBmb3IgKGNvbnN0IG0gb2YgdGhpcy5leWVHbG93cykgbS5vcGFjaXR5ID0gYSAqIDAuODJcbiAgfVxuICAvKiogVGludHMgZXllcy9za2luIGZvciBuaWdodCB2YXJpYW50cyAoZS5nLiBlbWJlci1leWVkIHdvbHZlcykuICovXG4gIGdyYWRlKGNvbG9yOiBudW1iZXIsIGFtb3VudDogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3QgYyA9IG5ldyBUSFJFRS5Db2xvcihjb2xvcilcbiAgICBmb3IgKGNvbnN0IG0gb2YgdGhpcy5tYXRlcmlhbHMpIG0uY29sb3IubGVycChjLCBhbW91bnQpXG4gIH1cbiAgZGlzcG9zZSgpOiB2b2lkIHtcbiAgICB0aGlzLm1peGVyLnN0b3BBbGxBY3Rpb24oKVxuICAgIGZvciAoY29uc3QgbSBvZiB0aGlzLm1hdGVyaWFscykgbS5kaXNwb3NlKClcbiAgICBmb3IgKGNvbnN0IG0gb2YgdGhpcy5leWVHbG93cykgbS5kaXNwb3NlKClcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTW9kZWwoaWQ6IE1vZGVsSWQpOiBNb2RlbEluc3RhbmNlIHwgbnVsbCB7XG4gIGNvbnN0IHQgPSB0ZW1wbGF0ZXMuZ2V0KGlkKVxuICByZXR1cm4gdCA/IG5ldyBNb2RlbEluc3RhbmNlKGlkLCB0KSA6IG51bGxcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vZGVsSGVpZ2h0KGlkOiBNb2RlbElkKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1PREVMU1tpZF0uaGVpZ2h0XG59XG4iXX0=