(() => {
const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const W = 480, H = 720, GROUND = 100, GY = H - GROUND, PIPE_W = 72, BIRD_X = 140;

// ---------- 20 level configs: gap shrinks, speed up, spacing down, moving pipes later ----------
const LEVELS = [];
for (let n = 1; n <= 20; n++) {
  LEVELS.push({
    n,
    gap: Math.max(96, 168 - (n - 1) * 3.6),          // 168 → ~96
    speed: 2.1 + (n - 1) * 0.16,                     // 2.1 → ~5.1
    spacing: Math.max(150, 240 - (n - 1) * 5),       // 240 → ~150
    target: 6 + Math.floor(n * 1.4),                 // 7 → 34
    moveAmp: n >= 6 ? Math.min(52, (n - 5) * 5.5) : 0,
    moveSpd: n >= 6 ? 0.8 + (n - 5) * 0.12 : 0,
    night: n % 5 === 0
  });
}

let save = { unlocked: 1, bests: {} };
try { Object.assign(save, JSON.parse(localStorage.getItem('noob.flappy20') || '{}') || {}); } catch (e) { /* storage blocked — play without saving */ }
const store = () => { try { localStorage.setItem('noob.flappy20', JSON.stringify(save)); } catch (e) { /* ignore */ } };

let state = 'menu', lvl = LEVELS[0], paused = false;
let bird = null, pipes = [], score = 0, frame = 0, groundX = 0, dead = false, won = false, wingT = 0, flashT = 0;

// ---------- sound (WebAudio, no assets) ----------
let AC;
function beep(f, d, type='square', v=0.08) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = v;
    o.connect(g); g.connect(AC.destination);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + d);
    o.start(); o.stop(AC.currentTime + d);
  } catch(e){}
}

// ---------- drawing ----------
function drawSky() {
  if (lvl.night) {
    const g = ctx.createLinearGradient(0,0,0,GY);
    g.addColorStop(0,'#0d1b3e'); g.addColorStop(1,'#33507a');
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0,0,0,GY);
    g.addColorStop(0,'#70c5ce'); g.addColorStop(1,'#bfeaf0');
    ctx.fillStyle = g;
  }
  ctx.fillRect(0,0,W,GY);
  // clouds (parallax)
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 210 + 60 - frame * (lvl.speed * 0.12)) % (W + 160) + W + 160) % (W + 160) - 80;
    const cy = 70 + (i % 3) * 60;
    ctx.fillStyle = lvl.night ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, 7); ctx.arc(cx + 24, cy - 8, 17, 0, 7); ctx.arc(cx + 48, cy, 20, 0, 7);
    ctx.fill();
  }
  // city silhouette
  ctx.fillStyle = lvl.night ? '#1b2a4a' : '#a8d8b0';
  for (let i = 0; i < 10; i++) {
    const bx = ((i * 70 - frame * (lvl.speed * 0.25)) % (W + 80) + W + 80) % (W + 80) - 40;
    const bh = 55 + ((i * 37) % 45);
    ctx.fillRect(bx, GY - bh - 22, 56, bh + 22);
  }
  ctx.fillStyle = lvl.night ? '#16233f' : '#c7ecc9';
  for (let i = 0; i < 10; i++) {
    const bx = ((i * 90 + 30 - frame * (lvl.speed * 0.4)) % (W + 100) + W + 100) % (W + 100) - 50;
    const bh = 30 + ((i * 53) % 28);
    ctx.fillRect(bx, GY - bh, 70, bh);
  }
}
function drawPipe(x, gapY, gap) {
  const topH = gapY - gap / 2, botY = gapY + gap / 2;
  const g = ctx.createLinearGradient(x, 0, x + PIPE_W, 0);
  g.addColorStop(0, '#5db84f'); g.addColorStop(0.5, '#8ed96f'); g.addColorStop(1, '#3e8e34');
  ctx.fillStyle = g; ctx.strokeStyle = '#23531d'; ctx.lineWidth = 3;
  ctx.fillRect(x, 0, PIPE_W, topH); ctx.strokeRect(x, -4, PIPE_W, topH + 4);
  ctx.fillRect(x, botY, PIPE_W, GY - botY); ctx.strokeRect(x, botY, PIPE_W, GY - botY + 6);
  ctx.fillRect(x - 5, topH - 26, PIPE_W + 10, 26); ctx.strokeRect(x - 5, topH - 26, PIPE_W + 10, 26);
  ctx.fillRect(x - 5, botY, PIPE_W + 10, 26); ctx.strokeRect(x - 5, botY, PIPE_W + 10, 26);
}
function drawGround() {
  ctx.fillStyle = '#ded895'; ctx.fillRect(0, GY, W, GROUND);
  ctx.fillStyle = '#7ec850'; ctx.fillRect(0, GY, W, 14);
  ctx.fillStyle = '#5ea63c';
  for (let x = -((groundX) % 24); x < W; x += 24) ctx.fillRect(x, GY, 12, 14);
  ctx.fillStyle = '#d0c878';
  for (let x = -((groundX) % 40); x < W; x += 40) ctx.fillRect(x, GY + 26, 20, 8);
  ctx.fillStyle = '#c8b06a'; ctx.fillRect(0, GY + 14, W, 4);
}
function drawBird() {
  const b = bird;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(Math.max(-0.5, Math.min(1.3, b.vy * 0.07)));
  // body
  ctx.fillStyle = '#f7d51d'; ctx.strokeStyle = '#5a4a00'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, 19, 15, 0, 0, 7); ctx.fill(); ctx.stroke();
  // belly
  ctx.fillStyle = '#fdf6d0';
  ctx.beginPath(); ctx.ellipse(2, 6, 12, 7, 0, 0, 7); ctx.fill();
  // wing (flapping)
  const wf = Math.sin(wingT * 0.35) * 6;
  ctx.fillStyle = '#f2a71b'; ctx.strokeStyle = '#5a4a00';
  ctx.beginPath(); ctx.ellipse(-4, 2 + wf * 0.4, 10, 6, wf * 0.08, 0, 7); ctx.fill(); ctx.stroke();
  // eye
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(9, -6, 6, 0, 7); ctx.fill();
  ctx.strokeStyle = '#5a4a00'; ctx.stroke();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(11, -6, 2.6, 0, 7); ctx.fill();
  // beak
  ctx.fillStyle = '#e8502a'; ctx.strokeStyle = '#7a1f00';
  ctx.beginPath(); ctx.moveTo(14, -1); ctx.lineTo(28, 1); ctx.lineTo(14, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawHUD() {
  // pause button (like reference, top-left)
  ctx.fillStyle = 'rgba(230,102,0,0.9)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(12, 12, 40, 40, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillRect(24, 22, 5, 20); ctx.fillRect(35, 22, 5, 20);
  // score / target (big white with black outline, top-right)
  ctx.font = 'bold 40px Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
  ctx.strokeText(score + ' / ' + lvl.target, W - 14, 12);
  ctx.fillText(score + ' / ' + lvl.target, W - 14, 12);
  ctx.font = 'bold 16px Arial';
  ctx.strokeText('LEVEL ' + lvl.n, W - 14, 56);
  ctx.fillText('LEVEL ' + lvl.n, W - 14, 56);
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
    ctx.font = 'bold 42px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeText('PAUSED', W / 2, H / 2 - 20); ctx.fillStyle = '#fff';
    ctx.fillText('PAUSED', W / 2, H / 2 - 20);
    ctx.font = 'bold 18px Arial';
    ctx.strokeText('Tap ▶ or press P to resume', W / 2, H / 2 + 25);
    ctx.fillText('Tap ▶ or press P to resume', W / 2, H / 2 + 25);
  }
}

// ---------- game logic ----------
function startLevel(n) {
  lvl = LEVELS[n - 1];
  bird = { x: BIRD_X, y: H / 2 - 80, vy: 0 };
  pipes = []; score = 0; frame = 0; groundX = 0; dead = false; won = false; paused = false; wingT = 0;
  const firstX = W + 120;
  for (let i = 0; i < 4; i++) pipes.push(newPipe(firstX + i * lvl.spacing));
  state = 'ready';
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
}
function newPipe(x) {
  const margin = 70;
  const gapY = margin + lvl.gap / 2 + Math.random() * (GY - lvl.gap - margin * 2);
  return { x, gapY, baseY: gapY, phase: Math.random() * 6.28, passed: false };
}
function flap() {
  if (state === 'ready') state = 'play';
  if (state !== 'play' || paused || dead || won) return;
  bird.vy = -8.1; wingT = 0; beep(600, 0.08, 'square', 0.05);
}
function die() {
  if (dead) return;
  dead = true; flashT = 6; beep(180, 0.25, 'sawtooth', 0.1);
  setTimeout(gameOver, 500);
}
function gameOver() {
  const key = 'L' + lvl.n;
  save.bests[key] = Math.max(save.bests[key] || 0, score);
  store();
  if (window.NoobScore) NoobScore.submit(Object.keys(save.bests).reduce((n, k) => n + (save.bests[k] || 0), 0));   // the ranking: all the best scores of all levels added up
  document.getElementById('goTitle').textContent = won ? 'LEVEL ' + lvl.n + ' CLEARED!' : 'GAME OVER';
  document.getElementById('goScore').textContent = 'Score: ' + score + ' / ' + lvl.target;
  document.getElementById('goBest').textContent = 'Best: ' + save.bests[key];
  document.getElementById('btnNext').classList.toggle('hidden', !(won && lvl.n < 20));
  document.getElementById('gameover').classList.remove('hidden');
  state = 'over';
}
function update() {
  frame++; wingT++;
  if (state === 'ready') { bird.y = H / 2 - 80 + Math.sin(frame * 0.08) * 8; groundX += lvl.speed; return; }
  if (state !== 'play' || paused || dead || won) return;
  bird.vy = Math.min(12, bird.vy + 0.45); bird.y += bird.vy;
  if (bird.y < -20) bird.y = -20;
  groundX += lvl.speed;
  for (const p of pipes) {
    p.x -= lvl.speed;
    if (lvl.moveAmp) p.gapY = p.baseY + Math.sin(frame * 0.02 * lvl.moveSpd + p.phase) * lvl.moveAmp;
    if (!p.passed && p.x + PIPE_W < bird.x - 15) {
      p.passed = true; score++;
      beep(900, 0.1, 'triangle', 0.07);
      if (score >= lvl.target) { won = true; save.unlocked = Math.max(save.unlocked, Math.min(20, lvl.n + 1)); store(); beep(1200, 0.3, 'triangle', 0.1); setTimeout(gameOver, 400); return; }
    }
  }
  if (pipes.length && pipes[0].x < -PIPE_W - 10) pipes.push(newPipe(pipes[pipes.length - 1].x + lvl.spacing)), pipes.shift();
  // collisions
  if (bird.y + 15 >= GY) { bird.y = GY - 15; die(); }
  for (const p of pipes) {
    const topH = p.gapY - lvl.gap / 2, botY = p.gapY + lvl.gap / 2;
    if (bird.x + 16 > p.x && bird.x - 16 < p.x + PIPE_W) {
      if (bird.y - 13 < topH || bird.y + 13 > botY) { die(); break; }
    }
  }
}
function render() {
  drawSky();
  for (const p of (pipes || [])) drawPipe(p.x, p.gapY, lvl.gap);
  drawGround();
  if (state !== 'menu') drawBird();
  if (state === 'ready') {
    ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
    ctx.strokeText('Tap / Click / Space to start', W / 2, H / 2 - 110);
    ctx.fillText('Tap / Click / Space to start', W / 2, H / 2 - 110);
    ctx.font = 'bold 18px Arial';
    ctx.strokeText('Target: ' + lvl.target + '  •  Gap shrinks as you level up!', W / 2, H / 2 - 74);
    ctx.fillText('Target: ' + lvl.target + '  •  Gap shrinks as you level up!', W / 2, H / 2 - 74);
  }
  if (state === 'play' || state === 'ready') drawHUD();
}
function loop() {
  try { update(); render(); } catch (e) { /* never let one bad frame kill the game */ }
  requestAnimationFrame(loop);
}

// ---------- level select menu ----------
function buildMenu() {
  const grid = document.getElementById('levelGrid');
  grid.innerHTML = '';
  for (let n = 1; n <= 20; n++) {
    const b = document.createElement('button');
    b.className = 'lvlBtn' + (n > save.unlocked ? ' locked' : '') + (save.bests['L' + n] >= LEVELS[n-1].target ? ' done' : '');
    b.textContent = n > save.unlocked ? '🔒' : n;
    b.title = 'Target: ' + LEVELS[n-1].target + (n >= 6 ? ' • moving pipes' : '');
    if (n <= save.unlocked) b.onclick = () => { state = 'game'; startLevel(n); };
    grid.appendChild(b);
  }
  const done = Object.keys(save.bests).filter(k => save.bests[k] >= LEVELS[+k.slice(1) - 1].target).length;
  document.getElementById('bestLine').textContent = '✅ ' + done + ' / 20 levels cleared — green ✓ = beaten, yellow = beaten (star). Progress auto-saves.';
}
function showMenu() {
  state = 'menu';
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  buildMenu();
}

// ---------- input ----------
cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
  if (state === 'menu' || state === 'over') return;
  if (x < 60 && y < 60) { paused = !paused; return; }  // pause button
  if (paused) { paused = false; return; }
  flap();
});
document.getElementById('wrap').addEventListener('pointerdown', e => {
  if (e.target === cv) return;
  if (state === 'play' && !paused) flap();
});
window.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); if (state !== 'menu' && state !== 'over') flap(); else if (state === 'over') startLevel(lvl.n); }
  if (e.code === 'KeyP' && state === 'play') paused = !paused;
});
document.getElementById('btnRetry').onclick = () => startLevel(lvl.n);
document.getElementById('btnNext').onclick = () => startLevel(Math.min(20, lvl.n + 1));
document.getElementById('btnLevels').onclick = showMenu;

// roundRect polyfill for older browsers
if (!ctx.roundRect) ctx.roundRect = function(x,y,w,h,r){ this.moveTo(x+r,y); this.arcTo(x+w,y,x+w,y+h,r); this.arcTo(x+w,y+h,x,y+h,r); this.arcTo(x,y+h,x,y,r); this.arcTo(x,y,x+w,y,r); return this; };

showMenu();
loop();
})();
