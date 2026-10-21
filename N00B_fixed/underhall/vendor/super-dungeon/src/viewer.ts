/**
 * Dev-only look-dev viewer (not part of the production build): /viewer.html?v=hero,pixel&clip=Jog_Fwd_Loop&cam=front&t=0.4
 *   v    comma list of character variants (default: all)
 *   clip animation clip for all (default Idle_Loop); `clips` comma list per character
 *   cam  front | back | side | close | high
 *   t    seconds to advance the animation before the still
 * Sets window.__viewerReady once the frame is rendered.
 */
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Renderer } from './engine/renderer'
import { loadJSON } from './game/assets3d'
import { createCharacter, preloadCharacters, type VariantInfo } from './game/character'

const q = new URLSearchParams(location.search)
const canvas = document.getElementById('c') as HTMLCanvasElement
const renderer = new Renderer(canvas, 'high')
const scene = new THREE.Scene()
scene.background = new THREE.Color('#141726')
const pmrem = new THREE.PMREMGenerator(renderer.gl)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = Number(q.get('env') ?? 0.55)
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 100)

const hemi = new THREE.HemisphereLight('#aab8ff', '#2a1d18', 0.5)
scene.add(hemi)
const key = new THREE.DirectionalLight('#fff1dc', 2.6)
key.position.set(3, 6, 4)
key.castShadow = true
key.shadow.mapSize.set(2048, 2048)
key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 8; key.shadow.camera.bottom = -8
key.shadow.bias = -0.0004
key.shadow.normalBias = 0.02
scene.add(key)
const rimL = new THREE.DirectionalLight('#7ab8ff', 1.4)
rimL.position.set(-4, 3, -5)
scene.add(rimL)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#2a2833', roughness: 0.6 }))
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)

async function main(): Promise<void> {
  const info = await loadJSON<Record<string, VariantInfo>>('models/chars/variants.json')
  const vs = (q.get('v') ?? Object.keys(info).join(',')).split(',').filter(v => info[v])
  await preloadCharacters(vs)
  const clips = (q.get('clips') ?? '').split(',').filter(Boolean)
  const clip = q.get('clip') ?? 'Idle_Loop'
  const spacing = Number(q.get('gap') ?? 1.1)
  const chars = vs.map((v, i) => {
    const c = createCharacter({ variant: v, scale: v === 'bruiser' ? 1.25 : 1, rimStrength: Number(q.get('rim') ?? 0.3) })!
    c.root.position.x = (i - (vs.length - 1) / 2) * spacing
    c.root.rotation.y = Number(q.get('yaw') ?? 0)
    c.play(clips[i] ?? clip, { fade: 0 })
    scene.add(c.root)
    return c
  })
  const t = Number(q.get('t') ?? 0.5)
  for (let s = 0; s < t; s += 1 / 30) for (const c of chars) c.update(1 / 30)
  const w = Math.max(2.2, vs.length * spacing)
  const cam = q.get('cam') ?? 'front'
  // Characters face -Z (gameplay convention), so "front" views from -Z.
  const dist = (w * 1.35 + 1.5) / Number(q.get('zoom') ?? 1)
  if (cam === 'front') camera.position.set(0, 1.2, -dist)
  else if (cam === 'back') camera.position.set(0, 1.4, dist)
  else if (cam === 'side') camera.position.set(dist, 1.2, 0)
  else if (cam === 'high') camera.position.set(dist * 0.4, dist * 0.8, -dist * 0.7)
  else if (cam === 'close') camera.position.set(0.25, 1.62, -1.25)
  camera.lookAt(0, cam === 'close' ? 1.55 : 0.95, 0)
  if (cam === 'front' || cam === 'high') key.position.set(3, 6, -4)
  await renderer.warm(scene, scene, camera)
  renderer.render(scene, camera)
  document.getElementById('l')!.textContent = `${vs.join(' ')} | ${clip}`
  ;(window as unknown as { __viewerReady: boolean }).__viewerReady = true
  const loop = (): void => {
    renderer.render(scene, camera)
    if (q.get('anim')) {
      for (const c of chars) c.update(1 / 60)
      requestAnimationFrame(loop)
    }
  }
  loop()
}
main().catch(e => {
  document.getElementById('l')!.textContent = 'ERROR ' + String(e?.stack ?? e)
  ;(window as unknown as { __viewerError: string }).__viewerError = String(e?.stack ?? e)
})
