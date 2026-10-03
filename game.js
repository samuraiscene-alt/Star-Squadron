"use strict";

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const W = 360;
  const FINAL_STAGE = 100;
  const WEAPON_EVENTS = { 10: 2, 20: 3, 30: 4, 40: 5 };
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
  let bursts = [];
  let respawnDelay = 0;
  let dualFighter = false;
  let captivePending = false;
  let captureAnimation = null;
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
  let attackCooldown = Math.max(2.8, 3.4 - (stage - 1) * .006);
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
    audioOutput.gain.value = .595;
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
      noiseVoice(machineGun ? .055 : .085, 4500, 1000, machineGun ? .1125 : .135, "bandpass");
      sweepVoice(machineGun ? 150 : 190, 55, .085, "triangle", .12);
      if (level === 2) noiseVoice(.055, 3200, 800, .075, "bandpass", .012);
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
    if (["boss", "battalion", "regiment", "division", "minister"].includes(kind)) {
      const tier = kind === "battalion" ? 1 : kind === "regiment" ? 2 : kind === "division" ? 3 : 4;
      const duration = [0, .85, 1.15, 1.6, 2.3][tier];
      noiseVoice(duration, 1800 + tier * 150, 65, .22 + tier * .035);
      sweepVoice(125 - tier * 10, 30 - tier, duration * .7, "sine", .22 + tier * .025);
      noiseVoice(duration * .6, 1200, 90, .14 + tier * .025, "lowpass", .15);
      sweepVoice(180, 32, duration * .5, "triangle", .13, .2);
      if (tier >= 3) noiseVoice(.65, 2700, 180, .1, "bandpass", .45);
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
    const hp = kind === "leader" ? 3 + Math.floor((stage - 1) / 35)
      : kind === "armored" ? 3 : kind === "phantom" ? 2 : kind === "elite" ? 4 : 1;
    return {
      id: `${stage}-${kind}-${col}-${row}-${Math.random().toString(36).slice(2, 7)}`,
      kind, col, row, baseX: x, baseY: y, x, y, hp, maxHp: hp,
      alive: true, dive: null, entry: null, angle: 0, flash: 0, carrier: false, shot: false,
      phase: rand(0, Math.PI * 2)
    };
  }
  function bossRank(round) {
    if (round === 100) return { kind: "minister", name: "국방부장관기", tier: 4, color: "#ff9475" };
    if (round === 50) return { kind: "division", name: "사단장기", tier: 3, color: "#e3b8ff" };
    if ([20, 40, 60, 80].includes(round)) return { kind: "regiment", name: "연대장기", tier: 2, color: "#7ee6ff" };
    if (round % 10 === 0) return { kind: "battalion", name: "대대장기", tier: 1, color: "#9cebd7" };
    return null;
  }
  function flightModes(round) {
    return 3 + (round >= 25 ? 1 : 0) + (round >= 45 ? 1 : 0) + (round >= 65 ? 1 : 0) + (round >= 85 ? 1 : 0);
  }
  function startStage() {
    enemies = [];
    playerShots = [];
    enemyShots = [];
    items = [];
    particles = [];
    bursts = [];
    boss = null;
    const rank = bossRank(stage);
    bossStage = Boolean(rank);
    stageClearTimer = 0;
    attackCooldown = Math.max(2.8, 3.4 - (stage - 1) * .006);
    groupAttackIndex = 0;
    const spacing = 41;
    const left = (W - spacing * 7) / 2;
    if (!bossStage) {
      for (let col = 0; col < 3; col++) {
        enemies.push(makeEnemy("leader", col, 0, W / 2 + (col - 1) * 72, 71));
      }
      for (let row = 1; row <= 2; row++) {
        for (let col = 0; col < 8; col++) {
          const kind = row === 1 && (stage >= 41 || stage >= 5 && col % 4 === 1) ? "armored"
            : row === 2 && (stage >= 21 || col % 3 === 1) ? "interceptor" : "assault";
          enemies.push(makeEnemy(kind, col, row, left + col * spacing, 106 + (row - 1) * 28));
        }
      }
      for (let row = 3; row <= 4; row++) {
        for (let col = 0; col < 8; col++) {
          enemies.push(makeEnemy(row === 3 && (stage >= 61 || stage >= 15 && col % 4 === 2) ? "phantom" : row === 4 && stage >= 81 ? "elite" : "scout", col, row, left + col * spacing, 170 + (row - 3) * 28));
        }
      }
      const captor = enemies.find(e => e.kind === "leader" && e.col === 0);
      captor.role = "captor";
      captor.carrying = captivePending;
      captor.beamCooldown = captivePending ? 99 : 3.2;
      captor.beam = null;
      captor.escape = null;
      // Bonus carriers are separate from the four scheduled weapon upgrades.
      if (stage % 7 === 0) {
        const carrier = enemies.find(e => e.kind === "leader" && e.col === 1);
        if (carrier) carrier.carrier = "life";
      } else if (stage < 40 && stage % 5 === 0) {
        const carrier = enemies.find(e => e.row === 3 && e.col === 3);
        if (carrier) carrier.carrier = "score";
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
          e.entry = { age: -row * 0.18, duration: 2.0, route, offsetX: e.baseX - centerX, offsetY: 0,
            fireTimes: stage >= 30 ? [.26 + e.col * .035, .58 + e.col * .025] : [.3 + e.col * .055], nextShot: 0 };
          const p = flightPosition(e.entry, 0);
          e.x = p.x; e.y = p.y;
        });
      }
      banner = `STAGE ${stage}`;
      bannerTime = 1.3;
    } else {
      const hp = Math.round([0, 28, 66, 108, 190][rank.tier] + stage * .6);
      boss = {
        ...rank, x: W / 2, y: 120, hp, maxHp: hp, hitRadius: 27 + rank.tier * 4,
        dir: 1, shotTimer: 1.6, flash: 0, age: 0, volley: 0
      };
      banner = `${stage}판 · ${rank.name}`;
      bannerTime = 2;
    }
  }
  function beginGame() {
    resetControls();
    stopSounds();
    screenShake = 0;
    respawnDelay = 0;
    dualFighter = false; captivePending = false; captureAnimation = null;
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
    if (enemies.some(e => e.alive && (e.entry || e.dive || e.beam || e.escape))) return;
    const order = ["leader", "scout", "interceptor", "assault", "leader", "armored", "phantom", "elite", "scout"];
    let available = [];
    for (let attempt = 0; attempt < order.length; attempt++) {
      const kind = order[groupAttackIndex++ % order.length];
      available = enemies.filter(e => e.alive && !e.entry && !e.dive && e.kind === kind && (e.role !== "captor" || e.carrying || dualFighter || captivePending || lives <= 1));
      if (available.length) break;
    }
    if (!available.length) return;
    // Select neighbours in the same row instead of unrelated nearest targets.
    const row = available[0].row;
    available = available.filter(e => e.row === row).sort((a, b) => a.col - b.col);
    const kind = available[0].kind;
    const count = kind === "leader" ? 2 : Math.min(6, 4 + Math.floor((stage - 1) / 25));
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
      const pattern = (groupAttackIndex - 1) % flightModes(stage);
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
      } else if (pattern >= 3) {
        const points = [[cx, cy]];
        for (let i = 0; i <= 12; i++) {
          const t = i / 12, angle = t * Math.PI * (pattern === 4 ? 4 : 3);
          const radius = pattern === 3 ? 105 * (1 - .45 * t) : 95;
          const px = pattern === 5 ? W / 2 + 95 * Math.sin(t * Math.PI * 4)
            : pattern === 6 ? W / 2 + 90 * Math.sin(angle) * Math.cos(t * Math.PI)
            : W / 2 + direction * radius * Math.cos(angle);
          const py = pattern >= 5 ? cy + 40 + (front - cy - 40) * t
            : middle + Math.min(80, (front - cy) * .3) * Math.sin(angle);
          points.push([px, py]);
        }
        points.push([homeX + direction * 60, homeY + 45], [homeX, homeY]);
        route = curvedRoute(points);
      } else {
        // Wide banked loop across the screen rather than a simple down-and-up dive.
        route = curvedRoute([[cx, cy], [65, middle], [110, front + 25],
          [270, front + 25], [295, middle], [220, cy + 30], [homeX, homeY]]);
      }
    }
    const pattern = (groupAttackIndex - 1) % flightModes(stage);
    squad.forEach((enemy, index) => {
      enemy.dive = { age: kind === "leader" ? 0 : -index * .16,
        duration: enemy.carrying ? 3.6 : Math.max(4.7, 6.2 - (stage - 1) * .015) + (pattern === 1 || pattern >= 3 ? 1 : 0),
        route, offsetX: enemy.x - cx, offsetY: enemy.y - cy, rearAttack: kind === "leader",
        ribbon: kind !== "leader",
        fireTimes: kind === "leader" ? (stage >= 10 ? [.18, .28, .68] : [.18, .28]) : stage >= 60 ? [.24, .42, .62] : [.34, .55],
        nextShot: 0 };
      enemy.shot = false;
    });
  }

  function captureFighter(enemy) {
    if (dualFighter || captivePending || ship.invulnerable > 0 || lives <= 1 || respawnDelay > 0) return;
    captureAnimation = { x: ship.x, y: ship.y, toX: enemy.x, toY: enemy.y + 26, age: 0 };
    captivePending = true; enemy.carrying = true;
    lives -= 1; respawnDelay = 1.1; ship.invulnerable = 2.6;
    enemyShots = []; resetControls(); ship.x = W / 2;
    banner = "기체 납치! 보라색 특수기를 격추해서 구출하세요"; bannerTime = 3;
    sweepVoice(780, 150, .65, "sine", .075, 0, 25);
  }
  function updateCaptor(enemy, dt) {
    if (enemy.escape) {
      enemy.escape.age += dt; enemy.y -= 360 * dt; enemy.x += Math.sin(enemy.escape.age * 8) * 80 * dt;
      if (enemy.y < -55) { enemy.alive = false; captivePending = true; }
      return true;
    }
    if (enemy.carrying && !enemies.some(e => e.alive && e !== enemy)) {
      enemy.entry = null; enemy.dive = null; enemy.beam = null; enemy.escape = { age: 0 };
      banner = "납치범 도주 · 다음 일반 판에서 구출 재도전"; bannerTime = 2;
      return true;
    }
    if (enemy.beam) {
      const b = enemy.beam; b.age += dt; enemy.angle = Math.PI;
      if (b.phase === "approach") {
        const t = clamp(b.age / 1, 0, 1);
        enemy.x = b.fromX + (b.x - b.fromX) * t;
        enemy.y = b.fromY + (b.y - b.fromY) * t;
        if (t >= 1) { b.phase = "warning"; b.age = 0; }
      } else if (b.phase === "warning") {
        if (b.age >= .8) { b.phase = "active"; b.age = 0; sweepVoice(220, 440, .6, "sine", .04, 0, 18); }
      } else if (b.phase === "active") {
        if (Math.abs(ship.x - enemy.x) < 36 && ship.y > enemy.y + 35 && ship.y < enemy.y + 210) captureFighter(enemy);
        if (enemy.carrying || b.age >= 2.1) { b.phase = "return"; b.age = 0; b.fromX = enemy.x; b.fromY = enemy.y; }
      } else {
        const t = clamp(b.age / .85, 0, 1);
        enemy.x = b.fromX + (enemy.baseX - b.fromX) * t;
        enemy.y = b.fromY + (enemy.baseY - b.fromY) * t;
        if (t >= 1) { enemy.beam = null; enemy.beamCooldown = 6.5; }
      }
      return true;
    }
    if (enemy.entry || enemy.dive || enemy.carrying || dualFighter || captivePending || lives <= 1) return false;
    enemy.beamCooldown -= dt;
    if (enemy.beamCooldown <= 0 && !enemies.some(e => e.alive && (e.entry || e.dive || e.beam))) {
      enemy.beam = { phase: "approach", age: 0, fromX: enemy.x, fromY: enemy.y,
        x: clamp(ship.x, 55, W - 55), y: Math.max(230, ship.y - 180) };
      banner = "납치 빔 접근 · 좌우로 피하거나 특수기를 격추!"; bannerTime = 2;
      return true;
    }
    return false;
  }
  function drawCaptureBeams() {
    for (const enemy of enemies) {
      if (!enemy.alive || !enemy.beam || !["warning", "active"].includes(enemy.beam.phase)) continue;
      const active = enemy.beam.phase === "active";
      ctx.save(); ctx.translate(enemy.x, enemy.y + 14);
      const glow = ctx.createLinearGradient(0, 0, 0, 200);
      glow.addColorStop(0, active ? "rgba(148,100,255,.32)" : "rgba(148,100,255,.05)");
      glow.addColorStop(1, active ? "rgba(78,231,255,.15)" : "rgba(78,231,255,.03)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-42, 196); ctx.lineTo(42, 196); ctx.lineTo(8, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = active ? "#7de9ff" : "#b6a0df"; ctx.lineWidth = active ? 1.5 : 1;
      ctx.globalAlpha = active ? .65 : .22 + .15 * Math.sin(elapsed * 16);
      for (let i = 0; i < 12; i++) {
        const y = ((i * 17 + elapsed * (active ? -65 : 20)) % 196 + 196) % 196;
        const w = 8 + y * .17;
        ctx.beginPath(); ctx.ellipse(0, y, w, 4 + y * .018, 0, 0, Math.PI); ctx.stroke();
      }
      ctx.restore();
    }
    if (captureAnimation) {
      const a = captureAnimation, t = clamp(a.age / .7, 0, 1);
      drawCraft("player", a.x + (a.toX - a.x) * t, a.y + (a.toY - a.y) * t, t * Math.PI * 4, weapon);
    }
  }

  function pushEnemyShot(x, y, angle, speed, color, type = "straight", radius = 2.5) {
    enemyShots.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      baseAngle: angle, speed, age: 0, type, r: radius, color });
  }
  function enemyFire(enemy) {
    missileSound();
    const speed = 100 + (stage - 1) * 1.15;
    const baseAngle = Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
    const heavy = ["assault", "armored", "elite"].includes(enemy.kind);
    const angles = stage < 20 ? [0] : enemy.kind === "leader" ? [-.24, 0, .24]
      : heavy ? [-.13, 0, .13] : [0];
    const type = stage >= 65 && ["phantom", "elite"].includes(enemy.kind) ? "homing"
      : stage >= 8 && ["interceptor", "armored"].includes(enemy.kind) ? "wave" : "straight";
    angles.forEach(offset => pushEnemyShot(enemy.x, enemy.y + 6, baseAngle + offset, speed,
      type === "homing" ? "#9cfde2" : type === "wave" ? "#74cfff" : enemy.kind === "leader" ? "#d28aff" : heavy ? "#ff675c" : "#f0c35b", type));
  }
  function bossFire() {
    if (!boss) return;
    missileSound();
    const speed = 105 + stage * .8;
    const tier = boss.tier;
    boss.volley += 1;
    const aim = Math.atan2(ship.y - boss.y, ship.x - boss.x);
    const count = 2 * tier + 1;
    const centered = boss.volley % 2 === 0 ? aim : Math.PI / 2;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * .14;
      pushEnemyShot(boss.x, boss.y + 20, centered + offset, speed, boss.color,
        tier >= 3 && boss.volley % 3 === 0 ? "wave" : "straight", 3);
    }
    if (tier === 4 && boss.volley % 4 === 0) {
      for (const side of [-1, 1]) pushEnemyShot(boss.x + side * 22, boss.y, aim + side * .3, speed * .8, "#ffda8a", "homing", 3);
    }
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
    ctx.fillText(`STAGE ${String(stage).padStart(3, "0")} / 100`, W / 2, 32);
    for (let i = 0; i < Math.min(lives, 5); i++) {
      drawCraft("player", 22 + i * 17, 54, 0, 1, true);
    }
    if (lives > 5) { ctx.textAlign = "left"; ctx.fillStyle = "#b7d7ec"; ctx.font = "10px ui-monospace, monospace"; ctx.fillText("×" + lives, 110, 49); }
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
  const craftArtwork = new Map();
  function craftImage(kind, level = 1) {
    const key = kind + "-" + level;
    if (craftArtwork.has(key)) return craftArtwork.get(key);
    const art = document.createElement("canvas");
    art.width = art.height = kind === "boss" ? 256 : 224;
    const paint = art.getContext("2d");
    paint.translate(art.width / 2, art.height / 2);
    paint.scale(4, 4);
    paint.lineJoin = "round";
    const colors = kind === "scout" ? ["#80601e", "#fff0a4", "#dba640"]
      : kind === "assault" ? ["#692b38", "#ffbac0", "#dc4a5d"]
      : kind === "leader" ? ["#452b68", "#e2c4ff", "#9c63dd"]
      : kind === "interceptor" ? ["#194b68", "#b8f7ff", "#469ddb"]
      : kind === "armored" ? ["#31465b", "#ecf3ff", "#8095a9"]
      : kind === "phantom" ? ["#1d5f53", "#adffdf", "#45b99d"]
      : kind === "elite" ? ["#742b27", "#ffe2a8", "#e8774e"]
      : kind === "boss" ? (level === 4 ? ["#6b292c", "#ffe4c1", "#d36d52"]
        : level === 3 ? ["#42325e", "#f0d4ff", "#9370bd"]
        : level === 2 ? ["#213e68", "#c8f7ff", "#5494bc"] : ["#193a4c", "#b0f7eb", "#388c8b"])
      : level === 5 ? ["#263b67", "#e2efff", "#977ae9"] : ["#233c62", "#eef8ff", "#5f9bd0"];
    const metal = paint.createLinearGradient(-17, -15, 16, 18);
    metal.addColorStop(0, colors[1]); metal.addColorStop(.35, colors[2]); metal.addColorStop(1, colors[0]);
    const hull = paint.createLinearGradient(-5, -20, 8, 18);
    hull.addColorStop(0, "#f5fcff"); hull.addColorStop(.35, colors[2]); hull.addColorStop(1, colors[0]);
    function panel(points, fill = metal, stroke = "#152739", width = .65) {
      paint.beginPath(); paint.moveTo(points[0][0], points[0][1]);
      for (const point of points.slice(1)) paint.lineTo(point[0], point[1]);
      paint.closePath(); paint.fillStyle = fill; paint.fill();
      if (stroke) { paint.strokeStyle = stroke; paint.lineWidth = width; paint.stroke(); }
    }
    function line(points, color = "rgba(225,250,255,.5)", width = .5) {
      paint.beginPath(); paint.moveTo(points[0][0], points[0][1]);
      for (const point of points.slice(1)) paint.lineTo(point[0], point[1]);
      paint.strokeStyle = color; paint.lineWidth = width; paint.stroke();
    }
    function glass(x, y, w, h) {
      const gradient = paint.createLinearGradient(x - w, y - h, x + w, y + h);
      gradient.addColorStop(0, "#efffff"); gradient.addColorStop(.28, "#70e4ff");
      gradient.addColorStop(.65, "#2470a3"); gradient.addColorStop(1, "#102b4c");
      paint.beginPath(); paint.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
      paint.fillStyle = gradient; paint.fill(); paint.strokeStyle = "#d2f9ff"; paint.lineWidth = .5; paint.stroke();
      line([[x - w * .4, y - h * .5], [x - w * .4, y + h * .2]], "#ffffff", .55);
    }
    function vent(x, y, count = 3) {
      paint.fillStyle = "#132635";
      for (let i = 0; i < count; i++) paint.fillRect(x, y + i * 1.5, 3, .7);
    }
    if (kind === "player") {
      for (const side of [-1, 1]) {
        panel([[side * 4, -6], [side * 18, 5], [side * 20, 13], [side * 8, 10], [side * 5, 16]], metal);
        panel([[side * 7, 0], [side * 15, 6], [side * 13, 9], [side * 7, 7]], "#346992");
        line([[side * 5, -4], [side * 17, 6], [side * 18, 11]]);
        vent(side < 0 ? -14 : 11, 6);
        panel([[side * 4, 8], [side * 8, 8], [side * 9, 17], [side * 4, 17]], "#23465f");
        paint.fillStyle = "#96f6ff"; paint.fillRect(side * 6 - 1, 15, 2, 2);
        if (level >= 2) {
          panel([[side * 11 - 1.4, -8], [side * 11 + 1.4, -8], [side * 11 + 1.8, 7], [side * 11 - 1.8, 7]], level >= 3 ? "#b4d2e6" : "#698faa");
          paint.fillStyle = "#142b40"; paint.fillRect(side * 11 - .9, -9, 1.8, 3);
          if (level >= 3) {
            line([[side * 13, -5], [side * 13, 5]], "#b8ebff", 1.1);
            panel([[side * 8, 4], [side * 17, 7], [side * 17, 13], [side * 8, 11]], "#477cb0");
          }
        }
      }
      panel([[0, -19], [4, -10], [5, 9], [2, 15], [-2, 15], [-5, 9], [-4, -10]], hull);
      glass(0, -5, 2.6, 5);
      line([[0, -17], [0, -12]], "#ffffff", .7);
      panel([[-3, 9], [3, 9], [2, 14], [-2, 14]], "#214359");
      paint.fillStyle = "#e57064"; paint.fillRect(-1.2, 6, 2.4, 2);
      if (level === 4) {
        panel([[-2, -22], [2, -22], [2.6, -12], [-2.6, -12]], "#9bd4e5");
        paint.fillStyle = "#b8ffff"; paint.fillRect(-1, -23, 2, 3);
      }
      if (level === 5) {
        for (const side of [-1, 1]) {
          panel([[side * 8, -4], [side * 20, -10], [side * 21, 7], [side * 15, 12], [side * 8, 6]], metal);
          line([[side * 18, -7], [side * 18, 6]], "#98f6ff", 1);
          glass(side * 14, 1, 1.6, 3);
        }
        paint.fillStyle = "#25315e"; paint.beginPath(); paint.arc(0, 1, 5.5, 0, Math.PI * 2); paint.fill();
        glass(0, 1, 3.5, 3.5);
      }
    } else if (kind === "boss") {
      for (const side of [-1, 1]) {
        panel([[side * 6, -9], [side * 23, -14], [side * 29, -5], [side * 27, 13], [side * 15, 18], [side * 8, 9]], metal);
        panel([[side * 13, -8], [side * 24, -9], [side * 23, 4], [side * 13, 7]], "#264658");
        line([[side * 10, -7], [side * 25, -11], [side * 27, -4]], "#bbffed", .7);
        vent(side < 0 ? -22 : 19, -4, 5);
        panel([[side * 21 - 2, 2], [side * 21 + 2, 2], [side * 21 + 2, 20], [side * 21 - 2, 20]], "#497882");
        paint.fillStyle = "#bafeee"; paint.fillRect(side * 21 - 1, 18, 2, 2);
        glass(side * 12, 0, 2.2, 4);
      }
      panel([[0, -21], [8, -11], [10, 8], [5, 17], [-5, 17], [-10, 8], [-8, -11]], hull);
      glass(0, -8, 4, 6);
      panel([[-6, 4], [6, 4], [5, 11], [-5, 11]], "#263e4b");
      paint.fillStyle = "#edbf66"; paint.beginPath(); paint.arc(0, 6, 3, 0, Math.PI * 2); paint.fill();
      line([[-5, -16], [0, -20], [5, -16]], "#f8e4a8", .9);
      for (let i = 1; i < level; i++) {
        for (const side of [-1, 1]) {
          const x = side * (8 + i * 5);
          paint.fillStyle = "#26344b"; paint.fillRect(x - 1.5, 9, 3, 12);
          paint.fillStyle = level === 4 ? "#ffbe8d" : "#b6f3ff"; paint.fillRect(x - .8, 18, 1.6, 3);
        }
      }
      if (level >= 3) {
        paint.strokeStyle = level === 4 ? "#ffc38f" : "#dec2ff"; paint.lineWidth = 1;
        paint.beginPath(); paint.arc(0, 6, 5, 0, Math.PI * 2); paint.stroke();
      }
    } else {
      const wide = ["leader", "armored", "elite"].includes(kind);
      const red = ["assault", "interceptor"].includes(kind);
      for (const side of [-1, 1]) {
        const wing = wide ? 21 : red ? 19 : 18;
        panel([[side * 3, -7], [side * (wing - 4), -12], [side * wing, -2],
          [side * (wing - 1), 11], [side * 9, 8], [side * 4, 12]], metal);
        panel([[side * 7, -5], [side * (wing - 3), -7], [side * (wing - 3), 3], [side * 8, 5]], "#233b59");
        line([[side * 4, -7], [side * (wing - 5), -10], [side * (wing - 1), -2]]);
        vent(side < 0 ? -(wing - 4) : wing - 7, -3);
        panel([[side * 10 - 1, 5], [side * 10 + 1, 5], [side * 10 + 1, 13], [side * 10 - 1, 13]], colors[0]);
        paint.fillStyle = wide ? "#b9f8ff" : red ? "#ffc5b9" : "#fff0a7";
        paint.fillRect(side * 10 - .7, 11, 1.4, 2);
        if (wide) glass(side * 13, -1, 1.7, 3);
      }
      panel([[0, -17], [5, -8], [6, 8], [2, 13], [-2, 13], [-6, 8], [-5, -8]], hull);
      glass(0, -5, wide ? 3 : 2.4, 4);
      line([[-2, 3], [0, 7], [2, 3]], colors[1], .6);
      paint.fillStyle = colors[0]; paint.fillRect(-2, 8, 4, 3);
      if (wide) {
        paint.strokeStyle = "#f5d684"; paint.lineWidth = .7;
        paint.beginPath(); paint.arc(0, 3, 4, 0, Math.PI * 2); paint.stroke();
      }
    }
    craftArtwork.set(key, art);
    return art;
  }
  function drawCraft(kind, x, y, angle = 0, level = 1, miniature = false) {
    const art = craftImage(kind, level);
    const size = miniature ? .32 : kind === "scout" ? .64 : kind === "assault" ? .69
      : kind === "leader" ? .75 : kind === "boss" ? .84 + level * .08
      : kind === "interceptor" ? .65 : kind === "armored" ? .74 : kind === "phantom" ? .66 : kind === "elite" ? .77 : level >= 4 ? .88 : .82;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(size, size);
    ctx.imageSmoothingEnabled = true;
    if (!miniature) {
      const exhaust = kind === "boss" ? [ -16, 16 ] : kind === "player" ? [-6, 6] : [-10, 10];
      const flicker = 1 + Math.sin(elapsed * 22 + x * .1) * .18;
      ctx.globalCompositeOperation = "lighter";
      for (const nozzle of exhaust) {
        const glow = ctx.createRadialGradient(nozzle, 17, .5, nozzle, 18, 7);
        glow.addColorStop(0, "rgba(170,250,255,.65)");
        glow.addColorStop(.5, "rgba(65,145,245,.22)"); glow.addColorStop(1, "rgba(30,100,240,0)");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(nozzle, 18, 4, 7 * flicker, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }
    const logicalSize = art.width / 4;
    ctx.drawImage(art, -logicalSize / 2, -logicalSize / 2, logicalSize, logicalSize);
    if (kind === "player" && level === 5 && !miniature) {
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "#8af8ff"; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.ellipse(0, 1, 6, 3, elapsed * 2, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  function drawEnemy(enemy) {
    if (!enemy.alive) return;
    const blink = enemy.flash > 0 && Math.floor(elapsed * 24) % 2 === 0;
    if (blink) return;
    const bob = enemy.dive || enemy.entry ? 0 : Math.sin(elapsed * 2) * 1.5;
    drawCraft(enemy.role === "captor" ? "phantom" : enemy.kind, enemy.x, enemy.y + bob, enemy.angle || 0);
    if (enemy.role === "captor") {
      ctx.strokeStyle = "#d6a9ff"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(enemy.x, enemy.y, 18, 12, elapsed * 1.5, 0, Math.PI * 2); ctx.stroke();
      if (enemy.carrying && !captureAnimation) drawCraft("player", enemy.x, enemy.y + 26, Math.PI, weapon, true);
    }
    if (enemy.carrier) {
      ctx.fillStyle = enemy.carrier === "life" ? "#92ecff" : "#fff1a3";
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
      drawCraft("boss", boss.x, boss.y, Math.PI, boss.tier);
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
    ctx.fillText(boss.name, W / 2, y - 2);
  }
  function drawShip() {
    if (respawnDelay > 0 || lives <= 0 || (ship.invulnerable > 0 && Math.floor(elapsed * 13) % 2 === 0)) return;
    for (const x of fighterCenters()) drawCraft("player", x, ship.y, 0, weapon);
    if (dualFighter) {
      ctx.strokeStyle = "#a5e8ff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ship.x - 6, ship.y + 5); ctx.lineTo(ship.x + 6, ship.y + 5); ctx.stroke();
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
      ctx.save(); ctx.translate(shot.x, shot.y);
      ctx.rotate(Math.atan2(shot.vy, shot.vx) - Math.PI / 2);
      ctx.fillStyle = shot.color;
      if (shot.type === "homing") {
        ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(shot.r, -4); ctx.lineTo(0, -2); ctx.lineTo(-shot.r, -4); ctx.closePath(); ctx.fill();
      } else if (shot.type === "wave") {
        ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(3, 0); ctx.lineTo(0, -4); ctx.lineTo(-3, 0); ctx.closePath(); ctx.fill();
      } else ctx.fillRect(-shot.r, -shot.r, shot.r * 2, shot.r * 2);
      ctx.restore();
    }
  }
  function drawItems() {
    for (const item of items) {
      ctx.save(); ctx.translate(item.x, item.y);
      ctx.rotate(Math.sin(elapsed * 5) * .08);
      ctx.fillStyle = ["life", "rescue"].includes(item.type) ? "#213c60" : item.type === "weapon" ? "#9f7730" : "#745820";
      ctx.strokeStyle = ["life", "rescue"].includes(item.type) ? "#8ce7ff" : "#fce199";
      ctx.lineWidth = 1;
      ctx.fillRect(-11, -11, 22, 22); ctx.strokeRect(-11, -11, 22, 22);
      if (["life", "rescue"].includes(item.type)) drawCraft("player", 0, 0, 0, 1, true);
      else {
        ctx.fillStyle = "#fff1ae"; ctx.font = "bold 10px ui-monospace, monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(item.type === "weapon" ? String(item.level) : "★", 0, 0);
      }
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
  function cinematicExplosion(x, y, kind) {
    const profile = {
      player: { duration: .8, radius: 34, color: "#8feeff" },
      battalion: { duration: 1.0, radius: 46, color: "#ffe0a2" },
      regiment: { duration: 1.35, radius: 62, color: "#8ceeff" },
      division: { duration: 1.7, radius: 80, color: "#d3a9ff" },
      minister: { duration: 2.3, radius: 105, color: "#ff9b6d" }
    }[kind];
    bursts.push({ x, y, kind, age: 0, ...profile });
    explosionSound(kind);
    const count = kind === "player" ? 24 : kind === "minister" ? 72 : 44;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + rand(-.1, .1);
      const speed = rand(45, profile.radius * 2);
      const life = rand(profile.duration * .4, profile.duration);
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life, maxLife: life, size: rand(1, 3), color: i % 3 ? profile.color : "#fff7dd" });
    }
    if (kind !== "player") screenShake = Math.max(screenShake, .18);
  }
  function updateEffects(dt) {
    for (const burst of bursts) burst.age += dt;
    bursts = bursts.filter(burst => burst.age < burst.duration);
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 1.2); p.vy *= Math.exp(-dt * 1.2); p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);
  }
  function drawBursts() {
    for (const burst of bursts) {
      const progress = clamp(burst.age / burst.duration, 0, 1);
      const radius = 5 + burst.radius * Math.pow(progress, .55);
      ctx.save(); ctx.translate(burst.x, burst.y);
      // Expanding hot core, debris shockwave and delayed secondary blasts.
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, radius);
      glow.addColorStop(0, "rgba(255,255,235," + ((1 - progress) * .9) + ")");
      glow.addColorStop(.25, "rgba(255,190,90," + ((1 - progress) * .65) + ")");
      glow.addColorStop(.65, "rgba(255,80,30," + ((1 - progress) * .3) + ")");
      glow.addColorStop(1, "rgba(255,70,25,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.pow(1 - progress, 1.4);
      ctx.strokeStyle = burst.color; ctx.lineWidth = 2.5 * (1 - progress) + .5;
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "#fff6d8"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, radius * .64, 0, Math.PI * 2); ctx.stroke();
      if (burst.kind !== "player") {
        for (let i = 0; i < (burst.kind === "minister" ? 6 : 3); i++) {
          const delay = .1 + i * .1;
          const phase = clamp((burst.age - delay) / .4, 0, 1);
          if (phase <= 0 || phase >= 1) continue;
          const angle = i * 2.4;
          const x = Math.cos(angle) * burst.radius * .32, y = Math.sin(angle) * burst.radius * .24;
          ctx.globalAlpha = (1 - phase) * .8;
          ctx.fillStyle = i % 2 ? burst.color : "#fff7cd";
          ctx.beginPath(); ctx.arc(x, y, 3 + phase * burst.radius * .2, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
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
      if (enemy.carrying) {
        enemy.carrying = false; captivePending = false;
        items.push({ x: enemy.x, y: enemy.y + 26, vy: 95, type: "rescue" });
        banner = "기체 구출! 내려오는 기체를 받아주세요"; bannerTime = 2;
      }
      if (enemy.carrier) {
        items.push({ x: enemy.x, y: enemy.y + 8, vy: 75, type: enemy.carrier });
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
      cinematicExplosion(boss.x, boss.y, boss.kind);
      enemyShots = [];
      playerShots = [];
      const nextWeapon = WEAPON_EVENTS[stage];
      if (nextWeapon) items.push({ x: boss.x, y: boss.y + 12, vy: 75, type: "weapon", level: nextWeapon });
      if (stage > 40 && stage < 100 && stage % 20 === 0) items.push({ x: boss.x - 28, y: boss.y + 12, vy: 70, type: "life" });
      boss = null;
    }
  }
  function fighterCenters() { return dualFighter ? [ship.x - 16, ship.x + 16] : [ship.x]; }
  function playerDistance(x, y) { return Math.min(...fighterCenters().map(cx => distance(x, y, cx, ship.y))); }
  function shootPlayer() {
    for (const x of fighterCenters()) shootPlayerAt(x);
    weaponSound(weapon);
  }
  function shootPlayerAt(x) {
    const speed = 300;
    if (weapon === 1) {
      playerShots.push({ x: x, y: ship.y - 17, vy: -speed, type: "bullet", color: "#6de7ff", r: 3 });
    } else if (weapon === 2 || weapon === 3) {
      const offset = weapon === 2 ? 7 : 8;
      playerShots.push({ x: x - offset, y: ship.y - 15, vy: -speed, type: "bullet", color: weapon === 3 ? "#a1f2ff" : "#6de7ff", r: 3 });
      playerShots.push({ x: x + offset, y: ship.y - 15, vy: -speed, type: "bullet", color: weapon === 3 ? "#a1f2ff" : "#6de7ff", r: 3 });
    } else if (weapon === 4) {
      playerShots.push({ x: x, y: ship.y - 14, vy: -speed * 1.3, type: "laser", length: H * .54, ttl: .2, hitIds: new Set() });
    } else {
      playerShots.push({ x: x, y: ship.y - 16, vy: -250, type: "plasma", r: 7, ttl: 3 });
    }
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
  function loseLife(impactX = ship.x) {
    if (ship.invulnerable > 0 || state !== "playing") return;
    if (dualFighter) {
      cinematicExplosion(ship.x + (impactX < ship.x ? -16 : 16), ship.y, "player");
      dualFighter = false; ship.invulnerable = 1.5;
      enemyShots = []; playerImpactFeedback();
      banner = "기체 1대 손실 · 단독 비행"; bannerTime = 1.5;
      return;
    }
    lives -= 1;
    const hitX = ship.x, hitY = ship.y;
    ship.vx = 0;
    ship.invulnerable = 2.2;
    respawnDelay = .8;
    enemyShots = [];
    cinematicExplosion(hitX, hitY, "player");
    ship.x = W / 2;
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
    if (state === "paused") return;
    screenShake = Math.max(0, screenShake - dt);
    updateEffects(dt);
    if (captureAnimation) {
      captureAnimation.age += dt;
      if (captureAnimation.age >= .7) captureAnimation = null;
    }
    if (state !== "playing") return;
    elapsed += dt;
    if (bannerTime > 0) bannerTime -= dt;
    if (fireButton.flash > 0) fireButton.flash -= dt;
    if (fireButton.pointer === null) fireButton.pressed = false;
    if (joy.pointer === null) joy.knobX = 0;
    if (state !== "playing") return;

    ship.invulnerable = Math.max(0, ship.invulnerable - dt);
    respawnDelay = Math.max(0, respawnDelay - dt);
    const keyboardAxis = (keys.has("ArrowRight") || keys.has("d") || keys.has("D") ? 1 : 0)
      - (keys.has("ArrowLeft") || keys.has("a") || keys.has("A") ? 1 : 0);
    const axis = Math.abs(keyboardAxis) > 0 ? keyboardAxis : joy.knobX / 19;
    // Input determines velocity in this frame; retain the existing top speed.
    const inputAxis = clamp(axis, -1, 1);
    ship.vx = respawnDelay > 0 || Math.abs(inputAxis) < 0.08 ? 0 : inputAxis * 165;
    ship.x = clamp(ship.x + ship.vx * dt, dualFighter ? 35 : 19, W - (dualFighter ? 35 : 19));
    if ((ship.x <= 19 && ship.vx < 0) || (ship.x >= W - 19 && ship.vx > 0)) ship.vx = 0;

    fireCooldown -= dt;
    const keyboardFire = keys.has(" ") || keys.has("Spacebar");
    if (respawnDelay <= 0 && (fireButton.pressed || keyboardFire) && fireCooldown <= 0) {
      shootPlayer();
      fireCooldown = weapon === 3 ? .18 : weapon === 4 ? .46 : weapon === 5 ? .62 : .38;
    }

    if (!bossStage) {
      attackCooldown -= dt;
      if (attackCooldown <= 0) {
        launchGroupAttack();
        attackCooldown = Math.max(2.1, 5.0 - (stage - 1) * .029);
      }
    } else if (boss) {
      boss.age += dt;
      boss.x += boss.dir * (38 + stage * .48) * dt;
      if (boss.x > W - 56) { boss.x = W - 56; boss.dir = -1; }
      if (boss.x < 56) { boss.x = 56; boss.dir = 1; }
      boss.y = 120 + Math.sin(boss.age * (1.1 + boss.tier * .15)) * (6 + boss.tier * 3);
      boss.shotTimer -= dt;
      if (boss.shotTimer <= 0) { bossFire(); boss.shotTimer = Math.max(.7, 1.8 - stage * .006 - boss.tier * .13); }
      boss.flash = Math.max(0, boss.flash - dt);
    }

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      if (enemy.role === "captor" && updateCaptor(enemy, dt)) continue;
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
        if (enemy.entry && flight.nextShot < flight.fireTimes.length && p >= flight.fireTimes[flight.nextShot]) {
          // Every entrant has a staggered volley, away from the player's rear.
          if (enemy.x > 12 && enemy.x < W - 12 && enemy.y < ship.y - 100) {
            enemyFire(enemy); flight.nextShot += 1;
          }
        }
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
      if (ship.invulnerable <= 0 && playerDistance(enemy.x, enemy.y) < 18) loseLife(enemy.x);
    }

    for (const shot of playerShots) {
      shot.y += shot.vy * dt;
      if (shot.type === "laser") shot.ttl -= dt;
      if (shot.type === "plasma") shot.ttl -= dt;
    }
    for (const shot of enemyShots) {
      shot.age += dt;
      if (shot.type === "wave") {
        const angle = shot.baseAngle + Math.sin(shot.age * 5) * .22;
        shot.vx = Math.cos(angle) * shot.speed; shot.vy = Math.sin(angle) * shot.speed;
      } else if (shot.type === "homing" && shot.age < 1.15) {
        const target = Math.atan2(ship.y - shot.y, ship.x - shot.x);
        const current = Math.atan2(shot.vy, shot.vx);
        const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
        const angle = current + clamp(difference, -dt * .65, dt * .65);
        shot.vx = Math.cos(angle) * shot.speed; shot.vy = Math.sin(angle) * shot.speed;
      }
      shot.x += shot.vx * dt; shot.y += shot.vy * dt;
    }

    for (const shot of playerShots) {
      if (shot.type === "laser") {
        for (const enemy of enemies) {
          if (enemy.alive && !shot.hitIds.has(enemy.id) && Math.abs(enemy.x - shot.x) < 8 && enemy.y < shot.y && enemy.y > shot.y - shot.length) {
            shot.hitIds.add(enemy.id); damageEnemy(enemy, 1);
          }
        }
        if (boss && Math.abs(boss.x - shot.x) < boss.hitRadius && boss.y < shot.y && boss.y > shot.y - shot.length && !shot.hitBoss) {
          shot.hitBoss = true; damageBoss(2);
        }
      } else if (shot.type === "plasma" && !shot.exploded) {
        const target = enemies.find(e => e.alive && distance(e.x, e.y, shot.x, shot.y) < 14);
        const bossHit = boss && distance(boss.x, boss.y, shot.x, shot.y) < boss.hitRadius;
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
        if (boss && distance(boss.x, boss.y, shot.x, shot.y) < boss.hitRadius) { shot.dead = true; damageBoss(1); }
      }
    }
    playerShots = playerShots.filter(s => !s.dead && s.y > -30 && (s.type !== "laser" || s.ttl > 0) && (s.type !== "plasma" || s.ttl > 0));

    if (ship.invulnerable <= 0) {
      for (const shot of enemyShots) {
        if (playerDistance(shot.x, shot.y) < 15) { shot.dead = true; loseLife(shot.x); break; }
      }
    }
    enemyShots = enemyShots.filter(s => !s.dead && s.y < H + 15 && s.x > -15 && s.x < W + 15);

    for (const item of items) {
      item.y += item.vy * dt;
      if (respawnDelay <= 0 && distance(item.x, item.y, ship.x, ship.y) < 25) {
        item.caught = true;
        if (item.type === "rescue") {
          captivePending = false; dualFighter = true; ship.invulnerable = 1.5;
          ship.x = clamp(ship.x, 35, W - 35);
          banner = "구출 성공 · 듀얼 파이터!"; bannerTime = 2;
          sweepVoice(330, 990, .4, "triangle", .06);
        } else if (item.type === "weapon") upgradeWeapon(item.level);
        else if (item.type === "life") { lives += 1; banner = "보너스 기체 · 생명 +1"; bannerTime = 2; tone(1040, .16, "sine", .06); }
        else { score += 500; banner = "보너스 점수 +500"; bannerTime = 1.7; tone(760, .12, "sine", .05); }
      }
    }
    for (const item of items) if (!item.caught && item.type === "rescue" && item.y >= H + 12) captivePending = true;
    items = items.filter(item => !item.caught && item.y < H + 12);

    if (state !== "playing") return;
    const remaining = enemies.some(e => e.alive);
    if (!remaining && !boss && items.length === 0 && bursts.length === 0) {
      stageClearTimer += dt;
      if (stageClearTimer > 1) {
        if (stage >= FINAL_STAGE) {
          state = "victory"; resetControls();
          if (score > highScore) { highScore = score; writeNumber("ss-high", highScore); }
        } else { stage += 1; startStage(); }
      }
    } else stageClearTimer = 0;
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
    drawCaptureBeams();
    drawParticles();
    drawBursts();
    drawShip();
    drawBanner();
    drawControls();
    if (state === "title") drawOverlay("STAR SQUADRON", "편대 공격을 돌파하고 무기를 강화하세요", "화면을 눌러 시작 · 좌우 조이스틱 / 발사 버튼");
    if (state === "victory") drawOverlay("MISSION COMPLETE", `100판 클리어 · SCORE ${score}`, "화면을 눌러 처음부터");
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
    if (state === "title" || state === "gameover" || state === "victory") beginGame();
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
      if (state === "title" || state === "gameover" || state === "victory") beginGame();
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
