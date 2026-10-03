"use strict";

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const W = 360;
  const keys = new Set();
  const useTouchInput = "ontouchstart" in window;

  const playerPixels = [
    "000000111000000", "000001222100000", "000012333210000",
    "000123333321000", "001233434332100", "012233333332210",
    "122223333322221", "122211111122221", "012211111122210",
    "001211111122100", "000211111120000", "000012212000000",
    "000001221000000"
  ];
  const scoutPixels = [
    "00011000110", "00111111100", "01112221110", "11122222111",
    "11212121211", "00122222100", "00012121000", "00110001100"
  ];
  const assaultPixels = [
    "00100000100", "01110001110", "11111111111", "11221112211",
    "11212121211", "01122222110", "00121121200", "00010001000"
  ];
  const leaderPixels = [
    "0001100011000", "0011111111100", "0112211221100", "1122222222111",
    "1221212121221", "1222222222221", "0122222222210", "0012211221000",
    "0001100110000"
  ];
  const bossPixels = [
    "000001111100000", "000111222111000", "001122333221100",
    "011222333222110", "112223434322211", "122233333332221",
    "112222333222211", "011122222221110", "001111111111100",
    "000110000001100", "001100000000110"
  ];

  let scale = 1;
  let H = 780;
  let state = "title";
  let stage = 1;
  let score = 0;
  let highScore = readNumber("ss-high", 0);
  let lives = 3;
  let weapon = 1;
  let enemies = [];
  let playerShots = [];
  let enemyShots = [];
  let items = [];
  let particles = [];
  let boss = null;
  let bossStage = false;
  let ship = { x: W / 2, y: 0, vx: 0, invulnerable: 0 };
  let joy = { x: 65, y: 0, knobX: 0, pointer: null };
  let fireButton = { x: W - 65, y: 0, pointer: null, pressed: false, flash: 0 };
  let soundEnabled = readNumber("ss-sound", 1) === 1;
  let audioContext = null;
  let audioOutput = null;
  let noiseBuffer = null;
  const activeSoundSources = new Set();
  let screenShake = 0;
  let fireCooldown = 0;
  let attackCooldown = stage === 1 ? 3.4 : 3.0;
  let stageClearTimer = 0;
  let banner = "";
  let bannerTime = 0;
  let elapsed = 0;
  let groupAttackIndex = 0;
  let lastFrame = 0;
  let stars = [];

  function readNumber(key, fallback) {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return fallback;
      const n = Number(stored);
      return Number.isFinite(n) ? n : fallback;
    } catch (_) { return fallback; }
  }
  function writeNumber(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) { /* private mode */ }
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function distance(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = window.innerWidth / W;
    H = window.innerHeight / scale;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ship.y = H - 160;
    joy.x = 65;
    joy.y = H - 75;
    fireButton.x = W - 65;
    fireButton.y = H - 75;
    stars = Array.from({ length: 64 }, () => ({
      x: rand(4, W - 4), y: rand(0, H), size: Math.random() < 0.8 ? 1.5 : 2.2,
      color: ["#758599", "#5875a3", "#8b7770"][Math.floor(Math.random() * 3)],
      phase: rand(0, 7)
    }));
  }
  window.addEventListener("resize", resize);
  resize();

  function initAudio(testSound = false) {
    if (!soundEnabled) return;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    // iPhone: request media playback instead of the default ambient audio category.
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (_) {}
    const ready = () => {
      if (!soundEnabled || !audioContext || audioContext.state !== "running") return;
      if (testSound) tone(880, .16, "sine", .06, true);

    };
    try {
      if (!audioContext || audioContext.state === "closed") {
        audioContext = new AudioCtor();
        audioOutput = null; noiseBuffer = null;
        activeSoundSources.clear();
      }
      prepareAudioOutput();
      if (audioContext.state === "running") ready();
      else {
        const resume = audioContext.resume();
        if (resume && resume.then) resume.then(ready).catch(() => {
          if (state === "playing") { banner = "소리를 켜려면 ♪ 버튼을 눌러 주세요"; bannerTime = 2; }
        });
        else ready();
      }
    } catch (_) {
      if (state === "playing") { banner = "소리를 켜려면 ♪ 버튼을 눌러 주세요"; bannerTime = 2; }
    }
  }
  function prepareAudioOutput() {
    if (audioOutput) return;
    audioOutput = audioContext.createGain();
    audioOutput.gain.value = .7;
    const limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 16;
    limiter.ratio.value = 8;
    limiter.attack.value = .003;
    limiter.release.value = .16;
    audioOutput.connect(limiter).connect(audioContext.destination);
  }
  function canPlaySound(preview = false) {
    return soundEnabled && audioContext && audioContext.state === "running" && (preview || state === "playing");
  }
  function trackSound(source, nodes) {
    activeSoundSources.add(source);
    source.onended = () => {
      activeSoundSources.delete(source);
      for (const node of [source, ...nodes]) { try { node.disconnect(); } catch (_) {} }
    };
  }
  function sweepVoice(from, to, duration, type, volume, delay = 0, warble = 0, preview = false) {
    if (!canPlaySound(preview)) return;
    const now = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain).connect(audioOutput);
    trackSound(oscillator, [gain]);
    if (warble) {
      const modulation = audioContext.createOscillator();
      const depth = audioContext.createGain();
      modulation.frequency.value = 26;
      depth.gain.value = warble;
      modulation.connect(depth).connect(oscillator.frequency);
      trackSound(modulation, [depth]);
      modulation.start(now); modulation.stop(now + duration);
    }
    oscillator.start(now); oscillator.stop(now + duration);
  }
  function noiseVoice(duration, from, to, volume, filterType = "lowpass", delay = 0) {
    if (!canPlaySound()) return;
    if (!noiseBuffer) {
      noiseBuffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * 2.5), audioContext.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const now = audioContext.currentTime + delay;
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    source.buffer = noiseBuffer;
    filter.type = filterType; filter.Q.value = .7;
    filter.frequency.setValueAtTime(from, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + .005);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(filter).connect(gain).connect(audioOutput);
    trackSound(source, [filter, gain]);
    source.start(now); source.stop(now + duration);
  }
  function tone(freq, duration = .07, type = "sine", volume = .04, preview = false) {
    sweepVoice(freq, freq, duration, type, volume, 0, 0, preview);
  }
  function weaponSound(level) {
    if (level <= 3) {
      // Short muzzle crack and a low mechanical punch, rather than a pitched beep.
      const machineGun = level === 3;
      noiseVoice(machineGun ? .055 : .085, 4500, 1000, machineGun ? .15 : .18, "bandpass");
      sweepVoice(machineGun ? 150 : 190, 55, .085, "triangle", .16);
      if (level === 2) noiseVoice(.055, 3200, 800, .1, "bandpass", .012);
    } else if (level === 4) {
      sweepVoice(2400, 180, .24, "sawtooth", .065);
      sweepVoice(1400, 260, .17, "sine", .075);
      noiseVoice(.08, 2800, 900, .035, "bandpass");
    } else {
      // Layered energy pulse with a modulated core and a heavy, decaying tail.
      sweepVoice(440, 85, .48, "sine", .16, 0, 30);
      sweepVoice(130, 38, .6, "triangle", .23);
      sweepVoice(760, 180, .28, "sawtooth", .045, .015, 45);
      noiseVoice(.42, 2100, 160, .13, "bandpass", .02);
    }
  }
  function missileSound() {
    noiseVoice(.14, 1700, 450, .05, "bandpass");
    sweepVoice(250, 90, .15, "triangle", .035);
  }
  function impactSound(heavy = false) {
    noiseVoice(.035, heavy ? 1800 : 3500, 900, .055, "bandpass");
  }
  function explosionSound(kind) {
    if (kind === "boss") {
      noiseVoice(1.8, 2200, 65, .38);
      sweepVoice(90, 25, 1.25, "sine", .36);
      noiseVoice(1.1, 1200, 90, .25, "lowpass", .22);
      sweepVoice(160, 32, .9, "triangle", .2, .25);
      noiseVoice(.65, 2700, 180, .13, "bandpass", .5);
    } else if (kind === "leader") {
      noiseVoice(.75, 2300, 110, .26);
      sweepVoice(115, 32, .65, "sine", .26);
      noiseVoice(.4, 1200, 160, .12, "lowpass", .1);
      sweepVoice(640, 140, .28, "triangle", .075, .08);
    } else if (kind === "player") {
      noiseVoice(.65, 2200, 100, .29);
      sweepVoice(130, 28, .6, "sine", .29);
      noiseVoice(.35, 3500, 450, .12, "bandpass", .035);
    } else if (kind === "assault") {
      noiseVoice(.34, 2100, 150, .2);
      sweepVoice(140, 40, .3, "triangle", .18);
    } else if (kind === "plasma") {
      noiseVoice(.42, 2600, 120, .2);
      sweepVoice(230, 42, .42, "sine", .22, 0, 22);
    } else {
      noiseVoice(.22, 2800, 250, .14);
      sweepVoice(170, 55, .2, "triangle", .13);
    }
  }
  function stopSounds() {
    for (const source of activeSoundSources) { try { source.stop(); } catch (_) {} }
    activeSoundSources.clear();
  }
  function playerImpactFeedback() {
    screenShake = .18;
    try { if (typeof navigator.vibrate === "function") navigator.vibrate(35); } catch (_) {}
  }
  function toggleSound() {
    soundEnabled = !soundEnabled;
    writeNumber("ss-sound", soundEnabled ? 1 : 0);
    if (soundEnabled) initAudio(true);
    else stopSounds();
  }

  function makeEnemy(kind, col, row, x, y) {
    const hp = kind === "leader" ? 3 : 1;
    return {
      id: `${stage}-${kind}-${col}-${row}-${Math.random().toString(36).slice(2, 7)}`,
      kind, col, row, baseX: x, baseY: y, x, y, hp, maxHp: hp,
      alive: true, dive: null, entry: null, angle: 0, flash: 0, carrier: false, shot: false,
      phase: rand(0, Math.PI * 2)
    };
  }
  function startStage() {
    enemies = [];
    playerShots = [];
    enemyShots = [];
    items = [];
    particles = [];
    boss = null;
    bossStage = stage % 3 === 0;
    stageClearTimer = 0;
    attackCooldown = stage === 1 ? 3.4 : 3.0;
    groupAttackIndex = 0;
    const spacing = 41;
    const left = (W - spacing * 7) / 2;
    if (!bossStage) {
      for (let col = 0; col < 3; col++) {
        enemies.push(makeEnemy("leader", col, 0, W / 2 + (col - 1) * 72, 71));
      }
      for (let row = 1; row <= 2; row++) {
        for (let col = 0; col < 8; col++) {
          enemies.push(makeEnemy("assault", col, row, left + col * spacing, 106 + (row - 1) * 28));
        }
      }
      for (let row = 3; row <= 4; row++) {
        for (let col = 0; col < 8; col++) {
          enemies.push(makeEnemy("scout", col, row, left + col * spacing, 170 + (row - 3) * 28));
        }
      }
      if (weapon < 5) {
        const carrier = enemies.find(e => e.kind === "scout" && e.col === 3 && e.row === 3);
        if (carrier) carrier.carrier = true;
      }
      // Each row enters as one shared formation, with no entry-phase firing.
      for (let row = 0; row <= 4; row++) {
        const squad = enemies.filter(e => e.row === row);
        const centerX = squad.reduce((sum, e) => sum + e.baseX, 0) / squad.length;
        const centerY = squad[0].baseY;
        const side = row % 2 === 0 ? -1 : 1;
        const startX = side < 0 ? -190 : W + 190;
        const route = [
          [[startX, 65], [W / 2, 20], [W / 2 - side * 100, 230], [W / 2, 225]],
          [[W / 2, 225], [W / 2 + side * 115, 225], [centerX + side * 90, centerY], [centerX, centerY]]
        ];
        squad.forEach(e => {
          e.entry = { age: -row * 0.18, duration: 2.0, route, offsetX: e.baseX - centerX, offsetY: 0 };
          const p = flightPosition(e.entry, 0);
          e.x = p.x; e.y = p.y;
        });
      }
      banner = `STAGE ${stage}`;
      bannerTime = 1.3;
    } else {
      boss = {
        x: W / 2, y: 110, hp: 12 + stage, maxHp: 12 + stage,
        dir: 1, shotTimer: 1.0, flash: 0, age: 0
      };
      banner = `COMMANDER ${stage}`;
      bannerTime = 1.5;
    }
  }
  function beginGame() {
    resetControls();
    stopSounds();
    screenShake = 0;
    score = 0;
    stage = 1;
    lives = 3;
    weapon = 1;
    ship.x = W / 2;
    ship.vx = 0;
    ship.invulnerable = 0;
    state = "playing";
    fireCooldown = 0;
    startStage();
    initAudio(true);
  }

  function curvedRoute(points) {
    // Smooth connected curves through waypoints, including the figure-eight crossing.
    return points.slice(0, -1).map((point, i) => {
      const previous = points[Math.max(0, i - 1)];
      const next = points[i + 1];
      const after = points[Math.min(points.length - 1, i + 2)];
      return [point,
        [point[0] + (next[0] - previous[0]) / 6, point[1] + (next[1] - previous[1]) / 6],
        [next[0] - (after[0] - point[0]) / 6, next[1] - (after[1] - point[1]) / 6], next];
    });
  }
  function flightPosition(flight, progress) {
    const t = clamp(progress, 0, 1) * flight.route.length;
    const index = Math.min(flight.route.length - 1, Math.floor(t));
    const u = Math.min(1, t - index), v = 1 - u;
    const points = flight.route[index];
    const spread = flight.ribbon ? 0.08 + 0.92 * Math.pow(Math.abs(2 * progress - 1), 4) : 1;
    return {
      x: v * v * v * points[0][0] + 3 * v * v * u * points[1][0] + 3 * v * u * u * points[2][0] + u * u * u * points[3][0] + flight.offsetX * spread,
      y: v * v * v * points[0][1] + 3 * v * v * u * points[1][1] + 3 * v * u * u * points[2][1] + u * u * u * points[3][1] + flight.offsetY * spread
    };
  }
  function launchGroupAttack() {
    if (enemies.some(e => e.alive && (e.entry || e.dive))) return;
    const order = ["scout", "assault", "scout", "leader"];
    let available = [];
    for (let attempt = 0; attempt < order.length; attempt++) {
      const kind = order[groupAttackIndex++ % order.length];
      available = enemies.filter(e => e.alive && !e.entry && !e.dive && e.kind === kind);
      if (available.length) break;
    }
    if (!available.length) return;
    // Select neighbours in the same row instead of unrelated nearest targets.
    const row = available[0].row;
    available = available.filter(e => e.row === row).sort((a, b) => a.col - b.col);
    const kind = available[0].kind;
    const count = kind === "leader" ? 1 : stage === 1 ? 4 : Math.min(6, 4 + Math.floor(stage / 2));
    const squad = available.slice(0, count);
    const cx = squad.reduce((sum, e) => sum + e.x, 0) / squad.length;
    const cy = squad.reduce((sum, e) => sum + e.y, 0) / squad.length;
    const homeX = squad.reduce((sum, e) => sum + e.baseX, 0) / squad.length;
    const homeY = squad[0].baseY;
    const direction = groupAttackIndex % 2 ? 1 : -1;
    const target = clamp(ship.x, 100, W - 100);
    const sideX = clamp(target + direction * 65, 65, W - 65);
    const front = Math.max(homeY + 70, ship.y - 100);
    const rear = ship.y + 44;
    let route;
    if (kind === "leader") {
      // Pass beside the player, turn behind it, then fire upward on the return leg.
      const opposite = clamp(target - direction * 65, 45, W - 45);
      route = [
        [[cx, cy], [cx + direction * 60, cy - 25], [sideX, front - 100], [sideX, front]],
        [[sideX, front], [sideX, ship.y], [sideX, rear], [target, rear]],
        [[target, rear], [opposite, rear], [opposite, rear - 4], [opposite, ship.y + 24]],
        [[opposite, ship.y + 24], [opposite, front], [homeX - direction * 65, homeY + 60], [homeX, homeY]]
      ];
    } else {
      const pattern = (groupAttackIndex - 1) % 3;
      const middle = (cy + front) / 2;
      if (pattern === 0) {
        // S-shaped ribbon: several ships follow the same left/right bends.
        route = curvedRoute([[cx, cy], [85, cy + 65], [275, middle],
          [85, front - 45], [240, front + 30], [290, middle], [homeX, homeY]]);
      } else if (pattern === 1) {
        // Horizontal figure eight, then a sweeping return to the original row.
        const points = [[cx, cy], [W / 2, middle]];
        const radiusY = Math.min(95, Math.max(40, (front - cy) * .32));
        for (let i = 1; i <= 12; i++) {
          const t = i / 12 * Math.PI * 2;
          points.push([W / 2 + direction * 100 * Math.sin(t), middle + radiusY * Math.sin(2 * t)]);
        }
        points.push([homeX + direction * 60, homeY + 40], [homeX, homeY]);
        route = curvedRoute(points);
      } else {
        // Wide banked loop across the screen rather than a simple down-and-up dive.
        route = curvedRoute([[cx, cy], [65, middle], [110, front + 25],
          [270, front + 25], [295, middle], [220, cy + 30], [homeX, homeY]]);
      }
    }
    const pattern = (groupAttackIndex - 1) % 3;
    squad.forEach((enemy, index) => {
      enemy.dive = { age: kind === "leader" ? 0 : -index * .16,
        duration: kind === "leader" ? 6.2 : (stage === 1 ? 6.2 : 5.4) + (pattern === 1 ? 1.0 : 0),
        route, offsetX: enemy.x - cx, offsetY: enemy.y - cy, rearAttack: kind === "leader",
        ribbon: kind !== "leader",
        fireTimes: kind === "leader" ? (stage >= 10 ? [.18, .28, .68] : [.18, .28]) : [.34, .55],
        nextShot: 0 };
      enemy.shot = false;
    });
  }

  function enemyFire(enemy) {
    missileSound();
    const speed = stage === 1 ? 100 : 125 + stage * 4;
    const baseAngle = Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
    const angles = stage === 1 ? [0] : enemy.kind === "leader" ? [-0.3, -0.15, 0, 0.15, 0.3]
      : enemy.kind === "assault" ? [-0.16, 0, 0.16] : [0];
    angles.forEach(offset => {
      const angle = baseAngle + offset;
      enemyShots.push({ x: enemy.x, y: enemy.y + 6, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        r: enemy.kind === "leader" ? 3.2 : 2.5, color: enemy.kind === "leader" ? "#d28aff" : enemy.kind === "assault" ? "#ff675c" : "#f0c35b" });
    });
  }
  function bossFire() {
    if (!boss) return;
    missileSound();
    const spread = [-0.48, -0.24, 0, 0.24, 0.48];
    spread.forEach(offset => enemyShots.push({
      x: boss.x, y: boss.y + 17, vx: Math.sin(offset) * 155,
      vy: Math.cos(offset) * 155, r: 3.2, color: "#cf7bff"
    }));
  }

  function drawPixelMap(map, x, y, palette, cell, alpha = 1) {
    const width = map[0].length;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let row = 0; row < map.length; row++) {
      for (let col = 0; col < width; col++) {
        const n = Number(map[row][col]);
        if (n > 0) {
          ctx.fillStyle = palette[n - 1];
          ctx.fillRect(Math.round(x - width * cell / 2 + col * cell), Math.round(y - map.length * cell / 2 + row * cell), cell, cell);
        }
      }
    }
    ctx.restore();
  }
  function drawStars(dt = 0) {
    ctx.fillStyle = "#03060b";
    ctx.fillRect(0, 0, W, H);
    for (const star of stars) {
      star.phase += dt * 1.7;
      const alpha = 0.25 + (Math.sin(star.phase) + 1) * 0.2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = star.color;
      ctx.fillRect(Math.round(star.x), Math.round(star.y), star.size, star.size);
    }
    ctx.globalAlpha = 1;
  }
  function drawHud() {
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = "bold 13px ui-monospace, monospace";
    ctx.fillStyle = "#e54a52";
    ctx.fillText("1UP", 16, 13);
    ctx.fillStyle = "#e9edf2";
    ctx.fillText(String(score).padStart(6, "0"), 57, 13);
    ctx.textAlign = "right";
    ctx.fillStyle = "#aab3c1";
    ctx.fillText(`HI ${String(Math.max(highScore, score)).padStart(6, "0")}`, W - 16, 13);
    ctx.textAlign = "center";
    ctx.fillStyle = "#7c91ab";
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillText(`STAGE ${String(stage).padStart(2, "0")}`, W / 2, 32);
    for (let i = 0; i < lives; i++) {
      drawPixelMap(playerPixels, 22 + i * 17, 54, ["#e9edf2", "#72c9f2", "#3975c4", "#f45c53"], 0.72);
    }
    const soundX = W - 21;
    ctx.strokeStyle = soundEnabled ? "#8390a0" : "#444d59";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(soundX, 52, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = soundEnabled ? "#b2bdca" : "#5a626e";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(soundEnabled ? "♪" : "×", soundX, 52);
    if (state === "playing" || state === "paused") {
      const pauseX = W - 54;
      ctx.strokeStyle = "#94a7ba";
      ctx.beginPath(); ctx.arc(pauseX, 52, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#d9e7f2";
      if (state === "paused") {
        ctx.beginPath(); ctx.moveTo(pauseX - 3, 47); ctx.lineTo(pauseX + 5, 52); ctx.lineTo(pauseX - 3, 57); ctx.closePath(); ctx.fill();
      } else {
        ctx.fillRect(pauseX - 4, 47, 2.5, 10); ctx.fillRect(pauseX + 1.5, 47, 2.5, 10);
      }
    }
  }
  function drawEnemy(enemy) {
    if (!enemy.alive) return;
    const blink = enemy.flash > 0 && Math.floor(elapsed * 24) % 2 === 0;
    if (blink) return;
    const bob = enemy.dive || enemy.entry ? 0 : Math.sin(elapsed * 2) * 1.5;
    let map = scoutPixels;
    let palette = ["#f5c54a", "#1f4276", "#f9e7a2"];
    let cell = 1.65;
    if (enemy.kind === "assault") {
      map = assaultPixels;
      palette = ["#ed4b4e", "#254d83", "#d8e6f7"];
    } else if (enemy.kind === "leader") {
      map = leaderPixels;
      palette = ["#a85bd5", "#543886", "#75d9e9", "#ffe06b"];
      cell = 1.8;
    }
    ctx.save();
    ctx.translate(enemy.x, enemy.y + bob);
    ctx.rotate(enemy.angle || 0);
    drawPixelMap(map, 0, 0, palette, cell);
    ctx.restore();
    if (enemy.carrier) {
      ctx.fillStyle = "#fff1a3";
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y - 15);
      ctx.lineTo(enemy.x + 4, enemy.y - 11);
      ctx.lineTo(enemy.x, enemy.y - 7);
      ctx.lineTo(enemy.x - 4, enemy.y - 11);
      ctx.closePath();
      ctx.fill();
    }
    if (enemy.kind === "leader" && enemy.hp < enemy.maxHp) {
      ctx.fillStyle = "#59445f";
      ctx.fillRect(enemy.x - 7, enemy.y - 12, 14, 2);
      ctx.fillStyle = "#e2a7ff";
      ctx.fillRect(enemy.x - 7, enemy.y - 12, 14 * enemy.hp / enemy.maxHp, 2);
    }
  }
  function drawBoss() {
    if (!boss) return;
    if (!(boss.flash > 0 && Math.floor(elapsed * 24) % 2 === 0)) {
      drawPixelMap(bossPixels, boss.x, boss.y, ["#176e72", "#1c333d", "#e0ad4e", "#65e5dc"], 2.25);
    }
    const barW = 110;
    const y = 66;
    ctx.fillStyle = "#33424a";
    ctx.fillRect(W / 2 - barW / 2, y, barW, 5);
    ctx.fillStyle = "#d87957";
    ctx.fillRect(W / 2 - barW / 2, y, barW * boss.hp / boss.maxHp, 5);
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = "8px ui-monospace, monospace";
    ctx.fillStyle = "#c6d3d3";
    ctx.fillText("COMMANDER", W / 2, y - 2);
  }
  function drawShip() {
    if (ship.invulnerable > 0 && Math.floor(elapsed * 13) % 2 === 0) return;
    const map = weapon === 5 ? [
      "0000000011100000000", "0000000123210000000", "0010001234321000100",
      "0121012334332101210", "1232123334333212321", "1233233334333323321",
      "0123332334332333210", "0012333234323332100", "0001233323233321000",
      "0012232111112322100", "0122211000001122210", "0012100000000012100"
    ] : playerPixels;
    const palette = weapon === 5 ? ["#e5ffff", "#8667e9", "#247a9c", "#a1ffff"] : ["#e7efff", "#80d2f5", "#3975c4", "#e85355"];
    const cell = weapon >= 4 ? 2 : 1.9;
    if (weapon >= 3) {
      ctx.fillStyle = weapon >= 5 ? "rgba(120,94,255,.18)" : "rgba(74,190,245,.14)";
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, weapon >= 5 ? 26 : 21, 0, Math.PI * 2);
      ctx.fill();
    }
    drawPixelMap(map, ship.x, ship.y, palette, cell);
    if (weapon === 5) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "#83f9ff"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(ship.x, ship.y - 2, 9, 5, elapsed * 2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#efffff";
      ctx.beginPath(); ctx.arc(ship.x, ship.y - 2, 2.5 + Math.sin(elapsed * 8) * .5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  function drawPlasma(shot) {
    ctx.save();
    ctx.translate(shot.x, shot.y);
    ctx.globalCompositeOperation = "lighter";
    const phase = elapsed * 9 + shot.x * .03;
    if (shot.exploded) {
      const p = clamp(1 - shot.ttl / .16, 0, 1);
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = "#8bffff"; ctx.lineWidth = 3 * (1 - p) + .5;
      ctx.beginPath(); ctx.arc(0, 0, 10 + p * 44, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#b28aff";
      ctx.beginPath(); ctx.arc(0, 0, 6 + p * 30, 0, Math.PI * 2); ctx.stroke();
    } else {
      // Twin flowing energy trails, a bright core and counter-rotating containment rings.
      for (let trail = 0; trail < 9; trail++) {
        const y = trail * 7;
        ctx.globalAlpha = (1 - trail / 9) * .45;
        ctx.fillStyle = trail % 2 ? "#9067ff" : "#48edff";
        ctx.beginPath(); ctx.ellipse(Math.sin(phase - trail * .7) * trail * .7, y, Math.max(1, 9 - trail), 7, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = .2; ctx.fillStyle = "#6c72ff";
      ctx.beginPath(); ctx.ellipse(0, 0, 20, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = .55; ctx.fillStyle = "#26cfe9";
      ctx.beginPath(); ctx.ellipse(0, -2, 10, 15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = "#e2ffff";
      ctx.beginPath(); ctx.ellipse(0, -4, 3.5, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = "#8effff";
      ctx.beginPath(); ctx.ellipse(0, 0, 16, 7, phase, .2, Math.PI * 1.6); ctx.stroke();
      ctx.strokeStyle = "#b58bff";
      ctx.beginPath(); ctx.ellipse(0, 0, 18, 8, -phase, .2, Math.PI * 1.6); ctx.stroke();
      for (let side = -1; side <= 1; side += 2) {
        ctx.strokeStyle = side < 0 ? "#8bffff" : "#c2a0ff";
        ctx.beginPath(); ctx.moveTo(side * 4, -17);
        ctx.lineTo(side * (9 + Math.sin(phase) * 3), -8);
        ctx.lineTo(side * 6, -1); ctx.lineTo(side * 12, 7); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawShots() {
    for (const shot of playerShots) {
      if (shot.type === "laser") {
        ctx.fillStyle = "rgba(91,223,255,.23)";
        ctx.fillRect(shot.x - 6, shot.y - shot.length, 12, shot.length);
        ctx.fillStyle = "#b9f8ff";
        ctx.fillRect(shot.x - 2, shot.y - shot.length, 4, shot.length);
      } else if (shot.type === "plasma") {
        drawPlasma(shot);
      } else {
        ctx.fillStyle = shot.color;
        ctx.fillRect(Math.round(shot.x - 1.5), Math.round(shot.y - 5), 3, 9);
      }
    }
    for (const shot of enemyShots) {
      ctx.fillStyle = shot.color;
      ctx.fillRect(Math.round(shot.x - shot.r), Math.round(shot.y - shot.r), shot.r * 2, shot.r * 2);
    }
  }
  function drawItems() {
    for (const item of items) {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(Math.sin(elapsed * 5) * 0.08);
      ctx.fillStyle = "#f2c85c";
      ctx.fillRect(-8, -8, 16, 16);
      ctx.fillStyle = "#fff3b2";
      ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = "#263449";
      ctx.font = "bold 8px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(item.level), 0, 0);
      ctx.restore();
    }
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
  function drawControls() {
    // Top-down, horizontal-only red arcade joystick.
    ctx.save();
    ctx.fillStyle = "rgba(8,15,25,.9)";
    ctx.strokeStyle = "#53697b";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.x, joy.y, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#192733";
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(joy.x, joy.y + 2, 22, 13, 0, 0, Math.PI * 2); ctx.stroke();
    const knobX = clamp(joy.knobX, -19, 19);
    ctx.fillStyle = "#a62028";
    ctx.beginPath(); ctx.arc(joy.x + knobX, joy.y, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ed4149";
    ctx.beginPath(); ctx.arc(joy.x + knobX, joy.y - 2, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.68)";
    ctx.fillRect(joy.x + knobX - 5, joy.y - 9, 4, 3);
    ctx.restore();

    // Fixed-position fire button; press feedback changes only its depressed state.
    ctx.save();
    const pressScale = fireButton.pressed ? 0.91 : 1;
    ctx.translate(fireButton.x, fireButton.y);
    ctx.scale(pressScale, pressScale);
    ctx.fillStyle = "rgba(8,15,25,.93)";
    ctx.strokeStyle = "#53697b";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = fireButton.pressed ? "#951d29" : "#8c2029";
    ctx.beginPath(); ctx.arc(0, fireButton.pressed ? 2 : -1, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = fireButton.pressed ? "#d93542" : "#e9434c";
    ctx.beginPath(); ctx.arc(0, fireButton.pressed ? -1 : -4, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.56)";
    ctx.fillRect(-8, fireButton.pressed ? -13 : -16, 5, 3);
    ctx.restore();
  }
  function drawBanner() {
    if (bannerTime <= 0 || !banner) return;
    ctx.globalAlpha = Math.min(1, bannerTime * 2);
    ctx.fillStyle = "#e5eaf0";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 15px ui-monospace, monospace";
    ctx.fillText(banner, W / 2, H * 0.42);
    ctx.globalAlpha = 1;
  }
  function drawOverlay(title, subtitle, action) {
    ctx.fillStyle = "rgba(0,0,0,.7)";
    ctx.fillRect(26, H * 0.36, W - 52, 140);
    ctx.strokeStyle = "#33445a";
    ctx.lineWidth = 1;
    ctx.strokeRect(26.5, H * 0.36 + .5, W - 53, 139);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e5eaf0";
    ctx.font = "bold 19px ui-monospace, monospace";
    ctx.fillText(title, W / 2, H * 0.36 + 42);
    ctx.fillStyle = "#aab7c7";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(subtitle, W / 2, H * 0.36 + 73);
    ctx.fillStyle = "#e6c45f";
    ctx.font = "bold 12px ui-monospace, monospace";
    ctx.fillText(action, W / 2, H * 0.36 + 108);
  }

  function addExplosion(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), speed = rand(18, 72);
      particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: rand(.18, .48), maxLife: .48, size: rand(1.5, 3), color });
    }
  }
  function damageEnemy(enemy, amount = 1) {
    if (!enemy.alive) return;
    enemy.hp -= amount;
    enemy.flash = 0.12;
    if (enemy.hp > 0) impactSound(enemy.kind === "leader");
    if (enemy.hp <= 0) {
      enemy.alive = false;
      const points = enemy.kind === "leader" ? 250 : enemy.kind === "assault" ? 100 : 50;
      score += points + (enemy.dive ? 25 : 0);
      addExplosion(enemy.x, enemy.y, enemy.kind === "leader" ? "#bd78ed" : enemy.kind === "assault" ? "#f16b59" : "#e9c45a");
      explosionSound(enemy.kind);
      if (enemy.carrier) {
        items.push({ x: enemy.x, y: enemy.y + 8, vy: 105, level: Math.min(5, weapon + 1) });
      }
    }
  }
  function damageBoss(amount = 1) {
    if (!boss) return;
    boss.hp -= amount;
    boss.flash = .1;
    if (boss.hp > 0) impactSound(true);
    if (boss.hp <= 0) {
      score += 2500 + stage * 100;
      addExplosion(boss.x, boss.y, "#68dfd3", 28);
      explosionSound("boss");
      boss = null;
    }
  }
  function shootPlayer() {
    const speed = 300;
    if (weapon === 1) {
      playerShots.push({ x: ship.x, y: ship.y - 17, vy: -speed, type: "bullet", color: "#6de7ff", r: 3 });
    } else if (weapon === 2 || weapon === 3) {
      const offset = weapon === 2 ? 7 : 8;
      playerShots.push({ x: ship.x - offset, y: ship.y - 15, vy: -speed, type: "bullet", color: weapon === 3 ? "#a1f2ff" : "#6de7ff", r: 3 });
      playerShots.push({ x: ship.x + offset, y: ship.y - 15, vy: -speed, type: "bullet", color: weapon === 3 ? "#a1f2ff" : "#6de7ff", r: 3 });
    } else if (weapon === 4) {
      playerShots.push({ x: ship.x, y: ship.y - 14, vy: -speed * 1.3, type: "laser", length: H * .54, ttl: .2, hitIds: new Set() });
    } else {
      playerShots.push({ x: ship.x, y: ship.y - 16, vy: -250, type: "plasma", r: 7, ttl: 3 });
    }
    weaponSound(weapon);
  }
  function upgradeWeapon(level) {
    if (level <= weapon) return;
    weapon = level;
    const labels = ["", "기본탄", "쌍발탄", "기관포", "레이저", "플라즈마"];
    banner = `무기 업그레이드 · ${labels[weapon]}`;
    bannerTime = 1.7;
    score += 300;
    tone(660, .08, "square", .04);
    window.setTimeout(() => tone(880, .11, "square", .04), 70);
  }
  function loseLife() {
    if (ship.invulnerable > 0 || state !== "playing") return;
    lives -= 1;
    ship.vx = 0;
    ship.invulnerable = 1.5;
    ship.x = W / 2;
    enemyShots = [];
    addExplosion(ship.x, ship.y, "#8bd8f2", 14);
    explosionSound("player");
    playerImpactFeedback();
    if (lives <= 0) {
      state = "gameover";
      if (score > highScore) {
        highScore = score;
        writeNumber("ss-high", highScore);
      }
    }
  }

  function update(dt) {
    if (state !== "paused") screenShake = Math.max(0, screenShake - dt);
    if (state !== "playing") return;
    elapsed += dt;
    if (bannerTime > 0) bannerTime -= dt;
    if (fireButton.flash > 0) fireButton.flash -= dt;
    if (fireButton.pointer === null) fireButton.pressed = false;
    if (joy.pointer === null) joy.knobX = 0;
    if (state !== "playing") return;

    ship.invulnerable = Math.max(0, ship.invulnerable - dt);
    const keyboardAxis = (keys.has("ArrowRight") || keys.has("d") || keys.has("D") ? 1 : 0)
      - (keys.has("ArrowLeft") || keys.has("a") || keys.has("A") ? 1 : 0);
    const axis = Math.abs(keyboardAxis) > 0 ? keyboardAxis : joy.knobX / 19;
    // Input determines velocity in this frame; retain the existing top speed.
    const inputAxis = clamp(axis, -1, 1);
    ship.vx = Math.abs(inputAxis) < 0.08 ? 0 : inputAxis * 165;
    ship.x = clamp(ship.x + ship.vx * dt, 19, W - 19);
    if ((ship.x <= 19 && ship.vx < 0) || (ship.x >= W - 19 && ship.vx > 0)) ship.vx = 0;

    fireCooldown -= dt;
    const keyboardFire = keys.has(" ") || keys.has("Spacebar");
    if ((fireButton.pressed || keyboardFire) && fireCooldown <= 0) {
      shootPlayer();
      fireCooldown = weapon === 3 ? .18 : weapon === 4 ? .46 : weapon === 5 ? .62 : .38;
    }

    if (!bossStage) {
      attackCooldown -= dt;
      if (attackCooldown <= 0) {
        launchGroupAttack();
        attackCooldown = stage === 1 ? 5.0 : Math.max(2.4, 4.1 - stage * .08);
      }
    } else if (boss) {
      boss.age += dt;
      boss.x += boss.dir * (46 + stage * 2) * dt;
      if (boss.x > W - 56) { boss.x = W - 56; boss.dir = -1; }
      if (boss.x < 56) { boss.x = 56; boss.dir = 1; }
      boss.y = 108 + Math.sin(boss.age * 2.1) * 8;
      boss.shotTimer -= dt;
      if (boss.shotTimer <= 0) { bossFire(); boss.shotTimer = Math.max(.9, 1.65 - stage * .025); }
      boss.flash = Math.max(0, boss.flash - dt);
    }

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      const flight = enemy.entry || enemy.dive;
      if (!flight) {
        enemy.x = enemy.baseX + Math.sin(elapsed * .65) * 5;
        enemy.y = enemy.baseY + Math.sin(elapsed * 1.7) * 1.6;
        enemy.angle = 0;
      } else {
        flight.age += dt;
        if (flight.age < 0) continue;
        const p = clamp(flight.age / flight.duration, 0, 1);
        const position = flightPosition(flight, p);
        const ahead = flightPosition(flight, Math.min(1, p + 0.003));
        enemy.x = position.x;
        enemy.y = position.y;
        enemy.angle = Math.atan2(ahead.x - position.x, -(ahead.y - position.y));
        if (enemy.dive && flight.nextShot < flight.fireTimes.length && p >= flight.fireTimes[flight.nextShot]) {
          const rearVolley = flight.rearAttack && flight.nextShot === 2;
          // Early stages fire only with space in front; rear fire unlocks at stage 10.
          if (rearVolley ? stage >= 10 && enemy.y > ship.y + 12 : enemy.y < ship.y - 35) {
            enemyFire(enemy);
          }
          flight.nextShot += 1;
        }
        if (p >= 1) {
          enemy.entry = null; enemy.dive = null;
          enemy.x = enemy.baseX; enemy.y = enemy.baseY; enemy.angle = 0;
        }
      }
      if (ship.invulnerable <= 0 && distance(enemy.x, enemy.y, ship.x, ship.y) < 18) loseLife();
    }

    for (const shot of playerShots) {
      shot.y += shot.vy * dt;
      if (shot.type === "laser") shot.ttl -= dt;
      if (shot.type === "plasma") shot.ttl -= dt;
    }
    for (const shot of enemyShots) { shot.x += shot.vx * dt; shot.y += shot.vy * dt; }

    for (const shot of playerShots) {
      if (shot.type === "laser") {
        for (const enemy of enemies) {
          if (enemy.alive && !shot.hitIds.has(enemy.id) && Math.abs(enemy.x - shot.x) < 8 && enemy.y < shot.y && enemy.y > shot.y - shot.length) {
            shot.hitIds.add(enemy.id); damageEnemy(enemy, 1);
          }
        }
        if (boss && Math.abs(boss.x - shot.x) < 28 && boss.y < shot.y && boss.y > shot.y - shot.length && !shot.hitBoss) {
          shot.hitBoss = true; damageBoss(2);
        }
      } else if (shot.type === "plasma" && !shot.exploded) {
        const target = enemies.find(e => e.alive && distance(e.x, e.y, shot.x, shot.y) < 14);
        const bossHit = boss && distance(boss.x, boss.y, shot.x, shot.y) < 32;
        if (target || bossHit) {
          shot.exploded = true; shot.ttl = .16;
          addExplosion(shot.x, shot.y, "#82f8ff", 22);
          addExplosion(shot.x, shot.y, "#a68aff", 10);
          explosionSound("plasma");
          enemies.forEach(e => { if (e.alive && distance(e.x, e.y, shot.x, shot.y) < 44) damageEnemy(e, 2); });
          if (boss && distance(boss.x, boss.y, shot.x, shot.y) < 54) damageBoss(3);
        }
      } else if (shot.type === "bullet") {
        const target = enemies.find(e => e.alive && distance(e.x, e.y, shot.x, shot.y) < 12);
        if (target) { shot.dead = true; damageEnemy(target); }
        if (boss && distance(boss.x, boss.y, shot.x, shot.y) < 30) { shot.dead = true; damageBoss(1); }
      }
    }
    playerShots = playerShots.filter(s => !s.dead && s.y > -30 && (s.type !== "laser" || s.ttl > 0) && (s.type !== "plasma" || s.ttl > 0));

    if (ship.invulnerable <= 0) {
      for (const shot of enemyShots) {
        if (distance(shot.x, shot.y, ship.x, ship.y) < 15) { shot.dead = true; loseLife(); break; }
      }
    }
    enemyShots = enemyShots.filter(s => !s.dead && s.y < H + 15 && s.x > -15 && s.x < W + 15);

    for (const item of items) {
      item.y += item.vy * dt;
      if (distance(item.x, item.y, ship.x, ship.y) < 25) { item.caught = true; upgradeWeapon(item.level); }
    }
    items = items.filter(item => !item.caught && item.y < H + 12);

    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .985; p.vy *= .985; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);

    const remaining = enemies.some(e => e.alive);
    if (!remaining && !boss && items.length === 0) {
      stageClearTimer += dt;
      if (stageClearTimer > .85) { stage += 1; startStage(); }
    }
  }

  function render(dt) {
    ctx.save();
    if (screenShake > 0 && state !== "paused") {
      const strength = screenShake / .18 * 2;
      ctx.translate(Math.sin(screenShake * 170) * strength, Math.cos(screenShake * 145) * strength);
    }
    drawStars(dt);
    drawHud();
    enemies.forEach(drawEnemy);
    if (boss) drawBoss();
    drawShots();
    drawItems();
    drawParticles();
    drawShip();
    drawBanner();
    drawControls();
    if (state === "title") drawOverlay("STAR SQUADRON", "편대 공격을 돌파하고 무기를 강화하세요", "화면을 눌러 시작 · 좌우 조이스틱 / 발사 버튼");
    if (state === "gameover") drawOverlay("GAME OVER", `SCORE ${String(score).padStart(6, "0")}  ·  BEST ${String(highScore).padStart(6, "0")}`, "화면을 눌러 다시 시작");
    if (state === "paused") drawOverlay("PAUSED", "게임이 잠시 멈췄습니다", "이 안내창을 눌러 계속");
    ctx.restore();
  }

  function resetControls() {
    const captured = [joy.pointer, fireButton.pointer];
    joy.pointer = null; joy.knobX = 0;
    fireButton.pointer = null; fireButton.pressed = false;
    ship.vx = 0;
    keys.clear();
    for (const id of captured) {
      if (typeof id === "number") {
        try { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch (_) {}
      }
    }
  }
  function pauseGame() {
    if (state !== "playing") return;
    state = "paused";
    resetControls();
    stopSounds();
  }
  function resumeGame() {
    if (state !== "paused") return;
    resetControls();
    state = "playing";
    lastFrame = 0;
    initAudio();
  }
  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  }
  function soundHit(x, y) { return distance(x, y, W - 21, 52) < 15; }
  function pauseHit(x, y) { return distance(x, y, W - 54, 52) < 16; }
  function pointerDown(event) {
    if (useTouchInput && event.pointerType === "touch") return;
    event.preventDefault();
    const p = pointerPosition(event);
    if (soundHit(p.x, p.y)) { toggleSound(); return; }
    if ((state === "playing" || state === "paused") && pauseHit(p.x, p.y)) {
      if (state === "playing") pauseGame(); else resumeGame();
      return;
    }
    if (state === "paused") {
      if (p.x >= 26 && p.x <= W - 26 && p.y >= H * .36 && p.y <= H * .36 + 140) resumeGame();
      return;
    }
    if (state === "title" || state === "gameover") beginGame();
    if (state !== "playing") return;
    initAudio();
    if (distance(p.x, p.y, joy.x, joy.y) < 48 && joy.pointer === null) {
      joy.pointer = event.pointerId;
      joy.knobX = clamp(p.x - joy.x, -19, 19);
    } else if (distance(p.x, p.y, fireButton.x, fireButton.y) < 48 && fireButton.pointer === null) {
      fireButton.pointer = event.pointerId;
      fireButton.pressed = true;
      fireButton.flash = .12;
    } else return;
    if (typeof event.pointerId === "number") {
      try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
    }
  }
  function pointerMove(event) {
    if (useTouchInput && event.pointerType === "touch") return;
    if (joy.pointer !== event.pointerId) return;
    event.preventDefault();
    const p = pointerPosition(event);
    joy.knobX = clamp(p.x - joy.x, -19, 19);
  }
  function pointerUp(event) {
    if (useTouchInput && event.pointerType === "touch") return;
    if (joy.pointer === event.pointerId) { joy.pointer = null; joy.knobX = 0; ship.vx = 0; }
    if (fireButton.pointer === event.pointerId) { fireButton.pointer = null; fireButton.pressed = false; }
  }
  canvas.addEventListener("pointerdown", pointerDown);
  window.addEventListener("pointermove", pointerMove, { passive: false });
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("lostpointercapture", pointerUp);

  function touchPointer(touch, event) {
    return { pointerId: "touch-" + touch.identifier, clientX: touch.clientX, clientY: touch.clientY,
      preventDefault: () => event.preventDefault() };
  }
  function reconcileTouches(event) {
    const active = new Set(Array.from(event.touches, touch => "touch-" + touch.identifier));
    if (typeof joy.pointer === "string" && !active.has(joy.pointer)) {
      joy.pointer = null; joy.knobX = 0; ship.vx = 0;
    }
    if (typeof fireButton.pointer === "string" && !active.has(fireButton.pointer)) {
      fireButton.pointer = null; fireButton.pressed = false;
    }
  }
  if (useTouchInput) {
    canvas.addEventListener("touchstart", event => {
      event.preventDefault();
      reconcileTouches(event);
      for (const touch of event.changedTouches) pointerDown(touchPointer(touch, event));
    }, { passive: false });
    window.addEventListener("touchmove", event => {
      reconcileTouches(event);
      if (joy.pointer === null && fireButton.pointer === null) return;
      event.preventDefault();
      for (const touch of event.changedTouches) pointerMove(touchPointer(touch, event));
    }, { passive: false });
    const endTouches = event => {
      for (const touch of event.changedTouches) pointerUp(touchPointer(touch, event));
      reconcileTouches(event);
    };
    window.addEventListener("touchend", endTouches);
    window.addEventListener("touchcancel", endTouches);
  }
  window.addEventListener("keydown", event => {
    if (["ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
    if (event.key === "Enter") {
      if (state === "title" || state === "gameover") beginGame();
      else if (state === "paused") resumeGame();
    }
    if (!event.repeat && event.key.toLowerCase() === "m") toggleSound();
    if (!event.repeat && (event.key.toLowerCase() === "p" || event.key === "Escape")) {
      if (state === "playing") pauseGame(); else if (state === "paused") resumeGame();
    }
    if (state === "playing") keys.add(event.key);
  });
  window.addEventListener("keyup", event => keys.delete(event.key));
  window.addEventListener("blur", () => { pauseGame(); resetControls(); });
  window.addEventListener("pagehide", () => { pauseGame(); resetControls(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { pauseGame(); resetControls(); }
  });

  function frame(now) {
    const dt = Math.min(.045, lastFrame ? (now - lastFrame) / 1000 : .016);
    lastFrame = now;
    update(dt);
    render(state === "paused" ? 0 : dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
