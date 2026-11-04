/* METRO RUSH — stylised runner "Kai": cap, hoodie, backpack, neon sneakers. Front faces -z. */
'use strict';
(() => {
if (!window.MR || MR.failed) return;
const { scene, mat, box, sphere, cylinder, canvasTex, CONFIG } = MR;

const OUTFITS = {
  street: { hoodie: '#ff3b5c', hood2: '#ffd23f', pants: '#2f5bff', cap: '#16c79a', capBill: '#ffd23f', shoe: '#ffffff', shoe2: '#8dff5a', pack: '#ffbf14' },
  ocean: { hoodie: '#2fb8ff', hood2: '#ffffff', pants: '#3b2f7a', cap: '#ff4fa3', capBill: '#ffffff', shoe: '#ffffff', shoe2: '#ff4fa3', pack: '#7b4dff' },
  lime: { hoodie: '#8dff5a', hood2: '#1b1240', pants: '#1b1240', cap: '#ff8a1f', capBill: '#1b1240', shoe: '#1b1240', shoe2: '#ffd23f', pack: '#ff3b5c' }
};
const skin = '#f2b48a', skinD = '#d9946a', hair = '#3b2418';

function buildRunner(o) {
  const player = new THREE.Group(); player.position.set(0, 0, CONFIG.playerZ);
  const body = new THREE.Group(); player.add(body);
  const hood = mat(o.hoodie, .65), hood2 = mat(o.hood2, .6), pants = mat(o.pants, .75);
  // torso (hoodie) with pocket and zip
  const torso = sphere(body, 0, 1.42, 0, .44, .5, .32, hood); torso.castShadow = true;
  box(body, 0, 1.2, -.27, .46, .2, .1, hood2);
  box(body, 0, 1.55, -.3, .05, .45, .04, '#ffffff');
  for (const s of [-1, 1]) { const c = cylinder(body, s * .12, 1.82, -.28, .025, .32, '#ffffff'); c.rotation.x = .25; }
  sphere(body, 0, 1.0, 0, .38, .2, .28, pants);
  // hood behind neck
  sphere(body, 0, 1.86, .2, .3, .17, .2, hood);
  // backpack
  const pack = new THREE.Group(); pack.position.set(0, 1.45, .34); body.add(pack);
  box(pack, 0, 0, 0, .56, .62, .26, mat(o.pack, .5), true);
  box(pack, 0, -.12, .14, .44, .26, .08, mat(MR.shade(o.pack, -.18), .5));
  box(pack, 0, .24, .14, .5, .06, .04, '#ffffff');
  for (const s of [-1, 1]) box(body, s * .2, 1.6, -.02, .07, .5, .64, mat(MR.shade(o.pack, -.3), .6));
  const spray = cylinder(pack, .33, .05, .02, .07, .28, mat('#ff4fa3', .3, .5)); cylinder(pack, .33, .22, .02, .045, .06, '#ffffff');
  // head
  const head = new THREE.Group(); head.position.y = 2.18; body.add(head);
  sphere(head, 0, 0, 0, .37, .38, .36, skin);
  sphere(head, 0, -.12, -.05, .3, .24, .3, skin);
  sphere(head, 0, .06, .1, .36, .3, .3, hair);
  for (const s of [-1, 1]) sphere(head, s * .36, -.02, 0, .07, .1, .07, skinD);
  // eyes
  const eyeW = mat('#ffffff', .3), eyeB = mat('#1b1240', .2);
  for (const s of [-1, 1]) { sphere(head, s * .13, .03, -.31, .085, .1, .05, eyeW, false); sphere(head, s * .13, .02, -.35, .045, .055, .03, eyeB, false); sphere(head, s * .12, .045, -.375, .015, .015, .01, eyeW, false); box(head, s * .14, .16, -.33, .13, .03, .03, hair); }
  sphere(head, 0, -.06, -.36, .05, .045, .04, skinD, false);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(.08, .016, 6, 12, Math.PI), mat('#8a2b2b')); smile.position.set(0, -.15, -.33); smile.rotation.z = Math.PI; head.add(smile);
  // backwards cap
  const cap = sphere(head, 0, .15, .01, .385, .25, .375, mat(o.cap, .55)); cap.scale.y = .26;
  const capTop = sphere(head, 0, .2, .02, .37, .2, .36, mat(o.cap, .55));
  const bill = box(head, 0, .14, .42, .42, .045, .3, mat(o.capBill, .5)); bill.rotation.x = -.15;
  sphere(head, 0, .41, .02, .05, .03, .05, mat(o.capBill, .5));
  // limbs
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * .44, 1.75, 0); body.add(arm);
    sphere(arm, 0, -.05, 0, .16, .16, .16, hood);
    const up = cylinder(arm, 0, -.24, 0, .12, .38, hood, true);
    const fore = new THREE.Group(); fore.position.y = -.42; arm.add(fore);
    cylinder(fore, 0, -.14, 0, .105, .3, hood, true); box(fore, 0, -.03, 0, .24, .07, .24, hood2);
    sphere(fore, 0, -.36, 0, .12, .13, .12, skin);
    arm.userData.fore = fore; arms.push(arm);
    const leg = new THREE.Group(); leg.position.set(s * .19, 1.0, 0); body.add(leg);
    cylinder(leg, 0, -.2, 0, .15, .4, pants, true);
    const shin = new THREE.Group(); shin.position.y = -.4; leg.add(shin);
    cylinder(shin, 0, -.17, 0, .12, .34, pants, true);
    box(shin, 0, -.31, 0, .26, .06, .26, mat(o.shoe2, .5));
    const shoe = new THREE.Group(); shoe.position.y = -.42; shin.add(shoe);
    box(shoe, 0, -.06, -.06, .27, .2, .46, mat(o.shoe, .45), true);
    box(shoe, 0, -.15, -.06, .3, .06, .5, mat(o.shoe2, .4));
    box(shoe, 0, -.02, -.2, .2, .05, .16, mat(o.shoe2, .4));
    leg.userData.shin = shin; legs.push(leg);
  }
  // super-sneaker glow + shield bubble
  const sneakGlow = [];
  for (const leg of legs) { const s = MR.glowSprite('#8dff5a', 1.1, .9); s.position.set(0, -.55, 0); leg.userData.shin.add(s); s.visible = false; sneakGlow.push(s); }
  const shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(1.45, 32, 20), new THREE.MeshStandardMaterial({ color: '#59e3ff', transparent: true, opacity: .22, roughness: 0, metalness: 0, depthWrite: false, emissive: '#0aa4ff', emissiveIntensity: .35 }));
  shieldBubble.position.y = 1.35; shieldBubble.visible = false; player.add(shieldBubble);
  player.traverse(m => { if (m.isMesh && m !== shieldBubble) m.castShadow = true; });
  return { player, body, head, arms, legs, shieldBubble, sneakGlow, pack };
}

MR.buildPlayer = function (outfit = 'street') {
  const rig = buildRunner(OUTFITS[outfit] || OUTFITS.street);
  scene.add(rig.player);
  // contact shadow
  const tex = canvasTex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(30,20,60,.55)'); g.addColorStop(1, 'rgba(30,20,60,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2; contact.position.set(0, .26, CONFIG.playerZ); contact.renderOrder = 2; scene.add(contact);
  rig.contact = contact;
  MR.rig = rig;
  return rig;
};

// Pose solver: run / jump / slide / idle / roll
MR.poseRunner = function (rig, s, dt) {
  const D = THREE.MathUtils.damp;
  const { body, arms, legs, head } = rig;
  const ph = s.phase;
  let bodyY, bodyX, leanZ = s.lean;
  if (s.mode === 'slide') {
    bodyY = .05; bodyX = -1.25;
    for (let i = 0; i < 2; i++) {
      legs[i].rotation.x = D(legs[i].rotation.x, -1.35 + i * .25, 20, dt); legs[i].userData.shin.rotation.x = D(legs[i].userData.shin.rotation.x, .3 + i * .6, 20, dt);
      arms[i].rotation.x = D(arms[i].rotation.x, -2.6, 20, dt); arms[i].rotation.z = D(arms[i].rotation.z, (i ? -1 : 1) * .5, 20, dt); arms[i].userData.fore.rotation.x = D(arms[i].userData.fore.rotation.x, -.3, 20, dt);
    }
  } else if (s.mode === 'air') {
    const tuck = Math.max(0, Math.min(1, s.vy / 6));
    bodyY = .1; bodyX = -.25 + tuck * .1;
    for (let i = 0; i < 2; i++) {
      legs[i].rotation.x = D(legs[i].rotation.x, i ? .55 : -1.15, 14, dt); legs[i].userData.shin.rotation.x = D(legs[i].userData.shin.rotation.x, i ? 1.3 : .5, 14, dt);
      arms[i].rotation.x = D(arms[i].rotation.x, i ? -2.5 : .6, 14, dt); arms[i].rotation.z = D(arms[i].rotation.z, (i ? -1 : 1) * .35, 14, dt); arms[i].userData.fore.rotation.x = D(arms[i].userData.fore.rotation.x, -.6, 14, dt);
    }
  } else if (s.mode === 'idle') {
    const b = Math.sin(ph * .35);
    bodyY = b * .025; bodyX = .02; leanZ = 0;
    for (let i = 0; i < 2; i++) {
      legs[i].rotation.x = D(legs[i].rotation.x, 0, 8, dt); legs[i].userData.shin.rotation.x = D(legs[i].userData.shin.rotation.x, .05, 8, dt);
      arms[i].rotation.x = D(arms[i].rotation.x, i ? -.15 + Math.sin(ph * .7) * .5 - .4 : .1, 8, dt);
      arms[i].rotation.z = D(arms[i].rotation.z, (i ? -1 : 1) * (i ? .9 + Math.sin(ph * .7) * .3 : .18), 8, dt);
      arms[i].userData.fore.rotation.x = D(arms[i].userData.fore.rotation.x, i ? -1.4 : -.25, 8, dt);
    }
  } else if (s.mode === 'dead') {
    bodyY = .02; bodyX = .25;
    for (let i = 0; i < 2; i++) { arms[i].rotation.x = D(arms[i].rotation.x, -2.9, 10, dt); arms[i].rotation.z = D(arms[i].rotation.z, (i ? -1 : 1) * .8, 10, dt); legs[i].rotation.x = D(legs[i].rotation.x, i ? .4 : -.3, 10, dt); }
  } else {
    const sn = Math.sin(ph), cs = Math.cos(ph);
    bodyY = Math.abs(cs) * .12; bodyX = -.2;
    for (let i = 0; i < 2; i++) {
      const p = i ? -sn : sn, q = i ? -cs : cs;
      legs[i].rotation.x = D(legs[i].rotation.x, p * .95, 26, dt);
      legs[i].userData.shin.rotation.x = D(legs[i].userData.shin.rotation.x, .25 + Math.max(0, -q) * 1.35 + Math.max(0, p) * .3, 26, dt);
      arms[i].rotation.x = D(arms[i].rotation.x, -p * .9, 26, dt); arms[i].rotation.z = D(arms[i].rotation.z, (i ? -1 : 1) * .12, 20, dt);
      arms[i].userData.fore.rotation.x = D(arms[i].userData.fore.rotation.x, -1.35, 20, dt);
    }
  }
  body.position.y = D(body.position.y, bodyY, 18, dt);
  body.rotation.x = D(body.rotation.x, bodyX, 16, dt);
  body.rotation.z = D(body.rotation.z, leanZ, 12, dt);
  head.rotation.x = D(head.rotation.x, s.mode === 'slide' ? .9 : s.mode === 'run' ? .12 : 0, 12, dt);
  head.rotation.y = D(head.rotation.y, s.look || 0, 6, dt);
};
})();
