import * as THREE from 'three';

// "Noob Ball": a glossy black sphere with two big white eyes that bulge OUT of its body (the eyeballs sit half outside the sphere), a black pupil that pushes out of each eyeball and a tiny white
// shine on every pupil. Made in code (no file to download). The face looks along +z, a little up, like the picture it was drawn from. Radius of the body = 1.
export function buildBallBuddy(): THREE.Group {
  const g = new THREE.Group();
  const seg = 64;
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(1, seg, seg),
    new THREE.MeshPhysicalMaterial({ color: 0x060606, roughness: 0.4, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.35 })
  );
  g.add(body);

  const white = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, clearcoat: 0.9, clearcoatRoughness: 0.1 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const EYE_R = 0.4, PUPIL_R = 0.21, SHINE_R = 0.06, EYE_X = 0.4;

  for (const side of [-1, 1]) {
    // the eyeball: its centre is ON the surface of the body, so half of it stands out (bulging eyes)
    const out = new THREE.Vector3(side * EYE_X, 0.15, 0).setZ(Math.sqrt(1 - EYE_X * EYE_X - 0.15 * 0.15)).normalize();
    const eye = new THREE.Group();
    eye.position.copy(out).multiplyScalar(1.0);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(EYE_R, seg, seg), white);
    eye.add(ball);
    // the pupil: a dome on the front of the eyeball, looking a little up (and a little to the middle)
    const look = out.clone().add(new THREE.Vector3(-side * 0.1, 0.2, 0)).normalize();
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(PUPIL_R, 48, 48), black);
    pupil.position.copy(look).multiplyScalar(EYE_R - PUPIL_R * 0.35);
    eye.add(pupil);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(SHINE_R, 24, 24), shine);
    const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(up, look).normalize();
    glint.position.copy(pupil.position).addScaledVector(look, PUPIL_R * 0.78).addScaledVector(up, PUPIL_R * 0.42).addScaledVector(right, PUPIL_R * 0.3);
    eye.add(glint);
    g.add(eye);
  }
  return g;
}

export const MODEL_BUILDERS: Readonly<Record<string, () => THREE.Object3D>> = { 'ball-eyes': buildBallBuddy };
