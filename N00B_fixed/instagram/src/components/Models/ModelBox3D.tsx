import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { fetchAvatarModel } from '../Avatars/modelCache';

// One 3D model inside a curved box of the NOOB Models page. The whole model is framed to fit the box, it turns slowly by itself, and a finger or the mouse turns it by hand (up and down on a
// phone still scrolls the page). It is only drawn while its box is on the screen, and everything is released when it leaves the screen or the page closes (a phone allows only a few 3D views at once).
interface Props { src: string; name: string }

const ModelBox3D: React.FC<Props> = ({ src, name }) => {
  const box = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const el = box.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = box.current; if (!el || !visible) return;
    let disposed = false, raf = 0;
    setState('loading');
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(1.5, 2.5, 3); scene.add(key);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
    const controls = new OrbitControls(camera, renderer.domElement);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;outline:none;cursor:grab;touch-action:pan-y';
    controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.autoRotate = true; controls.autoRotateSpeed = 1.6;
    controls.addEventListener('start', () => { controls.autoRotate = false; });
    renderer.domElement.style.touchAction = 'pan-y';   // (OrbitControls sets "none"; vertical swipes must still scroll the page)

    const size = () => {
      const w = el.clientWidth || 300, h = el.clientHeight || 300;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(el);

    let model: THREE.Object3D | null = null;
    const release = (obj: THREE.Object3D) => obj.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      m.geometry.dispose();
      const mats: THREE.Material[] = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mm) => { for (const k of Object.keys(mm)) { const v = (mm as unknown as Record<string, unknown>)[k]; if (v instanceof THREE.Texture) (v as THREE.Texture).dispose(); } mm.dispose(); });
    });
    const parse = (buf: ArrayBuffer): Promise<{ scene: THREE.Object3D }> => new Promise((resolve, reject) => {
      // the site's security rules block fetch(blob:) that three uses for the pictures inside a model (it came out white): hiding createImageBitmap for this one call makes it use a plain <img>
      const w = window as unknown as { createImageBitmap?: unknown };
      const saved = w.createImageBitmap; w.createImageBitmap = undefined;
      try { new GLTFLoader().parse(buf, '', resolve, reject); } catch (e) { reject(e); } finally { w.createImageBitmap = saved; }
    });
    fetchAvatarModel(src).then((buf) => (disposed ? undefined : parse(buf))).then((g) => {
      if (!g || disposed) return;
      const next = g.scene;
      next.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.map) mat.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
      });
      const bb = new THREE.Box3().setFromObject(next);
      const sphere = bb.getBoundingSphere(new THREE.Sphere());
      next.position.sub(sphere.center);
      model = next; scene.add(model);
      const dist = (sphere.radius * 1.15) / Math.sin(THREE.MathUtils.degToRad(Math.min(camera.fov, camera.fov * camera.aspect) / 2));
      camera.position.set(0, sphere.radius * 0.25, dist); controls.target.set(0, 0, 0); controls.update();
      setState('ready');
    }).catch(() => { if (!disposed) setState('error'); });

    const tick = () => { raf = requestAnimationFrame(tick); if (document.hidden) return; controls.update(); renderer.render(scene, camera); };
    tick();
    return () => {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      if (model) release(model);
      envTex.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [src, visible]);

  return (
    <div ref={box} className="nm-stage" role="img" aria-label={`${name}, a 3D model you can turn round`} data-testid="model-box-3d">
      {visible && state === 'loading' && <div className="nm-state" aria-live="polite">Loading 3D model…</div>}
      {state === 'error' && <div className="nm-state" role="alert">The 3D model could not load</div>}
    </div>
  );
};

export default ModelBox3D;
