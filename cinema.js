"use strict";
(() => {
  const layer = document.getElementById("cinema");
  const poster = document.getElementById("cinema-poster");
  const video = document.getElementById("cinema-video");
  const start = document.getElementById("start-button");
  const skip = document.getElementById("skip-button");
  const home = document.getElementById("home-button");
  const title = document.getElementById("cinema-title");
  let mode = "home", generation = 0, callbacks = null;
  function stopVideo() {
    generation += 1;
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.hidden = true;
  }
  function showHome() {
    mode = "home"; stopVideo();
    layer.hidden = false; layer.dataset.mode = mode;
    poster.hidden = false;
    start.hidden = false; home.hidden = true; skip.hidden = true;
    title.hidden = false; title.textContent = "STAR SQUADRON";
  }
  function finish() {
    if (mode !== "intro" && mode !== "ending") return;
    const finished = mode;
    mode = finished === "intro" ? "playing" : "ended";
    stopVideo();
    skip.hidden = true;
    if (finished === "intro") {
      layer.hidden = true;
      callbacks?.start();
    } else {
      callbacks?.ended();
      layer.hidden = false; layer.dataset.mode = mode;
      poster.hidden = true; start.hidden = true;
      title.hidden = false; title.textContent = "GAME OVER";
      home.hidden = false;
      home.focus({ preventScroll: true });
    }
  }
  async function resumeVideo() {
    if (!video.src || document.hidden || (mode !== "intro" && mode !== "ending")) return;
    const token = generation;
    try { await video.play(); }
    catch (_) {
      if (token !== generation || document.hidden) return;
      // iPhone can reject audible autoplay at the automatic end of a countdown.
      video.muted = true;
      try { await video.play(); }
      catch (_) { if (token === generation && !document.hidden) finish(); }
    }
    if (token !== generation) return;
  }
  function play(kind) {
    stopVideo(); mode = kind;
    layer.hidden = false; layer.dataset.mode = mode;
    poster.hidden = true; title.hidden = true;
    start.hidden = true; home.hidden = true; skip.hidden = false;
    video.hidden = false;
    video.src = kind === "intro" ? "media/launch-v18.mp4" : "media/ending-v18.mp4";
    video.muted = !callbacks?.soundEnabled();
    video.currentTime = 0;
    video.load();
    resumeVideo();
  }
  start.addEventListener("click", () => { if (mode === "home") callbacks?.opening(); });
  skip.addEventListener("click", finish);
  home.addEventListener("click", () => { if (mode === "ended") callbacks?.home(); });
  video.addEventListener("ended", finish);
  video.addEventListener("error", () => { if ((mode === "intro" || mode === "ending") && video.getAttribute("src")) finish(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) video.pause(); else resumeVideo();
  });
  window.addEventListener("pagehide", () => video.pause());
  window.addEventListener("pageshow", resumeVideo);
  window.SquadronCinema = { init: value => { callbacks = value; showHome(); }, showHome,
    playOpening: () => play("intro"), playEnding: () => play("ending"), skip: finish,
    hide: () => { mode = "playing"; stopVideo(); layer.hidden = true; }, getMode: () => mode };
})();
