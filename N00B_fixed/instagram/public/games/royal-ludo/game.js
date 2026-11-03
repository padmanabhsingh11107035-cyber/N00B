"use strict";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const COLORS = [
  { name: "Rose", hex: "#ec6979", dark: "#ad354c", lane: "red" },
  { name: "Jade", hex: "#4fc9a5", dark: "#20896a", lane: "green" },
  { name: "Amber", hex: "#f0c65d", dark: "#ae8128", lane: "yellow" },
  { name: "Azure", hex: "#6b9eed", dark: "#3969ae", lane: "blue" },
];
const PATH = [
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  [6, 5],
  [5, 6],
  [4, 6],
  [3, 6],
  [2, 6],
  [1, 6],
  [0, 6],
  [0, 7],
  [0, 8],
  [1, 8],
  [2, 8],
  [3, 8],
  [4, 8],
  [5, 8],
  [6, 9],
  [6, 10],
  [6, 11],
  [6, 12],
  [6, 13],
  [6, 14],
  [7, 14],
  [8, 14],
  [8, 13],
  [8, 12],
  [8, 11],
  [8, 10],
  [8, 9],
  [9, 8],
  [10, 8],
  [11, 8],
  [12, 8],
  [13, 8],
  [14, 8],
  [14, 7],
  [14, 6],
  [13, 6],
  [12, 6],
  [11, 6],
  [10, 6],
  [9, 6],
  [8, 5],
  [8, 4],
  [8, 3],
  [8, 2],
  [8, 1],
  [8, 0],
  [7, 0],
  [6, 0],
];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const NS = "http://www.w3.org/2000/svg";
const KEY = "noob.royalludo.v1";
let preferences = { sound: true, light: false, motion: false, fast: false },
  lifetime = { games: 0, captures: 0, moves: 0 },
  game = null,
  busy = false,
  botTimer = null,
  epoch = 0,
  setupCount = 2,
  setupMode = "classic",
  audio = null,
  lastFocus = null,
  storageOK = true;
function readStore(k, f) {
  try {
    return JSON.parse(localStorage.getItem(k)) || f;
  } catch (e) {
    storageOK = false;
    return f;
  }
}
preferences = { ...preferences, ...readStore(KEY + "-preferences", {}) };
lifetime = { ...lifetime, ...readStore(KEY + "-stats", {}) };
function persist(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {
    storageOK = false;
  }
  $("#saveStatus").textContent = storageOK
    ? "Progress saved on this device"
    : "Browser storage unavailable · keep this tab open";
}
function save() {
  if (game && !busy) persist(KEY, game);
}
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
}
function sound(type) {
  if (!preferences.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    let notes =
      type === "win"
        ? [523, 659, 784, 1046]
        : type === "capture"
          ? [440, 220, 165]
          : type === "home"
            ? [660, 880]
            : type === "roll"
              ? [160, 200, 140, 240]
              : [430];
    notes.forEach((f, i) => {
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.connect(g);
      g.connect(audio.destination);
      o.type = type === "roll" ? "triangle" : "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.055, audio.currentTime + i * 0.09);
      g.gain.exponentialRampToValueAtTime(
        0.001,
        audio.currentTime + i * 0.09 + 0.15,
      );
      o.start(audio.currentTime + i * 0.09);
      o.stop(audio.currentTime + i * 0.09 + 0.16);
    });
  } catch (e) {}
}
function applyPreferences() {
  document.body.classList.toggle("light", preferences.light);
  document.body.classList.toggle("no-motion", preferences.motion);
  $("#soundBtn").textContent = preferences.sound ? "♫" : "♪";
  $("#soundBtn").setAttribute("aria-pressed", String(preferences.sound));
  $("#soundBtn").title = preferences.sound ? "Mute sound" : "Enable sound";
  $("#themeBtn").setAttribute("aria-pressed", String(preferences.light));
  for (const [key, id] of [
    ["sound", "soundSetting"],
    ["light", "lightSetting"],
    ["motion", "motionSetting"],
    ["fast", "fastSetting"],
  ])
    $("#" + id).checked = preferences[key];
  persist(KEY + "-preferences", preferences);
}
function isModal() {
  return !!$(".overlay.open");
}
function openModal(id) {
  clearTimeout(botTimer);
  lastFocus = document.activeElement;
  $("#" + id).classList.add("open");
  if (id === "settingsModal") {
    $("#lifetimeStats").replaceChildren();
    for (const [name, value] of [
      ["Completed matches", lifetime.games],
      ["Total moves", lifetime.moves],
      ["Total captures", lifetime.captures],
    ]) {
      let row = document.createElement("div");
      row.className = "score-row";
      let a = document.createElement("span"),
        b = document.createElement("b");
      a.textContent = name;
      b.textContent = value;
      row.append(a, b);
      $("#lifetimeStats").append(row);
    }
  }
  setTimeout(() => $("#" + id + " button")?.focus(), 0);
}
function closeModal(el) {
  el.classList.remove("open");
  if (lastFocus?.isConnected) lastFocus.focus();
  if (!game && !isModal()) openModal("setupModal");
  else scheduleBot();
}
$$(".close").forEach(
  (b) => (b.onclick = () => closeModal(b.closest(".overlay"))),
);
$$(".overlay").forEach((o) =>
  o.addEventListener("click", (e) => {
    if (e.target === o && o.id !== "winModal") closeModal(o);
  }),
);
function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.append(n);
  return n;
}
function text(x, y, value, attrs = {}, parent) {
  let n = el(
    "text",
    { x, y, "text-anchor": "middle", "dominant-baseline": "central", ...attrs },
    parent,
  );
  n.textContent = value;
  return n;
}
function rc(r, c) {
  return [c * 40 + 20, r * 40 + 20];
}
// Each yard is a 240x240 corner panel; its four token slots sit symmetrically
// around the exact panel centre so a full yard reads as one tidy 2x2 cluster.
const YARD_CENTERS = [
  [120, 120],
  [480, 120],
  [480, 480],
  [120, 480],
];
const YARD_SLOTS = [
  [-40, -40],
  [40, -40],
  [-40, 40],
  [40, 40],
];
function homePos(color, t) {
  const [cx, cy] = YARD_CENTERS[color];
  const [dx, dy] = YARD_SLOTS[t];
  return [cx + dx, cy + dy];
}
function lanePos(color, n) {
  return [rc(7, n), rc(n, 7), rc(7, 14 - n), rc(14 - n, 7)][color];
}
function tokenPos(p, t) {
  const n = p.tokens[t];
  if (n < 0) return homePos(p.color, t);
  if (n >= 56)
    return [
      [270, 300],
      [300, 270],
      [330, 300],
      [300, 330],
    ][p.color];
  if (n >= 51) return lanePos(p.color, n - 50);
  const [r, c] = PATH[(n + p.color * 13) % 52];
  return rc(r, c);
}
function boardBase() {
  const svg = $("#board");
  svg.replaceChildren();
  el("rect", { width: 600, height: 600, fill: "#e9e5dc" }, svg);
  for (let color = 0; color < 4; color++) {
    const ox = color === 1 || color === 2 ? 360 : 0,
      oy = color >= 2 ? 360 : 0;
    el(
      "rect",
      { x: ox, y: oy, width: 240, height: 240, fill: COLORS[color].hex },
      svg,
    );
    el(
      "rect",
      {
        x: ox + 29,
        y: oy + 29,
        width: 182,
        height: 182,
        rx: 28,
        fill: "#f8f2e7",
        "fill-opacity": ".93",
        stroke: "#fff8",
        "stroke-width": 2,
      },
      svg,
    );
    for (let t = 0; t < 4; t++) {
      const [x, y] = homePos(color, t);
      el(
        "circle",
        {
          cx: x,
          cy: y,
          r: 26,
          fill: COLORS[color].hex,
          "fill-opacity": ".17",
          stroke: COLORS[color].hex,
          "stroke-opacity": ".45",
          "stroke-width": 1.5,
        },
        svg,
      );
      el(
        "circle",
        {
          cx: x,
          cy: y,
          r: 19,
          fill: "none",
          stroke: COLORS[color].hex,
          "stroke-opacity": ".22",
          "stroke-width": 1,
          "stroke-dasharray": "2 5",
        },
        svg,
      );
    }
  }
  PATH.forEach(([r, c], i) => {
    const a = { x: c * 40, y: r * 40, width: 40, height: 40, class: "cell" };
    if (i % 13 === 0) a.style = "fill:" + COLORS[Math.floor(i / 13)].hex;
    el("rect", a, svg);
    if (SAFE.has(i)) {
      let [x, y] = rc(r, c);
      text(
        x,
        y,
        "✦",
        {
          "font-size": 25,
          fill: i % 13 === 0 ? "#fff9e8" : "#a8997b",
          "font-family": "Georgia",
        },
        svg,
      );
    }
  });
  for (let color = 0; color < 4; color++)
    for (let n = 1; n <= 5; n++) {
      const [x, y] = lanePos(color, n);
      el(
        "rect",
        {
          x: x - 20,
          y: y - 20,
          width: 40,
          height: 40,
          class: "cell lane-" + COLORS[color].lane,
        },
        svg,
      );
      if (n === 1)
        text(
          x,
          y,
          ["›", "⌄", "‹", "⌃"][color],
          { fill: COLORS[color].dark, "font-size": 29, "font-weight": 700 },
          svg,
        );
    }
  el(
    "polygon",
    { points: "240,240 300,300 240,360", fill: COLORS[0].hex },
    svg,
  );
  el(
    "polygon",
    { points: "240,240 360,240 300,300", fill: COLORS[1].hex },
    svg,
  );
  el(
    "polygon",
    { points: "360,240 360,360 300,300", fill: COLORS[2].hex },
    svg,
  );
  el(
    "polygon",
    { points: "240,360 300,300 360,360", fill: COLORS[3].hex },
    svg,
  );
  el(
    "circle",
    {
      cx: 300,
      cy: 300,
      r: 20,
      fill: "#fcf3da",
      stroke: "#d6bc7b",
      "stroke-width": 2,
    },
    svg,
  );
  text(300, 300, "♛", { "font-size": 23, fill: "#9c783d" }, svg);
  el("g", { id: "tokens" }, svg);
}
function current() {
  return game?.players[game.current];
}
function legalMoves(p = current(), roll = game?.dice) {
  if (!p || !roll) return [];
  return p.tokens.flatMap((n, i) =>
    n === -1 ? (roll === 6 ? [i] : []) : n < 56 && n + roll <= 56 ? [i] : [],
  );
}
function boardTokens() {
  const layer = $("#tokens");
  layer.replaceChildren();
  if (!game) return;
  const all = [];
  game.players.forEach((p, pi) =>
    p.tokens.forEach((v, t) => {
      if (v >= 56) return;
      const [x, y] = tokenPos(p, t);
      all.push({ p, pi, t, x, y });
    }),
  );
  const groups = {};
  all.forEach((a) => {
    let k = a.x + "," + a.y;
    (groups[k] ??= []).push(a);
  });
  const legal = game.phase === "move" ? legalMoves() : [];
  Object.values(groups).forEach((group) => {
    group.forEach((a, i) => {
      const { p, pi, t } = a,
        active =
          pi === game.current &&
          p.type === "human" &&
          legal.includes(t) &&
          !busy &&
          !game.over;
      let dx = 0,
        dy = 0,
        scale = 1;
      if (group.length > 1) {
        scale = group.length > 4 ? 0.48 : 0.64;
        const cols = group.length > 4 ? 3 : 2;
        dx = ((i % cols) - (Math.min(cols, group.length) - 1) / 2) * 15;
        dy =
          (Math.floor(i / cols) - (Math.ceil(group.length / cols) - 1) / 2) *
          15;
      }
      const g = el(
        "g",
        {
          class: "pawn" + (active ? " legal" : ""),
          transform: `translate(${a.x + dx},${a.y + dy}) scale(${scale})`,
          "data-player": pi,
          "data-token": t,
          role: "button",
          "aria-label": `${p.name}, token ${t + 1}, ${p.tokens[t] < 0 ? "in yard" : `step ${p.tokens[t]}`}${active ? ", available to move" : ""}`,
          tabindex: active ? 0 : -1,
        },
        layer,
      );
      let title = el("title", {}, g);
      title.textContent = `${p.name} · Token ${t + 1}`;
      el(
        "circle",
        {
          r: 20,
          fill: "transparent",
          stroke: active ? "#fff3bd" : "transparent",
          "stroke-width": 2.8,
          class: "halo",
        },
        g,
      );
      el("ellipse", { cx: 0, cy: 12, rx: 14, ry: 7, fill: "#0003" }, g);
      const shape = el("g", { class: "body" }, g);
      el(
        "path",
        {
          d: "M-12 11 Q-11 1 -6 -3 A10 10 0 1 1 6 -3 Q11 1 12 11 Q0 18 -12 11Z",
          fill: COLORS[p.color].hex,
          stroke: COLORS[p.color].dark,
          "stroke-width": 1.6,
        },
        shape,
      );
      el("ellipse", { cx: -3, cy: -12, rx: 4, ry: 2, fill: "#fff8" }, shape);
      text(
        0,
        7,
        t + 1,
        {
          "font-size": 11,
          "font-family": "system-ui",
          "font-weight": 800,
          fill: "#fff",
        },
        shape,
      );
      g.onclick = () => {
        if (active) moveToken(t);
      };
      g.onkeydown = (e) => {
        if (active && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          e.stopPropagation();
          moveToken(t);
        }
      };
    });
  });
}
function drawDice(n, rolling = false) {
  const dots = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  $("#dice").replaceChildren();
  for (let i = 0; i < 9; i++) {
    let d = document.createElement("i");
    if (!(dots[n] || dots[1]).includes(i)) d.className = "off";
    $("#dice").append(d);
  }
  $("#dice").classList.toggle("rolling", rolling && !preferences.motion);
  $("#dice").setAttribute("aria-label", "Dice showing " + n);
}
function playerCard(p) {
  const d = document.createElement("div");
  d.className = "player" + (p === current() && !game.over ? " active" : "");
  d.style.setProperty("--pc", COLORS[p.color].hex);
  if (p.color === 1 || p.color === 2) d.style.marginLeft = "auto";
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = p.rank
    ? "♛"
    : p.type === "bot"
      ? "♟"
      : p.name.charAt(0).toUpperCase();
  const info = document.createElement("div"),
    name = document.createElement("div"),
    sub = document.createElement("div"),
    pips = document.createElement("div");
  name.className = "player-name";
  name.textContent = p.name;
  sub.className = "player-sub";
  sub.textContent =
    (p.rank
      ? ["", "1st place", "2nd place", "3rd place", "4th place"][p.rank]
      : p.type === "bot"
        ? "Computer"
        : "Local player") +
    " · " +
    COLORS[p.color].name;
  pips.className = "pips";
  p.tokens.forEach((v) => {
    const i = document.createElement("i");
    i.className = v === 56 ? "done" : "";
    pips.append(i);
  });
  info.append(name, sub, pips);
  d.append(avatar, info);
  return d;
}
function renderPlayers() {
  for (const id of ["topPlayers", "bottomPlayers"])
    $("#" + id).replaceChildren();
  if (!game) return;
  [0, 1, 3, 2].forEach((c) => {
    let p = game.players.find((x) => x.color === c);
    if (p) $(c < 2 ? "#topPlayers" : "#bottomPlayers").append(playerCard(p));
  });
}
function addLog(message, color = current()?.color ?? 0) {
  game.log.unshift({ message, color });
  game.log = game.log.slice(0, 35);
}
function renderLog() {
  $("#activity").replaceChildren();
  for (const item of game?.log.slice(0, 12) || []) {
    let d = document.createElement("div"),
      dot = document.createElement("i"),
      s = document.createElement("span");
    d.className = "event";
    dot.className = "event-dot";
    dot.style.background = COLORS[item.color].hex;
    s.textContent = item.message;
    d.append(dot, s);
    $("#activity").append(d);
  }
}
function render() {
  if (!game) return;
  renderPlayers();
  boardTokens();
  renderLog();
  drawDice(game.dice || game.lastDice || 1);
  const p = current();
  $("#matchPill").textContent =
    `${game.mode.toUpperCase()} · ${game.players.length} PLAYERS`;
  $("#turnNumber").textContent = "TURN " + game.turn;
  $("#turnTitle").textContent = game.over
    ? "A royal finish."
    : p.name + "’s turn";
  $("#turnTitle").style.color = game.over ? "var(--gold)" : COLORS[p.color].hex;
  $("#turnMessage").textContent = game.over
    ? "The match is complete. Time for a rematch."
    : game.message ||
      (game.phase === "move"
        ? `Rolled ${game.dice}. Choose a glowing token.`
        : p.type === "bot"
          ? "The house is planning its next move."
          : "Roll a six to leave the yard. Race your tokens home.");
  $("#rollBtn").disabled =
    busy || game.over || game.phase !== "roll" || p.type === "bot";
  $("#rollBtn").textContent = game.over
    ? "Match complete"
    : p.type === "bot"
      ? "Computer is playing…"
      : game.phase === "move"
        ? "Choose a glowing token"
        : "Roll the dice ↗";
  $("#rollHint").textContent = game.over
    ? "A new table is just one click away."
    : game.phase === "move"
      ? "Tap a token · keys 1–" + p.tokens.length
      : "Every six brings another chance.";
  $("#movesStat").textContent = game.moves;
  $("#capturesStat").textContent = game.captures;
  $("#homeStat").textContent = game.players.reduce(
    (s, p) => s + p.tokens.filter((n) => n === 56).length,
    0,
  );
  $("#boardStatus").textContent = game.over
    ? "The crown has been claimed."
    : game.phase === "move"
      ? "Choose your next move."
      : p.type === "bot"
        ? "Computer at the table."
        : "Good luck at the table.";
  updateClock();
}
function updateClock() {
  let n = game?.elapsed || 0;
  $("#timer").textContent =
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function validTicket(t) {
  return t === epoch;
}
function randomDie() {
  if (window.crypto?.getRandomValues) {
    const a = new Uint32Array(1);
    do {
      crypto.getRandomValues(a);
    } while (a[0] >= 4294967292);
    return (a[0] % 6) + 1;
  }
  return Math.floor(Math.random() * 6) + 1;
}
async function rollDice() {
  if (!game || busy || game.over || game.phase !== "roll" || isModal()) return;
  busy = true;
  clearTimeout(botTimer);
  const ticket = epoch;
  $("#rollBtn").disabled = true;
  sound("roll");
  const n = randomDie();
  if (!preferences.motion) {
    for (let k = 0; k < 8; k++) {
      drawDice(randomDie(), true);
      await sleep(preferences.fast ? 25 : 45);
      if (!validTicket(ticket)) return;
    }
  }
  drawDice(n);
  const p = current();
  game.dice = n;
  game.lastDice = n;
  game.sixes = n === 6 ? game.sixes + 1 : 0;
  addLog(`${p.name} rolled a ${n}.`);
  if (n === 6 && game.sixes === 3 && game.rules.tripleSix) {
    game.message = "Three sixes! This roll is forfeited.";
    addLog(`${p.name} rolled three sixes — turn ends.`);
    game.phase = "wait";
    save();
    render();
    await sleep(preferences.fast ? 300 : 950);
    if (!validTicket(ticket)) return;
    busy = false;
    nextTurn(false);
    return;
  }
  game.phase = "move";
  game.message = "";
  const legal = legalMoves();
  if (!legal.length) {
    game.message = `No legal move with ${n}. ${n === 6 ? "Roll again." : "Passing the dice."}`;
    game.phase = "wait";
    render();
    save();
    await sleep(preferences.fast ? 250 : 850);
    if (!validTicket(ticket)) return;
    busy = false;
    nextTurn(n === 6);
    return;
  }
  busy = false;
  render();
  save();
  scheduleBot();
}
function nextTurn(bonus) {
  game.dice = null;
  game.phase = "roll";
  game.message = bonus ? "Bonus roll — keep the momentum." : "";
  if (!bonus) {
    game.sixes = 0;
    do {
      game.current = (game.current + 1) % game.players.length;
    } while (current().rank);
    game.turn++;
  }
  render();
  save();
  scheduleBot();
}
async function moveToken(t) {
  if (
    !game ||
    busy ||
    game.over ||
    game.phase !== "move" ||
    isModal() ||
    !legalMoves().includes(t)
  )
    return;
  busy = true;
  clearTimeout(botTimer);
  const ticket = epoch,
    p = current(),
    roll = game.dice,
    old = p.tokens[t],
    target = old < 0 ? 0 : old + roll;
  $("#rollBtn").disabled = true;
  boardTokens();
  if (!preferences.motion) {
    for (let n = old < 0 ? 0 : old + 1; n <= target; n++) {
      p.tokens[t] = n;
      boardTokens();
      sound("move");
      await sleep(preferences.fast ? 35 : 90);
      if (!validTicket(ticket)) return;
    }
  }
  p.tokens[t] = target;
  game.moves++;
  lifetime.moves++;
  let captured = 0;
  if (target < 51) {
    let idx = (target + p.color * 13) % 52;
    if (!SAFE.has(idx))
      for (const other of game.players) {
        if (other === p) continue;
        other.tokens.forEach((v, i) => {
          if (v >= 0 && v < 51 && (v + other.color * 13) % 52 === idx) {
            other.tokens[i] = -1;
            captured++;
            addLog(
              `${p.name} captured ${other.name}’s token ${i + 1}!`,
              p.color,
            );
          }
        });
      }
  }
  game.captures += captured;
  lifetime.captures += captured;
  if (captured) {
    sound("capture");
    toast(
      `${captured} ${captured === 1 ? "token" : "tokens"} sent back to the yard`,
    );
  } else if (target === 56) {
    sound("home");
    toast(`${p.name}: token ${t + 1} is home!`);
    addLog(`${p.name} brought token ${t + 1} home.`, p.color);
  } else {
    sound("move");
    addLog(
      `${p.name} moved token ${t + 1}${old < 0 ? " out of the yard" : ` by ${roll}`}.`,
      p.color,
    );
  }
  if (p.tokens.every((v) => v === 56)) {
    p.rank = game.players.filter((x) => x.rank).length + 1;
    addLog(`${p.name} finishes in place ${p.rank}!`, p.color);
    const remaining = game.players.filter((x) => !x.rank);
    if (!game.rules.rankings || remaining.length <= 1) {
      if (remaining.length === 1) remaining[0].rank = game.players.length;
      game.over = true;
      game.phase = "over";
      game.dice = null;
      lifetime.games++;
      busy = false;
      persist(KEY + "-stats", lifetime);
      save();
      render();
      showWinner();
      return;
    }
    toast(`${p.name} finished #${p.rank}. Play continues.`);
  }
  busy = false;
  persist(KEY + "-stats", lifetime);
  nextTurn(
    !p.rank &&
      (roll === 6 ||
        (captured > 0 && game.rules.captureBonus) ||
        (target === 56 && game.rules.homeBonus)),
  );
}
function chooseBot() {
  const p = current(),
    legal = legalMoves(),
    roll = game.dice;
  if (game.difficulty === "easy")
    return legal[Math.floor(Math.random() * legal.length)];
  const options = legal.map((t) => {
    const old = p.tokens[t],
      n = old < 0 ? 0 : old + roll;
    let score = n === 56 ? 150 : old < 0 ? 32 : 8 + roll;
    if (n >= 51) score += 40 + n;
    if (n < 51) {
      const idx = (n + p.color * 13) % 52;
      if (SAFE.has(idx)) score += 19;
      for (const o of game.players) {
        if (o === p) continue;
        for (const v of o.tokens) {
          if (v < 0 || v >= 51) continue;
          const oi = (v + o.color * 13) % 52;
          if (oi === idx && !SAFE.has(idx)) score += 95;
          let dist = (idx - oi + 52) % 52;
          if (dist >= 1 && dist <= 6 && !SAFE.has(idx) && v + dist < 51)
            score -= 15 / (dist * 0.25 + 1);
        }
      }
      if (
        old >= 0 &&
        old < 51 &&
        SAFE.has((old + p.color * 13) % 52) &&
        !SAFE.has(idx)
      )
        score -= 6;
    }
    score +=
      game.difficulty === "normal" ? Math.random() * 65 : Math.random() * 6;
    return { t, score };
  });
  options.sort((a, b) => b.score - a.score);
  return options[0].t;
}
function scheduleBot() {
  clearTimeout(botTimer);
  if (
    !game ||
    busy ||
    game.over ||
    current().type !== "bot" ||
    isModal() ||
    document.hidden
  )
    return;
  const ticket = epoch;
  botTimer = setTimeout(
    () => {
      if (!validTicket(ticket) || isModal()) return;
      if (game.phase === "roll") rollDice();
      else if (game.phase === "move") moveToken(chooseBot());
    },
    preferences.fast ? 280 : 900,
  );
}
function showWinner() {
  const ranked = game.players
      .filter((p) => p.rank)
      .sort((a, b) => a.rank - b.rank),
    winner = ranked[0];
  $("#winTitle").textContent = winner.name + " takes the crown.";
  $("#winDesc").textContent =
    `${game.moves} moves · ${game.captures} captures · ${$("#timer").textContent} at the table`;
  $("#podium").replaceChildren();
  const ordered = [...ranked, ...game.players.filter((p) => !p.rank)];
  for (const p of ordered) {
    let row = document.createElement("div");
    row.className = "podium-row";
    let a = document.createElement("strong"),
      b = document.createElement("span");
    a.textContent = (p.rank ? "#" + p.rank : "—") + "  " + p.name;
    a.style.color = COLORS[p.color].hex;
    b.textContent =
      p.tokens.filter((v) => v === 56).length + "/" + p.tokens.length + " home";
    row.append(a, b);
    $("#podium").append(row);
  }
  openModal("winModal");
  sound("win");
  if (
    !preferences.motion &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    for (let i = 0; i < 55; i++) {
      const s = document.createElement("i");
      s.className = "confetti";
      s.style.left = Math.random() * 100 + "vw";
      s.style.background = COLORS[i % 4].hex;
      s.style.animationDelay = Math.random() * 0.6 + "s";
      s.style.animationDuration = 2 + Math.random() * 2 + "s";
      document.body.append(s);
      setTimeout(() => s.remove(), 4700);
    }
}
function seatColors() {
  return setupCount === 2
    ? [0, 2]
    : setupCount === 3
      ? [0, 1, 2]
      : [0, 1, 2, 3];
}
let seatDraft = {};
function captureDraft() {
  $$("#setupPlayers .setup-player").forEach((row) => {
    const c = +row.dataset.color;
    seatDraft[c] = {
      name: row.querySelector("input").value,
      type: row.querySelector("select").value,
    };
  });
}
function renderSetup() {
  const holder = $("#setupPlayers");
  holder.replaceChildren();
  seatColors().forEach((c, i) => {
    const d = seatDraft[c] || {
        name: i === 0 ? "You" : COLORS[c].name + " Bot",
        type: i === 0 ? "human" : "bot",
      },
      row = document.createElement("div");
    row.className = "setup-player";
    row.dataset.color = c;
    const sw = document.createElement("i");
    sw.className = "swatch";
    sw.style.background = COLORS[c].hex;
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 18;
    input.value = d.name;
    input.setAttribute("aria-label", COLORS[c].name + " player name");
    const sel = document.createElement("select");
    sel.setAttribute("aria-label", COLORS[c].name + " player type");
    for (const [v, label] of [
      ["human", "Local player"],
      ["bot", "Computer"],
    ]) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = label;
      sel.append(o);
    }
    sel.value = d.type;
    sel.onchange = () => {
      if (input.value === COLORS[c].name + " Bot" && sel.value === "human")
        input.value = COLORS[c].name;
      if (input.value === COLORS[c].name && sel.value === "bot")
        input.value = COLORS[c].name + " Bot";
    };
    row.append(sw, input, sel);
    holder.append(row);
  });
  $$("#countOptions button").forEach((b) =>
    b.classList.toggle("selected", +b.dataset.count === setupCount),
  );
  $$("#modeOptions button").forEach((b) =>
    b.classList.toggle("selected", b.dataset.mode === setupMode),
  );
}
$$("#countOptions button").forEach(
  (b) =>
    (b.onclick = () => {
      captureDraft();
      setupCount = +b.dataset.count;
      renderSetup();
    }),
);
$$("#modeOptions button").forEach(
  (b) =>
    (b.onclick = () => {
      captureDraft();
      setupMode = b.dataset.mode;
      renderSetup();
    }),
);
function startGame() {
  captureDraft();
  epoch++;
  clearTimeout(botTimer);
  busy = false;
  const players = seatColors().map((c) => ({
    color: c,
    name: (seatDraft[c].name.trim() || COLORS[c].name).slice(0, 18),
    type: seatDraft[c].type,
    tokens: Array(setupMode === "quick" ? 2 : 4).fill(-1),
    rank: 0,
  }));
  game = {
    version: 1,
    players,
    current: 0,
    mode: setupMode,
    difficulty: $("#difficulty").value,
    rules: {
      captureBonus: $("#captureBonus").checked,
      homeBonus: $("#homeBonus").checked,
      tripleSix: $("#tripleSix").checked,
      rankings: $("#rankings").checked,
    },
    phase: "roll",
    dice: null,
    lastDice: 1,
    sixes: 0,
    turn: 1,
    moves: 0,
    captures: 0,
    elapsed: 0,
    over: false,
    message: "",
    log: [],
  };
  addLog("The table is set. " + players[0].name + " rolls first.", 0);
  $$(".overlay").forEach((o) => o.classList.remove("open"));
  save();
  render();
  toast("The table is yours. Good luck!");
  $("#rollBtn").focus();
  scheduleBot();
}
function newGame() {
  if (game) {
    setupCount = game.players.length;
    setupMode = game.mode;
    seatDraft = {};
    game.players.forEach(
      (p) => (seatDraft[p.color] = { name: p.name, type: p.type }),
    );
    $("#difficulty").value = game.difficulty;
    for (const k of ["captureBonus", "homeBonus", "tripleSix", "rankings"])
      $("#" + k).checked = game.rules[k];
  }
  renderSetup();
  $("#winModal").classList.remove("open");
  openModal("setupModal");
}
$("#startBtn").onclick = startGame;
$("#newBtn").onclick = newGame;
$("#playAgainBtn").onclick = newGame;
$("#rulesBtn").onclick = () => openModal("rulesModal");
$("#settingsBtn").onclick = () => openModal("settingsModal");
$("#rollBtn").onclick = () => {
  if (current()?.type === "human") rollDice();
};
$("#soundBtn").onclick = () => {
  preferences.sound = !preferences.sound;
  applyPreferences();
  if (preferences.sound) sound("move");
};
$("#themeBtn").onclick = () => {
  preferences.light = !preferences.light;
  applyPreferences();
};
$("#fullscreenBtn").onclick = async () => {
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch (e) {
    toast("Fullscreen is not available in this browser.");
  }
};
for (const [key, id] of [
  ["sound", "soundSetting"],
  ["light", "lightSetting"],
  ["motion", "motionSetting"],
  ["fast", "fastSetting"],
])
  $("#" + id).onchange = (e) => {
    preferences[key] = e.target.checked;
    applyPreferences();
  };
document.addEventListener("keydown", (e) => {
  const modal = $(".overlay.open");
  if (modal) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal(modal);
    }
    if (e.key === "Tab") {
      const items = [
        ...modal.querySelectorAll('button,input,select,[tabindex="0"]'),
      ].filter((x) => !x.disabled);
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
    return;
  }
  if (
    ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(e.target.tagName) ||
    e.target.getAttribute("role") === "button"
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    if (current()?.type === "human") rollDice();
  }
  if (/^[1-4]$/.test(e.key) && current()?.type === "human")
    moveToken(+e.key - 1);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearTimeout(botTimer);
    save();
  } else scheduleBot();
});
window.addEventListener("beforeunload", save);
setInterval(() => {
  if (game && !game.over && !isModal() && !document.hidden) {
    game.elapsed++;
    updateClock();
    if (game.elapsed % 5 === 0) save();
  }
}, 1000);
function validSave(g) {
  try {
    return (
      g.version === 1 &&
      Array.isArray(g.players) &&
      g.players.length >= 2 &&
      g.players.length <= 4 &&
      new Set(g.players.map((p) => p.color)).size === g.players.length &&
      g.players.every(
        (p) =>
          Number.isInteger(p.color) &&
          p.color >= 0 &&
          p.color < 4 &&
          typeof p.name === "string" &&
          ["human", "bot"].includes(p.type) &&
          Array.isArray(p.tokens) &&
          [2, 4].includes(p.tokens.length) &&
          p.tokens.every((n) => Number.isInteger(n) && n >= -1 && n <= 56),
      ) &&
      Number.isInteger(g.current) &&
      g.current >= 0 &&
      g.current < g.players.length &&
      ["roll", "move", "wait", "over"].includes(g.phase) &&
      g.rules &&
      Array.isArray(g.log) &&
      Number.isFinite(g.elapsed) &&
      (!["move", "wait"].includes(g.phase) ||
        (Number.isInteger(g.dice) && g.dice >= 1 && g.dice <= 6))
    );
  } catch (e) {
    return false;
  }
}
boardBase();
drawDice(1);
applyPreferences();
const saved = readStore(KEY, null);
if (saved && validSave(saved)) {
  game = saved;
  if (game.phase === "wait") {
    const repeat =
      game.dice === 6 && !(game.sixes >= 3 && game.rules.tripleSix);
    nextTurn(repeat);
  } else {
    render();
    scheduleBot();
  }
  toast(
    game.over
      ? "Last completed match restored."
      : "Welcome back. Your table was waiting.",
  );
} else {
  renderSetup();
  openModal("setupModal");
}
// Inspection helpers used by the included automated browser tests.
window.RoyalLudo = {
  get state() {
    return game;
  },
  legalMoves,
  tokenPos,
  path: PATH,
  safe: SAFE,
};
