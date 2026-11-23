import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { fetchAvatarModel } from './modelCache';

// A real 3D avatar: one .glb file (public/avatars/<id>.glb) shown on a transparent canvas that fills its whole parent (the page colour shows through). The figure is framed in the
// middle of the screen, clear of the name above and the buttons below. One finger or the mouse on the figure turns it all the way round, from every side and from above and below;
// a pinch or the wheel brings it closer. Only the middle of the screen takes the dragging: the two side strips are left free so a swipe there changes to the next avatar. It turns
// slowly by itself until it is touched. Drawing stops when the page is not showing it, and everything is released when it closes.

interface Props { src: string; name: string; calm?: boolean; onReady?: () => void }

const AvatarModel3D: React.FC<Props> = ({ src, name, calm, onReady }) => {
  const host = useRef<HTMLDivElement | null>(null);
  const touchZone = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const readyCb = useRef(onReady);
  readyCb.current = onReady;

  useEffect(() => {
    const el = host.current; if (!el) return;
    let disposed = false;
    let raf = 0;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none;outline:none';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1.5, 2.5, 3); scene.add(key);
    const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
    const controls = new OrbitControls(camera, touchZone.current ?? renderer.domElement);
    controls.enablePan = false; controls.zoomToCursor = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minPolarAngle = 0.02; controls.maxPolarAngle = Math.PI - 0.02; // all the way round: from above, from below and from every side
    controls.rotateSpeed = 0.9;
    controls.autoRotate = !calm; controls.autoRotateSpeed = 1.4;
    controls.addEventListener('start', () => { controls.autoRotate = false; });

    const size = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 400;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(el);

    let model: THREE.Object3D | null = null;
    const loader = new GLTFLoader();
    const onFail = () => { if (!disposed) setState('error'); };
    const onLoaded = (gltf: { scene: THREE.Object3D }) => {
      if (disposed) return;
      model = gltf.scene;
      // the exported shine map made the skin glare and hid the eyes: a soft, mostly matt surface keeps the face readable
      model.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.map) mat.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
        mat.metalnessMap = null; mat.roughnessMap = null; mat.metalness = 0; mat.roughness = 0.62; mat.envMapIntensity = 0.55; mat.needsUpdate = true;
      });
      const box = new THREE.Box3().setFromObject(model);
      const sz = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
      model.position.sub(c); model.position.y += sz.y / 2 - sz.y / 2; // centred on its middle
      scene.add(model);
      // the whole body fills about 58% of the screen height, centred a little above the middle (the name is above it, the buttons below it)
      const visible = sz.y / 0.58;
      const dist = (visible / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const ty = -visible * 0.06;
      camera.position.set(0, ty + sz.y * 0.04, dist); controls.target.set(0, ty, 0);
      controls.minDistance = dist * 0.15; controls.maxDistance = dist * 1.7;
      controls.update();
      setState('ready'); readyCb.current?.();
    };
    fetchAvatarModel(src).then((buf) => {
      if (disposed) return;
      // three reads the pictures inside the file with fetch(blob:), which the site's security rules block (the model came out white). Hiding createImageBitmap for this one call
      // makes it use a plain <img> instead, which the rules allow.
      const w = window as unknown as { createImageBitmap?: unknown };
      const saved = w.createImageBitmap; w.createImageBitmap = undefined;
      try { loader.parse(buf, '', onLoaded, onFail); } finally { w.createImageBitmap = saved; }
    }).catch(onFail);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      controls.update(); renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      model?.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        m.geometry.dispose();
        const mats: THREE.Material[] = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mm) => { for (const k of Object.keys(mm)) { const v = (mm as unknown as Record<string, unknown>)[k]; if (v instanceof THREE.Texture) (v as THREE.Texture).dispose(); } mm.dispose(); });
      });
      envTex.dispose(); pmrem.dispose(); renderer.dispose();
      renderer.domElement.remove();
    };
  }, [src, calm]);

  return (
    <div ref={host} className="absolute inset-0" role="img" aria-label={`${name}, a 3D model you can turn all the way round`} data-testid="avatar-3d">
      <div ref={touchZone} className="absolute" style={{ left: '20%', right: '20%', top: '11%', bottom: '21%', touchAction: 'none', cursor: 'grab' }} data-testid="avatar-3d-zone" />
      {state === 'loading' && <div className="absolute inset-x-0 bottom-[22%] flex justify-center text-[11px] font-bold opacity-80 pointer-events-none" aria-live="polite">Loading 3D…</div>}
      {state === 'error' && <div className="absolute inset-0 flex items-center justify-center text-xs font-bold opacity-80" role="alert">The 3D model could not load</div>}
    </div>
  );
};

export default AvatarModel3D;
