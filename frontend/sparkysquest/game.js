'use strict';
/* ============================================================
   闪星勇者 Sparky's Quest — 横版闯关
   纯 Canvas 实现，无外部依赖；BGM 用 wwwroot/songs/*.mp3
   ============================================================ */

// ---------- 基础工具 ----------
const VW = 960, VH = 540;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const sign = (v) => v < 0 ? -1 : (v > 0 ? 1 : 0);
const aabb = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- 画布 ----------
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
// 渲染缩放：按「实际显示尺寸 × 屏幕像素比」匹配物理像素，手机端更清晰、桌面端不浪费性能
// 世界坐标仍按 VW/VH，不影响玩法
let RS = 2;
function computeRS() {
  const cw = canvas.clientWidth || VW;
  const dpr = window.devicePixelRatio || 1;
  const need = (cw * dpr) / VW;
  return Math.max(1.25, Math.min(2.5, need));
}
function resize() {
  // 仅设置内部分辨率；显示尺寸交给 CSS 控制，避免 JS 内联尺寸把游戏画面搞坏
  RS = computeRS();
  canvas.width = Math.round(VW * RS); canvas.height = Math.round(VH * RS);
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(RS, 0, 0, RS, 0, 0);
}
// 移动端防缩放：iOS Safari 会忽略 user-scalable=no，必须 JS 兜底
// 1) 禁掉双指捏合（iOS 私有 gesture 事件）2) 300ms 内二次点击阻止默认行为（禁双击放大）
(function disableZoom() {
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev =>
    document.addEventListener(ev, stop, { passive: false }));
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 320) stop(e);
    lastTouchEnd = now;
  }, { passive: false });
})();
window.addEventListener('resize', resize);
// 手机横竖屏切换 / 地址栏收展后重算渲染分辨率，保证画面始终匹配物理像素
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// ---------- 精灵图（美术资产，由 sprites/*.png 加载，加载时裁剪紧贴包围盒并生成受击白剪影）----------
const SPR = {};
function loadSprite(key, src) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, img.width, img.height).data;
    let minx = img.width, miny = img.height, maxx = 0, maxy = 0, found = false;
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        if (d[(y * img.width + x) * 4 + 3] > 10) {
          if (x < minx) minx = x; if (x > maxx) maxx = x;
          if (y < miny) miny = y; if (y > maxy) maxy = y; found = true;
        }
      }
    const bx = found ? minx : 0, by = found ? miny : 0;
    const bw = found ? (maxx - minx + 1) : img.width;
    const bh = found ? (maxy - miny + 1) : img.height;
    const wc = document.createElement('canvas');
    wc.width = img.width; wc.height = img.height;
    const wx = wc.getContext('2d');
    wx.drawImage(img, 0, 0); wx.globalCompositeOperation = 'source-in';
    wx.fillStyle = '#fff'; wx.fillRect(0, 0, wc.width, wc.height);
    SPR[key] = { img, white: wc, bx, by, bw, bh };
  };
  img.onerror = () => { SPR[key] = null; };
  img.src = src;
  SPR[key] = { img, bx: 0, by: 0, bw: 1, bh: 1, loading: true };
}
function drawSprite(key, cx, cy, h, facing, opt) {
  opt = opt || {};
  const s = SPR[key];
  if (!s || s.loading || !s.img || !s.img.width) return;
  const zoom = opt.zoom || 1;
  const scale = (h * zoom) / s.bh;
  const dw = s.bw * scale, dh = s.bh * scale;
  ctx.save();
  ctx.translate(cx, cy);
  if (opt.sx) ctx.scale(opt.sx, opt.sy || 1 / opt.sx);
  ctx.scale(facing || 1, 1);
  if (opt.alpha != null) ctx.globalAlpha = opt.alpha;
  const srcImg = (opt.flash && s.white) ? s.white : s.img;
  ctx.drawImage(srcImg, s.bx, s.by, s.bw, s.bh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}
loadSprite('player', 'sprites/player.png');
loadSprite('slime', 'sprites/slime.png');
loadSprite('bee', 'sprites/bee.png');
loadSprite('turret', 'sprites/turret.png');
loadSprite('boss', 'sprites/boss.png');

// ---------- 输入 ----------
const keys = {};
const pressed = {};
function keyName(e) {
  const k = e.key.toLowerCase();
  return k;
}
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowleft','arrowright','arrowup','arrowdown',' '].includes(k)) e.preventDefault();
  if (!keys[k]) pressed[k] = true;
  keys[k] = true;
  ensureAudio();
  if (k === 'm') toggleMute();
  if (k === 'r' && (G.state === 'playing' || G.state === 'gameover')) restartStage();
  if (k === 'q' && G.state === 'playing') tryTimeSlow();
  if ((k === 'p' || k === 'escape') && G.state === 'playing') pauseGame();
  else if ((k === 'p' || k === 'escape') && G.state === 'paused') resumeGame();
});
function tryTimeSlow(){ if (G.timeSlowCD>0 || G.state!=='playing') return; G.timeSlowT=3; G.timeSlowCD=12; if (SFX.boss) SFX.boss(); burst(G.player.x+G.player.w/2, G.player.y, '#7fffd4', 16); }
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousedown', (e) => {
  ensureAudio();
  if (G.state === 'playing') pressed['j'] = true, keys['j'] = true;
});
canvas.addEventListener('mouseup', () => { keys['j'] = false; });

// ---------- 触屏控制（手机 / 平板） ----------
// 复用键盘输入管线：触摸按钮 = 派发对应的键盘事件，这样移动/跳跃/开火/星影逻辑完全一致。
const isTouch = (typeof navigator !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0 || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches));
const touchMap = { btnLeft: 'arrowleft', btnRight: 'arrowright', btnJump: ' ', btnShoot: 'j', btnDash: 'shift', btnEcho: 'f', btnSlow: 'q' };
function fireKey(key, isDown) {
  try { window.dispatchEvent(new KeyboardEvent(isDown ? 'keydown' : 'keyup', { key })); } catch (e) {}
}

// ---------- 虚拟摇杆（浮动式）----------
// 触发区在左半屏：手指按下哪里，摇杆就在哪里冒出来，松手消失（主流手游做法）。
// 用 pointerId 锁定摇杆手指，保证「摇杆拖动」和「右手点技能键」互不干扰。
const joyZone = document.getElementById('joyZone');
const joyBase = document.getElementById('joyBase');
const joyKnob = document.getElementById('joyKnob');
const JOY_DEAD = 0.22;           // 死区：轻微抖动不触发移动
let joyId = null, joyCX = 0, joyCY = 0, joyR = 60, joyDir = 0;
function joyShow(x, y) {
  joyR = (joyBase && joyBase.offsetWidth ? joyBase.offsetWidth : 132) / 2;
  joyCX = x; joyCY = y;
  if (!joyBase) return;
  joyBase.style.left = x + 'px'; joyBase.style.top = y + 'px';
  joyKnob.style.transform = 'translate(0px, 0px)';
  joyBase.classList.add('on');
}
function joyDirSet(nd) {
  if (nd === joyDir) return;
  const setKey = (k, v) => { try { if (v && !keys[k]) pressed[k] = true; keys[k] = v; } catch (err) {} };
  if (joyDir !== 0) setKey(joyDir < 0 ? 'arrowleft' : 'arrowright', false);
  if (nd !== 0) setKey(nd < 0 ? 'arrowleft' : 'arrowright', true);
  joyDir = nd;
}
const JOY_UP = 0.5;              // 摇杆上推超过半径一半即视为「跳」
let joyUp = false, joyJumpT = 0;
function joyMove(x, y) {
  let dx = x - joyCX, dy = y - joyCY;
  const d = Math.hypot(dx, dy) || 1;
  if (d > joyR) { dx = dx / d * joyR; dy = dy / d * joyR; }   // 限制在底盘内
  if (joyKnob) joyKnob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
  const nx = dx / joyR, ny = dy / joyR;
  joyDirSet(nx < -JOY_DEAD ? -1 : (nx > JOY_DEAD ? 1 : 0));
  // 左摇杆只负责左右移动；跳跃由右侧独立「跳」按钮触发（不再上推起跳）
}
function joyEnd() {
  if (!joyBase) return;
  joyBase.classList.remove('on');
  joyId = null;
  joyUp = false;
  joyDirSet(0);
}
if (isTouch) {
  document.body.classList.add('touch');
  for (const id in touchMap) {
    const el = document.getElementById(id);
    if (!el) continue;
    const key = touchMap[id];
    const downFn = (e) => { e.preventDefault(); fireKey(key, true); };
    const upFn = (e) => { e.preventDefault(); fireKey(key, false); };
    el.addEventListener('pointerdown', downFn);
    el.addEventListener('pointerup', upFn);
    el.addEventListener('pointerleave', upFn);
    el.addEventListener('pointercancel', upFn);
  }
  // 摇杆：左半屏按下即出现并跟手；捕获指针，手指滑出区域也不断连
  if (joyZone && joyBase) {
    const jr = () => joyZone.getBoundingClientRect();
    joyZone.addEventListener('pointerdown', (e) => {
      if (joyId !== null) return;                 // 已有手指在控摇杆，忽略后续手指
      joyId = e.pointerId;
      try { joyZone.setPointerCapture(e.pointerId); } catch (err) {}
      const r = jr();
      joyShow(e.clientX - r.left, e.clientY - r.top);
      joyMove(e.clientX - r.left, e.clientY - r.top);
      e.preventDefault();
    }, { passive: false });
    joyZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      const r = jr();
      joyMove(e.clientX - r.left, e.clientY - r.top);
      e.preventDefault();
    }, { passive: false });
    const jEnd = (e) => { if (e.pointerId !== joyId) return; joyEnd(); e.preventDefault(); };
    joyZone.addEventListener('pointerup', jEnd, { passive: false });
    joyZone.addEventListener('pointercancel', jEnd, { passive: false });
  }
}
// 电脑和手机都会按游戏状态加/去 in-game：
// 触屏按键用 body.touch.in-game（仅手机显示），暂停按钮用 body.in-game（两端都能点）
function updateTouchUI() {
  document.body.classList.toggle('in-game', G.state === 'playing');
}

function down(...names) { return names.some(n => keys[n]); }
function tap(...names) { return names.some(n => pressed[n]); }

// ---------- 音频 ----------
let actx = null, muted = false;
let bgmVolume = 0.4; // 0~1，用户可调 BGM 音量（默认偏低，避免吵）
try { const _v = parseFloat(localStorage.getItem('sparky_bgmvol')); if (!isNaN(_v)) bgmVolume = Math.max(0, Math.min(1, _v)); } catch (e) {}
let bgm = null;
function ensureAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (actx && actx.state === 'suspended') actx.resume();
}
// 通用合成音：带 ADSR 包络，比裸 beep 更圆润好听
function tone(freq, dur, type = 'square', vol = 0.16, slideTo = null, attack = 0.005) {
  if (muted || !actx) return;
  const t0 = actx.currentTime;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
// 噪声爆发：用于打击 / 碎裂 / 落地等冲击感
function noise(dur, vol, hp, lp) {
  if (muted || !actx) return;
  const t0 = actx.currentTime;
  const n = Math.max(1, Math.floor(actx.sampleRate * dur));
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = actx.createBufferSource(); src.buffer = buf;
  const g = actx.createGain(); g.gain.value = vol;
  let node = src;
  if (lp) { const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
  if (hp) { const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  node.connect(g); g.connect(actx.destination);
  src.start(t0);
}
const SFX = {
  jump:  () => { tone(420, 0.16, 'square', 0.16, 720, 0.004); tone(840, 0.09, 'triangle', 0.05, 1100, 0.004); },
  djump: () => { tone(560, 0.14, 'square', 0.14, 1000); tone(1120, 0.08, 'triangle', 0.05); },
  dash:  () => { noise(0.18, 0.12, 600, 4200); tone(720, 0.12, 'sawtooth', 0.08, 1300); },
  swing: () => tone(300, 0.08, 'sawtooth', 0.10, 160),
  hit:   () => { tone(420, 0.10, 'square', 0.13, 220); noise(0.06, 0.06, 800); },
  stomp: () => { tone(260, 0.12, 'square', 0.16, 120); noise(0.10, 0.10, 200, 1200); },
  coin:  () => { tone(988, 0.07, 'triangle', 0.13); setTimeout(() => tone(1319, 0.10, 'triangle', 0.13), 55); },
  star:  () => { tone(1047, 0.08, 'triangle', 0.13); setTimeout(() => tone(1568, 0.12, 'triangle', 0.12), 65); },
  hurt:  () => { tone(300, 0.18, 'sawtooth', 0.18, 90); noise(0.12, 0.10, 300); },
  boss:  () => { tone(120, 0.4, 'sawtooth', 0.20, 60); noise(0.30, 0.08, 150); },
  up:    () => { tone(660, 0.08, 'triangle', 0.14); setTimeout(() => tone(990, 0.12, 'triangle', 0.14), 70); },
  win:   () => { [523,659,784,1046].forEach((f, i) => setTimeout(() => { tone(f, 0.22, 'triangle', 0.16); tone(f * 1.5, 0.18, 'sine', 0.06); }, i * 120)); },
  clear: () => { [523,659,784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.14), i * 90)); },
  land:  () => { noise(0.07, 0.10, 150, 900); tone(180, 0.07, 'sine', 0.10, 120); },
  shoot: () => { tone(680, 0.06, 'square', 0.09, 980); },
  portal:() => { tone(520, 0.12, 'sine', 0.13, 1300); setTimeout(() => tone(900, 0.12, 'sine', 0.12, 500), 55); },
  key:   () => { tone(880, 0.08, 'triangle', 0.13); setTimeout(() => tone(1320, 0.1, 'triangle', 0.12), 55); },
  gate:  () => tone(420, 0.22, 'square', 0.13, 820),
  brk:   () => { noise(0.12, 0.12, 200, 1500); tone(200, 0.10, 'sawtooth', 0.10, 80); },
  echo:  () => { tone(700, 0.10, 'sine', 0.11, 1200); },
  chest: () => { tone(880, 0.12, 'square', 0.15, 1320); setTimeout(() => tone(1320, 0.1, 'triangle', 0.11), 65); },
  crumble: () => { noise(0.18, 0.12, 200, 1200); tone(160, 0.14, 'sawtooth', 0.10, 80); },
  combo: (n) => { const f = 600 + Math.min(10, n) * 45; tone(f, 0.09, 'square', 0.12, f * 1.5); },
};
// 循环 BGM：优先播放关卡歌曲 mp3（songs/NN.mp3，exe / 本地服务器 / 内嵌资源均可播放）；
// 仅在 mp3 加载不到时（如 file:// 直接打开分享版）回退到 WebAudio 合成芯片乐兜底。
const BGM = {
  meadow:  { tempo: 0.22, lead: [523,659,784,659,587,659,523,440], bass: [131,131,165,165,147,147,131,131] },
  cave:    { tempo: 0.20, lead: [440,523,659,587,523,440,392,440], bass: [110,110,147,147,131,131,110,110] },
  sky:     { tempo: 0.20, lead: [659,784,880,784,659,587,659,523], bass: [165,165,196,196,147,147,165,165] },
  boss:    { tempo: 0.18, lead: [392,466,392,587,523,466,392,330], bass: [98,98,110,110,98,98,110,110] },
  crystal: { tempo: 0.19, lead: [587,698,880,698,784,659,587,523], bass: [147,147,196,196,165,165,147,147] },
  sunset:  { tempo: 0.21, lead: [523,587,698,659,587,523,494,523], bass: [131,131,147,147,131,131,123,123] },
  forest:  { tempo: 0.19, lead: [440,523,587,523,494,587,523,440], bass: [110,110,131,131,123,123,110,110] },
};
function playNote(freq, t, dur, type, vol, dest) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
function startSynthBgm(theme) {
  if (!actx) return false;
  const m = BGM[theme] || BGM.meadow;
  bgm = { mode: 'synth', theme, song: 0, audio: null, gain: actx.createGain(), step: 0, next: actx.currentTime + 0.06, timer: null };
  bgm.gain.gain.value = muted ? 0 : bgmVolume * 0.22; bgm.gain.connect(actx.destination);
  bgm.timer = setInterval(() => {
    if (!actx || muted || !bgm) return;
    while (bgm.next < actx.currentTime + 0.12) {
      const i = bgm.step % m.lead.length;
      if (m.lead[i]) playNote(m.lead[i], bgm.next, m.tempo * 0.9, 'square', 0.4, bgm.gain);
      if (m.bass[i] && bgm.step % 2 === 0) playNote(m.bass[i], bgm.next, m.tempo * 1.7, 'triangle', 0.5, bgm.gain);
      bgm.next += m.tempo; bgm.step++;
    }
  }, 25);
  return true;
}
function stopBgm() {
  if (!bgm) return;
  if (bgm.timer) { clearInterval(bgm.timer); bgm.timer = null; }
  if (bgm.audio) { try { bgm.audio.pause(); bgm.audio.src = ''; } catch (e) {} bgm.audio = null; }
  if (bgm.gain) { try { bgm.gain.disconnect(); } catch (e) {} bgm.gain = null; }
  bgm = null;
}
function setBgm(song, theme, force) {
  song = song || 1; theme = theme || 'meadow';
  if (!force && bgm && bgm.song === song && (bgm.mode === 'synth' ? !!bgm.timer : (bgm.audio && !bgm.audio.paused))) return;
  stopBgm();
  const path = 'songs/' + String(song).padStart(2, '0') + '.mp3';
  const a = new Audio(path); a.loop = true; a.volume = muted ? 0 : Math.min(0.95, bgmVolume);
  let fell = false;
  const fallback = () => { if (fell) return; fell = true; try { a.pause(); } catch (e) {} startSynthBgm(theme); };
  a.addEventListener('error', fallback);
  const pr = a.play(); if (pr && pr.catch) pr.catch(fallback);
  bgm = { mode: 'mp3', theme, song, audio: a, gain: null, step: 0, next: 0, timer: null };
}
function applyBgmVolume() {
  if (!bgm) return;
  if (bgm.mode === 'mp3' && bgm.audio) bgm.audio.volume = muted ? 0 : Math.min(0.95, bgmVolume);
  if (bgm.gain) bgm.gain.gain.value = muted ? 0 : bgmVolume * 0.22;
}
function toggleMute() {
  muted = !muted;
  applyBgmVolume();
}
function setBgmVol(pct) {
  bgmVolume = Math.max(0, Math.min(1, pct / 100));
  try { localStorage.setItem('sparky_bgmvol', String(bgmVolume)); } catch (e) {}
  applyBgmVolume();
  const sync = (id, txtId) => { const el = document.getElementById(id); if (el) el.value = Math.round(bgmVolume * 100); const t = document.getElementById(txtId); if (t) t.textContent = Math.round(bgmVolume * 100) + '%'; };
  sync('bgmVolTitle', 'bgmVolTitleTxt'); sync('bgmVolPause', 'bgmVolPauseTxt');
}

// ---------- 关卡数据 ----------
// 主题：meadow / cave / sky / boss
function L(opts) { return Object.assign({ platforms: [], enemies: [], coins: [], stars: [], bounces: [], powers: [], signs: [], chests: [], portals: [], blocks: [], keys: [], gates: [], checkpoints: [], spawn: [80, 420], goal: null, boss: false, song: 1, theme: 'meadow' }, opts); }

const LEVELS = [
  // 第一关 · 微光草原
  L({
    name: '第一关 · 微光草原', theme: 'meadow', song: 1, w: 3300,
    platforms: [
      { x: 0, y: 480, w: 3300, h: 90 },
      { x: 480, y: 360, w: 170, h: 22 },
      { x: 1000, y: 330, w: 170, h: 22 },
      { x: 1720, y: 350, w: 170, h: 22 },
      { x: 2480, y: 300, w: 200, h: 22 },
      { x: 2900, y: 380, w: 180, h: 22 },
      { x: 1640, y: 300, w: 150, h: 22, move: { axis: 'x', range: 70, speed: 1.1 } },
      { x: 1300, y: 235, w: 150, h: 22 },
    ],
    enemies: [
      { type: 'slime', x: 420, y: 444 },
      { type: 'bee', x: 1050, y: 220 },
      { type: 'slime', x: 1300, y: 444 },
      { type: 'roller', x: 600, y: 446 },
      { type: 'turret', x: 2350, y: 444 },
      { type: 'bee', x: 2600, y: 200 },
    ],
    coins: coinRow(300, 450, 6, 90).concat(coinRow(900, 300, 3, 60), coinRow(1750, 320, 3, 60), coinRow(2500, 270, 3, 60), coinRow(2950, 350, 3, 60), coinRow(1300, 205, 3, 50)),
    stars: [ [560, 330], [1085, 300], [2570, 270], [1375, 205] ],
    bounces: [ { x: 2260, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 1040, y: 270, w: 26, h: 26, kind: 'rapid', name: '连发', icon: 'R', col: '#ffb04a' } ],
    crates: [ { x: 1120, y: 290, kind: 'hmg' } ],
    signs: [
      { x: 200, y: 390, text: '← → / A D 移动', arrow: 'right' },
      { x: 620, y: 390, text: '空格 / W / ↑ 跳', arrow: 'up' },
      { x: 900, y: 390, text: 'J / 鼠标左键 开火', arrow: 'right' },
      { x: 1330, y: 390, text: '跳到敌人头顶\n踩它！一踩就死', arrow: 'up' },
      { x: 1750, y: 390, text: 'Shift / L 冲刺', arrow: 'right' },
      { x: 2500, y: 390, text: 'F / 右下「星跃」\n向上星能冲刺够高处', arrow: 'right' },
    ],
    chests: [ { x: 1310, y: 209 } ],
    goal: { x: 3220, y: 380 },
  }),
  // 第二关 · 星夜洞窟
  L({
    name: '第二关 · 星夜洞窟', theme: 'cave', song: 4, w: 3700,
    platforms: [
      { x: 0, y: 480, w: 3700, h: 90 },
      { x: 360, y: 360, w: 160, h: 22 },
      { x: 900, y: 330, w: 150, h: 22 },
      { x: 1450, y: 340, w: 160, h: 22 },
      { x: 1980, y: 300, w: 160, h: 22 },
      { x: 2560, y: 330, w: 160, h: 22 },
      { x: 3100, y: 300, w: 180, h: 22 },
      { x: 3380, y: 380, w: 180, h: 22 },
      { x: 2040, y: 250, w: 150, h: 22, move: { axis: 'x', range: 80, speed: 1.1 } },
      { x: 1500, y: 215, w: 150, h: 22 },
    ],
    enemies: [
      { type: 'slime', x: 300, y: 444 },
      { type: 'turret', x: 800, y: 444 },
      { type: 'bee', x: 1300, y: 220 },
      { type: 'slime', x: 1500, y: 444 },
      { type: 'roller', x: 1300, y: 446 },
      { type: 'turret', x: 1900, y: 444 },
      { type: 'bee', x: 2300, y: 200 },
      { type: 'slime', x: 2600, y: 444 },
      { type: 'turret', x: 3050, y: 444 },
      { type: 'bee', x: 3300, y: 200 },
    ],
    coins: coinRow(420, 450, 4, 70).concat(coinRow(980, 300, 3, 55), coinRow(1520, 310, 3, 55), coinRow(2060, 270, 3, 55), coinRow(2640, 300, 3, 55), coinRow(3160, 270, 3, 55), coinRow(3440, 350, 3, 55), coinRow(1500, 185, 3, 50)),
    stars: [ [980, 300], [2060, 270], [3160, 270], [1575, 185] ],
    bounces: [ { x: 2700, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 1450, y: 270, w: 26, h: 26, kind: 'shield', name: '护盾', icon: 'S', col: '#5b9bff' } ],
    crates: [ { x: 1000, y: 280, kind: 'shotgun' }, { x: 2700, y: 250, kind: 'laser' } ],
    portals: [ { ax: 1490, ay: 150, bx: 3090, by: 248 } ],
    blocks: [ { x: 914, y: 300 }, { x: 950, y: 300 } ],
    signs: [ { x: 1500, y: 205, text: '传送门！踩进来\n瞬移跳关 →', arrow: 'down' } ],
    goal: { x: 3620, y: 380 },
  }),
  // 第三关 · 云端天梯（底部连续地面 + 上方平台奖励，2 处断崖由平台衔接）
  L({
    name: '第三关 · 云端天梯', theme: 'sky', song: 8, w: 4000,
    platforms: [
      // 底部连续地面（中间留 2 个断崖缺口）
      { x: 0, y: 480, w: 4000, h: 90 },
      // 断崖1 的衔接移动平台 + 断崖2 的衔接固定平台
      { x: 1900, y: 420, w: 180, h: 22, move: { axis: 'x', range: 90, speed: 1.0 } },
      { x: 3080, y: 410, w: 160, h: 22 },
      // 上方奖励平台（均有下方地面支撑，不会悬空吃不到）
      { x: 520, y: 360, w: 200, h: 22 },
      { x: 980, y: 320, w: 180, h: 22 },
      { x: 1420, y: 360, w: 180, h: 22 },
      { x: 2300, y: 360, w: 200, h: 22 },
      { x: 2620, y: 300, w: 180, h: 22 },
      { x: 2700, y: 220, w: 160, h: 22 },
      { x: 3450, y: 340, w: 180, h: 22 },
      { x: 1450, y: 240, w: 160, h: 22, move: { axis: 'x', range: 60, speed: 1.1 } },
    ],
    enemies: [
      { type: 'roller', x: 300, y: 446 },
      { type: 'bee', x: 700, y: 220 },
      { type: 'slime', x: 1000, y: 444 },
      { type: 'bee', x: 1500, y: 200 },
      { type: 'turret', x: 2150, y: 444 },
      { type: 'bee', x: 2400, y: 200 },
      { type: 'slime', x: 2700, y: 444 },
      { type: 'bee', x: 3000, y: 200 },
      { type: 'turret', x: 3350, y: 444 },
      { type: 'bee', x: 3600, y: 200 },
    ],
    coins: coinRow(560, 330, 3, 60).concat(coinRow(1010, 290, 3, 55), coinRow(1450, 330, 3, 55), coinRow(2340, 330, 3, 60), coinRow(2660, 270, 3, 55), coinRow(2740, 190, 3, 50), coinRow(3480, 310, 3, 55), coinRow(2300, 360, 5, 70), coinRow(3300, 360, 5, 70)),
    stars: [ [1050, 290], [1480, 210], [2780, 190], [3500, 310] ],
    spikes: [],
    bounces: [ { x: 250, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 2360, y: 320, w: 26, h: 26, kind: 'magnet', name: '磁铁', icon: 'M', col: '#46d6c4' } ],
    crates: [ { x: 1040, y: 290, kind: 'rocket' } ],
    chests: [ { x: 1430, y: 334 }, { x: 2200, y: 364 } ],
    signs: [
      { x: 150, y: 390, text: '→ 出发！踩怪/开火都能打', arrow: 'right' },
      { x: 1960, y: 390, text: '断崖！跳过去 →', arrow: 'right' },
      { x: 3160, y: 390, text: '又一个缺口 →', arrow: 'right' },
      { x: 3880, y: 390, text: '终点 →', arrow: 'right' },
    ],
    goal: { x: 3920, y: 380 },
  }),
  // 第四关 · 水晶回廊（移动平台为主）
  L({
    name: '第四关 · 水晶回廊', theme: 'crystal', song: 3, w: 3600,
    platforms: [
      { x: 0, y: 480, w: 3600, h: 90 },
      { x: 560, y: 380, w: 170, h: 22, move: { axis: 'x', range: 110, speed: 1.0 } },
      { x: 1060, y: 350, w: 160, h: 22, move: { axis: 'x', range: 130, speed: 1.15 } },
      { x: 1560, y: 330, w: 170, h: 22 },
      { x: 2060, y: 320, w: 160, h: 22, move: { axis: 'x', range: 90, speed: 1.0 } },
      { x: 2620, y: 300, w: 180, h: 22 },
      { x: 3050, y: 330, w: 170, h: 22, move: { axis: 'x', range: 120, speed: 1.1 } },
      { x: 2680, y: 190, w: 160, h: 22 },
    ],
    enemies: [
      { type: 'slime', x: 320, y: 444 },
      { type: 'bee', x: 1120, y: 230 },
      { type: 'turret', x: 1400, y: 444 },
      { type: 'bee', x: 1900, y: 220 },
      { type: 'roller', x: 2300, y: 446 },
      { type: 'turret', x: 2900, y: 444 },
      { type: 'bee', x: 3150, y: 240 },
    ],
    coins: coinRow(300, 450, 4, 70).concat(coinRow(720, 430, 3, 60), coinRow(1580, 290, 3, 55), coinRow(2640, 260, 3, 55), coinRow(3080, 290, 3, 55), coinRow(2700, 150, 3, 50)),
    stars: [ [1600, 290], [2650, 260], [2720, 150] ],
    bounces: [ { x: 2400, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 1580, y: 290, w: 26, h: 26, kind: 'shield', name: '护盾', icon: 'S', col: '#5b9bff' } ],
    crates: [ { x: 1080, y: 300, kind: 'hmg' }, { x: 2700, y: 250, kind: 'rocket' } ],
    portals: [ { ax: 1050, ay: 298, bx: 3040, by: 278 } ],
    keys: [ { x: 2680, y: 150 } ],
    gates: [ { x: 3160, y: 360, w: 26, h: 120 } ],
    chests: [ { x: 3300, y: 364 } ],
    blocks: [ { x: 700, y: 390 }, { x: 734, y: 390 } ],
    signs: [ { x: 1050, y: 340, text: '传送门：跳过关卡中段 →', arrow: 'down' }, { x: 2680, y: 190, text: '拿钥匙\n开宝藏门', arrow: 'down' } ],
    goal: { x: 3520, y: 380 },
  }),
  // 第五关 · 暮色果园（弹跳板 + 垂直挑战）
  L({
    name: '第五关 · 暮色果园', theme: 'sunset', song: 6, w: 3400,
    platforms: [
      { x: 0, y: 480, w: 3400, h: 90 },
      { x: 150, y: 370, w: 170, h: 22 },
      { x: 1130, y: 340, w: 170, h: 22 },
      { x: 2020, y: 330, w: 180, h: 22 },
      { x: 2950, y: 350, w: 170, h: 22 },
      { x: 1150, y: 170, w: 200, h: 22 },
      { x: 2450, y: 140, w: 200, h: 22 },
    ],
    enemies: [
      { type: 'slime', x: 280, y: 444 },
      { type: 'bee', x: 700, y: 230 },
      { type: 'roller', x: 1150, y: 446 },
      { type: 'turret', x: 1600, y: 444 },
      { type: 'bee', x: 2000, y: 200 },
      { type: 'slime', x: 2500, y: 444 },
      { type: 'turret', x: 2950, y: 444 },
    ],
    coins: coinRow(300, 450, 4, 70).concat(coinRow(1150, 290, 3, 55), coinRow(2040, 280, 3, 55), coinRow(2970, 300, 3, 55), coinRow(1200, 130, 3, 55), coinRow(2500, 100, 3, 55)),
    stars: [ [1160, 290], [2450, 220], [2520, 100] ],
    bounces: [ { x: 360, y: 462, w: 70, h: 14 }, { x: 1180, y: 462, w: 70, h: 14 }, { x: 2500, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 1150, y: 300, w: 26, h: 26, kind: 'rapid', name: '连发', icon: 'R', col: '#ffb04a' } ],
    crates: [ { x: 1160, y: 290, kind: 'shotgun' }, { x: 2480, y: 90, kind: 'laser' } ],
    chests: [ { x: 2450, y: 114 } ],
    goal: { x: 3330, y: 380 },
  }),
  // 第六关 · 翠影密林（敌人密集，适合用星跃闪避或冲上高台）
  L({
    name: '第六关 · 翠影密林', theme: 'forest', song: 9, w: 3800,
    platforms: [
      { x: 0, y: 480, w: 3800, h: 90 },
      { x: 200, y: 360, w: 170, h: 22 },
      { x: 800, y: 340, w: 170, h: 22 },
      { x: 1280, y: 330, w: 170, h: 22 },
      { x: 1760, y: 320, w: 170, h: 22 },
      { x: 2240, y: 330, w: 170, h: 22 },
      { x: 2720, y: 340, w: 170, h: 22 },
      { x: 3200, y: 360, w: 170, h: 22 },
    ],
    enemies: [
      { type: 'slime', x: 300, y: 444 },
      { type: 'turret', x: 700, y: 444 },
      { type: 'bee', x: 900, y: 230 },
      { type: 'turret', x: 1200, y: 444 },
      { type: 'roller', x: 1350, y: 446 },
      { type: 'bee', x: 1500, y: 240 },
      { type: 'slime', x: 1700, y: 444 },
      { type: 'turret', x: 2000, y: 444 },
      { type: 'bee', x: 2200, y: 230 },
      { type: 'roller', x: 2350, y: 446 },
      { type: 'turret', x: 2600, y: 444 },
      { type: 'bee', x: 2800, y: 240 },
      { type: 'slime', x: 3100, y: 444 },
      { type: 'turret', x: 3400, y: 444 },
    ],
    coins: coinRow(300, 450, 4, 70).concat(coinRow(820, 300, 3, 55), coinRow(1300, 290, 3, 55), coinRow(1780, 280, 3, 55), coinRow(2260, 290, 3, 55), coinRow(2740, 300, 3, 55), coinRow(3220, 320, 3, 55)),
    stars: [ [1300, 290], [2260, 290], [3220, 320] ],
    bounces: [ { x: 1700, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 1290, y: 290, w: 26, h: 26, kind: 'shield', name: '护盾', icon: 'S', col: '#5b9bff' } ],
    crates: [ { x: 850, y: 290, kind: 'hmg' }, { x: 2300, y: 280, kind: 'rocket' }, { x: 3220, y: 310, kind: 'laser' } ],
    chests: [ { x: 1290, y: 304 } ],
    goal: { x: 3730, y: 380 },
  }),
  // 第七关 · 星轨高塔（移动平台 + 弹跳板综合挑战）
  L({
    name: '第七关 · 星轨高塔', theme: 'starway', song: 10, w: 4200,
    platforms: [
      { x: 0, y: 480, w: 4200, h: 90 },
      { x: 560, y: 380, w: 160, h: 22, move: { axis: 'x', range: 100, speed: 1.0 } },
      { x: 980, y: 360, w: 160, h: 22, move: { axis: 'x', range: 110, speed: 1.1 } },
      { x: 1400, y: 340, w: 160, h: 22, move: { axis: 'x', range: 80, speed: 1.0 } },
      { x: 1820, y: 330, w: 160, h: 22, move: { axis: 'x', range: 120, speed: 1.15 } },
      { x: 2240, y: 320, w: 160, h: 22, move: { axis: 'x', range: 90, speed: 1.0 } },
      { x: 2660, y: 340, w: 160, h: 22, move: { axis: 'x', range: 110, speed: 1.1 } },
      { x: 3080, y: 350, w: 160, h: 22, move: { axis: 'x', range: 100, speed: 1.0 } },
      { x: 3500, y: 330, w: 160, h: 22, move: { axis: 'x', range: 120, speed: 1.2 } },
      { x: 1200, y: 200, w: 200, h: 22 },
      { x: 2000, y: 190, w: 200, h: 22 },
      { x: 2800, y: 180, w: 200, h: 22 },
      { x: 3600, y: 200, w: 200, h: 22 },
    ],
    enemies: [
      { type: 'slime', x: 260, y: 444 },
      { type: 'bee', x: 700, y: 240 },
      { type: 'turret', x: 1150, y: 444 },
      { type: 'bee', x: 1560, y: 220 },
      { type: 'roller', x: 1700, y: 446 },
      { type: 'turret', x: 2000, y: 444 },
      { type: 'bee', x: 2400, y: 210 },
      { type: 'slime', x: 2500, y: 444 },
      { type: 'turret', x: 2850, y: 444 },
      { type: 'bee', x: 3200, y: 220 },
      { type: 'roller', x: 3300, y: 446 },
      { type: 'turret', x: 3700, y: 444 },
    ],
    coins: coinRow(300, 450, 4, 70).concat(coinRow(1250, 160, 3, 55), coinRow(2050, 150, 3, 55), coinRow(2850, 140, 3, 55), coinRow(3650, 160, 3, 55), coinRow(1000, 320, 3, 55), coinRow(2260, 280, 3, 55)),
    stars: [ [1250, 160], [2850, 140], [3650, 160] ],
    bounces: [ { x: 400, y: 462, w: 70, h: 14 }, { x: 1150, y: 462, w: 70, h: 14 }, { x: 1950, y: 462, w: 70, h: 14 }, { x: 2750, y: 462, w: 70, h: 14 }, { x: 3650, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 1230, y: 160, w: 26, h: 26, kind: 'magnet', name: '磁铁', icon: 'M', col: '#46d6c4' } ],
    crates: [ { x: 1250, y: 150, kind: 'laser' }, { x: 2050, y: 140, kind: 'shotgun' }, { x: 2850, y: 130, kind: 'rocket' } ],
    portals: [ { ax: 980, ay: 308, bx: 3080, by: 298 } ],
    blocks: [ { x: 1220, y: 170 }, { x: 1254, y: 170 } ],
    signs: [ { x: 980, y: 350, text: '传送门：直达高塔顶端 →', arrow: 'down' } ],
    chests: [ { x: 1200, y: 174 } ],
    goal: { x: 4130, y: 380 },
  }),
  // 第八关 · 暗影巨兽（BOSS）
  L({
    name: '第八关 · 暗影巨兽', theme: 'boss', song: 11, w: 1500, boss: true,
    platforms: [
      { x: 0, y: 480, w: 1500, h: 90 },
      { x: 180, y: 350, w: 200, h: 22 },
      { x: 1120, y: 350, w: 200, h: 22 },
      { x: 620, y: 250, w: 260, h: 22 },
    ],
    enemies: [],
    coins: coinRow(240, 320, 3, 70).concat(coinRow(1180, 320, 3, 70), coinRow(700, 220, 3, 70)),
    stars: [ [720, 220] ],
    bounces: [ { x: 700, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 200, y: 320, w: 26, h: 26, kind: 'rapid', name: '连发', icon: 'R', col: '#ffb04a' } ],
    crates: [ { x: 720, y: 300, kind: 'hmg' }, { x: 700, y: 170, kind: 'rocket' } ],
    goal: null,
  }),
  // 第九关 · 熔岩裂谷（敌人密布 + 大量移动平台 + 传送门 + 钥匙门）
  L({
    name: '第九关 · 熔岩裂谷', theme: 'lava', song: 7, w: 4400,
    platforms: [
      { x: 0, y: 480, w: 4400, h: 90 },
      { x: 360, y: 360, w: 160, h: 22, move: { axis: 'x', range: 120, speed: 1.2 } },
      { x: 800, y: 340, w: 160, h: 22, move: { axis: 'x', range: 90, speed: 1.1 } },
      { x: 1240, y: 330, w: 160, h: 22, move: { axis: 'x', range: 130, speed: 1.3 } },
      { x: 1680, y: 320, w: 160, h: 22, move: { axis: 'x', range: 100, speed: 1.2 } },
      { x: 2120, y: 320, w: 160, h: 22, move: { axis: 'x', range: 120, speed: 1.35 } },
      { x: 2560, y: 330, w: 160, h: 22, move: { axis: 'x', range: 90, speed: 1.3 } },
      { x: 3000, y: 330, w: 160, h: 22, move: { axis: 'x', range: 130, speed: 1.4 } },
      { x: 3440, y: 320, w: 160, h: 22, move: { axis: 'x', range: 100, speed: 1.35 } },
      { x: 1300, y: 200, w: 180, h: 22 },
      { x: 2200, y: 180, w: 180, h: 22 },
      { x: 3100, y: 200, w: 180, h: 22 },
    ],
    enemies: [
      { type: 'slime', x: 300, y: 444 },
      { type: 'turret', x: 700, y: 444 },
      { type: 'bee', x: 900, y: 230 },
      { type: 'roller', x: 1150, y: 446 },
      { type: 'turret', x: 1560, y: 444 },
      { type: 'bee', x: 1750, y: 220 },
      { type: 'slime', x: 2000, y: 444 },
      { type: 'turret', x: 2400, y: 444 },
      { type: 'bee', x: 2600, y: 230 },
      { type: 'roller', x: 2900, y: 446 },
      { type: 'turret', x: 3300, y: 444 },
      { type: 'bee', x: 3500, y: 220 },
      { type: 'slime', x: 3800, y: 444 },
      { type: 'turret', x: 4000, y: 444 },
      { type: 'bee', x: 4200, y: 220 },
      { type: 'roller', x: 4300, y: 446 },
    ],
    coins: coinRow(300, 450, 4, 70).concat(coinRow(1340, 170, 3, 55), coinRow(2240, 150, 3, 55), coinRow(3140, 170, 3, 55), coinRow(820, 300, 3, 55), coinRow(1700, 280, 3, 55), coinRow(2580, 290, 3, 55), coinRow(3460, 280, 3, 55)),
    stars: [ [1340, 170], [2240, 150], [3140, 170] ],
    bounces: [ { x: 450, y: 462, w: 70, h: 14 }, { x: 1850, y: 462, w: 70, h: 14 }, { x: 3300, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 1300, y: 160, w: 26, h: 26, kind: 'bomb', name: '清屏弹', icon: 'B', col: '#ffb547' }, { x: 3100, y: 160, w: 26, h: 26, kind: 'shield', name: '护盾', icon: 'S', col: '#5b9bff' } ],
    crates: [ { x: 800, y: 300, kind: 'hmg' }, { x: 2200, y: 140, kind: 'rocket' }, { x: 3100, y: 160, kind: 'laser' } ],
    portals: [ { ax: 1240, ay: 298, bx: 3000, by: 298 } ],
    keys: [ { x: 1300, y: 160 } ],
    gates: [ { x: 3080, y: 360, w: 26, h: 120 } ],
    chests: [ { x: 1300, y: 174 }, { x: 2200, y: 154 } ],
    signs: [ { x: 1240, y: 290, text: '传送门 + 钥匙门\n层层设防', arrow: 'down' } ],
    goal: { x: 4330, y: 380 },
  }),
  // 第十关 · 暗影巨兽·再临（BOSS，血量更高）
  L({
    name: '第十关 · 暗影巨兽·再临', theme: 'boss2', song: 11, w: 1800, boss: true, bossHp: 78,
    platforms: [
      { x: 0, y: 480, w: 1800, h: 90 },
      { x: 200, y: 350, w: 220, h: 22 },
      { x: 1380, y: 350, w: 220, h: 22 },
      { x: 700, y: 250, w: 280, h: 22 },
      { x: 360, y: 170, w: 200, h: 22 },
      { x: 1240, y: 170, w: 200, h: 22 },
    ],
    enemies: [
      { type: 'slime', x: 400, y: 444 },
      { type: 'bee', x: 900, y: 220 },
      { type: 'slime', x: 1400, y: 444 },
    ],
    coins: coinRow(260, 320, 3, 70).concat(coinRow(1440, 320, 3, 70), coinRow(800, 220, 3, 70), coinRow(420, 140, 3, 70), coinRow(1300, 140, 3, 70)),
    stars: [ [800, 220], [440, 140], [1320, 140] ],
    spikes: [],
    bounces: [ { x: 800, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 220, y: 320, w: 26, h: 26, kind: 'rapid', name: '连发', icon: 'R', col: '#ffb04a' }, { x: 1380, y: 320, w: 26, h: 26, kind: 'heal', name: '回血', icon: 'H', col: '#ff6b8b' } ],
    crates: [ { x: 800, y: 300, kind: 'hmg' }, { x: 800, y: 180, kind: 'rocket' } ],
    goal: null,
  }),
  // 第十一关 · 星海迷城（超密机关 + 海量敌人 + 多传送门 + 双钥匙门）
  L({
    name: '第十一关 · 星海迷城', theme: 'starsea', song: 5, w: 4800,
    platforms: [
      { x: 0, y: 480, w: 4800, h: 90 },
      { x: 360, y: 360, w: 160, h: 22, move: { axis: 'x', range: 130, speed: 1.4 } },
      { x: 800, y: 340, w: 160, h: 22, move: { axis: 'x', range: 100, speed: 1.3 } },
      { x: 1240, y: 330, w: 160, h: 22, move: { axis: 'x', range: 140, speed: 1.5 } },
      { x: 1680, y: 320, w: 160, h: 22, move: { axis: 'x', range: 110, speed: 1.4 } },
      { x: 2120, y: 320, w: 160, h: 22, move: { axis: 'x', range: 130, speed: 1.55 } },
      { x: 2560, y: 330, w: 160, h: 22, move: { axis: 'x', range: 100, speed: 1.5 } },
      { x: 3000, y: 330, w: 160, h: 22, move: { axis: 'x', range: 140, speed: 1.6 } },
      { x: 3440, y: 320, w: 160, h: 22, move: { axis: 'x', range: 110, speed: 1.55 } },
      { x: 3880, y: 330, w: 160, h: 22, move: { axis: 'x', range: 130, speed: 1.6 } },
      { x: 4320, y: 320, w: 160, h: 22, move: { axis: 'x', range: 100, speed: 1.5 } },
      { x: 1400, y: 200, w: 180, h: 22 },
      { x: 2400, y: 180, w: 180, h: 22 },
      { x: 3400, y: 200, w: 180, h: 22 },
      { x: 4300, y: 200, w: 180, h: 22 },
    ],
    enemies: [
      { type: 'slime', x: 300, y: 444 },
      { type: 'turret', x: 680, y: 444 },
      { type: 'bee', x: 900, y: 230 },
      { type: 'roller', x: 1100, y: 446 },
      { type: 'turret', x: 1500, y: 444 },
      { type: 'bee', x: 1700, y: 220 },
      { type: 'slime', x: 1950, y: 444 },
      { type: 'turret', x: 2350, y: 444 },
      { type: 'bee', x: 2550, y: 230 },
      { type: 'roller', x: 2800, y: 446 },
      { type: 'turret', x: 3200, y: 444 },
      { type: 'bee', x: 3400, y: 220 },
      { type: 'slime', x: 3650, y: 444 },
      { type: 'turret', x: 4050, y: 444 },
      { type: 'bee', x: 4250, y: 220 },
      { type: 'roller', x: 4500, y: 446 },
      { type: 'bee', x: 4600, y: 220 },
      { type: 'turret', x: 4700, y: 444 },
    ],
    coins: coinRow(300, 450, 4, 70).concat(coinRow(1440, 170, 3, 55), coinRow(2440, 150, 3, 55), coinRow(3440, 170, 3, 55), coinRow(4340, 170, 3, 55), coinRow(820, 300, 3, 55), coinRow(1700, 280, 3, 55), coinRow(2580, 290, 3, 55), coinRow(3460, 280, 3, 55), coinRow(4400, 280, 3, 55)),
    stars: [ [1440, 170], [2440, 150], [3440, 170], [4340, 170] ],
    bounces: [ { x: 400, y: 462, w: 70, h: 14 }, { x: 1600, y: 462, w: 70, h: 14 }, { x: 2800, y: 462, w: 70, h: 14 }, { x: 4000, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 1400, y: 160, w: 26, h: 26, kind: 'bomb', name: '清屏弹', icon: 'B', col: '#ffb547' }, { x: 3400, y: 160, w: 26, h: 26, kind: 'magnet', name: '磁铁', icon: 'M', col: '#46d6c4' }, { x: 4340, y: 160, w: 26, h: 26, kind: 'heal', name: '回血', icon: 'H', col: '#ff6b8b' } ],
    crates: [ { x: 800, y: 300, kind: 'hmg' }, { x: 2400, y: 140, kind: 'rocket' }, { x: 3440, y: 160, kind: 'laser' }, { x: 4340, y: 160, kind: 'shotgun' } ],
    portals: [ { ax: 1240, ay: 298, bx: 3000, by: 298 }, { ax: 3440, ay: 168, bx: 4320, by: 168 } ],
    keys: [ { x: 1400, y: 160 }, { x: 3400, y: 160 } ],
    gates: [ { x: 3080, y: 360, w: 26, h: 120 }, { x: 4280, y: 360, w: 26, h: 120 } ],
    chests: [ { x: 1400, y: 174 }, { x: 2400, y: 154 }, { x: 3400, y: 174 }, { x: 4340, y: 174 } ],
    signs: [ { x: 1240, y: 290, text: '双钥匙门！\n集齐才能通关', arrow: 'down' } ],
    goal: { x: 4730, y: 380 },
  }),
  // 第十二关 · 暗影巨兽·真身（最终 BOSS，三阶段弹幕狂潮）
  L({
    name: '第十二关 · 暗影巨兽·真身', theme: 'boss3', song: 12, w: 1900, boss: true, bossHp: 100,
    platforms: [
      { x: 0, y: 480, w: 1900, h: 90 },
      { x: 200, y: 350, w: 240, h: 22 },
      { x: 1460, y: 350, w: 240, h: 22 },
      { x: 720, y: 250, w: 320, h: 22 },
      { x: 360, y: 160, w: 220, h: 22 },
      { x: 1320, y: 160, w: 220, h: 22 },
    ],
    enemies: [
      { type: 'slime', x: 400, y: 444 },
      { type: 'bee', x: 900, y: 220 },
      { type: 'turret', x: 1400, y: 444 },
    ],
    coins: coinRow(280, 320, 3, 70).concat(coinRow(1520, 320, 3, 70), coinRow(820, 220, 3, 70), coinRow(440, 130, 3, 70), coinRow(1400, 130, 3, 70)),
    stars: [ [820, 220], [460, 130], [1420, 130] ],
    spikes: [],
    bounces: [ { x: 820, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 240, y: 320, w: 26, h: 26, kind: 'rapid', name: '连发', icon: 'R', col: '#ffb04a' }, { x: 1460, y: 320, w: 26, h: 26, kind: 'heal', name: '回血', icon: 'H', col: '#ff6b8b' }, { x: 820, y: 160, w: 26, h: 26, kind: 'shield', name: '护盾', icon: 'S', col: '#5b9bff' } ],
    crates: [ { x: 820, y: 300, kind: 'laser' }, { x: 820, y: 180, kind: 'rocket' } ],
    goal: null,
  }),
];

function coinRow(x, y, n, gap) { const a = []; for (let i = 0; i < n; i++) a.push([x + i * gap, y]); return a; }
const POWER_POOL = [
  { kind: 'rapid', name: '连发', icon: 'R', col: '#ffb04a' },
  { kind: 'shield', name: '护盾', icon: 'S', col: '#5fd0ff' },
  { kind: 'magnet', name: '吸币', icon: 'M', col: '#b06bff' },
  { kind: 'heal', name: '回血', icon: '+', col: '#ff6b8b' },
  { kind: 'bomb', name: '清屏', icon: 'B', col: '#ffd166' },
  { kind: 'star', name: '无敌星', icon: '★', col: '#ffd700' },   // 短暂无敌，撞到敌人直接撞飞
  { kind: 'dbl', name: '双倍分', icon: 'x2', col: '#3fae7a' },   // 一段时间内得分翻倍
  { kind: 'hour', name: '时之符', icon: 'T', col: '#3fa9c9' },   // 立刻充能时缓（时间减速）
];
const CRATE_POOL = ['hmg', 'shotgun', 'rocket', 'laser'];
function seededRng(seed) { let s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// 程序化丰富每关：补充悬空平台/星币/道具/箱子/宝箱/尖刺/弹跳/存档点（确定性种子，复活时一致不卡关）
function enrichStage(G, def, n) {
  const rng = seededRng(((n + 1) * 2654435761) >>> 0);
  const w = def.w;
  const grounds = G.level.platforms.filter(pl => pl.h > 60);
  const groundY = grounds.length ? Math.max.apply(null, grounds.map(pl => pl.y)) : 480;
  const clampX = (x) => clamp(x, 360, w - 200);
  // 平台数量收敛：原来是 (w-800)/620 会铺得很满，画面显得拥挤
  const nPlat = Math.max(2, Math.min(6, Math.round((w - 900) / 900)));
  for (let i = 0; i < nPlat; i++) {
    const frac = (i + 0.5) / nPlat;
    let x = 650 + frac * (w - 1300) + (rng() - 0.5) * 150;
    x = clamp(x, 320, w - 240);
    // 平台高度限制在离地面不超过 320px，确保单/双跳必定可达（避免“太高跳不上去”）
    const maxAbove = 320;
    let y = Math.round(groundY - (110 + rng() * (maxAbove - 110)));
    y = Math.max(120, Math.min(y, groundY - 90));
    const pw = Math.round(100 + rng() * 80);
    // 移动平台：水平滑动 或 垂直升降（电梯加行程限制，绝不探到地面/其它台子以下）
    let move = null;
    if (rng() < 0.22) {
      if (rng() < 0.45) {
        const range = Math.min(70 + rng() * 60, (groundY - y) - 56); // 垂直：保证始终悬在地面之上
        move = (range > 24) ? { axis: 'y', range, speed: 0.8 + rng() * 0.5 } : null;
      } else {
        move = { axis: 'x', range: 40 + rng() * 60, speed: 0.9 + rng() * 0.5 };
      }
    }
    // 其它机制：崩塌台 / 传送带（与移动平台互斥，一个台子只承担一种机制）
    let crumble = false, conv = 0;
    if (!move) {
      const rk = rng();
      if (rk < 0.18) crumble = true;
      else if (rk < 0.32) conv = rng() < 0.5 ? 1 : -1;
    }
    const pl = { x: Math.round(x), y, w: pw, h: 22, move, crumble, conv };
    if (move) { pl.baseX = pl.x; pl.baseY = pl.y; pl.ox = 0; pl.oy = 0; pl.dx = 0; pl.dy = 0; pl.mt = rand(0, 6); }
    // 重叠/贴太近就整块跳过：水平有重叠且高度几乎一致 → 必然跳过（含移动平台的行程范围）
    let clash = false;
    for (const q of G.level.platforms) {
      let qx0 = q.x, qx1 = q.x + q.w;
      if (q.move && q.move.axis === 'x') { const r = q.move.range; qx0 = Math.min(qx0, q.baseX - r); qx1 = Math.max(qx1, q.baseX + r + q.w); }
      const gapX = (pl.x + pl.w < qx0 || pl.x > qx1) ? 1e9 : Math.max(0, Math.min(pl.x + pl.w, qx1) - Math.max(pl.x, qx0));
      if (gapX < 64 && Math.abs(pl.y - q.y) < 74) { clash = true; break; } // 高度几乎重叠 → 跳过
      // 垂直移动平台会上下扫，禁止把新台放在它扫过的竖直区间里
      if (q.move && q.move.axis === 'y' && gapX < 64) {
        const r = q.move.range;
        if (pl.y > q.baseY - r - 46 && pl.y < q.baseY + r + 46) { clash = true; break; }
      }
    }
    if (clash) continue;
    G.level.platforms.push(pl);
    const cn = Math.max(2, Math.floor(pw / 64)); // 金币排布更疏，不糊成一片
    for (let k = 0; k < cn; k++) G.coins.push({ x: pl.x + 14 + k * 38, y: pl.y - 26, w: 18, h: 18, t: rand(0, 6), got: false });
    const r2 = rng();
    if (r2 < 0.34) {
      const sp = POWER_POOL[(n + i) % POWER_POOL.length];
      G.powers.push({ x: pl.x + pl.w / 2 - 13, y: pl.y - 34, w: 26, h: 26, kind: sp.kind, name: sp.name, icon: sp.icon, col: sp.col, got: false, t: rand(0, 6) });
    } else if (r2 < 0.5) {
      const ck = CRATE_POOL[(n + i) % CRATE_POOL.length];
      G.crates.push({ x: pl.x + pl.w / 2 - 14, y: pl.y - 28, w: 28, h: 24, kind: ck, t: rand(0, 6), got: false });
    } else if (r2 < 0.6) {
      G.chests.push({ x: pl.x + pl.w / 2 - 15, y: pl.y - 28, w: 30, h: 26, opened: false, t: rand(0, 6) });
    }
    // 平台上的敌人/星辰概率下调，避免每个平台都堆满东西
    if (rng() < 0.22) G.enemies.push(makeEnemy({ type: 'bee', x: pl.x + pl.w / 2, y: pl.y - 90 }));
    if (rng() < 0.16) G.stars.push({ x: pl.x + pl.w / 2, y: pl.y - 60, w: 22, h: 22, t: rand(0, 6), got: false });
  }
  // 激光栅栏：第 2 关起出现，按固定节奏「预警 → 通电 → 断电」循环，是纯粹的走位/时机考验
  if (!def.boss) {
    const laserN = Math.min(3, Math.floor(n / 2));
    for (let i = 0; i < laserN; i++) {
      const lx = Math.round(820 + (i + 0.5) * ((w - 1500) / Math.max(1, laserN)) + (rng() - 0.5) * 120);
      if (lx < 420 || lx > w - 300) continue;
      const lh = 190; // 高于单跳高度，逼玩家等「断电」窗口或二段跳绕过
      const rect = { x: lx, y: groundY - lh, w: 16, h: lh };
      let bad = false;
      for (const pl of G.level.platforms) {
        if (pl.h > 60) continue; // 只避开悬空台，地面不算
        if (rect.x + rect.w > pl.x - 16 && rect.x < pl.x + pl.w + 16 && rect.y < pl.y + pl.h + 8 && rect.y + rect.h > pl.y - 8) { bad = true; break; }
      }
      if (bad) continue;
      G.lasers.push({ x: lx, y: groundY - lh, w: 16, h: lh, t: rng() * 3.4, period: 3.4, on: false, warn: false });
    }
  }
  // 第 3 关起加入新敌人：空中投弹怪；第 5 关起再加地面铁甲冲撞者
  if (!def.boss && n >= 3) {
    G.enemies.push(makeEnemy({ type: 'bomber', x: Math.round(clampX(900 + rng() * (w - 1400))), y: 150 + rng() * 120 }));
    if (n >= 5) G.enemies.push(makeEnemy({ type: 'charger', x: Math.round(clampX(1100 + rng() * (w - 1500))), y: groundY - 60 }));
  }
  if (!def.boss) {
    const bounceN = 1 + Math.round(rng() * 1.4);
    for (let i = 0; i < bounceN; i++) {
      const bx = clampX(700 + rng() * (w - 1100));
      G.bounces.push({ x: Math.round(bx), y: groundY - 16, w: 70, h: 14, cool: 0, t: rand(0, 6) });
    }
    if (w > 2600) G.checkpoints.push({ x: Math.round(w * 0.65), y: 420, activated: false });
  }
}

// 所有可拾取物都必须「站在平台上」：吸附到最近平台顶面；若附近确实没有平台，
// 就在它脚下就地生成一个支撑小平台，杜绝物品凭空悬在空中。
function supportPickups() {
  const plats = G.level.platforms;
  // 地面高度：没有可依附平台时就把物品放到地面上，绝不凭空造平台
  const gnd = plats.filter(p => p.h > 60);
  const gy = gnd.length ? Math.max.apply(null, gnd.map(p => p.y)) : 480;
  // 找能托住它的台面：优先物品「下方」的平台，其次才是最近的
  const findTop = (cx, y) => {
    let best = null, bd = 1e9;
    for (const pl of plats) {
      if (cx < pl.x - 24 || cx > pl.x + pl.w + 24) continue;
      const below = pl.y >= y - 12;
      const d = Math.abs(pl.y - y) + (below ? 0 : 500);
      if (d < bd) { bd = d; best = pl; }
    }
    return best;
  };
  const overlapped = (x, y, w) => {
    for (const pl of plats) {
      if (x + w > pl.x - 30 && x < pl.x + pl.w + 30 && Math.abs(pl.y - y) < 40) return true;
    }
    return false;
  };
  const fix = (arr, ph) => {
    if (!arr) return;
    for (const it of arr) {
      const h = ph || it.h || 22;
      const cx = it.x + (it.w || 20) / 2;
      // 只放到「已有平台顶」或「地面」上，不再生成任何新平台（杜绝假平台）
      const pl = findTop(cx, it.y);
      it.y = Math.round((pl ? pl.y : gy) - h - 6);
    }
  };
  fix(G.coins, 18);
  fix(G.stars, 22);
  fix(G.powers, 26);
  fix(G.crates, 24);
  fix(G.chests, 26);
}

// ---------- 升级 ----------
const UPGRADES = [
  { id: 'hp', name: '生命上限', desc: '最大生命 +1（过关/重玩自动回满）', base: 5, apply: p => { p.maxHp++; p.hp++; } },
  { id: 'atk', name: '踩踏威力', desc: '踩踏击退与威力 +1', base: 6, apply: p => { p.atk++; } },
  { id: 'jump', name: '跳跃力', desc: '起跳更高更飘逸', base: 5, apply: p => { p.jumpV += 55; } },
  { id: 'speed', name: '移动速度', desc: '奔跑更快', base: 5, apply: p => { p.maxRun += 28; } },
  { id: 'djump', name: '多段跳', desc: '空中可再多跳一次', base: 9, apply: p => { p.maxJumps++; } },
  // 枪械天赋：逐级进化枪械（注意 max 用字面量，避免顶层 const 的 TDZ 问题）
  { id: 'gun', name: '枪械天赋', desc: '枪械进化：手枪→机枪→霰弹→火箭→激光', base: 8, max: 4,
    apply: p => { p.gunLv = Math.min(5, p.gunLv + 1); equipGun(p); } },
];

// ---------- 游戏状态 ----------
const G = {
  state: 'title', // title / playing / upgrade / gameover / win / paused
  stage: 1,
  level: null,
  player: null,
  enemies: [],
  projectiles: [],
  beams: [],
  particles: [],
  floats: [],
  coins: [],
  stars: [],
  bounces: [],
  powers: [],
  crates: [],
  signs: [],
  chests: [],
  portals: [],
  blocks: [],
  lasers: [],
  keyItems: [],
  gates: [],
  keys: 0,
  boss: null,
  cam: { x: 0, y: 0 },
  shake: 0, hurtFlash: 0,
  hitstop: 0,
  time: 0,
  best: 0,
  combo: 0, comboT: 0,
  clouds: [],
};

// ---------- 物理常量 ----------
const GRAV = 2400;
const FRICTION = 14;

// ---------- 武器（合金弹头式）----------
// 手枪无限弹药作为保底；重武器有弹药，打空自动退回手枪
const WEAPONS = {
  pistol:  { name: '手枪',   tag: 'P', col: '#ffd166', dmg: 1, cd: 0.20,  ammo: 0,  spd: 780,  r: 5,  inf: true,  spread: 0,    n: 1 },
  hmg:     { name: '重机枪', tag: 'H', col: '#ff9ec4', dmg: 1, cd: 0.075, ammo: 80, spd: 940,  r: 5,  inf: false, spread: 0.05, n: 1 },
  shotgun: { name: '霰弹枪', tag: 'S', col: '#ffb04a', dmg: 2, cd: 0.46,  ammo: 28, spd: 800,  r: 5,  inf: false, spread: 0.20, n: 5 },
  rocket:  { name: '火箭筒', tag: 'R', col: '#ff7e5a', dmg: 5, cd: 0.72,  ammo: 12, spd: 640,  r: 10, inf: false, spread: 0,    n: 1, boom: 84 },
  laser:   { name: '激光枪', tag: 'L', col: '#6fd1c9', dmg: 4, cd: 0.30,  ammo: 30, spd: 1500, r: 7,  inf: false, spread: 0,    n: 1, pierce: true },
};
const WEP_KEYS = ['hmg', 'shotgun', 'rocket', 'laser'];
// 枪械天赋树：随天赋等级逐级进化，每一把都会用到，激光枪是最终形态
const GUN_TREE = ['pistol', 'hmg', 'shotgun', 'rocket', 'laser'];
const GUN_MAX_LV = GUN_TREE.length;
// 装备当前天赋等级对应的枪，并补满弹药
function equipGun(p) {
  const key = GUN_TREE[Math.min(GUN_MAX_LV - 1, p.gunLv - 1)];
  p.gun = key;
  if (!WEAPONS[key].inf) p.ammo[key] = wepAmmo(key, p.gunLv);
  return key;
}
// 打空后降级到上一把枪（手枪无限，永远兜底）
function downgradeGun(p) {
  const idx = GUN_TREE.indexOf(p.gun);
  if (idx > 0) {
    p.gun = GUN_TREE[idx - 1];
    if (!WEAPONS[p.gun].inf) p.ammo[p.gun] = wepAmmo(p.gun, p.gunLv);
  }
  return p.gun;
}
function wepDmg(key, lv) { return WEAPONS[key].dmg + (lv - 1); }
function wepAmmo(key, lv) { return WEAPONS[key].inf ? Infinity : Math.round(WEAPONS[key].ammo * (1 + (lv - 1) * 0.35)); }
function wepCd(key, lv) { return Math.max(0.05, WEAPONS[key].cd * (1 - (lv - 1) * 0.12)); }
function hexA(hex, a) { const n = parseInt(hex.replace('#', ''), 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }

// ---------- 实体工厂 ----------
function makePlayer() {
  return {
    x: 80, y: 420, w: 34, h: 42,
    vx: 0, vy: 0, facing: 1, onGround: false,
    maxHp: 6, hp: 6, atk: 2, maxRun: 300, jumpV: 950, maxJumps: 2,
    jumps: 0, coyote: 0, jumpBuf: 0, dashCD: 0, dashT: 0, dashDir: 1, leapCD: 0, score: 0,
    attacking: false, atkT: 0, atkCD: 0, swung: new Set(),
    shootCD: 0, charge: 0, rapidT: 0, shieldT: 0, magnetT: 0, starT: 0, dblT: 0,
    gunLv: 1, gun: 'pistol', muzzle: 0,
    ammo: { hmg: 0, shotgun: 0, rocket: 0, laser: 0 },
    invuln: 0, coins: 0, stars: 0, upg: { hp: 0, atk: 0, jump: 0, speed: 0, djump: 0 },
    squash: 1, sqv: 0, kPrev: false,
  };
}
function makeEnemy(spec) {
  const dm = G.diffMul || 1;
  const base = { x: spec.x, y: spec.y, vx: 0, vy: 0, onGround: false, flash: 0, dead: false, t: rand(0, 6), id: Math.random() };
  if (spec.type === 'slime') return Object.assign(base, { type: 'slime', w: 38, h: 30, hp: Math.round(2*dm), speed: 70, dir: Math.random() < 0.5 ? -1 : 1, dmgT: 0 });
  if (spec.type === 'bee') {
    // 领地机制：以出生点为中心、range 为半径，只在这片区域里追玩家
    const b = Object.assign(base, { type: 'bee', w: 30, h: 26, hp: Math.round(1*dm), speed: 85, dmgT: 0, range: spec.range || 240 });
    b.homeX = b.x + b.w / 2; b.homeY = b.y + b.h / 2;
    return b;
  }
  if (spec.type === 'turret') return Object.assign(base, { type: 'turret', w: 40, h: 44, hp: Math.round(3*dm), fireT: rand(2, 3.2), dmgT: 0 });
  if (spec.type === 'roller') return Object.assign(base, { type: 'roller', w: 34, h: 34, hp: Math.round(3*dm), speed: 150, dir: Math.random() < 0.5 ? -1 : 1, dmgT: 0, spin: 0 });
  // 投弹怪：悬停在玩家上方，定期丢下会爆炸的炸弹（踩踏可秒杀）
  if (spec.type === 'bomber') return Object.assign(base, { type: 'bomber', w: 36, h: 30, hp: Math.round(2*dm), speed: 78, dmgT: 0, bombT: rand(0.6, 1.6), range: spec.range || 360 });
  // 铁甲冲撞者：地面怪，看到玩家先蓄力（红闪示警）再高速猛冲，撞墙晕眩 1 秒（可趁机连踩）
  if (spec.type === 'charger') return Object.assign(base, { type: 'charger', w: 40, h: 34, hp: Math.round(5*dm), speed: 470, dir: Math.random() < 0.5 ? -1 : 1, dmgT: 0, st: 'patrol', timer: 0 });
  return base;
}
function makeBoss(spec) {
  const hp = Math.round(((spec && spec.bossHp) || 55) * (G.diffMul || 1));
  return {
    type: 'boss', x: 680, y: 200, w: 130, h: 130, vx: 0, vy: 0, onGround: false,
    hp, maxHp: hp, flash: 0, invuln: 0, phase: 1, timer: 2, action: 'idle',
    landed: false, wasAir: false, dmgT: 0, id: 'boss', hopT: 0,
  };
}

// ---------- 关卡加载 ----------
function startStage(n, spawnOverride, opts) {
  opts = opts || {};
  G.stage = n;
  G.diffMul = 1; G.goldStars = []; G.timeSlowT = 0; G.timeSlowCD = 0;
  const def = LEVELS[n - 1];
  const spawn = spawnOverride || def.spawn;
  G.level = { w: def.w, theme: def.theme, platforms: def.platforms.map(p => {
    const np = { ...p };
    if (np.move) { np.baseX = np.x; np.baseY = np.y; np.ox = 0; np.oy = 0; np.dx = 0; np.dy = 0; np.mt = rand(0, 6); }
    return np;
  }), goal: def.goal, name: def.name, song: def.song };
  const p = G.player || makePlayer();
  if (!G.player) G.player = p;
  // 保留成长，重置位置/状态
  p.x = spawn[0]; p.y = spawn[1]; p.vx = 0; p.vy = 0; p.facing = 1;
  p.onGround = false; p.attacking = false; p.atkT = 0; p.invuln = 0.6; p.jumps = 0; p.leapCD = 0;
  p.hp = p.maxHp; p.squash = 1; p.sqv = 0;
  G.lastSafe = { x: spawn[0], y: spawn[1] };
  equipGun(p); // 每关开局装备天赋枪并补满弹药
  G.hintUntil = performance.now() + 9000; // 开局 9 秒显示操作提示
  G.signHint = null;                      // 清掉上一关残留的引导横幅

  G.enemies = def.enemies.map(makeEnemy);
  // 随关卡递增的“增援”：越后面的关卡敌人越多（第1关几乎不变，后期大幅增多）
  if (!def.boss) {
    const extra = Math.min(9, Math.round(G.stage * 0.9)); // 增援收敛，画面不再被敌人塞满
    const pool = G.stage >= 4 ? ['slime', 'bee', 'turret', 'roller', 'bomber', 'charger'] : ['slime', 'bee', 'turret', 'roller'];
    for (let i = 0; i < extra; i++) {
      const ty = pool[(Math.random() * pool.length) | 0];
      const x = 420 + Math.random() * Math.max(200, def.w - 840);
      const y = (ty === 'bee' || ty === 'bomber') ? 110 + Math.random() * 200 : 444;
      G.enemies.push(makeEnemy({ type: ty, x, y }));
    }
  }
  G.projectiles = []; G.particles = []; G.floats = [];
  G.coins = def.coins.map(c => ({ x: c[0], y: c[1], w: 18, h: 18, t: rand(0, 6), got: false }));
  // 拾取物上移：贴地的星币吸到最近的悬空平台顶（满足“币放在平台上而非地面”）
  (function () {
    const grounds = G.level.platforms.filter(pl => pl.h > 60);
    const mGY = grounds.length ? Math.max.apply(null, grounds.map(pl => pl.y)) : 480;
    const ledges = G.level.platforms.filter(pl => pl.h <= 30 && pl.y < mGY - 50 && !pl.move);
    for (const c of G.coins) {
      if (c.y >= mGY - 60) {
        let best = null, bd = 1e9;
        for (const pl of ledges) {
          const inX = c.x >= pl.x - 12 && c.x <= pl.x + pl.w + 12;
          const d = inX ? 0 : Math.abs(c.x - (pl.x + pl.w / 2));
          if (d < bd) { bd = d; best = pl; }
        }
        c.y = best ? best.y - 20 : 300;
      }
    }
  })();
  G.stars = def.stars.map(c => ({ x: c[0], y: c[1], w: 22, h: 22, t: rand(0, 6), got: false }));
  G.bounces = (def.bounces || []).map(b => ({ ...b, cool: 0, t: rand(0, 6) }));
  G.powers = (def.powers || []).map(b => ({ ...b, got: false, t: rand(0, 6), vy: -120 }));
  G.crates = (def.crates || []).map(c => ({ x: c.x, y: c.y, w: 28, h: 24, kind: c.kind, t: rand(0, 6), got: false }));
  G.signs = (def.signs || []).map(s => ({ ...s, t: rand(0, 6) }));
  G.chests = (def.chests || []).map(c => ({ x: c.x, y: c.y, w: 30, h: 26, opened: false, t: rand(0, 6) }));
  // 传送门与「踩上去会碎、把人摔下去」的可破坏木箱已移除：体验太劝退，一律不生成
  G.portals = [];
  G.blocks = [];
  G.keyItems = (def.keys || []).map(o => ({ x: o.x, y: o.y, w: 22, h: 22, t: rand(0, 6), got: false }));
  G.gates = (def.gates || []).map(o => ({ x: o.x, y: o.y, w: o.w || 26, h: o.h || 120, req: o.req || 1, open: false }));
  G.keys = 0;
  G.boss = def.boss ? makeBoss(def) : null;
  // 存档点：默认在关卡 45% / 80% 处各一个（Boss 关仅门口一个），也可由关卡 checkpoints 覆盖
  let cps = (def.checkpoints && def.checkpoints.length) ? def.checkpoints : null;
  if (!cps) {
    if (def.boss) cps = [ { x: Math.round(def.w * 0.45), y: 420 } ];
    else cps = [ { x: Math.round(def.w * 0.45), y: 420 }, { x: Math.round(def.w * 0.8), y: 420 } ];
  }
  G.checkpoints = cps.map(c => ({ x: c.x, y: c.y, activated: false }));
  // 地刺已彻底移除：不再生成任何尖刺障碍
  G.spikes = [];
  G.lasers = [];
  enrichStage(G, def, n);
  supportPickups(); // 拾取物一律落到平台顶上，空中不再漂浮食物/道具
  for (const c of G.checkpoints) if (Math.abs(c.x - spawn[0]) < 60) c.activated = true;
  G.checkpoint = { x: spawn[0], y: spawn[1], activated: true };
  G.cam.x = clamp(p.x - VW / 2, 0, G.level.w - VW); G.cam.y = 0;
  G.shake = 0; G.hitstop = 0; G.combo = 0; G.comboT = 0;
  ensureAudio();
  // BGM 随机：每关进入随机选一首（避开上一关那首）；Boss 关也随机。在存档点复活时保留当前曲目
  if (opts.keepBgm && bgm) {
    // 保留当前 BGM，不强行换歌
  } else {
    let song = 1 + (Math.random() * 12 | 0);
    if (song === (G._lastSong || 0)) song = (song % 12) + 1;
    G._lastSong = song;
    setBgm(song, def.theme);
  }
  setState('playing');
}

function restartStage() { startStage(G.stage); }
function reviveAtCheckpoint() {
  const cp = G.checkpoint || { x: (G.level && G.level.w ? G.level.w * 0.45 : 400), y: 420 };
  addFloat(G.player.x + G.player.w / 2, G.player.y - 16, '在存档点复活', '#7fe7c4');
  G.player.hp = G.player.maxHp; G.player.shieldT = 0; G.player.rapidT = 0; G.player.magnetT = 0; G.player.starT = 0; G.player.dblT = 0;
  startStage(G.stage, [cp.x, cp.y - 12], { keepBgm: true });
}

// ---------- 碰撞 ----------
function moveAndCollide(e, dt) {
  e.x += e.vx * dt;
  for (const p of G.level.platforms) {
    if (p.broken) continue;
    if (aabb(e, p)) {
      if (e.vx > 0) e.x = p.x - e.w;
      else if (e.vx < 0) e.x = p.x + p.w;
      e.vx = 0;
    }
  }
  for (const b of (G.blocks || [])) {
    if (b.broken) continue;
    if (aabb(e, b)) {
      if (e.vx > 0) e.x = b.x - e.w; else if (e.vx < 0) e.x = b.x + b.w;
      e.vx = 0;
    }
  }
  e.y += e.vy * dt;
  e.onGround = false;
  e.standPlat = null;
  for (const p of G.level.platforms) {
    if (p.broken) continue;
    if (aabb(e, p)) {
      if (e.vy > 0) { e.y = p.y - e.h; e.vy = 0; e.onGround = true; e.standPlat = p; }
      else if (e.vy < 0) { e.y = p.y + p.h; e.vy = 0; }
    }
  }
  for (const b of (G.blocks || [])) {
    if (b.broken) continue;
    if (aabb(e, b)) {
      if (e.vy > 0) { e.y = b.y - e.h; e.vy = 0; e.onGround = true; e.standPlat = b; }
      else if (e.vy < 0) { e.y = b.y + b.h; e.vy = 0; }
    }
  }
  if (e.x < 0) e.x = 0;
  if (e.x > G.level.w - e.w) e.x = G.level.w - e.w;
}

// ---------- 玩家更新 ----------
function updatePlayer(dt) {
  const p = G.player;
  p.rapidT = Math.max(0, p.rapidT - dt);
  p.shieldT = Math.max(0, p.shieldT - dt);
  p.magnetT = Math.max(0, p.magnetT - dt);
  p.starT = Math.max(0, p.starT - dt);
  p.dblT = Math.max(0, p.dblT - dt);
  const left = down('arrowleft', 'a');
  const right = down('arrowright', 'd');
  const jumpDown = down('arrowup', 'w', ' ');
  const jumpTap = tap('arrowup', 'w', ' ');

  // 水平
  const inX = (right ? 1 : 0) - (left ? 1 : 0);
  let dashing = p.dashT > 0;
  if (dashing) { p.vx = p.dashDir * 900; }
  else {
    if (inX !== 0) { p.vx += inX * 2600 * dt; p.facing = inX; }
    else { p.vx -= p.vx * Math.min(1, FRICTION * dt); }
    p.vx = clamp(p.vx, -p.maxRun, p.maxRun);
  }

  // 冲刺（新动作）：Shift / 触屏冲刺键，水平突进并短暂无敌
  p.dashCD = Math.max(0, p.dashCD - dt);
  if (tap('shift', 'l') && !dashing && p.dashCD <= 0) {
    p.dashDir = inX !== 0 ? inX : p.facing;
    p.dashT = 0.16; p.dashCD = 0.7; p.invuln = Math.max(p.invuln, 0.14);
    p.vy = 0; SFX.dash(); spawnDust(p.x + p.w / 2, p.y + p.h / 2, 8);
  }
  if (p.dashT > 0) {
    dashing = true;
    p.dashT -= dt;
    if (Math.random() < 0.85) G.particles.push({ x: p.x + p.w / 2, y: p.y + p.h / 2, vx: -p.dashDir * 80, vy: rand(-30, 30), life: 0.22, col: 'rgba(150,210,255,.85)', r: rand(3, 6) });
  }

  // 连击计时
  G.comboT = Math.max(0, G.comboT - dt);
  if (G.comboT === 0) G.combo = 0;

  // 跳跃缓冲 / 土狼时间
  if (!dashing) {
    if (jumpTap) p.jumpBuf = 0.12;
    p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    if (p.onGround) { p.coyote = 0.1; p.jumps = p.maxJumps; }
    else p.coyote = Math.max(0, p.coyote - dt);

    if (p.jumpBuf > 0 && (p.coyote > 0 || p.jumps > 0)) {
      if (p.coyote > 0) { p.vy = -p.jumpV; p.coyote = 0; p.jumps = p.maxJumps - 1; }
      else { p.vy = -p.jumpV * 0.98; p.jumps--; SFX.djump(); }
      p.jumpBuf = 0; p.sqv = 1; SFX.jump();
      spawnDust(p.x + p.w / 2, p.y + p.h, 6);
    }
    // 可变跳跃高度（松手变短跳，但保留基础小跳手感）
    if (!jumpDown && p.vy < -340) p.vy = -340;
  }

  // 重力（冲刺时水平悬浮）
  if (dashing) p.vy = 0;
  else p.vy += GRAV * dt;
  p.vy = Math.min(p.vy, 1400);
  const wasAir = !p.onGround;
  moveAndCollide(p, dt);
  if (wasAir && p.onGround) { p.sqv = -1; spawnDust(p.x + p.w / 2, p.y + p.h, 8); SFX.land(); }
  if (p.onGround) G.lastSafe = { x: p.x, y: p.y };

  // 随移动平台一起移动
  if (p.standPlat) { p.x += p.standPlat.dx || 0; p.y += p.standPlat.dy || 0; }
  // 崩塌台：站上去后裂纹计时，到时碎裂掉落，几秒后复原（掉到下方平台/地面，不卡关）
  if (p.standPlat && p.standPlat.crumble && !p.standPlat.broken) {
    const cp = p.standPlat;
    cp.crackT = (cp.crackT || 0) + dt;
    if (cp.crackT >= 0.55 && !cp._warn) { cp._warn = true; SFX.crumble(); addFloat(cp.x + cp.w / 2, cp.y - 12, '台子要塌了!', '#d9a05b'); }
    if (cp.crackT >= 0.95) {
      cp.broken = true; cp.brokenT = 0; SFX.crumble();
      burst(cp.x + cp.w / 2, cp.y + cp.h / 2, '#caa46a', 18);
    }
  }
  // 传送带：站在上面被水平推送
  if (p.standPlat && p.standPlat.conv && !p.standPlat.broken) {
    p.x += p.standPlat.conv * 135 * dt;
  }
  // 弹跳板
  for (const b of G.bounces) {
    b.cool = Math.max(0, b.cool - dt);
    if (b.cool <= 0 && p.vy > 0 && aabb(p, { x: b.x, y: b.y - 6, w: b.w, h: b.h + 16 })) {
      p.vy = -1180; p.jumps = p.maxJumps; b.cool = 0.4; p.sqv = -1; SFX.djump();
      spawnDust(p.x + p.w / 2, p.y + p.h, 10);
    }
  }

  // 攻击：合金弹头式按住开火键连发（J / 鼠标左键＝主攻击），见下方 fireWeapon。
  // 近身击杀改为「踩踏」——跳起落下踩敌人顶部即秒杀，不再有单独的挥击键。

  // 星跃（F）与开火逻辑见下方
  p.shootCD = Math.max(0, p.shootCD - dt);
  p.muzzle = Math.max(0, p.muzzle - dt);
  // 合金弹头式：按住开火键连发，松开停火
  if (down('j', 'x')) fireWeapon(p); // J / 鼠标左键＝开火（主攻击，放最顺手的位置）

  // 计时器
  p.invuln = Math.max(0, p.invuln - dt);
  // squash 回弹
  p.sqv = lerp(p.sqv, 0, Math.min(1, 12 * dt));
  p.squash = 1 + p.sqv * 0.22;

  // 掉落出界
  // 掉落出界：不再直接判死，而是回到上一个安全落脚点并扣 1 点生命
  if (p.y > VH + 200) {
    damagePlayer(1, p.x);
    if (G.state === 'playing') {
      p.vx = 0; p.vy = 0; p.facing = 1; p.onGround = false; p.jumps = p.maxJumps;
      p.invuln = Math.max(p.invuln, 1.2);
      p.x = G.lastSafe.x; p.y = G.lastSafe.y - 6;
      addFloat(p.x + p.w / 2, p.y, '回到安全处', '#6fd1c9');
    }
  }

  // 星跃（F / 右下「星跃」键）：向上星能冲刺，附带短暂无敌，冷却约 1.4s，可够到高处平台或闪避弹幕
  if (tap('f') && p.leapCD <= 0) {
    p.vy = -p.jumpV * 1.05;
    p.invuln = Math.max(p.invuln, 0.28);
    p.leapCD = 1.4;
    p.jumps = Math.max(p.jumps, 1);
    SFX.djump(); spawnDust(p.x + p.w / 2, p.y + p.h, 12);
    burst(p.x + p.w / 2, p.y + p.h / 2, '#7fe0ff', 14);
    addFloat(p.x + p.w / 2, p.y - 10, '星跃!', '#7fe0ff');
  }
  p.leapCD = Math.max(0, p.leapCD - dt);
}

// （近战挥击已移除：近身击杀统一用「踩踏」——跳起落下踩敌人顶部即秒杀，见上方的踩踏判定）


// 合金弹头式开火：按住连发；重武器打空后自动退回无限手枪
function fireWeapon(p) {
  if (p.shootCD > 0) return;
  let key = p.gun;
  if (!WEAPONS[key].inf && (p.ammo[key] || 0) <= 0) key = downgradeGun(p);
  const W = WEAPONS[key], lv = p.gunLv;
  if (!W.inf) p.ammo[key] = Math.max(0, (p.ammo[key] || 0) - 1);
  const dmg = wepDmg(key, lv);
  const bx = p.x + (p.facing > 0 ? p.w - 2 : -W.r * 2 + 2);
  const by = p.y + p.h * 0.42;
  for (let i = 0; i < W.n; i++) {
    // 单发武器用随机抖动，多发武器均匀扇形展开
    const t = W.n === 1 ? (Math.random() - 0.5) : (i / (W.n - 1) - 0.5);
    const ang = t * W.spread * 2;
    G.projectiles.push({
      x: bx, y: by - W.r,
      vx: p.facing * W.spd * Math.cos(ang), vy: W.spd * Math.sin(ang),
      w: W.r * 2, h: W.r * 2, star: true, dmg, life: 1.8, col: W.col, rk: key,
      boom: W.boom || 0, pierce: !!W.pierce,
    });
  }
  if (W.pierce) { G.beams = G.beams || []; G.beams.push({ x: bx, y: by - W.r, ang: p.facing > 0 ? 0 : Math.PI, len: 520, life: 0.09, max: 0.09, col: W.col }); }
  p.shootCD = wepCd(key, lv) * (p.rapidT > 0 ? 0.55 : 1);
  p.muzzle = 0.07; // 枪口火焰
  p.vx -= p.facing * (key === 'rocket' ? 90 : key === 'shotgun' ? 55 : 16); // 后坐力
  SFX.shoot();
  if (!W.inf && (p.ammo[key] || 0) <= 0) downgradeGun(p); // 打空降级到上一把枪
}
// 火箭爆炸：范围伤害
function explode(pr) {
  const R = pr.boom || 80;
  burst(pr.x, pr.y, '#ffb04a', 22);
  hitSpark(pr.x, pr.y);
  G.shake = Math.max(G.shake, 2.5);
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (Math.hypot((e.x + e.w / 2) - pr.x, (e.y + e.h / 2) - pr.y) < R) {
      e.hp -= pr.dmg; e.flash = 0.12;
      e.vx += sign((e.x + e.w / 2) - pr.x) * 160; e.vy = -160;
      if (e.hp <= 0) killEnemy(e);
    }
  }
  if (G.boss && !G.boss.dead && Math.hypot((G.boss.x + G.boss.w / 2) - pr.x, (G.boss.y + G.boss.h / 2) - pr.y) < R) {
    hurtBoss(pr.dmg, sign(pr.vx));
  }
}
// 武器箱（合金弹头式补给）：拾取后立刻换上该武器并补满弹药
function updateCrates(dt) {
  const p = G.player;
  for (const c of G.crates) {
    if (c.got) continue;
    c.t += dt;
    if (c.vy !== undefined) { c.vy += GRAV * 0.5 * dt; c.y += c.vy * dt; if (c.y > 452) { c.y = 452; c.vy = 0; } }
    if (aabb(p, c)) {
      c.got = true;
      // 补给箱：补满弹药并换回当前天赋等级对应的枪
      const key = equipGun(p);
      addFloat(c.x + 14, c.y - 12, WEAPONS[key].name + ' 弹药全满', WEAPONS[key].col);
      burst(c.x + 14, c.y + 12, WEAPONS[key].col, 14);
      SFX.up();
    }
  }
  G.crates = G.crates.filter(c => !c.got);
}

// ---------- 敌人更新 ----------
const ACTIVE_DIST = 640; // 超过这个距离的敌人进入休眠，不再追你、不再开火
function updateEnemies(dt) {
  const p = G.player;
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt);
    e.dmgT = Math.max(0, e.dmgT - dt);
    // 脱战：离得太远就休眠，避免被看不见的怪一直追着打
    e.asleep = Math.hypot((e.x + e.w / 2) - pcx, (e.y + e.h / 2) - pcy) > ACTIVE_DIST;
    if (e.asleep) continue;
    if (e.type === 'slime') {
      e.vy += GRAV * dt;
      e.vx = e.dir * e.speed;
      moveAndCollide(e, dt);
      // 墙或悬崖转身
      if (e.vx === 0) e.dir *= -1;
      else {
        const footX = e.dir > 0 ? e.x + e.w + 3 : e.x - 3;
        const footY = e.y + e.h + 5;
        let ground = false;
        for (const pl of G.level.platforms) {
          if (footX >= pl.x && footX <= pl.x + pl.w && footY >= pl.y - 4 && footY <= pl.y + pl.h + 12) { ground = true; break; }
        }
        if (!ground) e.dir *= -1;
      }
    } else if (e.type === 'bee') {
      e.t += dt;
      const hx = e.homeX, hy = e.homeY, rg = e.range;
      // 直接追玩家（已移除星影分身诱饵机制）
      const gx = p.x + p.w / 2;
      const gy = p.y + p.h / 2;
      const chase = Math.hypot(gx - hx, gy - hy) < rg;
      const tx = chase ? gx : hx;
      const ty = chase ? gy : hy;
      const dx = tx - (e.x + e.w / 2), dy = ty - (e.y + e.h / 2), d = Math.hypot(dx, dy) || 1;
      const sp = chase ? e.speed : e.speed * 0.55;
      const step = d > 6 ? 1 : 0; // 已到巢则只悬停，避免抖动
      e.x += dx / d * sp * dt * step;
      e.y += dy / d * sp * dt * step + Math.sin(e.t * 5) * 0.7;
      // 硬边界：绝不飞出自己的领地
      const ox = e.x + e.w / 2 - hx, oy = e.y + e.h / 2 - hy, od = Math.hypot(ox, oy);
      if (od > rg) { const k = rg / od; e.x = hx + ox * k - e.w / 2; e.y = hy + oy * k - e.h / 2; }
      e.x = clamp(e.x, 0, G.level.w - e.w);
      e.y = clamp(e.y, 10, VH - e.h - 10);
    } else if (e.type === 'turret') {
      e.fireT -= dt;
      // 直接瞄准玩家（已移除星影分身诱饵机制）
      const aimX = pcx, aimY = pcy;
      const dpx = Math.abs(aimX - (e.x + e.w / 2)), dpy = Math.abs(aimY - (e.y + e.h / 2));
      if (e.fireT <= 0 && dpx < 520 && dpy < 300) {
        const dx = aimX - (e.x + e.w / 2), dy = aimY - (e.y + e.h / 2), d = Math.hypot(dx, dy) || 1;
        G.projectiles.push({ x: e.x + e.w / 2, y: e.y + 10, vx: dx / d * 215, vy: dy / d * 175, w: 20, h: 20, fromEnemy: true, life: 4, dmgT: 0 });
        e.fireT = 1.8; SFX.boss();
      }
    } else if (e.type === 'roller') {
      e.spin += dt * 9 * e.dir;
      e.vy += GRAV * dt;
      e.vx = e.dir * e.speed;
      moveAndCollide(e, dt);
      if (e.vx === 0) e.dir *= -1;
      else {
        const footX = e.dir > 0 ? e.x + e.w + 3 : e.x - 3;
        const footY = e.y + e.h + 5;
        let ground = false;
        for (const pl of G.level.platforms) {
          if (footX >= pl.x && footX <= pl.x + pl.w && footY >= pl.y - 4 && footY <= pl.y + pl.h + 12) { ground = true; break; }
        }
        if (!ground) e.dir *= -1;
      }
    } else if (e.type === 'bomber') {
      // 悬停：横向慢速跟随玩家，纵向保持在玩家上方一段距离，靠近就丢炸弹
      e.t += dt;
      const gx = p.x + p.w / 2;
      const dx = gx - (e.x + e.w / 2);
      e.x += clamp(dx, -e.speed * dt, e.speed * dt);
      const wantY = clamp(p.y - 150, 40, VH - 220);
      e.y += clamp(wantY - e.y, -52 * dt, 52 * dt) + Math.sin(e.t * 3) * 0.45;
      e.x = clamp(e.x, 0, G.level.w - e.w);
      e.bombT -= dt;
      if (e.bombT <= 0 && Math.abs(dx) < 110) {
        e.bombT = rand(1.8, 2.6);
        G.projectiles.push({
          x: e.x + e.w / 2 - 8, y: e.y + e.h - 2, w: 16, h: 16,
          vx: 0, vy: 40, fromEnemy: true, grav: 1100, life: 6, dmgT: 0, bomb: true,
        });
        SFX.boss();
      }
    } else if (e.type === 'charger') {
      // 三态：巡逻 → 蓄力（红闪示警）→ 猛冲；撞墙/超时后晕眩，晕眩期是反打窗口
      e.timer = Math.max(0, e.timer - dt);
      const dxp = (p.x + p.w / 2) - (e.x + e.w / 2);
      const sameFloor = Math.abs((p.y + p.h) - (e.y + e.h)) < 90;
      if (e.st === 'patrol') {
        e.vy += GRAV * dt; e.vx = e.dir * 62;
        moveAndCollide(e, dt);
        if (e.vx === 0) e.dir *= -1;
        else {
          const footX = e.dir > 0 ? e.x + e.w + 3 : e.x - 3, footY = e.y + e.h + 5;
          let ground = false;
          for (const pl of G.level.platforms) {
            if (footX >= pl.x && footX <= pl.x + pl.w && footY >= pl.y - 4 && footY <= pl.y + pl.h + 12) { ground = true; break; }
          }
          if (!ground) e.dir *= -1;
        }
        if (Math.abs(dxp) < 300 && sameFloor) { e.st = 'wind'; e.timer = 0.5; e.dir = sign(dxp) || e.dir; SFX.boss(); }
      } else if (e.st === 'wind') {
        e.vy += GRAV * dt; e.vx = 0;
        moveAndCollide(e, dt);
        if (e.timer <= 0) { e.st = 'dash'; e.timer = 1.1; SFX.dash(); }
      } else if (e.st === 'dash') {
        e.vy += GRAV * dt; e.vx = e.dir * e.speed;
        moveAndCollide(e, dt);
        if (Math.random() < 0.6) G.particles.push({ x: e.x + e.w / 2 - e.dir * 14, y: e.y + e.h - 4, vx: -e.dir * rand(40, 110), vy: rand(-70, -10), life: rand(0.2, 0.4), col: 'rgba(230,200,150,.85)', r: rand(2, 4) });
        if (e.vx === 0 || e.timer <= 0) {
          e.st = 'stun'; e.timer = 1.1; e.vx = 0; e.dmgT = 0.4;
          G.shake = Math.max(G.shake, 2.5);
          addFloat(e.x + e.w / 2, e.y - 12, '撞晕了!', '#ffd166');
        }
      } else { // stun
        e.vy += GRAV * dt; e.vx = 0;
        moveAndCollide(e, dt);
        if (e.timer <= 0) { e.st = 'patrol'; e.timer = 0; }
      }
    }
    // 接触伤害 / 踩踏
    handleEnemyContact(e);
  }
  G.enemies = G.enemies.filter(e => !e.dead);
}

function handleEnemyContact(e) {
  const p = G.player;
  if (!aabb(p, e)) return;
  // 无敌星：横冲直撞，碰到谁谁飞（含滚刺球），自己不掉血
  if (p.starT > 0) {
    e.hp = 0; e.flash = 0.12; killEnemy(e);
    burst(e.x + e.w / 2, e.y + e.h / 2, '#ffd700', 14);
    G.hitstop = 0.05; G.shake = Math.max(G.shake, 3);
    addCombo(); addScore(100 * Math.max(1, G.combo));
    return;
  }
  // 铁甲冲撞者：血厚，踩一下只是打伤并把它踩晕，需要多次踩踏才能干掉
  if (e.type === 'charger') {
    if (p.vy > 60 && (p.y + p.h) < e.y + e.h * 0.6) {
      e.hp -= Math.max(2, p.atk); e.flash = 0.14;
      p.vy = -500; p.jumps = Math.max(p.jumps, 1);
      SFX.stomp(); addFloat(e.x + e.w / 2, e.y, Math.max(2, p.atk), '#9be15d'); hitSpark(e.x + e.w / 2, e.y);
      G.hitstop = 0.07; G.shake = Math.max(G.shake, 3.5);
      addCombo(); addScore(100 * Math.max(1, G.combo));
      if (e.hp <= 0) killEnemy(e);
      else { e.st = 'stun'; e.timer = 0.9; e.vx = 0; }
      return;
    }
    if (e.dmgT <= 0 && p.invuln <= 0) { damagePlayer(1, e.x + e.w / 2); e.dmgT = 0.9; }
    return;
  }
  // 滚刺球：带刺不能踩，碰到即受伤
  if (e.type === 'roller') {
    if (e.dmgT <= 0) { damagePlayer(1, e.x + e.w / 2); e.dmgT = 0.9; }
    return;
  }
  // 踩踏：下落且脚在敌人上半部
  if (p.vy > 60 && (p.y + p.h) < e.y + e.h * 0.6) {
    e.hp = 0; e.flash = 0.12; p.vy = -460; p.jumps = Math.max(p.jumps, 1);
    SFX.stomp(); addFloat(e.x + e.w / 2, e.y, p.atk, '#9be15d'); hitSpark(e.x + e.w / 2, e.y);
    G.hitstop = 0.07; G.shake = Math.max(G.shake, 3.5);
    addCombo(); addScore(100 * Math.max(1, G.combo));
    if (e.hp <= 0) killEnemy(e);
    return;
  }
  if (e.dmgT <= 0 && p.invuln <= 0) { damagePlayer(1, e.x + e.w / 2); e.dmgT = 0.9; }
}

function killEnemy(e) {
  e.dead = true;
  burst(e.x + e.w / 2, e.y + e.h / 2, e.type === 'bee' ? '#ffd166' : '#9be15d', 14);
  if (Math.random() < 0.5) G.coins.push({ x: e.x + e.w / 2 - 9, y: e.y, w: 18, h: 18, t: 0, got: false, vy: -120 });
  // 合金弹头式：敌人有概率掉出武器箱
  if (Math.random() < 0.17) {
    const kind = WEP_KEYS[Math.floor(Math.random() * WEP_KEYS.length)];
    G.crates.push({ x: e.x + e.w / 2 - 14, y: e.y, w: 28, h: 24, kind, t: 0, vy: -150, got: false });
  }
  G.player.coins += 0; // 击杀不额外给币，收集掉落币
  addCombo(); addScore(80 * Math.max(1, G.combo));
}

// ---------- 星跃（F）：触发逻辑见 updatePlayer 中的 leap 段 ----------

// ---------- BOSS ----------
function updateBoss(dt) {
  const b = G.boss; if (!b) return;
  b.flash = Math.max(0, b.flash - dt);
  b.invuln = Math.max(0, b.invuln - dt);
  b.dmgT = Math.max(0, b.dmgT - dt);
  const p = G.player;
  // 阶段
  b.phase = b.hp > b.maxHp * 0.66 ? 1 : (b.hp > b.maxHp * 0.33 ? 2 : 3);

  if (b.action === 'idle') {
    // 缓慢逼近
    b.vx = sign(p.x - b.x) * (b.phase >= 2 ? 95 : 65);
    b.timer -= dt;
    if (b.timer <= 0) {
      const r = Math.random();
      if (r < 0.34) { b.action = 'slam'; b.vy = -900; b.landed = false; }
      else if (r < 0.64) { b.action = 'spread'; bossSpread(b); b.timer = b.phase >= 2 ? 1.6 : 2.2; b.action = 'idle'; }
      else if (b.phase >= 3 && r < 0.84) { bossRing(b); b.timer = 2.0; }
      else { b.action = 'summon'; for (let i = 0; i < (b.phase >= 2 ? 2 : 1); i++) spawnMinion(b); b.timer = 2.4; b.action = 'idle'; }
    }
  } else if (b.action === 'slam') {
    if (b.vy >= 0 && !b.landed && b.onGround) {
      b.landed = true; b.action = 'idle'; b.timer = b.phase >= 2 ? 1.6 : 2.2;
      G.shake = 4; SFX.boss();
      // 冲击波
      [-1, 1].forEach(d => G.projectiles.push({ x: b.x + b.w / 2, y: b.y + b.h - 14, vx: d * 250, vy: -40, w: 22, h: 22, fromEnemy: true, life: 3, dmgT: 0, shock: true }));
      burst(b.x + b.w / 2, b.y + b.h, '#b06bff', 18);
    }
  }

  b.vy += GRAV * dt;
  b.vy = Math.min(b.vy, 1500);
  b.wasAir = !b.onGround;
  moveAndCollide(b, dt);

  // 接触伤害 / 踩踏
  if (aabb(p, b)) {
    if (p.vy > 80 && (p.y + p.h) < b.y + b.h * 0.5) {
      hurtBoss(p.atk, p.facing, true);
      p.vy = -480; p.jumps = Math.max(p.jumps, 1);
      addCombo(); addScore(100 * Math.max(1, G.combo));
    } else if (b.dmgT <= 0 && p.invuln <= 0) { damagePlayer(1, b.x + b.w / 2); b.dmgT = 0.9; }
  }
}
function hurtBoss(dmg, dir, stomp) {
  const b = G.boss; if (!b || b.invuln > 0) return;
  b.hp -= dmg; b.flash = 0.12; b.invuln = stomp ? 0.25 : 0.18;
  b.vx += dir * 60; hitSpark(b.x + b.w / 2, b.y + b.h / 2); G.hitstop = 0.05;
  addFloat(b.x + b.w / 2, b.y, dmg, '#ff7eb3');
  SFX.hit();
  if (b.hp <= 0) { b.dead = true; winGame(); }
}
function bossSpread(b) {
  const p = G.player;
  const dx = p.x - (b.x + b.w / 2), dy = p.y - (b.y + b.h / 2), base = Math.atan2(dy, dx);
  const n = b.phase >= 3 ? 5 : 4;
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * 0.22;
    G.projectiles.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, w: 20, h: 20, fromEnemy: true, life: 4, dmgT: 0 });
  }
  SFX.boss();
}
function spawnMinion(b) {
  G.enemies.push(makeEnemy({ type: 'slime', x: b.x + (Math.random() < 0.5 ? -30 : b.w + 10), y: b.y }));
}

// ---------- 子弹 ----------
function updateProjectiles(dt) {
  const p = G.player;
  for (const pr of G.projectiles) {
    const psm = (pr.fromEnemy && G.timeSlowT > 0) ? 0.35 : 1; pr.x += pr.vx * dt * psm; pr.y += pr.vy * dt * psm; pr.life -= dt;
    if (pr.shock) pr.vy += 600 * dt; // 冲击波下坠
    if (pr.grav) pr.vy += pr.grav * dt; // 投弹怪的炸弹受重力下坠
    if (pr.life <= 0 || pr.x < -60 || pr.x > G.level.w + 60 || pr.y > VH + 60 || pr.y < -60) { if (pr.bomb) enemyBombExplode(pr); pr.dead = true; continue; }
    // 撞平台
    for (const pl of G.level.platforms) { if (pr.x > pl.x && pr.x < pl.x + pl.w && pr.y > pl.y && pr.y < pl.y + pl.h) { pr.dead = true; if (pr.bomb) enemyBombExplode(pr); else hitSpark(pr.x, pr.y); break; } }
    for (const b of (G.blocks || [])) { if (!b.broken && pr.x > b.x && pr.x < b.x + b.w && pr.y > b.y && pr.y < b.y + b.h) { b.broken = true; pr.dead = true; hitSpark(pr.x, pr.y); SFX.brk(); burst(b.x + b.w / 2, b.y + b.h / 2, '#c89b5e', 10); break; } }
    if (pr.dead) continue;
    if (pr.star) {
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (aabb(pr, e)) {
          if (pr.pierce && pr.hit && pr.hit.has(e.id)) continue; // 穿透弹对同一敌人只判定一次
          if (pr.boom) { explode(pr); pr.dead = true; break; }   // 火箭：范围爆炸
          e.hp -= pr.dmg; e.flash = 0.12; e.vx += sign(pr.vx) * 120; e.vy = -120;
          SFX.hit(); hitSpark(e.x + e.w / 2, e.y + e.h / 2); addFloat(e.x + e.w / 2, e.y, pr.dmg, pr.col || '#ffd166');
          if (e.hp <= 0) killEnemy(e);
          if (pr.pierce) { if (!pr.hit) pr.hit = new Set(); pr.hit.add(e.id); }
          else { pr.dead = true; break; }
        }
      }
      if (!pr.dead && G.boss && !G.boss.dead && aabb(pr, G.boss)) {
        if (pr.boom) explode(pr); else hurtBoss(pr.dmg, sign(pr.vx));
        if (!pr.pierce) pr.dead = true;
      }
    } else       if (pr.fromEnemy) {
      if (aabb(p, pr)) { if (p.shieldT > 0) { pr.fromEnemy = false; pr.vx = -pr.vx * 1.25; pr.vy = -Math.abs(pr.vy) - 140; pr.dmg = Math.max(2, (p.atk || 3)); pr.life = 4; pr.cl = '#7fffd4'; hitSpark(pr.x, pr.y); } else { damagePlayer(1, pr.x); pr.dead = true; if (pr.bomb) enemyBombExplode(pr); else hitSpark(pr.x, pr.y); } }
    }
    G.blocks = (G.blocks || []).filter(b => !b.broken);
  }
  G.projectiles = G.projectiles.filter(pr => !pr.dead);
  if (G.beams) { for (const b of G.beams) b.life -= dt; G.beams = G.beams.filter(b => b.life > 0); }
}

// 投弹怪的炸弹落地/到期爆炸：小范围伤害
function enemyBombExplode(pr) {
  burst(pr.x, pr.y, '#ff8a3d', 20);
  G.shake = Math.max(G.shake, 2.2);
  if (SFX.boom) SFX.boom(); else SFX.hit();
  const p = G.player;
  if (p && Math.hypot((p.x + p.w / 2) - pr.x, (p.y + p.h / 2) - pr.y) < 80) damagePlayer(1, pr.x);
}

// ---------- 伤害玩家 ----------
function damagePlayer(dmg, srcX) {
  const p = G.player;
  if (p.invuln > 0 || p.shieldT > 0 || p.starT > 0) return;
  p.hp -= dmg; p.invuln = 1.6;
  G.combo = 0; G.comboT = 0;
  p.vx = sign(p.x - srcX) * 320; p.vy = -300;
  G.shake = 0; SFX.hurt(); G.hurtFlash = 0.4;
  burst(p.x + p.w / 2, p.y + p.h / 2, '#ff6b6b', 12);
  if (p.hp <= 0) { p.hp = 0; reviveAtCheckpoint(); }
}

// ---------- 收集 ----------
function updateCollect(dt) {
  const p = G.player;
  const all = G.coins.concat(G.stars);
  for (const c of all) {
    if (c.got) continue;
    c.t += dt;
    if (c.vy !== undefined) { c.vy += GRAV * 0.5 * dt; c.y += c.vy * dt; if (c.y > 460) { c.y = 460; c.vy = 0; } }
    // 磁铁增益：把附近星币吸过来
    if (p.magnetT > 0) {
      const dx = (p.x + p.w / 2) - (c.x + c.w / 2), dy = (p.y + p.h / 2) - (c.y + c.h / 2), d = Math.hypot(dx, dy) || 1;
      if (d < 190) { c.x += dx / d * 240 * dt; c.y += dy / d * 240 * dt; }
    }
    const cb = { x: c.x - 6, y: c.y - 6, w: c.w + 12, h: c.h + 12 };
    if (aabb(p, cb)) {
      c.got = true;
      if (G.coins.includes(c)) { p.coins++; addScore(10); SFX.coin(); burst(c.x, c.y, '#ffd166', 8); }
      else { p.stars++; addScore(50); SFX.star(); burst(c.x, c.y, '#6fb1ff', 10); addFloat(c.x, c.y, '碎片+1', '#6fb1ff'); }
    }
  }
  G.coins = G.coins.filter(c => !c.got);
  G.stars = G.stars.filter(c => !c.got);
  // 增益道具
  for (const c of G.powers) {
    if (c.got) continue;
    c.t += dt;
    if (c.vy !== undefined) { c.vy += GRAV * 0.5 * dt; c.y += c.vy * dt; if (c.y > 460) { c.y = 460; c.vy = 0; } }
    const cb = { x: c.x - 12, y: c.y - 12, w: c.w + 24, h: c.h + 24 };
    if (aabb(p, cb)) {
      c.got = true; applyPower(p, c.kind); SFX.up(); burst(c.x, c.y, c.col, 14); addFloat(c.x, c.y, c.name, c.col);
    }
  }
  G.powers = G.powers.filter(c => !c.got);
  // 宝箱：接触即开，爆出星币与偶发天赋星
  for (const c of G.chests) {
    if (c.opened) continue;
    if (aabb(p, c)) {
      c.opened = true;
      const n = 6 + Math.floor(rand(0, 5));
      p.coins += n;
      burst(c.x + 15, c.y + 10, '#ffd166', 18);
      addFloat(c.x + 15, c.y - 6, '+' + n + '★', '#ffd166');
      SFX.chest();
      if (Math.random() < 0.4) { p.stars += 1; addFloat(c.x + 15, c.y - 26, '★+1 天赋星', '#5be0ff'); }
    }
  }
  G.chests = G.chests.filter(c => !c.opened);
  // 传送门：碰到入口 → 瞬移到出口（带短冷却，避免来回弹）
  G.keys = G.keys || 0;
  for (const pt of (G.portals || [])) {
    pt.cool = Math.max(0, (pt.cool || 0) - dt);
    if (pt.cool <= 0 && aabb(p, { x: pt.ax, y: pt.ay, w: pt.w || 36, h: pt.h || 52 })) {
      p.x = pt.bx; p.y = pt.by; p.vx = 0; p.vy = 0; p.invuln = 0.7; pt.cool = 1.2;
      SFX.portal(); burst(pt.bx + (pt.w || 36) / 2, pt.by + (pt.h || 52) / 2, '#8be0ff', 16);
    }
  }
  // 钥匙拾取
  for (const k of (G.keyItems || [])) {
    if (k.got) continue;
    if (aabb(p, k)) { k.got = true; G.keys++; SFX.key(); addFloat(k.x, k.y, '钥匙 +1', '#ffd166'); burst(k.x + 11, k.y + 11, '#ffd166', 12); }
  }
  // 锁门：凑够钥匙自动开启，否则当作墙挡住
  for (const g of (G.gates || [])) {
    if (g.open) continue;
    if (G.keys >= (g.req || 1)) { g.open = true; SFX.gate(); burst(g.x + g.w / 2, g.y + g.h / 2, '#ffd166', 18); continue; }
    if (aabb(p, g)) { if (p.x + p.w / 2 < g.x + g.w / 2) p.x = g.x - p.w; else p.x = g.x + g.w; p.vx = 0; }
  }
  // 可破坏木箱：从上方踩下即碎，给一段小弹跳
  for (const b of (G.blocks || [])) {
    if (b.broken) continue;
    if (p.vy >= 0 && aabb(p, { x: b.x, y: b.y - 6, w: b.w, h: b.h + 12 }) && p.y + p.h - p.vy * dt <= b.y + 10) {
      b.broken = true; p.vy = -520; p.jumps = p.maxJumps; SFX.brk(); burst(b.x + b.w / 2, b.y + b.h / 2, '#c89b5e', 14);
    }
  }
}
// 激光栅栏：周期性通电，通电时碰到扣血（有预警闪烁，给玩家反应时间）
function updateLasers(dt) {
  if (!G.lasers || !G.lasers.length) return;
  const p = G.player;
  for (const L of G.lasers) {
    L.t = (L.t + dt) % L.period;
    L.warn = L.t < 0.6;
    L.on = L.t >= 0.6 && L.t < 1.9;
    if (L.on && p.invuln <= 0 && aabb(p, { x: L.x - 4, y: L.y, w: L.w + 8, h: L.h })) {
      damagePlayer(1, L.x + L.w / 2);
      burst(p.x + p.w / 2, p.y + p.h / 2, '#ff5b5b', 14);
    }
  }
}
function updateCheckpoints() {
  if (!G.checkpoints) return;
  const p = G.player;
  for (const c of G.checkpoints) {
    if (c.activated) continue;
    if (aabb(p, { x: c.x - 30, y: c.y - 120, w: 60, h: 210 })) {
      c.activated = true;
      G.checkpoint = { x: c.x, y: c.y, activated: true };
      addFloat(c.x, c.y - 34, '✦ 存档点已激活', '#7fe7c4');
      SFX.key();
    }
  }
}
function applyPower(p, kind) {
  if (kind === 'rapid') p.rapidT = 9;
  else if (kind === 'shield') p.shieldT = 9;
  else if (kind === 'magnet') p.magnetT = 9;
  else if (kind === 'heal') { p.hp = Math.min(p.maxHp, p.hp + 3); addFloat(p.x, p.y - 30, '+3❤', '#ff6b8b'); }
  else if (kind === 'bomb') { // 清屏弹：炸飞当前关卡所有普通敌人
    for (const e of G.enemies) { if (!e.dead && e.type !== 'boss') { e.dead = true; burst(e.x + e.w / 2, e.y + e.h / 2, '#ffd166', 14); } }
    G.shake = 8; if (SFX.boom) SFX.boom(); else SFX.hit();
    addFloat(p.x, p.y - 30, '清屏!', '#ffd166');
  }
  else if (kind === 'star') { p.starT = 4.5; addFloat(p.x + p.w / 2, p.y - 30, '无敌 4.5s！', '#ffd700'); }
  else if (kind === 'dbl') { p.dblT = 20; addFloat(p.x + p.w / 2, p.y - 30, '得分 x2！', '#3fae7a'); }
  else if (kind === 'hour') { G.timeSlowCD = 0; G.timeSlowT = Math.max(G.timeSlowT, 3); addFloat(p.x + p.w / 2, p.y - 30, '时缓就绪！', '#3fa9c9'); }
}
// 统一加分：吃到「双倍分」时收益翻倍，让增益有明确体感
function addScore(n) {
  const p = G.player; if (!p) return;
  p.score += Math.round(n * ((p.dblT > 0) ? 2 : 1));
}

// ---------- 终点 ----------
function checkGoal() {
  const p = G.player;
  if (!G.level.goal) return;
  const g = { x: G.level.goal.x - 24, y: G.level.goal.y - 70, w: 48, h: 90 };
  if (aabb(p, g)) levelClear();
}

// ---------- 粒子/飘字 ----------
function spawnDust(x, y, n) { for (let i = 0; i < n; i++) G.particles.push({ x, y, vx: rand(-80, 80), vy: rand(-120, -20), life: rand(0.3, 0.6), col: 'rgba(255,255,255,.9)', r: rand(2, 4) }); }
function burst(x, y, col, n) { for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), s = rand(60, 260); G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), col, r: rand(2, 5) }); } }
function hitSpark(x, y) { for (let i = 0; i < 6; i++) { const a = rand(0, Math.PI * 2), s = rand(80, 220); G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.15, 0.35), col: '#fff3b0', r: rand(1.5, 3) }); } }
function updateParticles(dt) {
  for (const pt of G.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 500 * dt; pt.life -= dt; }
  G.particles = G.particles.filter(pt => pt.life > 0);
  for (const f of G.floats) { f.y -= 40 * dt; f.life -= dt; }
  G.floats = G.floats.filter(f => f.life > 0);
}
function addFloat(x, y, txt, col) { G.floats.push({ x, y, txt: String(txt), col, life: 0.8 }); }
function addCombo() {
  G.combo++; G.comboT = 2.6;
  SFX.combo(G.combo);
  if (G.combo > 1 && G.combo % 5 === 0) addFloat(G.player.x + G.player.w / 2, G.player.y - 24, '连击 x' + G.combo + '!', '#ff7eb3');
}

// ---------- 移动平台 ----------
function updatePlatforms(dt) {
  for (const p of G.level.platforms) {
    if (p.broken) { p.brokenT = (p.brokenT || 0) + dt; if (p.brokenT > 3.5) { p.broken = false; p.crackT = 0; p._warn = false; } p.dx = 0; p.dy = 0; continue; }
    if (!p.move) { p.dx = 0; p.dy = 0; continue; }
    p.mt += dt;
    const off = Math.sin(p.mt * p.move.speed) * p.move.range;
    if (p.move.axis === 'y') { p.dy = off - p.oy; p.oy = off; p.y = p.baseY + off; }
    else { p.dx = off - p.ox; p.ox = off; p.x = p.baseX + off; }
  }
}

// ---------- 摄像机 ----------
function updateCamera(dt) {
  const p = G.player;
  const tx = clamp(p.x + p.w / 2 - VW / 2, 0, G.level.w - VW);
  G.cam.x = lerp(G.cam.x, tx, Math.min(1, 8 * dt));
  G.cam.y = 0;
  G.shake = Math.max(0, G.shake - dt * 30);
}

// ---------- 主循环 ----------
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 1 / 30);
  G.time += dt;
  G.hurtFlash = Math.max(0, (G.hurtFlash || 0) - dt);

  if (G.state === 'playing') {
    if (G.hitstop > 0) { G.hitstop -= dt; }
    else {
      updatePlatforms(dt);
      updatePlayer(dt);
      if (G.timeSlowT > 0) G.timeSlowT -= dt;
      if (G.timeSlowCD > 0) G.timeSlowCD -= dt;
      const sdt = (G.timeSlowT > 0) ? dt * 0.35 : dt;
      if (G.state === 'playing') updateEnemies(sdt);
      if (G.state === 'playing') updateBoss(sdt);
      if (G.state === 'playing') updateProjectiles(dt);
      if (G.state === 'playing') updateCollect(dt);
      if (G.state === 'playing') updateCheckpoints();
      if (G.state === 'playing') updateLasers(dt);
      if (G.state === 'playing') {
        const _pp = G.player;
        if (Math.random() < 0.004 && (G.goldStars||[]).length < 2) G.goldStars.push({ x: rand(60, VW-60), y: rand(80, 280), t: 0 });
        for (let _gi = (G.goldStars||[]).length - 1; _gi >= 0; _gi--) {
          const _gs = G.goldStars[_gi]; _gs.t += dt; _gs.y += Math.sin(_gs.t*2)*0.5;
          if (aabb(_pp, { x: _gs.x-14, y: _gs.y-14, w: 28, h: 28 })) { _pp.coins += 25; addScore(500); burst(_gs.x, _gs.y, '#ffd700', 20); G.goldStars.splice(_gi, 1); }
          else if (_gs.t > 30) G.goldStars.splice(_gi, 1);
        }
      }
      // 引导提示：靠近即弹出顶部横幅，看完自动消失（不再立一块常驻木牌）
      if (G.signs && G.signs.length) {
        const pl2 = G.player;
        for (const s of G.signs) {
          if (s.seen) continue;
          if (Math.abs((pl2.x + pl2.w / 2) - s.x) < 120 && Math.abs((pl2.y + pl2.h / 2) - s.y) < 140) {
            s.seen = true;
            G.signHint = { text: s.text, until: performance.now() + 4200 };
          }
        }
      }
      if (G.state === 'playing') updateCrates(dt);
      if (G.state === 'playing') checkGoal();
      updateParticles(dt);
      updateCamera(dt);
    }
  } else {
    updateParticles(dt);
  }

  render();
  updateTouchUI();
  // 清空单次按键
  for (const k in pressed) pressed[k] = false;
  requestAnimationFrame(frame);
}

// ---------- 渲染 ----------
function render() {
  ctx.setTransform(RS, 0, 0, RS, 0, 0); // 每帧锁定缩放，避免 save/restore 丢失变换
  ctx.clearRect(0, 0, VW, VH);
  if (G.state === 'title' || !G.level) { drawTitleBg(); return; }
  const sh = G.shake;
  const ox = -G.cam.x + (sh > 0 ? rand(-sh, sh) : 0);
  const oy = (sh > 0 ? rand(-sh, sh) : 0);
  ctx.save();
  ctx.translate(ox, oy);
  drawBackground();
  drawPlatforms();
  drawBounces();
  drawCoins();
  drawCheckpoints();
  drawStars();
  drawPowers();
  drawCrates();
  drawSigns();
  drawChests();
  if (G.level.goal) drawGoal();
  drawPortals(); drawKeys(); drawGates(); drawBlocks(); drawLasers();
  for (const e of G.enemies) drawEnemy(e);
  if (G.boss) drawBoss(G.boss);
  drawProjectiles();
  drawPlayer(G.player);
  drawParticles();
  drawFloats();
  ctx.restore();
  for (const _gs of (G.goldStars||[])) { ctx.save(); ctx.translate(_gs.x, _gs.y); ctx.rotate(_gs.t*1.2); ctx.shadowColor='#ffd700'; ctx.shadowBlur=16; ctx.fillStyle='#ffd700'; ctx.beginPath(); for (let _kk=0;_kk<5;_kk++){ const _a=-Math.PI/2+_kk*2*Math.PI/5; ctx.lineTo(Math.cos(_a)*11,Math.sin(_a)*11); const _a2=_a+Math.PI/5; ctx.lineTo(Math.cos(_a2)*5,Math.sin(_a2)*5);} ctx.closePath(); ctx.fill(); ctx.restore(); }
  drawHUD();
}

// 弹药补给箱：外观颜色跟随当前天赋枪
function drawCrates() {
  const gp = G.player; if (!gp) return;
  const W = WEAPONS[gp.gun] || WEAPONS.pistol;
  for (const c of G.crates) {
    const x = c.x, y = c.y + Math.sin(c.t * 3) * 3;
    const g = ctx.createRadialGradient(x + 14, y + 12, 2, x + 14, y + 12, 34);
    g.addColorStop(0, hexA(W.col, .35)); g.addColorStop(1, hexA(W.col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - 20, y - 22, 68, 68);
    ctx.fillStyle = '#b98b5e'; rr(ctx, x, y, 28, 24, 5); ctx.fill();
    ctx.strokeStyle = '#8a6538'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 2, y + 7); ctx.lineTo(x + 26, y + 7); ctx.stroke();
    ctx.fillStyle = W.col; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('A', x + 14, y + 20);
  }
}

function drawTitleBg() {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#bfe3ff'); g.addColorStop(1, '#ffe9f3');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  for (let i = 0; i < 8; i++) { const x = (i * 137 + G.time * 12) % (VW + 120) - 60; ctx.beginPath(); ctx.ellipse(x, 120 + (i % 3) * 60, 60, 26, 0, 0, 7); ctx.fill(); }
}

const THEMES = {
  meadow:  { sky: ['#7fd4ff', '#b6ffce'], hill: ['#54e08a', '#a6f57a'], cloud: 'rgba(255,255,255,.92)', plat: ['#8dff9e', '#23b85f'], accent: '#2fae5a', accent2: '#ff7eb3' },
  cave:    { sky: ['#5466ff', '#b06bff'], hill: ['#7b8cff', '#b07bff'], cloud: 'rgba(230,225,255,.6)',  plat: ['#b59bff', '#6a3fd6'], accent: '#b07bff', accent2: '#7fe0ff' },
  sky:     { sky: ['#5fc2ff', '#ff9ee0'], hill: ['#ff9ee0', '#8fd4ff'], cloud: 'rgba(255,255,255,.95)', plat: ['#bfe6ff', '#4fa8ff'], accent: '#ffffff', accent2: '#cfeaff' },
  boss:    { sky: ['#6a3dff', '#ff5bb8'], hill: ['#9b5bff', '#ff5bb0'], cloud: 'rgba(255,220,245,.5)',  plat: ['#ff9bdd', '#a83fb5'], accent: '#ff5bb0', accent2: '#ffd166' },
  crystal: { sky: ['#4fe0ff', '#c08bff'], hill: ['#7fd0ff', '#c79bff'], cloud: 'rgba(255,255,255,.88)', plat: ['#aef0ff', '#3fb8e0'], accent: '#7fe0ff', accent2: '#cfeaff' },
  sunset:  { sky: ['#ff944d', '#ff5bb8'], hill: ['#ff8a5b', '#ff5bb0'], cloud: 'rgba(255,245,235,.92)',plat: ['#ffc09a', '#ff5b8a'], accent: '#ff7a3d', accent2: '#ffd166' },
  forest:  { sky: ['#7fe87f', '#d6ffb0'], hill: ['#33d06a', '#9bf07a'], cloud: 'rgba(255,255,255,.88)', plat: ['#9bf07a', '#1fae5a'], accent: '#2fae5a', accent2: '#9bf07a' },
  // 第七关 · 星轨高塔：深邃夜空 + 金色星轨
  starway: { sky: ['#0e1745', '#3a2a7a'], hill: ['#1c2a63', '#4a3a9a'], cloud: 'rgba(210,220,255,.5)', plat: ['#6d7bd6', '#2b2f7a'], accent: '#ffd166', accent2: '#8fa8ff' },
  // 第九关 · 熔岩裂谷：焦黑岩壁 + 橙红熔岩
  lava:    { sky: ['#2b0d16', '#8f2b1e'], hill: ['#4a1420', '#b03a1e'], cloud: 'rgba(255,190,120,.45)', plat: ['#7a3a2a', '#3a1410'], accent: '#ff7a3d', accent2: '#ffd166' },
  // 第十一关 · 星海迷城：靛紫星海 + 青色辉光
  starsea: { sky: ['#0b1030', '#3d1a6b'], hill: ['#171a4d', '#5b2a9a'], cloud: 'rgba(160,220,255,.5)', plat: ['#3fa9c9', '#1d3f8a'], accent: '#7fe0ff', accent2: '#c79bff' },
  // Boss 变体：再临（血色）/ 真身（深渊）
  boss2:   { sky: ['#4a0d2a', '#c7245c'], hill: ['#7a1440', '#ff4d7d'], cloud: 'rgba(255,200,220,.45)', plat: ['#ff6fae', '#8a1f4a'], accent: '#ff4d7d', accent2: '#ffd166' },
  boss3:   { sky: ['#12021f', '#4a0a5e'], hill: ['#2a0640', '#7a1a8f'], cloud: 'rgba(220,180,255,.4)', plat: ['#a05bff', '#3a0a55'], accent: '#c05bff', accent2: '#ff5bb0' },
};
function drawBackground() {
  const t = THEMES[G.level.theme] || THEMES.meadow;
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, t.sky[0]); g.addColorStop(1, t.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  // 远山（视差）
  const px = G.cam.x * 0.3;
  ctx.fillStyle = t.hill[0];
  for (let i = -1; i < 8; i++) { const x = i * 320 - (px % 320); ctx.beginPath(); ctx.moveTo(x, VH); ctx.quadraticCurveTo(x + 160, 300, x + 320, VH); ctx.fill(); }
  ctx.fillStyle = t.hill[1];
  const px2 = G.cam.x * 0.5;
  for (let i = -1; i < 9; i++) { const x = i * 280 - (px2 % 280); ctx.beginPath(); ctx.moveTo(x, VH); ctx.quadraticCurveTo(x + 140, 360, x + 280, VH); ctx.fill(); }
  // 云
  ctx.fillStyle = t.cloud;
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 260 - G.cam.x * 0.2) % (G.level.w + 400) + G.level.w + 400) % (G.level.w + 400) - 200;
    ctx.beginPath(); ctx.ellipse(cx, 90 + (i % 3) * 50, 60, 24, 0, 0, 7); ctx.fill();
  }
  drawThemeDeco(t);
}
// 主题专属背景装饰（确定性平铺，随相机视差）
function drawThemeDeco(t) {
  const rawTh = G.level.theme;
  let th = rawTh;
  // 新主题先复用相近的既有装饰骨架，下面再叠加各自专属元素
  if (th === 'starway' || th === 'starsea') th = 'sky';
  else if (th === 'boss2' || th === 'boss3') th = 'boss';
  const W = VW, H = VH;
  const grounds = G.level.platforms.filter(p => p.h > 60);
  const gy = grounds.length ? Math.max.apply(null, grounds.map(p => p.y)) : 480;
  ctx.save();
  if (th === 'meadow') {
    let g = ctx.createRadialGradient(W - 90, 76, 8, W - 90, 76, 72); g.addColorStop(0, 'rgba(255,224,138,.9)'); g.addColorStop(1, 'rgba(255,224,138,0)');
    ctx.fillStyle = g; ctx.fillRect(W - 162, 4, 144, 144);
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(W - 90, 76, 28, 0, 7); ctx.fill();
    for (let i = -1; i < 18; i++) { const x = i * 86 - ((G.cam.x * 0.6) % 86); drawGrass(x, gy, (i * 53) % 7 === 0); }
  } else if (th === 'cave') {
    for (let i = -1; i < 12; i++) { const x = i * 150 - ((G.cam.x * 0.25) % 150); drawStalactite(x, 0, 26 + ((i * 37) % 22), '#7b6fd0'); }
    for (let i = -1; i < 14; i++) { const x = i * 120 - ((G.cam.x * 0.6) % 120); drawCrystal(x, gy - 4, 14, '#7fe0ff'); }
    let fg = ctx.createLinearGradient(0, H - 170, 0, H); fg.addColorStop(0, 'rgba(40,20,70,0)'); fg.addColorStop(1, 'rgba(40,20,70,.35)');
    ctx.fillStyle = fg; ctx.fillRect(0, H - 170, W, 170);
  } else if (th === 'sky') {
    for (let i = 0; i < 26; i++) { const x = (i * 137 + 40) % (W + 80) - 40; const y = (i * 71 % (H - 120)) + 20; const a = 0.35 + 0.4 * Math.sin(G.time * 2 + i); ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); }
    if (rawTh === 'sky') drawRainbow(W * 0.5, 150, 90); // 彩虹只给真正的云端天梯
  } else if (th === 'boss') {
    let fg = ctx.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.4, W * 0.8); fg.addColorStop(0, 'rgba(60,10,40,0)'); fg.addColorStop(1, 'rgba(60,10,40,.4)');
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 10; i++) { const x = (i * 173 - G.cam.x * 0.15) % (W + 120) - 60; const y = 120 + (i * 97 % (H - 240)) + Math.sin(G.time + i) * 12; ctx.fillStyle = 'rgba(30,5,25,.5)'; ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + 12, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - 12, y); ctx.closePath(); ctx.fill(); }
    let rg = ctx.createRadialGradient(W / 2, -30, 10, W / 2, -30, 220); rg.addColorStop(0, 'rgba(255,80,160,.35)'); rg.addColorStop(1, 'rgba(255,80,160,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, 200);
  } else if (th === 'crystal') {
    for (let i = -1; i < 10; i++) { const x = i * 190 - ((G.cam.x * 0.4) % 190); drawCrystal(x, gy, 60 + ((i * 53) % 40), '#bff'); }
    for (let i = 0; i < 22; i++) { const x = (i * 151 + 30) % (W + 60) - 30; const y = (i * 83 % (H - 100)) + 30; const a = 0.3 + 0.5 * Math.abs(Math.sin(G.time * 1.5 + i)); ctx.fillStyle = 'rgba(200,240,255,' + a.toFixed(2) + ')'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill(); }
  } else if (th === 'sunset') {
    let sg = ctx.createRadialGradient(W * 0.7, 120, 20, W * 0.7, 120, 150); sg.addColorStop(0, 'rgba(255,120,70,.85)'); sg.addColorStop(1, 'rgba(255,120,70,0)');
    ctx.fillStyle = sg; ctx.fillRect(W * 0.7 - 150, -30, 300, 300);
    ctx.fillStyle = '#ff7a3d'; ctx.beginPath(); ctx.arc(W * 0.7, 120, 46, 0, 7); ctx.fill();
    for (let i = 0; i < 5; i++) { const x = (i * 160 - G.cam.x * 0.1 + G.time * 18) % (W + 80) - 40; const y = 90 + (i * 47 % 120); drawBird(x, y, 7); }
  } else if (th === 'forest') {
    for (let i = -1; i < 8; i++) { const x = i * 240 - ((G.cam.x * 0.3) % 240); ctx.fillStyle = 'rgba(20,80,40,.28)'; rr(ctx, x, 0, 46, H, 12); ctx.fill(); }
    for (let i = -1; i < 14; i++) { const x = i * 130 - ((G.cam.x * 0.5) % 130); drawVine(x, 0, 70 + ((i * 41) % 60)); }
    for (let i = 0; i < 10; i++) { const x = (i * 197 % (W + 60)) - 30; const y = (i * 113 % (H - 100)) + 30; let lg = ctx.createRadialGradient(x, y, 2, x, y, 40); lg.addColorStop(0, 'rgba(220,255,180,.18)'); lg.addColorStop(1, 'rgba(220,255,180,0)'); ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, y, 40, 0, 7); ctx.fill(); }
  }
  // ---- 新主题专属叠加装饰 ----
  if (rawTh === 'lava') {
    // 熔岩：地面裂缝透出橙红岩浆光，空中飘着上升火星
    for (let i = -1; i < 10; i++) {
      const x = i * 170 - ((G.cam.x * 0.5) % 170);
      let lg = ctx.createLinearGradient(0, gy - 6, 0, gy + 40);
      lg.addColorStop(0, 'rgba(255,150,60,.9)'); lg.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.moveTo(x, gy + 2); ctx.lineTo(x + 28, gy + 2); ctx.lineTo(x + 14, gy + 36); ctx.closePath(); ctx.fill();
    }
    let hg = ctx.createLinearGradient(0, H - 120, 0, H); hg.addColorStop(0, 'rgba(255,80,20,0)'); hg.addColorStop(1, 'rgba(255,80,20,.28)');
    ctx.fillStyle = hg; ctx.fillRect(0, H - 120, W, 120);
    for (let i = 0; i < 16; i++) {
      const x = ((i * 127 + 30 - G.cam.x * 0.3) % (W + 60) + W + 60) % (W + 60) - 30;
      const y = H - ((G.time * 40 + i * 37) % (H - 140));
      ctx.fillStyle = 'rgba(255,190,90,' + (0.25 + 0.35 * Math.abs(Math.sin(G.time * 2 + i))).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill();
    }
  } else if (rawTh === 'starway') {
    // 星轨：缓慢旋转的金色同心弧 + 闪烁星点
    ctx.save(); ctx.translate(W * 0.5, H * 0.62); ctx.rotate(G.time * 0.06);
    for (let r = 90; r <= 300; r += 70) {
      ctx.strokeStyle = 'rgba(255,209,102,' + (0.10 + 0.05 * Math.sin(G.time + r)).toFixed(2) + ')';
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 1.4); ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 34; i++) {
      const x = (i * 113 + 20) % (W + 40) - 20, y = (i * 67 % (H - 80)) + 20;
      const a = 0.3 + 0.6 * Math.abs(Math.sin(G.time * 2.2 + i));
      ctx.fillStyle = 'rgba(255,225,150,' + a.toFixed(2) + ')'; ctx.beginPath(); ctx.arc(x, y, 1.7, 0, 7); ctx.fill();
    }
  } else if (rawTh === 'starsea') {
    // 星海：青紫星云 + 横向流动的星点
    for (let i = 0; i < 5; i++) {
      const x = ((i * 220 - G.cam.x * 0.12) % (W + 200) + W + 200) % (W + 200) - 100, y = 120 + (i * 73 % 180);
      let ng = ctx.createRadialGradient(x, y, 4, x, y, 130); ng.addColorStop(0, 'rgba(120,220,255,.16)'); ng.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = ng; ctx.beginPath(); ctx.arc(x, y, 130, 0, 7); ctx.fill();
    }
    for (let i = 0; i < 40; i++) {
      const x = ((i * 97 + G.time * 12) % (W + 40) + W + 40) % (W + 40) - 20, y = (i * 59 % (H - 60)) + 16;
      const a = 0.25 + 0.55 * Math.abs(Math.sin(G.time * 1.8 + i * 1.7));
      ctx.fillStyle = 'rgba(190,235,255,' + a.toFixed(2) + ')'; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}
function drawGrass(x, baseY, flower) {
  ctx.strokeStyle = '#2fae5a'; ctx.lineWidth = 2;
  for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * 5, baseY); ctx.quadraticCurveTo(x + k * 5 + 3, baseY - 10, x + k * 5 + k * 4, baseY - 18); ctx.stroke(); }
  if (flower) { ctx.fillStyle = '#ff7eb3'; ctx.beginPath(); ctx.arc(x + 4, baseY - 18, 3.2, 0, 7); ctx.fill(); ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(x + 4, baseY - 18, 1.3, 0, 7); ctx.fill(); }
}
function drawStalactite(x, topY, len, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x + 12, topY); ctx.lineTo(x + 6, topY + len); ctx.closePath(); ctx.fill(); }
function drawCrystal(x, baseY, h, col) {
  let g = ctx.createLinearGradient(x, baseY - h, x, baseY); g.addColorStop(0, hexA(col, .9)); g.addColorStop(1, hexA(col, .25));
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 9, baseY); ctx.lineTo(x, baseY - h); ctx.lineTo(x + 9, baseY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(x, baseY - h); ctx.lineTo(x + 3, baseY - h * 0.5); ctx.lineTo(x, baseY); ctx.closePath(); ctx.fill();
}
function drawRainbow(cx, cy, r) { const cols = ['#ff6b6b', '#ffb04a', '#ffe066', '#6bde8a', '#5fd0ff', '#b06bff']; for (let i = 0; i < cols.length; i++) { ctx.strokeStyle = cols[i]; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, r - i * 6, Math.PI, 0); ctx.stroke(); } }
function drawBird(x, y, s) { ctx.strokeStyle = 'rgba(60,40,60,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x - s / 2, y - s / 2, x, y); ctx.quadraticCurveTo(x + s / 2, y - s / 2, x + s, y); ctx.stroke(); }
function drawVine(x, topY, len) { ctx.strokeStyle = '#2fae5a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, topY); ctx.quadraticCurveTo(x + 8, topY + len / 2, x, topY + len); ctx.stroke(); for (let k = 1; k <= 3; k++) { const yy = topY + len * k / 3.5; ctx.fillStyle = '#9bf07a'; ctx.beginPath(); ctx.ellipse(x + (k % 2 ? 6 : -6), yy, 5, 3, k % 2 ? 0.6 : -0.6, 0, 7); ctx.fill(); } }
function drawPlatDeco(th, x, y) {
  if (th === 'meadow') { ctx.fillStyle = '#2fae5a'; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * 4, y - 1); ctx.lineTo(x + k * 4 + 2, y - 9); ctx.lineTo(x + k * 4 + 4, y - 1); ctx.closePath(); ctx.fill(); } }
  else if (th === 'forest') { ctx.fillStyle = '#2fae5a'; ctx.beginPath(); ctx.ellipse(x, y - 3, 6, 3.4, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#9bf07a'; ctx.beginPath(); ctx.ellipse(x + 4, y - 5, 3.5, 2, 0.5, 0, 7); ctx.fill(); }
  else if (th === 'cave' || th === 'boss') { ctx.fillStyle = th === 'boss' ? '#ff5bb0' : '#b07bff'; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x, y - 8); ctx.lineTo(x + 4, y); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(x, y - 4, 1.4, 0, 7); ctx.fill(); }
  else if (th === 'crystal') { ctx.fillStyle = '#7fe0ff'; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x, y - 9); ctx.lineTo(x + 4, y); ctx.closePath(); ctx.fill(); }
  else if (th === 'sunset') { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(x, y - 4, 2.6, 0, 7); ctx.fill(); }
  else if (th === 'sky') { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x, y - 4, 3, 0, 7); ctx.fill(); }
}
function drawPlatforms() {
  const t = THEMES[G.level.theme] || THEMES.meadow;
  const pc = t.plat || ['#cfe6ff', '#9cc2ec'];
  for (const p of G.level.platforms) {
    if (p.y > VH + 4) continue;
    if (p.broken) { // 崩塌中：只画几块下坠的碎屑残影
      ctx.fillStyle = 'rgba(180,150,100,.32)';
      for (let k = 0; k < 3; k++) ctx.fillRect(p.x + k * (p.w / 3) + 6, p.y + 4, p.w / 3 - 12, 6);
      continue;
    }
    const moving = !!p.move;
    const crumble = !!p.crumble, conv = p.conv || 0;
    const baseCol = crumble ? ['#e7c089', '#b9814a'] : (conv ? ['#bcd0ff', '#6f8fe0'] : pc);
    const grd = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    grd.addColorStop(0, baseCol[0]); grd.addColorStop(1, baseCol[1]);
    ctx.fillStyle = grd; rr(ctx, p.x, p.y, p.w, p.h, 10); ctx.fill();
    // 顶部高光用主题色而非硬白，避免在熔岩/星轨等暗主题里突兀
    const acRgba = (hex, a) => { const h = (hex || '').replace('#',''); if (h.length < 6) return 'rgba(255,255,255,' + a + ')'; return 'rgba(' + parseInt(h.slice(0,2),16) + ',' + parseInt(h.slice(2,4),16) + ',' + parseInt(h.slice(4,6),16) + ',' + a + ')'; };
    ctx.fillStyle = moving ? 'rgba(150,232,255,.95)' : acRgba(t.accent2 || t.accent, .9);
    rr(ctx, p.x, p.y - 5, p.w, 12, 8); ctx.fill();
    ctx.fillStyle = moving ? 'rgba(150,232,255,.35)' : acRgba(t.accent || t.accent2, .45);
    rr(ctx, p.x + 8, p.y - 2, p.w - 16, 5, 3); ctx.fill();
    // 崩塌台：随裂纹计时显示越来越多裂痕（直观提示“快跳走”）
    if (crumble && p.crackT > 0.35) {
      ctx.strokeStyle = 'rgba(60,40,20,' + Math.min(0.85, (p.crackT - 0.35) * 2.2) + ')';
      ctx.lineWidth = 1.5;
      const seg = Math.max(1, Math.floor(p.crackT * 6));
      for (let k = 1; k <= seg; k++) {
        const cx = p.x + (p.w * k) / (seg + 1);
        ctx.beginPath(); ctx.moveTo(cx, p.y + 2); ctx.lineTo(cx + 6, p.y + p.h - 2); ctx.stroke();
      }
    }
    // 传送带：滚动箭头指示推送方向
    if (conv) {
      let off = (G.time * 60 * conv) % 28; if (off < 0) off += 28;
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      for (let ax = p.x + 8; ax < p.x + p.w - 10; ax += 28) {
        const mx = ax + off;
        ctx.beginPath(); ctx.moveTo(mx, p.y + 4); ctx.lineTo(mx - conv * 5, p.y + p.h / 2); ctx.lineTo(mx, p.y + p.h - 4); ctx.closePath(); ctx.fill();
      }
    }
    if (p.w > 120) {
      const n = Math.floor(p.w / 150);
      for (let i = 1; i <= n; i++) {
        const sx = p.x + (p.w * i) / (n + 1);
        drawPlatDeco(G.level.theme, sx, p.y);
      }
    }
    if (moving) { ctx.strokeStyle = 'rgba(120,220,255,.7)'; ctx.lineWidth = 2; rr(ctx, p.x, p.y, p.w, p.h, 10); ctx.stroke(); }
  }
}
function drawBounces() {
  for (const b of G.bounces) {
    const t = Math.sin(G.time * 6) * 2;
    ctx.fillStyle = 'rgba(120,90,200,.35)'; rr(ctx, b.x + 4, b.y + 10, b.w - 8, 10, 5); ctx.fill();
    ctx.fillStyle = '#9b6bff'; rr(ctx, b.x, b.y + 2 + t, b.w, 14, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; rr(ctx, b.x + 6, b.y + 4 + t, b.w - 12, 4, 2); ctx.fill();
    const cx = b.x + b.w / 2;
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.moveTo(cx, b.y - 8); ctx.lineTo(cx - 6, b.y - 1); ctx.lineTo(cx + 6, b.y - 1); ctx.closePath(); ctx.fill();
  }
}
function drawPowers() {
  for (const c of G.powers) {
    if (c.got) continue;
    const bob = Math.sin(c.t * 3) * 4;
    ctx.save(); ctx.translate(c.x + c.w / 2, c.y + c.h / 2 + bob);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, c.w);
    glow.addColorStop(0, c.col); glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.5; ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, c.w, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = c.col; ctx.beginPath(); ctx.arc(0, 0, c.w / 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(c.icon, 0, 1); ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
}
// ---------- 关卡引导牌 + 宝箱 ----------
function drawArrow(cx, cy, dir) {
  const a = 15;
  ctx.fillStyle = 'rgba(255,214,130,.96)';
  ctx.beginPath();
  if (dir === 'right') { ctx.moveTo(cx, cy); ctx.lineTo(cx + a, cy - a / 2); ctx.lineTo(cx + a, cy + a / 2); }
  else if (dir === 'left') { ctx.moveTo(cx, cy); ctx.lineTo(cx - a, cy - a / 2); ctx.lineTo(cx - a, cy + a / 2); }
  else if (dir === 'up') { ctx.moveTo(cx, cy); ctx.lineTo(cx - a / 2, cy - a); ctx.lineTo(cx + a / 2, cy - a); }
  else { ctx.moveTo(cx, cy); ctx.lineTo(cx - a / 2, cy + a); ctx.lineTo(cx + a / 2, cy + a); } // down
  ctx.closePath(); ctx.fill();
}
function drawSigns() {
  // 引导提示不再做成常驻木牌：靠近后以顶部横幅弹出，几秒后自动淡出消失
  if (!G.signHint) return;
  const left = G.signHint.until - performance.now();
  if (left <= 0) { G.signHint = null; return; }
  const lines = String(G.signHint.text).split('\n');
  ctx.save();
  ctx.setTransform(RS, 0, 0, RS, 0, 0); // 固定在屏幕上，不随相机移动
  ctx.globalAlpha = Math.min(1, left / 700);
  ctx.font = 'bold 17px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let w = 0; for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  const padX = 22, padY = 13, lh = 25;
  const bw = Math.min(VW - 60, w + padX * 2), bh = lines.length * lh + padY * 2;
  const x = (VW - bw) / 2, y = 92;
  ctx.fillStyle = 'rgba(28,24,48,.88)'; rr(ctx, x, y, bw, bh, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,214,130,.95)'; ctx.lineWidth = 2.5; rr(ctx, x, y, bw, bh, 16); ctx.stroke();
  ctx.fillStyle = '#fff4d6';
  lines.forEach((l, i) => ctx.fillText(l, VW / 2, y + padY + lh * i + lh / 2));
  ctx.restore();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
function drawChests() {
  for (const c of G.chests) {
    if (c.opened) continue;
    const x = c.x, y = c.y + Math.sin(c.t * 2) * 2;
    const g = ctx.createRadialGradient(x + 15, y + 13, 2, x + 15, y + 13, 38);
    g.addColorStop(0, 'rgba(255,200,90,.42)'); g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 18, y - 18, 66, 56);
    ctx.fillStyle = '#caa24a'; rr(ctx, x, y, 30, 26, 4); ctx.fill();
    ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 2; rr(ctx, x, y, 30, 26, 4); ctx.stroke();
    ctx.fillStyle = '#7a5a22'; ctx.fillRect(x, y + 11, 30, 5);
    ctx.fillStyle = '#ffd86b'; ctx.fillRect(x + 13, y + 9, 4, 9);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('?', x + 15, y + 22); ctx.textAlign = 'left';
  }
}
// ---------- 新机关：传送门 / 钥匙 / 锁门 / 木箱 ----------
function drawPortalRing(x, y, h, col, rot) {
  const cx = x + 18, cy = y + h / 2;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, h / 2 + 10);
  g.addColorStop(0, hexA(col, .5)); g.addColorStop(1, hexA(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, h / 2 + 10, 0, 7); ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = hexA(col, .9 - i * 0.28); ctx.lineWidth = 3 - i;
    ctx.beginPath(); ctx.ellipse(0, 0, 15 - i * 3, h / 2 - 3 - i * 3, 0, 0, 7); ctx.stroke();
  }
  ctx.restore();
}
function drawPortals() {
  for (const pt of (G.portals || [])) {
    drawPortalRing(pt.ax, pt.ay, pt.h || 52, '#5bd6ff', G.time * 3);
    drawPortalRing(pt.bx, pt.by, pt.h || 52, '#b58bff', -G.time * 3);
    ctx.save();
    ctx.strokeStyle = 'rgba(160,190,255,.35)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pt.ax + 18, pt.ay + (pt.h || 52) / 2); ctx.lineTo(pt.bx + 18, pt.by + (pt.h || 52) / 2); ctx.stroke();
    ctx.restore();
  }
}
function drawKeys() {
  for (const k of (G.keyItems || [])) {
    if (k.got) continue;
    k.t += 0.02;
    const bob = Math.sin(k.t + G.time * 2) * 4;
    ctx.save(); ctx.translate(k.x + 11, k.y + 11 + bob); ctx.rotate(Math.sin(k.t) * 0.3);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
    g.addColorStop(0, 'rgba(255,210,90,.6)'); g.addColorStop(1, 'rgba(255,210,90,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(-3, -3, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#c98a00'; ctx.fillRect(-1, 0, 3, 12); ctx.fillRect(-1, 8, 7, 3); ctx.fillRect(-1, 3, 5, 3);
    ctx.restore();
  }
}
function drawGates() {
  for (const g of (G.gates || [])) {
    ctx.save();
    if (g.open) {
      ctx.fillStyle = 'rgba(255,210,90,.16)'; rr(ctx, g.x, g.y, g.w, g.h, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('开', g.x + g.w / 2, g.y + g.h / 2 + 6); ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = 'rgba(255,180,60,.85)'; rr(ctx, g.x, g.y, g.w, g.h, 6); ctx.fill();
      ctx.strokeStyle = '#c98a00'; ctx.lineWidth = 3;
      for (let i = 0; i < g.h; i += 16) { ctx.beginPath(); ctx.moveTo(g.x, g.y + i); ctx.lineTo(g.x + g.w, g.y + i + 8); ctx.stroke(); }
      ctx.fillStyle = '#7a5200'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('锁', g.x + g.w / 2, g.y + g.h / 2 + 6); ctx.textAlign = 'left';
    }
    ctx.restore();
  }
}
function drawBlocks() {
  for (const b of (G.blocks || [])) {
    if (b.broken) continue;
    const t = Math.sin((b.t || 0) + G.time * 0.5) * 1.5;
    ctx.fillStyle = '#caa24a'; rr(ctx, b.x, b.y + t, b.w, b.h, 4); ctx.fill();
    ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 2; rr(ctx, b.x, b.y + t, b.w, b.h, 4); ctx.stroke();
    ctx.strokeStyle = '#a07a32'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(b.x, b.y + t); ctx.lineTo(b.x + b.w, b.y + t + b.h); ctx.moveTo(b.x + b.w, b.y + t); ctx.lineTo(b.x, b.y + t + b.h); ctx.stroke();
  }
}
function drawLasers() {
  for (const L of (G.lasers || [])) {
    const cx = L.x + L.w / 2;
    ctx.save();
    if (L.on) {
      // 通电：亮红激光柱 + 抖动白芯，醒目到不可能看漏
      const g = ctx.createLinearGradient(L.x - 12, 0, L.x + L.w + 12, 0);
      g.addColorStop(0, 'rgba(255,60,60,0)'); g.addColorStop(0.5, 'rgba(255,90,90,.85)'); g.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = g; ctx.fillRect(L.x - 12, L.y, L.w + 24, L.h);
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.fillRect(cx - 2.4 + Math.sin(G.time * 60) * 1.2, L.y, 4.8, L.h);
      ctx.fillStyle = '#ff5b5b';
      ctx.beginPath(); ctx.ellipse(cx, L.y, 12, 5, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, L.y + L.h, 12, 5, 0, 0, 7); ctx.fill();
    } else {
      const warnA = L.warn ? (0.35 + 0.45 * Math.abs(Math.sin(G.time * 22))) : 0.16;
      ctx.strokeStyle = 'rgba(255,120,120,' + warnA.toFixed(2) + ')';
      ctx.lineWidth = 3; ctx.setLineDash([7, 9]);
      ctx.beginPath(); ctx.moveTo(cx, L.y); ctx.lineTo(cx, L.y + L.h); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = L.warn ? 'rgba(255,110,110,.9)' : 'rgba(190,120,120,.65)';
      ctx.beginPath(); ctx.ellipse(cx, L.y, 9, 4, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, L.y + L.h, 9, 4, 0, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
}
function drawCheckpoints() {
  if (!G.checkpoints) return;
  for (const c of G.checkpoints) {
    const sx = c.x - G.cam.x, sy = c.y - G.cam.y;
    if (sx < -60 || sx > VW + 60) continue;
    const on = !!c.activated;
    // 常驻光柱：从存档点向上射出，远处也能看见（不再需要走近才显示）
    const beamA = (Math.sin(G.time * 2.2) * 0.5 + 0.5) * 0.26 + 0.16;
    const bg = ctx.createLinearGradient(sx, sy - 210, sx, sy);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, on ? 'rgba(70,214,160,' + beamA + ')' : 'rgba(150,185,240,' + beamA + ')');
    ctx.fillStyle = bg; ctx.fillRect(sx - 7, sy - 210, 14, 210);
    // 地面光晕：常亮（不再用 sin 做忽明忽暗的脉冲）
    const glow = ctx.createRadialGradient(sx, sy - 4, 2, sx, sy - 4, 46);
    glow.addColorStop(0, on ? 'rgba(70,214,160,.40)' : 'rgba(150,185,240,.30)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy - 4, 46, 0, Math.PI * 2); ctx.fill();
    // 旗杆
    ctx.fillStyle = on ? '#37c98d' : '#93a9c6';
    ctx.fillRect(sx - 3, sy - 72, 5, 72);
    // 旗面：常亮实体色，未激活也足够醒目
    ctx.beginPath();
    ctx.moveTo(sx + 3, sy - 72);
    ctx.lineTo(sx + 31, sy - 61);
    ctx.lineTo(sx + 3, sy - 50);
    ctx.closePath();
    ctx.fillStyle = on ? '#46d6a0' : '#dbe8f7';
    ctx.fill();
    ctx.strokeStyle = on ? '#1f9e6d' : '#7e97b8'; ctx.lineWidth = 2; ctx.stroke();
    // 顶部状态灯：激活打勾、未激活空心圈，均为常亮
    ctx.strokeStyle = on ? 'rgba(45,205,145,.95)' : 'rgba(125,155,205,.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(sx, sy - 84, 7.5, 0, Math.PI * 2); ctx.stroke();
    if (on) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx - 3.6, sy - 84); ctx.lineTo(sx - 1, sy - 81.4); ctx.lineTo(sx + 4.2, sy - 87.2); ctx.stroke();
    }
    // 文字常显（带描边，保证在任何背景上都看得清）
    ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    const label = on ? '已存档' : '存档点';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.strokeText(label, sx, sy - 98);
    ctx.fillStyle = on ? '#1f9e6d' : '#54708f';
    ctx.fillText(label, sx, sy - 98);
    ctx.textAlign = 'left';
  }
}
function drawCoins() {
  for (const c of G.coins) {
    const bob = Math.sin(c.t * 4) * 3;
    ctx.save(); ctx.translate(c.x + 9, c.y + 9 + bob);
    const grd = ctx.createLinearGradient(0, -9, 0, 9);
    grd.addColorStop(0, '#ffe79a'); grd.addColorStop(1, '#ffc024');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#e8a800'; ctx.stroke();
    ctx.fillStyle = '#fff7d6'; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(-3, -3, 2.4, 0, 7); ctx.fill();
    ctx.restore();
  }
}
function drawStars() {
  for (const c of G.stars) {
    const bob = Math.sin(c.t * 3) * 4;
    ctx.save(); ctx.translate(c.x + 11, c.y + 11 + bob); ctx.rotate(G.time * 1.5);
    drawStarShape(0, 0, 11, 5, '#6fb1ff', '#bfe0ff');
    ctx.restore();
  }
}
function drawStarShape(cx, cy, r, points, fill, stroke) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / points) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}
function drawGoal() {
  const g = G.level.goal;
  const t = G.time * 3;
  ctx.save(); ctx.translate(g.x, g.y);
  const grd = ctx.createLinearGradient(0, -70, 0, 20);
  grd.addColorStop(0, 'rgba(255,255,255,.2)'); grd.addColorStop(1, 'rgba(120,200,255,.5)');
  ctx.fillStyle = grd; rr(ctx, -22, -70, 44, 90, 22); ctx.fill();
  for (let i = 0; i < 3; i++) { ctx.fillStyle = i % 2 ? '#ff9ec7' : '#7fd1ff'; ctx.beginPath(); ctx.ellipse(0, -10 + i * 4 - Math.sin(t + i) * 4, 14 - i * 3, 26 - i * 6, 0, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('终点', 0, -78);
  ctx.restore();
}
// 手上的武器（合金弹头风格）：每种武器外形不同，开火瞬间有枪口火焰
function drawHeldWeapon(p) {
  const key = p.gun, W = WEAPONS[key];
  ctx.save();
  ctx.translate(p.x + p.w / 2 + p.facing * 10, p.y + p.h * 0.46);
  ctx.scale(p.facing, 1);
  ctx.fillStyle = '#5a6a88';
  if (key === 'rocket') {           // 火箭筒：粗筒 + 尾部喇叭
    ctx.fillRect(-4, -6, 26, 12);
    ctx.fillStyle = '#8a5a3a'; ctx.fillRect(-9, -7, 9, 14);
    ctx.fillStyle = '#3a4a66'; ctx.fillRect(7, 5, 9, 6);
  } else if (key === 'shotgun') {   // 霰弹枪：粗管 + 木托
    ctx.fillRect(-2, -5, 25, 9);
    ctx.fillStyle = '#7a5a3a'; ctx.fillRect(-9, 1, 12, 7);
  } else if (key === 'laser') {     // 激光枪：青色发光枪口
    ctx.fillStyle = '#3f8f8a'; ctx.fillRect(-2, -5, 24, 9);
    ctx.fillStyle = W.col; ctx.fillRect(16, -3, 9, 5);
  } else if (key === 'hmg') {       // 重机枪：长管 + 弹链盒
    ctx.fillRect(-2, -5, 29, 9);
    ctx.fillStyle = '#3a4a66'; ctx.fillRect(2, 4, 13, 9);
  } else {                          // 手枪：短小精悍
    ctx.fillRect(-1, -4, 16, 7);
    ctx.fillStyle = '#6a7a98'; ctx.fillRect(-4, 1, 9, 7);
  }
  // 枪口火焰
  if (p.muzzle > 0) {
    const s = Math.max(0.3, p.muzzle / 0.07);
    const len = key === 'rocket' ? 27 : key === 'shotgun' ? 21 : 16;
    ctx.fillStyle = 'rgba(255,225,130,' + (0.92 * s) + ')';
    ctx.beginPath();
    ctx.moveTo(len, 0); ctx.lineTo(len - 11 * s, -6.5 * s); ctx.lineTo(len - 11 * s, 6.5 * s);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawPlayer(p) {
  const sx = 1 / p.squash, sy = p.squash;
  const alpha = (p.invuln > 0 && Math.floor(p.invuln * 16) % 2 === 0) ? 0.45 : 1;
  drawSprite('player', p.x + p.w / 2, p.y + p.h / 2, p.h * 1.15, p.facing, { sx, sy, alpha });
  // 冲刺光环
  if (p.dashT > 0) {
    ctx.save(); ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.globalAlpha = 0.5; ctx.strokeStyle = 'rgba(150,210,255,.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, p.w * 1.1, p.h * 0.8, 0, 0, 7); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  }
  drawHeldWeapon(p);
  // 护盾光环
  if (p.shieldT > 0) {
    ctx.save(); ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.strokeStyle = 'rgba(120,210,255,.85)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, p.w * 0.95, 0, 7); ctx.stroke();
    ctx.restore();
  }
}
function drawEnemy(e) {
  if (e.type === 'roller') { drawRoller(e); return; }
  if (e.type === 'bomber') { drawBomber(e); return; }
  if (e.type === 'charger') { drawCharger(e); return; }
  const flash = e.flash > 0;
  const zoom = e.type === 'turret' ? 1.25 : (e.type === 'bee' ? 1.05 : 1.1);
  drawSprite(e.type, e.x + e.w / 2, e.y + e.h / 2, e.h * zoom, e.dir || 1, { flash });
  // 血条（非满时）
  if ((e.type === 'slime' && e.hp < 3) || (e.type === 'bee' && e.hp < 2) || (e.type === 'turret' && e.hp < 4) || (e.type === 'roller' && e.hp < 4)) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(e.x, e.y - 8, e.w, 4);
    ctx.fillStyle = '#7CFC9B'; ctx.fillRect(e.x, e.y - 8, e.w * (e.hp / (e.type === 'turret' || e.type === 'roller' ? 4 : e.type === 'bee' ? 2 : 3)), 4);
  }
}
function drawRoller(e) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(e.spin || 0);
  ctx.fillStyle = '#6b5b95';
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a + 0.25) * (r + 7), Math.sin(a + 0.25) * (r + 7));
    ctx.lineTo(Math.cos(a + 0.5) * r, Math.sin(a + 0.5) * r); ctx.closePath(); ctx.fill();
  }
  const grd = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
  grd.addColorStop(0, '#b9a7e6'); grd.addColorStop(1, '#7b5aa6');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - 6, cy - 2, 4, 0, 7); ctx.arc(cx + 6, cy - 2, 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#3a2a55'; ctx.beginPath(); ctx.arc(cx - 5, cy - 1, 2, 0, 7); ctx.arc(cx + 7, cy - 1, 2, 0, 7); ctx.fill();
}
// 投弹怪：悬浮螺旋桨小飞艇，投弹舱灯快亮时说明马上要丢炸弹
function drawBomber(e) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2 + Math.sin(e.t * 3) * 1.6;
  ctx.save(); ctx.translate(cx, cy);
  // 螺旋桨
  ctx.save(); ctx.rotate(G.time * 24);
  ctx.strokeStyle = 'rgba(215,235,255,.85)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(17, 0); ctx.moveTo(0, -17); ctx.lineTo(0, 17); ctx.stroke();
  ctx.restore();
  // 机身
  const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, 16);
  g.addColorStop(0, '#a9dcff'); g.addColorStop(1, '#3f6fa8');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill();
  ctx.strokeStyle = '#27456b'; ctx.lineWidth = 2; ctx.stroke();
  // 驾驶舱玻璃
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(-4, -4, 5, 0, 7); ctx.fill();
  // 投弹舱 + 指示灯（临近投弹会闪红）
  const soon = e.bombT < 0.65;
  ctx.fillStyle = soon ? '#ff4d4d' : '#2a3a52';
  ctx.beginPath(); ctx.ellipse(0, 11, 7.5, 5, 0, 0, 7); ctx.fill();
  if (soon) { ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(G.time * 18)); ctx.fillStyle = '#ff7a7a'; ctx.beginPath(); ctx.arc(0, 11, 11, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  if (e.flash > 0) { ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.restore();
  if (e.hp < 2) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(e.x, e.y - 8, e.w, 4); ctx.fillStyle = '#7CFC9B'; ctx.fillRect(e.x, e.y - 8, e.w * (e.hp / 2), 4); }
}
// 铁甲冲撞者：蓄力时全身红闪，冲撞带残影，撞晕后头顶转小星星（反打窗口）
function drawCharger(e) {
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2, dir = e.dir || 1;
  const wind = e.st === 'wind', dash = e.st === 'dash', stun = e.st === 'stun';
  ctx.save(); ctx.translate(cx, cy); ctx.scale(dir, 1);
  if (dash) {
    ctx.strokeStyle = 'rgba(255,190,120,.75)'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-22 - i * 9, -9 + i * 9); ctx.lineTo(-42 - i * 13, -9 + i * 9); ctx.stroke(); }
  }
  // 甲壳
  const g = ctx.createLinearGradient(0, -18, 0, 18);
  g.addColorStop(0, '#e6ab63'); g.addColorStop(1, '#8a5a2a');
  ctx.fillStyle = g; rr(ctx, -20, -17, 40, 34, 10); ctx.fill();
  ctx.strokeStyle = '#5e3a18'; ctx.lineWidth = 2; rr(ctx, -20, -17, 40, 34, 10); ctx.stroke();
  // 甲片纹路
  ctx.strokeStyle = 'rgba(94,58,24,.5)'; ctx.lineWidth = 1.5;
  for (let i = -8; i <= 8; i += 8) { ctx.beginPath(); ctx.moveTo(i, -16); ctx.lineTo(i, 16); ctx.stroke(); }
  // 撞角
  ctx.fillStyle = '#f3e3c4'; ctx.beginPath(); ctx.moveTo(17, -9); ctx.lineTo(34, 0); ctx.lineTo(17, 9); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#bda37a'; ctx.lineWidth = 1.5; ctx.stroke();
  // 眼
  ctx.fillStyle = wind ? '#ff2f2f' : (stun ? '#8a8a9a' : '#2a2438');
  ctx.beginPath(); ctx.arc(6, -4, 3.6, 0, 7); ctx.fill();
  if (wind) { ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(G.time * 22)); ctx.fillStyle = '#ff5b5b'; rr(ctx, -22, -19, 44, 38, 11); ctx.fill(); ctx.globalAlpha = 1; }
  if (e.flash > 0) { ctx.globalAlpha = 0.8; ctx.fillStyle = '#fff'; rr(ctx, -20, -17, 40, 34, 10); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.restore();
  if (stun) { for (let i = 0; i < 3; i++) { const a = G.time * 4 + i * 2.1; ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 13, cy - 26 + Math.sin(a) * 4, 3, 0, 7); ctx.fill(); } }
  if (e.hp < 5) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(e.x, e.y - 8, e.w, 4); ctx.fillStyle = '#7CFC9B'; ctx.fillRect(e.x, e.y - 8, e.w * Math.max(0, e.hp / 5), 4); }
}
function eyes(w, h, dir, flash) {
  const dx = (dir || 1) * 3;
  if (flash) {
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.arc(-5 + dx, -3, 2.6, 0, 7); ctx.arc(7 + dx, -3, 2.6, 0, 7); ctx.fill();
    return;
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-5 + dx, -3, 5.5, 0, 7); ctx.arc(7 + dx, -3, 5.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#33334d';
  ctx.beginPath(); ctx.arc(-4 + dx, -2.6, 3, 0, 7); ctx.arc(8 + dx, -2.6, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-3 + dx, -3.6, 1.3, 0, 7); ctx.arc(9 + dx, -3.6, 1.3, 0, 7); ctx.fill();
}
function drawBoss(b) {
  const flash = b.flash > 0;
  drawSprite('boss', b.x + b.w / 2, b.y + b.h / 2, b.h, 1, { flash });
}
function drawProjectiles() {
  for (const pr of G.projectiles) {
    ctx.save(); ctx.translate(pr.x, pr.y);
    if (pr.star) {
      const col = pr.col || '#ffd166';
      if (pr.pierce) { // 激光：细长发光光束（亮芯 + 外发光，沿运动方向）
        const r = pr.w / 2, ang = Math.atan2(pr.vy, pr.vx);
        ctx.rotate(ang);
        const len = Math.max(r * 5, 40);
        const og = ctx.createLinearGradient(-len, 0, len, 0);
        og.addColorStop(0, hexA(col, 0)); og.addColorStop(0.5, hexA(col, 0.85)); og.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = og; ctx.fillRect(-len, -r * 1.2, len * 2, r * 2.4);
        ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(-len, -r * 0.32, len * 2, r * 0.64);
        ctx.rotate(-ang);
      } else {
        const r = pr.w / 2;
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.6);
        glow.addColorStop(0, hexA(col, .85)); glow.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 2.6, 0, 7); ctx.fill();
        ctx.fillStyle = col;
        if (pr.boom) { // 火箭：带尖头的弹体
          ctx.rotate(Math.atan2(pr.vy, pr.vx));
          ctx.beginPath(); ctx.moveTo(r * 1.7, 0); ctx.lineTo(-r, -r * 0.85); ctx.lineTo(-r, r * 0.85); ctx.closePath(); ctx.fill();
          ctx.rotate(-Math.atan2(pr.vy, pr.vx));
        } else {
          ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.36, 0, 7); ctx.fill();
      }
    } else if (pr.shock) {
      ctx.fillStyle = 'rgba(176,107,255,.85)'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    } else if (pr.bomb) {
      const r = pr.w / 2;
      ctx.fillStyle = '#2e2a3a'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 2; ctx.stroke();
      // 引信火花
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath(); ctx.arc(0, -r - 2, 2 + Math.abs(Math.sin(G.time * 20)) * 1.8, 0, 7); ctx.fill();
    } else {
      const r = pr.w / 2;
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2);
      glow.addColorStop(0, 'rgba(255,140,170,.85)'); glow.addColorStop(1, 'rgba(255,120,160,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff4d7d'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.4, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  for (const b of (G.beams || [])) {
    const a = Math.max(0, b.life / b.max);
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang);
    const og = ctx.createLinearGradient(0, 0, b.len, 0);
    og.addColorStop(0, hexA(b.col, 0.9 * a)); og.addColorStop(1, hexA(b.col, 0));
    ctx.fillStyle = og; ctx.fillRect(0, -3.2, b.len, 6.4);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.95 * a) + ')'; ctx.fillRect(0, -1, b.len, 2);
    ctx.restore();
  }
}
function drawParticles() {
  for (const pt of G.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, pt.life * 2));
    ctx.fillStyle = pt.col; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawFloats() {
  ctx.textAlign = 'center'; ctx.font = 'bold 16px sans-serif';
  for (const f of G.floats) { ctx.globalAlpha = Math.max(0, f.life); ctx.fillStyle = f.col; ctx.fillText(f.txt, f.x, f.y); }
  ctx.globalAlpha = 1;
}

// ---------- HUD ----------
function drawHUD() {
  const p = G.player; if (!p) return;
  if (G.timeSlowT > 0 || G.timeSlowCD > 0) { ctx.fillStyle = G.timeSlowT > 0 ? '#7fffd4' : '#9aa'; ctx.font = '14px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(G.timeSlowT > 0 ? ('时缓 '+G.timeSlowT.toFixed(1)+'s') : ('时缓冷却 '+Math.ceil(G.timeSlowCD)+'s'), VW-12, 22); ctx.textAlign = 'left'; }
  // 心
  for (let i = 0; i < p.maxHp; i++) {
    const x = 22 + i * 30, y = 26;
    drawHeart(x, y, i < p.hp);
  }
  // 进度
  ctx.textAlign = 'left'; ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = 'rgba(40,55,90,.85)';
  ctx.fillText(G.level.name, 22, 60);
  // 货币
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e8910c'; ctx.fillText('★ 星币 ' + p.coins, VW - 22, 28);
  ctx.fillStyle = '#3a7bd5'; ctx.fillText('✦ 碎片 ' + p.stars, VW - 22, 50);
  // 分数 + 连击（居中，提供掌握感反馈）
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(40,55,90,.9)'; ctx.fillText('分数 ' + p.score, VW / 2, 28);
  if (G.combo > 1) {
    const pop = 1 + Math.max(0, G.comboT - 2.1) * 1.4; // 刚加连击时弹性放大
    ctx.save();
    ctx.translate(VW / 2, 52); ctx.scale(pop, pop);
    ctx.fillStyle = '#ff7eb3'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('连击 x' + G.combo, 0, 0);
    ctx.restore();
  }
  ctx.textAlign = 'right';
  if (muted) { ctx.fillStyle = 'rgba(40,55,90,.6)'; ctx.fillText('🔇 静音(M)', VW - 22, 72); }
  // 增益状态
  const chips = [];
  if (p.rapidT > 0) chips.push(['连发', p.rapidT, '#ffb04a']);
  if (p.shieldT > 0) chips.push(['护盾', p.shieldT, '#5b9bff']);
  if (p.magnetT > 0) chips.push(['磁铁', p.magnetT, '#46d6c4']);
  if (p.starT > 0) chips.push(['无敌', p.starT, '#e8a800']);
  if (p.dblT > 0) chips.push(['得分x2', p.dblT, '#3fae7a']);
  ctx.textAlign = 'right'; ctx.font = 'bold 13px sans-serif';
  let cy = 94;
  for (const [name, t, col] of chips) {
    const txt = name + ' ' + Math.ceil(t) + 's';
    ctx.fillStyle = col; ctx.fillText(txt, VW - 22, cy); cy += 20;
  }
  // BOSS 血条
  if (G.boss) {
    const b = G.boss;
    const bw = 560, bx = (VW - bw) / 2, by = 24;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; rr(ctx, bx, by, bw, 18, 9); ctx.fill();
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, '#ff7eb3'); g.addColorStop(1, '#b06bff');
    ctx.fillStyle = g; rr(ctx, bx, by, bw * Math.max(0, b.hp / b.maxHp), 18, 9); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('暗影巨兽  ' + Math.max(0, Math.ceil(b.hp)) + ' / ' + b.maxHp, VW / 2, by + 14);
  }
  // 枪械天赋：当前进化到哪一把枪 + 弹药
  const W = WEAPONS[p.gun] || WEAPONS.pistol;
  ctx.textAlign = 'left'; ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = W.col;
  ctx.fillText('枪械天赋 Lv' + p.gunLv + '   [' + W.tag + '] ' + W.name + '   弹药 ' + (W.inf ? '∞' : (p.ammo[p.gun] || 0)), 22, 82);
  // 星跃状态
  ctx.font = 'bold 13px sans-serif';
  const lp = p.leapCD;
  if (lp > 0) {
    ctx.fillStyle = 'rgba(130,140,165,.9)'; ctx.fillText('星跃冷却 ' + Math.ceil(lp) + 's', 22, 102);
  } else {
    ctx.fillStyle = 'rgba(95,200,230,.9)';
    ctx.fillText(isTouch ? '星跃就绪（点右下「星跃」向上冲）' : 'F 星跃 就绪', 22, 102);
  }
  // 开局操作提示条：手机显示按钮名、电脑显示键位，几秒后自动淡出
  if (G.hintUntil) {
    const left = (G.hintUntil - performance.now()) / 1000;
    if (left > 0) drawControlHint(Math.min(1, left / 1.5));
  }
  // 受伤红屏 + 低血量脉冲：强反馈让玩家立刻感知到受击与危险
  if (G.hurtFlash > 0) {
    ctx.fillStyle = 'rgba(255,40,60,' + (G.hurtFlash * 0.5) + ')';
    ctx.fillRect(0, 0, VW, VH);
  } else if (p.hp <= 1) {
    const a = 0.10 + Math.abs(Math.sin(G.time * 4)) * 0.16;
    ctx.fillStyle = 'rgba(255,40,60,' + a + ')';
    ctx.fillRect(0, 0, VW, VH);
  }
}
// 底部的操作提示胶囊
function drawControlHint(alpha) {
  const txt = isTouch
    ? '◀ ▶ 移动    跳 跳跃(可二段)    开火 按住连发    冲 突进    星跃 向上冲够高处'
    : '← → 移动    空格 跳(可二段)    J 开火(按住连发)    Shift/L 冲刺    F 星跃    P 暂停';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  const w = Math.min(VW - 24, ctx.measureText(txt).width + 34);
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  rr(ctx, (VW - w) / 2, VH - 44, w, 30, 15); ctx.fill();
  ctx.fillStyle = 'rgba(45,65,100,.92)';
  ctx.fillText(txt, VW / 2, VH - 24);
  ctx.restore();
}
function drawHeart(x, y, full) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1.1, 1.1);
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.bezierCurveTo(-9, -6, -11, 6, 0, 12);
  ctx.bezierCurveTo(11, 6, 9, -6, 0, 4);
  ctx.closePath();
  ctx.fillStyle = full ? '#ff5b7f' : 'rgba(255,255,255,.55)';
  ctx.fill();
  ctx.strokeStyle = full ? '#e23e66' : 'rgba(180,190,210,.7)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

// ---------- 流程控制 ----------
function setState(s) { G.state = s; }
function show(id, on) { document.getElementById(id).classList.toggle('hidden', !on); }

function startGame() {
  ensureAudio();
  G.player = makePlayer();
  hideAll();
  startStage(1);
}
function hideAll() { ['title', 'upgrade', 'gameover', 'win', 'pause'].forEach(id => show(id, false)); }

function levelClear() {
  if (G.state !== 'playing') return;
  SFX.clear();
  saveBest();
  saveProgress();
  if (G.stage < LEVELS.length) { setState('upgrade'); renderUpgrade(); show('upgrade', true); }
}
function renderUpgrade() {
  const p = G.player;
  document.getElementById('upgSub').textContent = '第 ' + G.stage + ' 关通过！用星币强化自己，再闯下一关';
  document.getElementById('upgCoins').textContent = p.coins;
  const body = document.getElementById('upgradeBody');
  body.innerHTML = '';
  for (const u of UPGRADES) {
    const cnt = p.upg[u.id] || 0;
    const cost = u.base + cnt * 3;
    const row = document.createElement('div'); row.className = 'upg-row';
    const info = document.createElement('div'); info.className = 'upg-info';
    info.innerHTML = '<div class="upg-name">' + u.name + ' <span style="color:#e8910c;font-size:12px">Lv.' + cnt + '</span></div><div class="upg-desc">' + u.desc + '</div>';
    const btn = document.createElement('button'); btn.className = 'upg-buy';
    if (u.max != null && cnt >= u.max) {
      btn.textContent = '已满级'; btn.disabled = true;
    } else {
      btn.textContent = '升级 (' + cost + '★)';
      btn.disabled = p.coins < cost;
      btn.onclick = () => { if (p.coins >= cost) { p.coins -= cost; p.upg[u.id] = cnt + 1; u.apply(p); SFX.up(); saveProgress(); renderUpgrade(); } };
    }
    row.appendChild(info); row.appendChild(btn); body.appendChild(row);
  }
  renderWeaponUpgrades(p);
}
// 枪械天赋树展示：让玩家清楚自己进化到哪一把、下一把是什么
function renderWeaponUpgrades(p) {
  const wbody = document.getElementById('weaponBody');
  if (!wbody) return;
  wbody.innerHTML = '';
  const head = document.createElement('div');
  head.style.cssText = 'font-size:14px;font-weight:800;color:#2a3a5e;margin:14px 0 8px;text-align:left';
  head.textContent = '枪械进化路线（当前 Lv' + p.gunLv + '）';
  wbody.appendChild(head);
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px';
  for (let i = 0; i < GUN_TREE.length; i++) {
    const key = GUN_TREE[i], W = WEAPONS[key], lv = i + 1;
    const cur = p.gunLv === lv, got = p.gunLv >= lv;
    const chip = document.createElement('div');
    chip.style.cssText = 'padding:7px 11px;border-radius:12px;font-size:12px;font-weight:700;' +
      (cur ? 'background:' + W.col + ';color:#fff;box-shadow:0 4px 12px ' + hexA(W.col, .55)
           : got ? 'background:' + hexA(W.col, .2) + ';color:' + W.col
                 : 'background:rgba(200,205,220,.35);color:rgba(90,100,120,.6)');
    chip.textContent = 'Lv' + lv + ' ' + W.name;
    row.appendChild(chip);
  }
  wbody.appendChild(row);
  const tip = document.createElement('div');
  tip.style.cssText = 'font-size:12px;color:rgba(60,80,120,.8);text-align:left;line-height:1.7';
  const nextKey = GUN_TREE[p.gunLv]; // 下一把枪（下标＝当前等级）
  tip.textContent = nextKey
    ? '升级「枪械天赋」→ 进化为 ' + WEAPONS[nextKey].name +
      '（伤害 ' + wepDmg(nextKey, p.gunLv + 1) + ' · 弹匣 ' + wepAmmo(nextKey, p.gunLv + 1) + '）'
    : '已达最终形态：' + WEAPONS[GUN_TREE[GUN_MAX_LV - 1]].name;
  wbody.appendChild(tip);
}
function nextStage() { hideAll(); startStage(G.stage + 1); }

function gameOver() {
  setState('gameover'); saveBest();
  document.getElementById('goDesc').textContent = '闪闪倒下了……但冒险还没结束。已强化会保留，再来一次！';
  show('gameover', true);
}
function restartFromOver() { hideAll(); startStage(G.stage); }

function winGame() {
  if (G.state === 'win') return;
  setState('win'); SFX.win(); saveBest();
  burst(G.boss ? G.boss.x + 65 : VW / 2, VH / 2, '#ffd166', 40);
  document.getElementById('winCoins').textContent = G.player.coins;
  document.getElementById('winStars').textContent = G.player.stars;
  show('win', true);
}
function playAgain() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} hideAll(); G.player = makePlayer(); startStage(1); }

function pauseGame() { setState('paused'); show('pause', true); if (bgm) { if (bgm.mode === 'mp3' && bgm.audio) { try { bgm.audio.pause(); } catch (e) {} } else if (bgm.timer) { clearInterval(bgm.timer); bgm.timer = null; } } }
function resumeGame() { setState('playing'); show('pause', false); if (G.level) setBgm(G.level.song, G.level.theme, true); }

function saveBest() {
  const score = G.player ? G.player.score : 0;
  if (score > G.best) { G.best = score; try { localStorage.setItem('sparky_best', String(G.best)); } catch (e) {} }
}

// ---------- 自动存档（进度 / 星币 / 天赋 / 枪械等级，可续关、可选关） ----------
const SAVE_KEY = 'sparky_save_v1';
function loadSave() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function writeSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {} }
function saveProgress() {
  const p = G.player; if (!p) return;
  const cur = loadSave() || { maxStage: 1 };
  writeSave({
    stage: G.stage,
    maxStage: Math.max(cur.maxStage || 1, G.stage + 1), // 当前关与下一关都解锁
    coins: p.coins, stars: p.stars,
    upg: p.upg, gunLv: p.gunLv,
    maxHp: p.maxHp, maxJumps: p.maxJumps, jumpV: p.jumpV, maxRun: p.maxRun, atk: p.atk,
    score: p.score,
  });
}
function applySave(s) {
  const p = makePlayer();
  p.coins = s.coins || 0; p.stars = s.stars || 0;
  p.upg = Object.assign({ hp: 0, atk: 0, jump: 0, speed: 0, djump: 0 }, s.upg || {});
  p.gunLv = s.gunLv || 1;
  p.maxHp = s.maxHp || 4; p.hp = p.maxHp;
  p.maxJumps = s.maxJumps || 2; p.jumpV = s.jumpV || 900;
  p.maxRun = s.maxRun || 300; p.atk = s.atk || 2;
  p.score = s.score || 0;
  G.player = p;
}
function continueGame() {
  const s = loadSave(); if (!s) { newGame(); return; }
  applySave(s); hideAll(); startStage(s.stage || 1); refreshTitle();
}
function newGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  G.player = makePlayer(); hideAll(); startStage(1); refreshTitle();
}
function gotoStage(i) {
  const s = loadSave(); if (s) applySave(s); else G.player = makePlayer();
  hideAll(); startStage(i); refreshTitle();
}
function refreshTitle() {
  const s = loadSave();
  const cont = document.getElementById('continueBtn');
  const sel = document.getElementById('levelSelect');
  if (!cont || !sel) return;
  if (s && s.maxStage >= 1) {
    cont.style.display = '';
    cont.textContent = '继续冒险（第 ' + (s.stage || 1) + ' 关）';
    sel.innerHTML = '';
    const maxS = Math.min(s.maxStage, LEVELS.length);
    for (let i = 1; i <= maxS; i++) {
      const b = document.createElement('button'); b.className = 'lvl-btn';
      b.textContent = i; b.onclick = () => gotoStage(i);
      sel.appendChild(b);
    }
    sel.style.display = '';
  } else {
    cont.style.display = 'none'; sel.style.display = 'none';
  }
}

// ---------- 绑定 UI ----------
document.getElementById('startBtn').onclick = () => newGame();
document.getElementById('continueBtn').onclick = continueGame;
document.getElementById('nextBtn').onclick = nextStage;
document.getElementById('retryBtn').onclick = restartFromOver;
document.getElementById('againBtn').onclick = playAgain;
// BGM 音量滑块绑定（标题页 + 暂停页共用）
(function bindBgmVol() {
  const init = (id) => {
    const el = document.getElementById(id); if (!el) return;
    el.value = Math.round(bgmVolume * 100);
    const t = document.getElementById(id + 'Txt'); if (t) t.textContent = Math.round(bgmVolume * 100) + '%';
    el.addEventListener('input', () => setBgmVol(+el.value));
  };
  init('bgmVolTitle'); init('bgmVolPause');
})();
document.getElementById('resumeBtn').onclick = resumeGame;
// 暂停按钮：手机和电脑进入游戏后都能点
const pauseBtnEl = document.getElementById('btnPause');
if (pauseBtnEl) {
  if (!isTouch) pauseBtnEl.textContent = '暂停 (P)';
  pauseBtnEl.onclick = () => {
    if (G.state === 'playing') pauseGame();
    else if (G.state === 'paused') resumeGame();
  };
}
try { G.best = parseInt(localStorage.getItem('sparky_best') || '0', 10) || 0; } catch (e) {}
document.getElementById('bestScore').textContent = G.best;
refreshTitle();

requestAnimationFrame(frame);
