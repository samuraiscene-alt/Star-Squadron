"use strict";

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const W = 360;
  const FINAL_STAGE = 100;
  const WEAPON_EVENTS = { 10: 2, 20: 3, 30: 4, 40: 5 };
  const cinema = window.SquadronCinema;
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
  let continueDeadline = 0;
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
  let specialAmmo = [];
  let specialShots = [];
  let specialFields = [];
  let specialCooldown = 0;
  const specialButton = { x: W / 2, y: 0 };
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
  let audioUnlockElement = null;
  let audioNeedsReset = false;
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
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    scale = width / W;
    H = height / scale;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ship.y = H - 160;
    joy.x = 65;
    joy.y = H - 75;
    fireButton.x = W - 65;
    fireButton.y = H - 75;
    specialButton.y = H - 32;
    stars = Array.from({ length: 64 }, () => ({
      x: rand(4, W - 4), y: rand(0, H), size: Math.random() < 0.8 ? 1.5 : 2.2,
      color: ["#758599", "#5875a3", "#8b7770"][Math.floor(Math.random() * 3)],
      phase: rand(0, 7)
    }));
  }
  window.addEventListener("resize", resize);
  resize();
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);

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
      unlockAudioRoute();
      if (audioContext && (audioNeedsReset || audioContext.state === "interrupted")) {
        stopAudioSources();
        const oldContext = audioContext;
        audioContext = null; audioOutput = null; noiseBuffer = null;
        const closed = oldContext.close();
        if (closed && closed.catch) closed.catch(() => {});
      }
      audioNeedsReset = false;
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
  function unlockAudioRoute() {
    if (document.hidden) return;
    if (!audioUnlockElement) {
      audioUnlockElement = document.createElement("audio");
      audioUnlockElement.src = "./audio-unlock-v16.wav";
      audioUnlockElement.preload = "auto";
      audioUnlockElement.loop = true;
      audioUnlockElement.setAttribute("playsinline", "");
    }
    if (audioUnlockElement.paused) {
      const playing = audioUnlockElement.play();
      if (playing && playing.catch) playing.catch(() => {});
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
  function stopAudioSources() {
    for (const source of activeSoundSources) { try { source.stop(); } catch (_) {} }
    activeSoundSources.clear();
  }
  function stopSounds() {
    stopAudioSources();
    if (audioUnlockElement) { try { audioUnlockElement.pause(); } catch (_) {} }
  }
  function playerImpactFeedback() {
    screenShake = .18;
    try { if (typeof navigator.vibrate === "function") navigator.vibrate(35); } catch (_) {}
  }
  function toggleSound() {
    soundEnabled = !soundEnabled;
    writeNumber("ss-sound", soundEnabled ? 1 : 0);
    if (soundEnabled) { audioNeedsReset = true; initAudio(true); }
    else stopSounds();
  }

  function makeEnemy(kind, col, row, x, y) {
    const hp = kind === "leader" ? 3 + Math.floor((stage - 1) / 35)
      : kind === "armored" ? 2 + Math.min(3, Math.floor((stage - 6) / 25))
      : kind === "shield" ? 3 + Math.floor((stage - 16) / 30)
      : kind === "heavy" ? 4 + Math.floor((stage - 21) / 25)
      : kind === "phantom" ? 2 + Math.floor((stage - 15) / 35)
      : kind === "elite" ? 5 + Math.floor((stage - 81) / 10) : 1;
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
    specialShots = []; specialFields = [];
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
          const kind = row === 1 && stage >= 16 && (col % 4 === 2 || stage >= 51 && col % 4 === 0) ? "shield"
            : row === 2 && stage >= 21 && (col % 4 === 0 || stage >= 61 && col % 4 === 2) ? "heavy"
            : row === 1 && stage >= 6 && (stage >= 41 || col % 4 === 1) ? "armored"
            : row === 2 && stage >= 11 && (stage >= 21 || col % 3 === 1) ? "interceptor" : "assault";
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
      // Entry wings fire through one designated shooter each.
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
            fireTimes: [1, 3, 2, 4, 0].slice(0, combatDifficulty().shooters).includes(row) && e.col === (row % 2 ? 2 : 0) ? (stage >= 30 ? [.36, .64] : [.42]) : [], nextShot: 0 };
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
        dir: 1, shotTimer: 1.6, flash: 0, age: 0, volley: 0,
        growth: Math.floor((stage - 1) / 20), escortTimer: 2.5, pending: []
      };
      banner = `${stage}판 · ${rank.name}`;
      bannerTime = 2;
    }
  }
  function beginGame() {
    specialAmmo = []; specialShots = []; specialFields = []; specialCooldown = 0;
    if (cinema) cinema.hide();
    resetControls();
    stopSounds();
    screenShake = 0;
    respawnDelay = 0;
    dualFighter = false; captivePending = false; captureAnimation = null;
    continueDeadline = 0;
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
  function combatDifficulty() {
    const maxFlying = stage <= 5 ? 3 : stage <= 15 ? 5 : stage < 30 ? 8 : stage <= 50 ? 12 : stage <= 80 ? 15 : 18;
    const shooters = stage <= 15 ? 1 : stage <= 50 ? 2 : stage <= 80 ? 3 : stage <= 90 ? 4 : 5;
    return { maxFlying, shooters, wings: stage <= 5 ? 1 : stage < 30 ? 2 : 3,
      interval: stage <= 5 ? 4 : stage <= 15 ? 3.5 : stage < 30 ? 3 : Math.max(2.1, 5 - (stage - 1) * .029),
      flightDuration: stage <= 5 ? 8 : stage <= 15 ? 7.5 : stage < 30 ? 7 : Math.max(4.7, 6.2 - (stage - 1) * .015),
      missileSpeed: stage < 30 ? 75 + (stage - 1) * 2 : 100 + (stage - 1) * 1.15 };
  }
  function launchGroupAttack() {
    // Several wings fly at once; only a small shared pool may fire missiles.
    for (let wing = 0; wing < combatDifficulty().wings; wing++) launchFlightWing();
  }
  function launchFlightWing() {
    if (enemies.some(e => e.alive && (e.entry || (stage < 30 && e.beam)))) return;
    const active = enemies.filter(e => e.alive && e.dive);
    const maxFlying = combatDifficulty().maxFlying;
    if (active.length >= maxFlying) return;
    const order = ["leader", "scout", "interceptor", "shield", "assault", "heavy", "armored", "phantom", "elite", "scout"];
    let available = [];
    for (let attempt = 0; attempt < order.length; attempt++) {
      const kind = order[groupAttackIndex++ % order.length];
      available = enemies.filter(e => e.alive && !e.entry && !e.dive && !e.beam && !e.escape && e.kind === kind && (e.role !== "captor" || e.carrying || dualFighter || captivePending || lives <= 1));
      if (available.length) break;
    }
    if (!available.length) return;
    // Select neighbours in the same row instead of unrelated nearest targets.
    const row = available[0].row;
    available = available.filter(e => e.row === row).sort((a, b) => a.col - b.col);
    const kind = available[0].kind;
    const count = kind === "leader" ? 2 : Math.min(6, 4 + Math.floor((stage - 1) / 25));
    const squad = available.slice(0, Math.min(count, maxFlying - active.length));
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
    if (kind !== "leader") {
      if (direction < 0) {
        route = route.map(segment => segment.map(([x, y]) => [W - x, y]));
        route[0][0] = [cx, cy];
        route[route.length - 1][3] = [homeX, homeY];
      }
      const flank = groupAttackIndex % 3;
      const gate = flank === 0 ? [-24, cy + 85] : flank === 1 ? [W + 24, cy + 85] : [W / 2, -25];
      const bank = flank === 0 ? -65 : flank === 1 ? W + 65 : W / 2;
      const lead = [[cx, cy], [bank, flank === 2 ? -55 : cy - 35], [bank, flank === 2 ? -55 : cy + 60], gate];
      route[0][0] = gate;
      route.unshift(lead);
    }
    // Alternate looping returns with a bottom exit and a separate top re-entry.
    // Separate Bezier segments leave no visible line through the playfield.
    const wrapReturn = kind !== "leader" && groupAttackIndex % 2 === 0;
    if (wrapReturn) {
      const exitX = clamp(target + direction * 45, 45, W - 45);
      const gate = route[1][0];
      const attack = curvedRoute([gate, [sideX, front - 90], [exitX, ship.y + 60], [exitX, H + 70]]);
      const arrival = curvedRoute([[exitX, -70], [homeX + direction * 45, homeY - 35], [homeX, homeY]]);
      route = [route[0], ...attack, ...arrival];
    }
    const pattern = (groupAttackIndex - 1) % flightModes(stage);
    const shooterLimit = combatDifficulty().shooters;
    const shooterSlots = Math.max(0, shooterLimit - active.filter(e => e.dive.fireTimes.length > 0).length);
    squad.forEach((enemy, index) => {
      enemy.dive = { age: kind === "leader" ? 0 : -index * .16,
        duration: (enemy.carrying ? (stage < 30 ? 6 : 3.6) : combatDifficulty().flightDuration + (pattern === 1 || pattern >= 3 ? 1 : 0)) * (kind === "interceptor" ? .78 : kind === "heavy" ? 1.2 : 1),
        route, wrapReturn, offsetX: enemy.x - cx, offsetY: enemy.y - cy, rearAttack: kind === "leader",
        ribbon: kind !== "leader",
        fireTimes: index >= shooterSlots ? [] : stage <= 5 ? [.34] : kind === "leader" ? (stage >= 10 ? [.18, .28, .68] : [.18, .28]) : stage >= 60 ? [.24, .42, .62] : [.34, .55],
        nextShot: 0 };
      enemy.shot = false;
    });
  }

  function captureFighter(enemy) {
    if (dualFighter || captivePending || ship.invulnerable > 0 || lives <= 1 || respawnDelay > 0) return;
    captureAnimation = { x: ship.x, y: ship.y, enemy, age: 0, duration: 1.1 };
    captivePending = true; enemy.carrying = true;
    const previousLives = lives;
    lives -= 1; respawnDelay = 1.5; ship.invulnerable = 2.6;
    enemyShots = []; resetControls(); ship.x = W / 2;
    banner = `기체 납치 · 생명 ${previousLives}→${lives} · 구출하세요`; bannerTime = 3;
    sweepVoice(780, 150, .65, "sine", .075, 0, 25);
  }
  function updateCaptor(enemy, dt) {
    if (enemy.blind > 0 && enemy.beam && enemy.beam.phase !== "return" && !enemy.carrying) {
      enemy.beam = { phase: "return", age: 0, fromX: enemy.x, fromY: enemy.y }; enemy.beamCooldown = 3;
    }
    if (enemy.escape) {
      enemy.escape.age += dt; enemy.y -= 360 * dt; enemy.x += Math.sin(enemy.escape.age * 8) * 80 * dt;
      if (enemy.y < -55) { enemy.alive = false; captivePending = true; }
      return true;
    }
    if (enemy.carrying && !captureAnimation && !enemies.some(e => e.alive && e !== enemy)) {
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
        if (enemy.carrying) { b.phase = "lifting"; b.age = 0; }
        else if (b.age >= 2.1) { b.phase = "return"; b.age = 0; b.fromX = enemy.x; b.fromY = enemy.y; }
      } else if (b.phase === "lifting") {
        // Keep the beam and captor still until the captured fighter is docked.
        if (!captureAnimation) { b.phase = "return"; b.age = 0; b.fromX = enemy.x; b.fromY = enemy.y; }
      } else {
        const t = clamp(b.age / .85, 0, 1);
        enemy.x = b.fromX + (enemy.baseX - b.fromX) * t;
        enemy.y = b.fromY + (enemy.baseY - b.fromY) * t;
        if (t >= 1) { enemy.beam = null; enemy.beamCooldown = stage < 30 ? 12 : 6.5; }
      }
      return true;
    }
    if (enemy.entry || enemy.dive || enemy.carrying || dualFighter || captivePending || lives <= 1) return false;
    enemy.beamCooldown -= dt;
    if (!(enemy.blind > 0) && enemy.beamCooldown <= 0 && !enemies.some(e => e.alive && (e.entry || e.beam || (stage < 30 && e.dive)))) {
      enemy.beam = { phase: "approach", age: 0, fromX: enemy.x, fromY: enemy.y,
        x: clamp(ship.x, 55, W - 55), y: Math.max(230, ship.y - 180) };
      banner = "납치 빔 접근 · 좌우로 피하거나 특수기를 격추!"; bannerTime = 2;
      return true;
    }
    return false;
  }
  function capturedFighterPosition(animation) {
    const t = clamp(animation.age / animation.duration, 0, 1);
    const vertical = t * t * (3 - 2 * t);
    const centerT = clamp(t / .3, 0, 1);
    const horizontal = centerT * centerT * (3 - 2 * centerT);
    return { x: animation.x + (animation.enemy.x - animation.x) * horizontal,
      y: animation.y + (animation.enemy.y + 32 - animation.y) * vertical };
  }
  function drawCaptureBeams() {
    for (const enemy of enemies) {
      if (!enemy.alive || !enemy.beam || !["warning", "active", "lifting"].includes(enemy.beam.phase)) continue;
      const active = enemy.beam.phase !== "warning";
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
      const position = capturedFighterPosition(captureAnimation);
      const t = clamp(captureAnimation.age / captureAnimation.duration, 0, 1);
      const spin = Math.PI * 4 * (1 - Math.pow(1 - t, 1.5));
      drawCraft("player", position.x, position.y, spin, weapon);
    }
  }

  function pushEnemyShot(x, y, angle, speed, color, type = "straight", radius = 2.5) {
    enemyShots.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      baseAngle: angle, speed, age: 0, type, r: radius, color });
  }
  function updateEnemyShot(shot, dt) {
    shot.age += dt;
    if (shot.type === "wave") {
      const angle = shot.baseAngle + Math.sin(shot.age * 5) * .22;
      shot.vx = Math.cos(angle) * shot.speed; shot.vy = Math.sin(angle) * shot.speed;
    } else if (shot.type === "homing") {
      // Tracking ends permanently at the player's line or after seven seconds.
      if (shot.y >= ship.y - 8 || shot.age >= 7 || shot.vy <= 0) shot.guidanceEnded = true;
      if (!shot.guidanceEnded) {
        const target = Math.atan2(ship.y - shot.y, ship.x - shot.x);
        const current = Math.atan2(shot.vy, shot.vx);
        const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
        // Downward-only heading and limited turn rate prevent a return attack.
        const angle = clamp(current + clamp(difference, -dt * .45, dt * .45), .35, Math.PI - .35);
        shot.vx = Math.cos(angle) * shot.speed; shot.vy = Math.sin(angle) * shot.speed;
      }
    }
    shot.x += shot.vx * dt; shot.y += shot.vy * dt;
    if (shot.type === "homing" && shot.y >= ship.y - 8) shot.guidanceEnded = true;
  }
  function enemyFire(enemy) {
    missileSound();
    const speed = combatDifficulty().missileSpeed;
    const baseAngle = enemy.blind > 0 ? Math.PI / 2 : Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
    const heavy = ["assault", "armored", "elite", "heavy", "shield"].includes(enemy.kind);
    // A narrow twin volley widens the attack without filling the screen.
    const guided = !(enemy.blind > 0) && stage >= 31 && enemy.y < ship.y - 100 &&
      (["phantom", "elite"].includes(enemy.kind) || enemy.kind === "armored" && enemy.col % 4 === 1);
    const twin = stage >= 11 && (heavy || enemy.kind === "leader");
    const type = guided ? "homing" : twin ? "spread" : "straight";
    const offsets = guided ? [0] : twin ? [-.08, .08] : [0];
    offsets.forEach((offset, i) => pushEnemyShot(enemy.x + (twin && !guided ? (i ? 4 : -4) : 0), enemy.y + 6,
      baseAngle + offset, guided ? Math.min(135, speed * .72) : speed,
      guided ? "#9cfde2" : twin ? "#ff9565" : enemy.kind === "leader" ? "#d28aff" : "#f0c35b", type));
  }
  function bossFire() {
    if (!boss) return;
    missileSound();
    const speed = Math.min(185, 100 + stage * .75);
    const tier = boss.tier, growth = boss.growth || 0;
    boss.volley += 1;
    const aim = boss.blind > 0 ? Math.PI / 2 : Math.atan2(ship.y - boss.y, ship.x - boss.x);
    const phase = boss.hp / boss.maxHp < .45 ? 1 : 0;
    const fire = (x, angles, type = "spread") => angles.forEach(angle => pushEnemyShot(x, boss.y + 24, angle, speed, boss.color, type, 3));
    if (tier === 1) {
      fire(boss.x, [aim - .08, aim + .08]);
      (boss.pending ||= []).push({ delay: .4, count: 1 + Math.min(2, growth) });
    } else if (tier === 2) {
      const side = boss.volley % 2 ? -1 : 1;
      for (const bank of [side, -side]) fire(boss.x + bank * 25, [aim - .08, aim + .08]);
      if (growth >= 2) (boss.pending ||= []).push({ delay: .5, count: 1 });
    } else if (tier === 3) {
      fire(boss.x, [-2, -1, 0, 1, 2].map(i => aim + i * .10));
    } else {
      for (const side of [-1, 1]) fire(boss.x + side * 32, [-1, 0, 1].map(i => Math.PI / 2 - side * (phase ? .28 : .16) + i * .09));
      if (phase) (boss.pending ||= []).push({ delay: .45, count: 2 });
    }
    if (!(boss.blind > 0) && (tier >= 3 || growth >= 3) && boss.volley % 3 === 0)
      pushEnemyShot(boss.x, boss.y + 24, aim, Math.min(125, speed * .68), "#9cfde2", "homing", 3);
  }

  function spawnEscorts() {
    if (!boss || boss.tier < 2) return;
    const active = enemies.filter(e => e.alive && e.escort);
    for (let slot = 0; slot < 2; slot++) {
      if (active.some(e => e.slot === slot)) continue;
      const e = makeEnemy(boss.tier >= 3 ? "armored" : "interceptor", slot, 0, boss.x, boss.y + 15);
      e.escort = true; e.slot = slot; e.flightAge = 0; e.shotTimer = 2 + slot * .7;
      e.hp = e.maxHp = boss.tier >= 3 ? 3 + Math.floor((boss.growth || 0) / 2) : 2;
      enemies.push(e);
    }
  }
  function updateEscort(e, dt) {
    if (!boss) { e.alive = false; return; }
    e.flightAge += dt; const side = e.slot ? 1 : -1;
    const cycle = (e.flightAge + e.slot * 2) % 7;
    const launch = clamp(e.flightAge / 1.1, 0, 1);
    e.x = boss.x + side * (18 + launch * 25);
    e.y = boss.y + 18 + launch * 55;
    if (e.flightAge > 2 && cycle > 3) {
      const t = (cycle - 3) / 4;
      e.x += side * Math.sin(t * Math.PI * 2) * 65;
      e.y += Math.sin(t * Math.PI) * Math.max(50, ship.y - boss.y - 140);
    }
    e.angle = Math.PI; e.shotTimer -= dt;
    if (e.shotTimer <= 0) { enemyFire(e); e.shotTimer = Math.max(1.6, 3.5 - stage * .015); }
    if (ship.invulnerable <= 0 && playerDistance(e.x, e.y) < 18) loseLife(e.x);
  }

  function fireSpecial() {
    if (state !== "playing" || respawnDelay > 0 || specialCooldown > 0 || !specialAmmo.length) return;
    const type = specialAmmo.shift(); specialCooldown = .5;
    specialShots.push({ x: ship.x, y: ship.y - 20, targetY: Math.max(150, ship.y - 230), type });
    sweepVoice(280, 740, .2, "sine", .05);
  }
  function specialBurst(shot) {
    specialFields.push({ x: shot.x, y: shot.y, type: shot.type, radius: shot.type === "emp" ? 78 : 85,
      age: 0, duration: shot.type === "emp" ? .65 : 3 });
    sweepVoice(shot.type === "emp" ? 1200 : 650, 130, .35, "triangle", .06);
  }
  function updateSpecials(dt) {
    specialCooldown = Math.max(0, specialCooldown - dt);
    for (const shot of specialShots) {
      shot.y -= 230 * dt;
      if (shot.y <= shot.targetY || enemies.some(e => e.alive && distance(e.x, e.y, shot.x, shot.y) < 22) ||
        boss && distance(boss.x, boss.y, shot.x, shot.y) < boss.hitRadius) { specialBurst(shot); shot.dead = true; }
    }
    specialShots = specialShots.filter(s => !s.dead);
    for (const field of specialFields) {
      const first = field.age === 0; field.age += dt;
      if (field.type === "emp" && !first) continue;
      for (const e of [...enemies, ...(boss ? [boss] : [])]) {
        if (e.alive === false || distance(e.x, e.y, field.x, field.y) > field.radius) continue;
        if (e === boss && field.bossApplied) continue;
        if (field.type === "emp") e.stun = Math.max(e.stun || 0, e === boss ? .5 : 2);
        else e.blind = Math.max(e.blind || 0, e === boss ? .5 : 2);
        if (e === boss) field.bossApplied = true;
      }
    }
    specialFields = specialFields.filter(f => f.age < f.duration);
  }
  function drawStatus(e) {
    if (!(e.stun > 0 || e.blind > 0)) return;
    ctx.save();ctx.translate(e.x,e.y);ctx.strokeStyle=e.stun>0?"#94dcff":"#ffe7a0";ctx.lineWidth=1.4;
    for(let i=0;i<3;i++){const a=elapsed*7+i*2.1;const x=Math.cos(a)*22,y=Math.sin(a)*20;
      ctx.beginPath();ctx.moveTo(x-4,y-4);ctx.lineTo(x+2,y);ctx.lineTo(x-2,y+3);ctx.lineTo(x+4,y+5);ctx.stroke();}
    ctx.restore();
  }
  function drawSpecials() {
    for(const s of specialShots){ctx.fillStyle=s.type==="emp"?"#84daff":"#ffe4a0";ctx.fillRect(s.x-3,s.y-9,6,14);}
    for(const f of specialFields){ctx.save();ctx.globalAlpha=(1-f.age/f.duration)*.32;ctx.fillStyle=f.type==="emp"?"#66caff":"#ffedbd";
      ctx.beginPath();ctx.arc(f.x,f.y,f.radius,0,Math.PI*2);ctx.fill();ctx.globalAlpha=(1-f.age/f.duration)*.8;ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=2;ctx.stroke();ctx.restore();}
    enemies.filter(e=>e.alive).forEach(drawStatus);if(boss)drawStatus(boss);
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
    ctx.save();ctx.textAlign = "left";ctx.textBaseline = "middle";
    ctx.fillStyle = "#b7d7ec";ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("×" + lives, 25 + Math.min(lives, 5) * 17, 54);ctx.restore();
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
  const capturedArtwork = new Map();
  function craftImage(kind, level = 1) {
    const key = kind + "-" + level;
    if (craftArtwork.has(key)) return craftArtwork.get(key);
    const art = document.createElement("canvas");
    art.width = art.height = kind === "boss" ? 400 : 224;
    const paint = art.getContext("2d");
    paint.translate(art.width / 2, art.height / 2);
    paint.scale(4, 4);
    paint.lineJoin = "round";
    const colors = kind === "scout" ? ["#80601e", "#fff0a4", "#dba640"]
      : kind === "assault" ? ["#692b38", "#ffbac0", "#dc4a5d"]
      : kind === "leader" ? ["#452b68", "#e2c4ff", "#9c63dd"]
      : kind === "interceptor" ? ["#194b68", "#b8f7ff", "#469ddb"]
      : kind === "armored" ? ["#31465b", "#ecf3ff", "#8095a9"]
      : kind === "shield" ? ["#164c61", "#bdffff", "#30beca"]
      : kind === "heavy" ? ["#633822", "#ffe3a2", "#cf8136"]
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
    } else if (kind === "shield") {
      panel([[-23,-9],[-15,-17],[15,-17],[23,-9],[19,13],[8,17],[-8,17],[-19,13]], metal);
      for (const side of [-1, 1]) {
        panel([[side*7,-11],[side*19,-8],[side*17,9],[side*8,11]], "#164e63");
        line([[side*10,-10],[side*19,-6],[side*17,8]], "#78ffff", 1.2);
        vent(side<0?-18:13, 0, 4);
      }
      panel([[0,-18],[6,-9],[7,10],[0,16],[-7,10],[-6,-9]], hull);
      glass(0,-5,3,5);
    } else if (kind === "heavy") {
      panel([[-25,-9],[-19,-17],[-7,-12],[0,-19],[7,-12],[19,-17],[25,-9],[23,13],[9,18],[-9,18],[-23,13]], metal);
      for (const side of [-1, 1]) {
        panel([[side*9,-10],[side*21,-8],[side*20,10],[side*9,12]], "#663d27");
        panel([[side*17-2,-5],[side*17+2,-5],[side*17+2,19],[side*17-2,19]], "#b7b7a6");
        paint.fillStyle="#ffb866";paint.fillRect(side*17-1,16,2,3);
        vent(side<0?-13:10,-3,5);
      }
      panel([[-7,-12],[7,-12],[8,12],[0,18],[-8,12]],hull);
      glass(0,-5,4,5);
      line([[-5,5],[5,5]],"#fff0ba",1.3);
    } else if (kind === "boss") {
      // The silhouette is fixed by rank; additional hardware is drawn per growth.
      if (level === 1) {
        panel([[0,-25],[7,-6],[25,12],[17,20],[5,12],[0,20],[-5,12],[-17,20],[-25,12],[-7,-6]],metal);
        panel([[-4,-16],[4,-16],[5,14],[-5,14]],hull);glass(0,-6,3,5);
        for(const side of [-1,1]){line([[side*8,3],[side*19,13]],colors[1],1);vent(side<0?-19:16,10);}
      } else if (level === 2) {
        panel([[-30,-5],[30,-5],[30,7],[-30,7]],metal);
        for(const side of [-1,1]){const x=side*23;panel([[x,-25],[x+7,-12],[x+7,17],[x,24],[x-7,17],[x-7,-12]],hull);glass(x,-8,3,6);vent(x-2,8,5);}
        panel([[0,-15],[8,-3],[6,14],[-6,14],[-8,-3]],metal);glass(0,-3,3,4);
      } else if (level === 3) {
        panel([[-33,-19],[33,-19],[38,-5],[33,21],[13,28],[-13,28],[-33,21],[-38,-5]],metal);
        panel([[-16,-15],[16,-15],[18,18],[-18,18]],hull);glass(0,-8,5,6);
        for(const side of [-1,1])for(let i=0;i<3;i++){const x=side*(22+i*5);panel([[x-2,-5],[x+2,-5],[x+2,20],[x-2,20]],colors[0]);line([[x,6],[x,18]],colors[1],1.2);}
      } else {
        panel([[0,-30],[20,-21],[40,-13],[46,5],[36,23],[16,30],[0,21],[-16,30],[-36,23],[-46,5],[-40,-13],[-20,-21]],metal);
        for(const side of [-1,1]){panel([[side*15,-15],[side*35,-9],[side*37,14],[side*17,21]],colors[0]);glass(side*25,-2,4,7);vent(side<0?-34:30,5,5);}
        panel([[-10,-22],[10,-22],[13,12],[0,22],[-13,12]],hull);glass(0,-10,5,7);
        paint.strokeStyle=colors[1];paint.lineWidth=2;paint.beginPath();paint.arc(0,5,8,0,Math.PI*2);paint.stroke();
      }
      craftArtwork.set(key, art);return art;
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
      if (kind === "armored") {
        for (const side of [-1,1]) panel([[side*8,-9],[side*19,-8],[side*19,6],[side*8,9]], "#aab5c0");
        line([[-5,3],[5,3]], "#eef6ff", 2);
      }
      if (kind === "interceptor") {
        panel([[0,-24],[3,-13],[-3,-13]], "#b6fbff");
        for(const side of [-1,1]) line([[side*6,-5],[side*17,7]], "#79e5ff", 1.2);
      }
      if (wide) {
        paint.strokeStyle = "#f5d684"; paint.lineWidth = .7;
        paint.beginPath(); paint.arc(0, 3, 4, 0, Math.PI * 2); paint.stroke();
      }
    }
    craftArtwork.set(key, art);
    return art;
  }
  function capturedCraftImage(level) {
    if (capturedArtwork.has(level)) return capturedArtwork.get(level);
    const normal = craftImage("player", level);
    const gray = document.createElement("canvas"); gray.width = normal.width; gray.height = normal.height;
    const paint = gray.getContext("2d"); paint.drawImage(normal, 0, 0);
    const pixels = paint.getImageData(0, 0, gray.width, gray.height);
    if (pixels && pixels.data) {
      for (let i = 0; i < pixels.data.length; i += 4) {
        const light = Math.round(pixels.data[i] * .2126 + pixels.data[i + 1] * .7152 + pixels.data[i + 2] * .0722);
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = light;
      }
      paint.putImageData(pixels, 0, 0);
    }
    capturedArtwork.set(level, gray);
    return gray;
  }
  function drawCraft(kind, x, y, angle = 0, level = 1, miniature = false, captured = false) {
    const art = captured ? capturedCraftImage(level) : craftImage(kind, level);
    const size = miniature ? .32 : kind === "scout" ? .64 : kind === "assault" ? .69
      : kind === "leader" ? .75 : kind === "boss" ? .84 + level * .08
      : kind === "heavy" ? .94 : kind === "shield" ? .79 : kind === "interceptor" ? .65 : kind === "armored" ? .74 : kind === "phantom" ? .66 : kind === "elite" ? .77 : level >= 4 ? .88 : .82;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(size, size);
    ctx.imageSmoothingEnabled = true;
    if (!miniature && !captured) {
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
    if (kind === "player" && level === 5 && !miniature && !captured) {
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
      if (enemy.carrying && (!captureAnimation || captureAnimation.enemy !== enemy)) {
        ctx.strokeStyle = "#a9e5ff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(enemy.x, enemy.y + 11); ctx.lineTo(enemy.x, enemy.y + 20); ctx.stroke();
        drawCraft("player", enemy.x, enemy.y + 32, 0, weapon, false, true);
      }
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
    if (enemy.kind === "shield") {
      ctx.save();ctx.translate(enemy.x, enemy.y);
      ctx.strokeStyle = enemy.shieldFlash > 0 ? "#ffffff" : shieldClosed(enemy) ? "#68edff" : "#275660";
      ctx.lineWidth = shieldClosed(enemy) ? 2.5 : 1;
      ctx.beginPath();ctx.arc(0, 0, 24, .2, Math.PI - .2);ctx.stroke();ctx.restore();
    }
    if (["leader", "armored", "shield", "heavy", "elite"].includes(enemy.kind) && enemy.hp < enemy.maxHp) {
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
      for(let i=0;i<(boss.growth||0);i++)for(const side of [-1,1]){
        const x=boss.x+side*(10+i*6);ctx.fillStyle=boss.color;ctx.fillRect(x-1.5,boss.y+12,3,12);
        ctx.fillStyle="#e9fbff";ctx.fillRect(x-1,boss.y+22,2,3);
      }
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
      } else if (shot.type === "wave" || shot.type === "spread") {
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
        ctx.fillText(item.type === "weapon" ? String(item.level) : item.type === "emp" ? "E" : item.type === "flash" ? "F" : "★", 0, 0);
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
  function drawSpecialButton() {
    ctx.save();ctx.translate(specialButton.x,specialButton.y);
    ctx.fillStyle="#0a1523";ctx.strokeStyle=specialAmmo.length?"#91d7ed":"#465667";ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(0,0,22,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle=specialAmmo.length?"#ddf7ff":"#627080";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="bold 9px sans-serif";
    ctx.fillText(specialAmmo[0]==="emp"?"EMP":specialAmmo[0]==="flash"?"FLASH":"특수",0,-4);
    ctx.fillText(String(specialAmmo.length),0,8);ctx.restore();
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
  function drawOverlay(title) {
    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.fillRect(26, H * .36, W - 52, 140);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e5eaf0";
    ctx.font = "bold 19px ui-monospace, monospace";
    ctx.fillText(title, W / 2, H * .36 + 70);
  }

  function continueSeconds() {
    return Math.max(0, Math.min(9, Math.ceil((continueDeadline - Date.now()) / 1000) - 1));
  }
  function finishContinue() {
    if (state !== "continue") return;
    continueDeadline = 0;
    resetControls();
    stopSounds();
    state = cinema ? "ending" : "gameover";
    if (cinema) cinema.playEnding();
  }
  function startOpening() {
    if (state !== "title") return;
    if (!cinema) { beginGame(); return; }
    resetControls(); stopSounds();
    state = "intro";
    initAudio();
    cinema.playOpening();
  }
  function finishEnding() {
    if (state !== "ending") return;
    state = "gameover";
    resetControls(); stopSounds();
    enemies = []; boss = null;
    playerShots = []; enemyShots = []; items = []; particles = []; bursts = [];
    dualFighter = false; captivePending = false; captureAnimation = null;
    lives = 0; screenShake = 0;
  }
  function returnHome() {
    resetControls(); stopSounds();
    state = "title";
    continueDeadline = 0;
    if (cinema) cinema.showHome();
  }
  function continueGame() {
    if (state !== "continue") return;
    if (Date.now() >= continueDeadline) { finishContinue(); return; }
    resetControls();
    stopSounds();
    continueDeadline = 0;
    lives = 3;
    dualFighter = false;
    captureAnimation = null;
    respawnDelay = 0;
    ship.x = W / 2;
    ship.invulnerable = 2.2;
    playerShots = []; enemyShots = [];
    particles = []; bursts = [];
    screenShake = 0;
    fireCooldown = 0;
    state = "playing";
    lastFrame = 0;
    initAudio();
  }
  function continueChoice(x, y) {
    if (x < 60 || x > W - 60) return null;
    const top = H * .36;
    if (y >= top + 78 && y <= top + 126) return "continue";
    if (y >= top + 138 && y <= top + 186) return "restart";
    return null;
  }
  function drawContinue() {
    const top = H * .36;
    ctx.fillStyle = "rgba(0,0,0,.8)";
    ctx.fillRect(26, top, W - 52, 204);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#e5eaf0";
    ctx.font = "bold 36px ui-monospace, monospace";
    ctx.fillText(String(continueSeconds()), W / 2, top + 40);
    ctx.font = "bold 17px system-ui, sans-serif";
    for (const [label, offset] of [["이어서하기", 78], ["처음부터하기", 138]]) {
      ctx.fillStyle = "rgba(110,180,220,.16)";
      ctx.fillRect(60, top + offset, W - 120, 48);
      ctx.fillStyle = "#e5eaf0";
      ctx.fillText(label, W / 2, top + offset + 24);
    }
  }

  function addExplosion(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), speed = rand(18, 72);
      particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: rand(.18, .48), maxLife: .48, size: rand(1.5, 3), color });
    }
  }
  function enemyExplosion(enemy) {
    const special = enemy.kind === "leader" || enemy.role === "captor";
    const heavy = ["armored", "elite", "assault", "heavy", "shield"].includes(enemy.kind);
    const radius = special ? 31 : heavy ? 24 : 20;
    const duration = special ? .72 : heavy ? .58 : .48;
    bursts.push({ x: enemy.x, y: enemy.y, kind: "enemy", age: 0, radius, duration,
      color: special ? "#f1b0ff" : "#ffc771", secondary: special ? 4 : 2 });
    explosionSound(enemy.kind);
    const count = special ? 32 : heavy ? 24 : 18;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + rand(-.13, .13);
      const speed = rand(35, special ? 135 : 105), life = rand(.18, duration);
      particles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life, maxLife: life, size: i % 3 === 0 ? 3 : 1.6,
        color: ["#fff8ce", "#ffc14e", "#ff6941", special ? "#c8a5ff" : "#f29a40"][i % 4] });
    }
    // Bound simultaneous debris without affecting the ship or boss animations.
    if (particles.length > 1200) particles = particles.slice(-1200);
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
        for (let i = 0; i < (burst.kind === "enemy" ? burst.secondary : burst.kind === "minister" ? 6 : 3); i++) {
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
  function shieldClosed(enemy) {
    return enemy.kind === "shield" && (elapsed + enemy.phase) % 2.8 < 1.55;
  }
  function damageEnemy(enemy, amount = 1, hitX = enemy.x, hitY = enemy.y + 10) {
    if (!enemy.alive) return;
    if (amount < 999 && shieldClosed(enemy) && hitY >= enemy.y && Math.abs(hitX - enemy.x) < 19) {
      enemy.shieldFlash = .12; impactSound(true); return;
    }
    enemy.hp -= amount;
    enemy.flash = 0.12;
    if (enemy.hp > 0) impactSound(enemy.kind === "leader");
    if (enemy.hp <= 0) {
      enemy.alive = false;
      const points = enemy.kind === "leader" ? 250 : enemy.kind === "heavy" ? 220 : enemy.kind === "shield" ? 180 : enemy.kind === "armored" ? 120 : enemy.kind === "assault" ? 100 : 50;
      score += points + (enemy.dive ? 25 : 0);
      enemyExplosion(enemy);
      if (amount < 999 && !enemy.escort && Math.random() < .03) items.push({ x: enemy.x, y: enemy.y, vy: 80, type: Math.random() < .5 ? "emp" : "flash" });
      if (enemy.carrying) {
        const rescuedPosition = captureAnimation && captureAnimation.enemy === enemy
          ? capturedFighterPosition(captureAnimation) : { x: enemy.x, y: enemy.y + 32 };
        if (captureAnimation && captureAnimation.enemy === enemy) captureAnimation = null;
        enemy.carrying = false; captivePending = false;
        items.push({ x: rescuedPosition.x, y: rescuedPosition.y, vy: 95, type: "rescue" });
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
      enemies.forEach(e => { if (e.escort && e.alive) { enemyExplosion(e); e.alive = false; } });
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
      state = "continue";
      continueDeadline = Date.now() + 10000;
      resetControls();
      if (score > highScore) {
        highScore = score;
        writeNumber("ss-high", highScore);
      }
    }
  }

  function update(dt) {
    if (state === "paused") return;
    if (state === "continue" && Date.now() >= continueDeadline) finishContinue();
    screenShake = Math.max(0, screenShake - dt);
    updateEffects(dt);
    if (captureAnimation) {
      if (!(captureAnimation.enemy.stun > 0)) captureAnimation.age += dt;
      if (captureAnimation.age >= captureAnimation.duration) captureAnimation = null;
    }
    if (state !== "playing") return;
    elapsed += dt;
    for(const e of [...enemies,...(boss?[boss]:[])]) { e.stun=Math.max(0,(e.stun||0)-dt);e.blind=Math.max(0,(e.blind||0)-dt); }
    updateSpecials(dt);
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
      fireCooldown = weapon === 3 ? .18 : weapon === 4 ? .30 : weapon === 5 ? .62 : .38;
    }

    if (!bossStage) {
      const earlyAttackBusy = stage < 30 && enemies.some(e => e.alive && (e.entry || e.dive || e.beam));
      if (earlyAttackBusy) attackCooldown = combatDifficulty().interval;
      else attackCooldown -= dt;
      if (attackCooldown <= 0) {
        launchGroupAttack();
        attackCooldown = combatDifficulty().interval;
      }
    } else if (boss) {
      if (!(boss.stun > 0)) {
      boss.age += dt;
      boss.x += boss.dir * (38 + stage * .48) * dt;
      if (boss.x > W - 56) { boss.x = W - 56; boss.dir = -1; }
      if (boss.x < 56) { boss.x = 56; boss.dir = 1; }
      boss.y = 120 + Math.sin(boss.age * (1.1 + boss.tier * .15)) * (6 + boss.tier * 3);
      boss.shotTimer -= dt;
      if (boss.shotTimer <= 0) {
        bossFire();
        boss.shotTimer = boss.volley % 3 === 0 ? Math.max(1.7, 2.8 - (boss.growth || 0) * .18) : Math.max(.75, 1.6 - (boss.growth || 0) * .12 - boss.tier * .06);
      }
      for(const p of boss.pending||[]) { p.delay-=dt;if(p.delay<=0){
        const aim=boss.blind>0?Math.PI/2:Math.atan2(ship.y-boss.y,ship.x-boss.x);
        for(let i=0;i<p.count;i++)pushEnemyShot(boss.x,boss.y+25,aim+(i-(p.count-1)/2)*.09,110+stage*.5,boss.color,"straight",3);
      }}
      boss.pending=(boss.pending||[]).filter(p=>p.delay>0);
      if (!(boss.blind > 0)) { boss.escortTimer-=dt;if(boss.escortTimer<=0){spawnEscorts();boss.escortTimer=Math.max(4,7-(boss.growth||0)*.5);} }
      }
      boss.flash = Math.max(0, boss.flash - dt);
    }

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.shieldFlash = Math.max(0, (enemy.shieldFlash || 0) - dt);
      if (enemy.stun > 0) continue;
      if (enemy.escort) { updateEscort(enemy,dt);continue; }
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
          // Only the wing's designated shooter fires during entry.
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

    if (state !== "playing") return;
    for (const shot of playerShots) {
      shot.y += shot.vy * dt;
      if (shot.type === "laser") shot.ttl -= dt;
      if (shot.type === "plasma") shot.ttl -= dt;
    }
    for (const shot of enemyShots) updateEnemyShot(shot, dt);

    for (const shot of playerShots) {
      if (shot.type === "laser") {
        for (const enemy of enemies) {
          if (enemy.alive && !shot.hitIds.has(enemy.id) && Math.abs(enemy.x - shot.x) < 8 && enemy.y < shot.y && enemy.y > shot.y - shot.length) {
            shot.hitIds.add(enemy.id); damageEnemy(enemy, 1, shot.x, shot.y);
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
          enemies.forEach(e => { if (e.alive && distance(e.x, e.y, shot.x, shot.y) < 44) damageEnemy(e, 2, shot.x, shot.y); });
          if (boss && distance(boss.x, boss.y, shot.x, shot.y) < 54) damageBoss(3);
        }
      } else if (shot.type === "bullet") {
        const target = enemies.find(e => e.alive && distance(e.x, e.y, shot.x, shot.y) < 12);
        if (target) { shot.dead = true; damageEnemy(target, 1, shot.x, shot.y); }
        if (!target && boss && distance(boss.x, boss.y, shot.x, shot.y) < boss.hitRadius) { shot.dead = true; damageBoss(1); }
      }
    }
    playerShots = playerShots.filter(s => !s.dead && s.y > -30 && (s.type !== "laser" || s.ttl > 0) && (s.type !== "plasma" || s.ttl > 0));

    if (ship.invulnerable <= 0) {
      for (const shot of enemyShots) {
        if (playerDistance(shot.x, shot.y) < 15) { shot.dead = true; loseLife(shot.x); break; }
      }
    }
    enemyShots = enemyShots.filter(s => !s.dead && s.y < H + 15 && s.x > -15 && s.x < W + 15);

    if (state !== "playing") return;
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
        else if (item.type === "emp" || item.type === "flash") {
          if(specialAmmo.length<2) { specialAmmo.push(item.type);banner=(item.type==="emp"?"EMP탄":"섬광탄")+" 획득 · 중앙 버튼으로 발사"; }
          else banner="특수 무기 가득 참 · 최대 2회";
          bannerTime=2;
        }
        else if (item.type === "life") { lives += 1; banner = "보너스 기체 · 생명 +1"; bannerTime = 2; tone(1040, .16, "sine", .06); }
        else { score += 500; banner = "보너스 점수 +500"; bannerTime = 1.7; tone(760, .12, "sine", .05); }
      }
    }
    for (const item of items) if (!item.caught && item.type === "rescue" && item.y >= H + 12) {
      captivePending = false;
      banner = "구출 실패 · 기체를 잃었습니다"; bannerTime = 2;
    }
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
    drawSpecials();
    drawCaptureBeams();
    drawParticles();
    drawBursts();
    drawShip();
    drawControls();
    drawSpecialButton();
    if (state === "title" && !cinema) drawOverlay("STAR SQUADRON");
    if (state === "victory") drawOverlay("CLEAR");
    if (state === "continue") drawContinue();
    if (state === "gameover" && !cinema) drawOverlay("GAME OVER");
    if (state === "paused") drawOverlay("PAUSED");
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
    audioNeedsReset = true;
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
    if (state === "continue") {
      if (Date.now() >= continueDeadline) { finishContinue(); return; }
      const choice = continueChoice(p.x, p.y);
      if (choice === "continue") continueGame();
      else if (choice === "restart") beginGame();
      return;
    }
    if (soundHit(p.x, p.y)) { toggleSound(); return; }
    if ((state === "playing" || state === "paused") && pauseHit(p.x, p.y)) {
      if (state === "playing") pauseGame(); else resumeGame();
      return;
    }
    if (state === "paused") {
      if (p.x >= 26 && p.x <= W - 26 && p.y >= H * .36 && p.y <= H * .36 + 140) resumeGame();
      return;
    }
    if (state === "title") { if (!cinema) beginGame(); return; }
    if (state === "gameover") { if (!cinema) beginGame(); return; }
    if (state === "victory") beginGame();
    if (state !== "playing") return;
    initAudio();
    if (distance(p.x,p.y,specialButton.x,specialButton.y)<26) { fireSpecial();return; }
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
    if (state === "continue") {
      if (Date.now() >= continueDeadline) { finishContinue(); return; }
      if (!event.repeat && event.key === "Enter") continueGame();
      else if (!event.repeat && event.key.toLowerCase() === "r") beginGame();
      return;
    }
    if (state === "intro" || state === "ending") {
      if (!event.repeat && event.key === "Escape" && cinema) cinema.skip();
      return;
    }
    if (event.key === "Enter" && !event.repeat) {
      if (state === "title") startOpening();
      else if (state === "gameover") { if (cinema) returnHome(); else beginGame(); }
      else if (state === "victory") beginGame();
      else if (state === "paused") resumeGame();
    }
    if (!event.repeat && event.key.toLowerCase() === "m") toggleSound();
    if (!event.repeat && (event.key.toLowerCase() === "p" || event.key === "Escape")) {
      if (state === "playing") pauseGame(); else if (state === "paused") resumeGame();
    }
    if (state === "playing") keys.add(event.key);
  });
  window.addEventListener("keyup", event => keys.delete(event.key));
  window.addEventListener("blur", () => { pauseGame(); stopSounds(); audioNeedsReset = true; resetControls(); });
  window.addEventListener("pagehide", () => { pauseGame(); stopSounds(); audioNeedsReset = true; resetControls(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { pauseGame(); stopSounds(); audioNeedsReset = true; resetControls(); }
  });

  function frame(now) {
    const dt = Math.min(.045, lastFrame ? (now - lastFrame) / 1000 : .016);
    lastFrame = now;
    update(dt);
    render(state === "paused" ? 0 : dt);
    requestAnimationFrame(frame);
  }
  if (cinema) cinema.init({ opening: startOpening, start: beginGame, ended: finishEnding, home: returnHome, soundEnabled: () => soundEnabled });
  requestAnimationFrame(frame);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
