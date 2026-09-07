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
function resize() {
  const ww = window.innerWidth, wh = window.innerHeight;
  const s = Math.min(ww / VW, wh / VH);
  canvas.width = VW; canvas.height = VH;
  canvas.style.width = (VW * s) + 'px';
  canvas.style.height = (VH * s) + 'px';
}
window.addEventListener('resize', resize);
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
  if ((k === 'p' || k === 'escape') && G.state === 'playing') pauseGame();
  else if ((k === 'p' || k === 'escape') && G.state === 'paused') resumeGame();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousedown', (e) => {
  ensureAudio();
  if (G.state === 'playing') pressed['j'] = true, keys['j'] = true;
});
canvas.addEventListener('mouseup', () => { keys['j'] = false; });

// ---------- 触屏控制（手机 / 平板） ----------
// 复用键盘输入管线：触摸按钮 = 派发对应的键盘事件，这样移动/跳跃/开火/星影逻辑完全一致。
const isTouch = (typeof navigator !== 'undefined') && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);
const touchMap = { btnLeft: 'arrowleft', btnRight: 'arrowright', btnJump: ' ', btnShoot: 'j', btnDash: 'shift', btnEcho: 'f' };
function fireKey(key, isDown) {
  try { window.dispatchEvent(new KeyboardEvent(isDown ? 'keydown' : 'keyup', { key })); } catch (e) {}
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
function beep(freq, dur, type = 'square', vol = 0.18, slideTo = null) {
  if (muted || !actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = freq;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, actx.currentTime + dur);
  g.gain.value = vol;
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(); o.stop(actx.currentTime + dur);
}
const SFX = {
  jump:  () => beep(480, 0.18, 'square', 0.16, 760),
  djump: () => beep(620, 0.16, 'square', 0.14, 900),
  dash:  () => beep(680, 0.12, 'sawtooth', 0.12, 1100),
  swing: () => beep(300, 0.08, 'sawtooth', 0.12, 160),
  hit:   () => beep(420, 0.10, 'square', 0.14, 220),
  stomp: () => beep(260, 0.12, 'square', 0.16, 120),
  coin:  () => { beep(880, 0.07, 'triangle', 0.14); setTimeout(() => beep(1320, 0.09, 'triangle', 0.14), 60); },
  star:  () => { beep(990, 0.08, 'triangle', 0.14); setTimeout(() => beep(1480, 0.12, 'triangle', 0.14), 70); },
  hurt:  () => beep(220, 0.22, 'sawtooth', 0.18, 70),
  boss:  () => beep(120, 0.4, 'sawtooth', 0.2, 60),
  up:    () => { beep(660, 0.08, 'triangle', 0.14); setTimeout(() => beep(990, 0.12, 'triangle', 0.14), 70); },
  win:   () => { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,0.18,'triangle',0.16),i*120)); },
  clear: () => { [523,659,784].forEach((f,i)=>setTimeout(()=>beep(f,0.14,'triangle',0.14),i*90)); },
  land:  () => beep(300, 0.07, 'square', 0.10, 200),
  shoot: () => beep(640, 0.06, 'square', 0.10, 980),
  portal:() => { beep(520, 0.12, 'sine', 0.14, 1300); setTimeout(() => beep(900, 0.12, 'sine', 0.14, 500), 60); },
  key:   () => { beep(880, 0.08, 'triangle', 0.14); setTimeout(() => beep(1320, 0.1, 'triangle', 0.14), 60); },
  gate:  () => beep(420, 0.22, 'square', 0.14, 820),
  brk:   () => beep(200, 0.10, 'sawtooth', 0.14, 80),
  echo:  () => { beep(700, 0.10, 'sine', 0.12, 1200); },
  chest: () => { beep(880, 0.12, 'square', 0.16, 1320); setTimeout(() => beep(1320, 0.1, 'triangle', 0.12), 70); },
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
function L(opts) { return Object.assign({ platforms: [], enemies: [], coins: [], stars: [], spikes: [], bounces: [], powers: [], signs: [], chests: [], portals: [], blocks: [], keys: [], gates: [], checkpoints: [], spawn: [80, 420], goal: null, boss: false, song: 1, theme: 'meadow' }, opts); }

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
      { x: 1640, y: 300, w: 150, h: 22, move: { axis: 'y', range: 70, speed: 1.1 } },
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
    spikes: [ { x: 1380, y: 462, w: 70 }, { x: 2050, y: 462, w: 70 } ],
    bounces: [ { x: 2260, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 1040, y: 270, w: 26, h: 26, kind: 'rapid', name: '连发', icon: 'R', col: '#ffb04a' } ],
    crates: [ { x: 1120, y: 290, kind: 'hmg' } ],
    signs: [
      { x: 200, y: 390, text: '← → / A D 移动', arrow: 'right' },
      { x: 620, y: 390, text: '空格 / W / ↑ 跳', arrow: 'up' },
      { x: 900, y: 390, text: 'J / 鼠标左键 开火', arrow: 'right' },
      { x: 1330, y: 390, text: '跳到敌人头顶\n踩它！一踩就死', arrow: 'up' },
      { x: 1750, y: 390, text: 'Shift / L 冲刺', arrow: 'right' },
      { x: 2500, y: 390, text: 'F 放出星影分身\n替你引开敌人', arrow: 'right' },
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
      { x: 2040, y: 250, w: 150, h: 22, move: { axis: 'y', range: 80, speed: 1.1 } },
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
    spikes: [ { x: 1160, y: 462, w: 80 }, { x: 1700, y: 462, w: 60 }, { x: 2300, y: 462, w: 80 } ],
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
      { x: 1450, y: 240, w: 160, h: 22, move: { axis: 'y', range: 60, speed: 1.1 } },
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
      { x: 2060, y: 320, w: 160, h: 22, move: { axis: 'y', range: 90, speed: 1.0 } },
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
    spikes: [ { x: 940, y: 462, w: 70 }, { x: 1400, y: 462, w: 70 }, { x: 1880, y: 462, w: 70 } ],
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
    spikes: [ { x: 780, y: 462, w: 70 }, { x: 1240, y: 462, w: 70 }, { x: 2120, y: 462, w: 70 }, { x: 2560, y: 462, w: 70 } ],
    bounces: [ { x: 360, y: 462, w: 70, h: 14 }, { x: 1180, y: 462, w: 70, h: 14 }, { x: 2500, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 1150, y: 300, w: 26, h: 26, kind: 'rapid', name: '连发', icon: 'R', col: '#ffb04a' } ],
    crates: [ { x: 1160, y: 290, kind: 'shotgun' }, { x: 2480, y: 90, kind: 'laser' } ],
    chests: [ { x: 2450, y: 114 } ],
    goal: { x: 3330, y: 380 },
  }),
  // 第六关 · 翠影密林（敌人密集，最适合用分身诱敌）
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
    spikes: [ { x: 850, y: 462, w: 70 }, { x: 1330, y: 462, w: 70 }, { x: 1810, y: 462, w: 70 }, { x: 2290, y: 462, w: 70 }, { x: 2770, y: 462, w: 70 } ],
    bounces: [ { x: 1700, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 1290, y: 290, w: 26, h: 26, kind: 'shield', name: '护盾', icon: 'S', col: '#5b9bff' } ],
    crates: [ { x: 850, y: 290, kind: 'hmg' }, { x: 2300, y: 280, kind: 'rocket' }, { x: 3220, y: 310, kind: 'laser' } ],
    chests: [ { x: 1290, y: 304 } ],
    goal: { x: 3730, y: 380 },
  }),
  // 第七关 · 星轨高塔（移动平台 + 弹跳板综合挑战）
  L({
    name: '第七关 · 星轨高塔', theme: 'crystal', song: 10, w: 4200,
    platforms: [
      { x: 0, y: 480, w: 4200, h: 90 },
      { x: 560, y: 380, w: 160, h: 22, move: { axis: 'x', range: 100, speed: 1.0 } },
      { x: 980, y: 360, w: 160, h: 22, move: { axis: 'x', range: 110, speed: 1.1 } },
      { x: 1400, y: 340, w: 160, h: 22, move: { axis: 'y', range: 80, speed: 1.0 } },
      { x: 1820, y: 330, w: 160, h: 22, move: { axis: 'x', range: 120, speed: 1.15 } },
      { x: 2240, y: 320, w: 160, h: 22, move: { axis: 'y', range: 90, speed: 1.0 } },
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
    spikes: [ { x: 780, y: 462, w: 70 }, { x: 1620, y: 462, w: 70 }, { x: 2460, y: 462, w: 70 }, { x: 3300, y: 462, w: 70 } ],
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
    spikes: [],
    bounces: [ { x: 700, y: 462, w: 70, h: 14 } ],
    powers: [ { x: 200, y: 320, w: 26, h: 26, kind: 'rapid', name: '连发', icon: 'R', col: '#ffb04a' } ],
    crates: [ { x: 720, y: 300, kind: 'hmg' }, { x: 700, y: 170, kind: 'rocket' } ],
    goal: null,
  }),
  // 第九关 · 熔岩裂谷（敌人密布 + 大量移动平台 + 传送门 + 钥匙门）
  L({
    name: '第九关 · 熔岩裂谷', theme: 'sunset', song: 7, w: 4400,
    platforms: [
      { x: 0, y: 480, w: 4400, h: 90 },
      { x: 360, y: 360, w: 160, h: 22, move: { axis: 'x', range: 120, speed: 1.2 } },
      { x: 800, y: 340, w: 160, h: 22, move: { axis: 'y', range: 90, speed: 1.1 } },
      { x: 1240, y: 330, w: 160, h: 22, move: { axis: 'x', range: 130, speed: 1.3 } },
      { x: 1680, y: 320, w: 160, h: 22, move: { axis: 'y', range: 100, speed: 1.2 } },
      { x: 2120, y: 320, w: 160, h: 22, move: { axis: 'x', range: 120, speed: 1.35 } },
      { x: 2560, y: 330, w: 160, h: 22, move: { axis: 'y', range: 90, speed: 1.3 } },
      { x: 3000, y: 330, w: 160, h: 22, move: { axis: 'x', range: 130, speed: 1.4 } },
      { x: 3440, y: 320, w: 160, h: 22, move: { axis: 'y', range: 100, speed: 1.35 } },
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
    spikes: [ { x: 560, y: 462, w: 80 }, { x: 1000, y: 462, w: 80 }, { x: 1440, y: 462, w: 80 }, { x: 1880, y: 462, w: 80 }, { x: 2320, y: 462, w: 80 }, { x: 2760, y: 462, w: 80 }, { x: 3200, y: 462, w: 80 } ],
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
    name: '第十关 · 暗影巨兽·再临', theme: 'boss', song: 11, w: 1800, boss: true, bossHp: 78,
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
    name: '第十一关 · 星海迷城', theme: 'crystal', song: 5, w: 4800,
    platforms: [
      { x: 0, y: 480, w: 4800, h: 90 },
      { x: 360, y: 360, w: 160, h: 22, move: { axis: 'x', range: 130, speed: 1.4 } },
      { x: 800, y: 340, w: 160, h: 22, move: { axis: 'y', range: 100, speed: 1.3 } },
      { x: 1240, y: 330, w: 160, h: 22, move: { axis: 'x', range: 140, speed: 1.5 } },
      { x: 1680, y: 320, w: 160, h: 22, move: { axis: 'y', range: 110, speed: 1.4 } },
      { x: 2120, y: 320, w: 160, h: 22, move: { axis: 'x', range: 130, speed: 1.55 } },
      { x: 2560, y: 330, w: 160, h: 22, move: { axis: 'y', range: 100, speed: 1.5 } },
      { x: 3000, y: 330, w: 160, h: 22, move: { axis: 'x', range: 140, speed: 1.6 } },
      { x: 3440, y: 320, w: 160, h: 22, move: { axis: 'y', range: 110, speed: 1.55 } },
      { x: 3880, y: 330, w: 160, h: 22, move: { axis: 'x', range: 130, speed: 1.6 } },
      { x: 4320, y: 320, w: 160, h: 22, move: { axis: 'y', range: 100, speed: 1.5 } },
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
    spikes: [ { x: 520, y: 462, w: 80 }, { x: 940, y: 462, w: 80 }, { x: 1360, y: 462, w: 80 }, { x: 1780, y: 462, w: 80 }, { x: 2200, y: 462, w: 80 }, { x: 2620, y: 462, w: 80 }, { x: 3040, y: 462, w: 80 }, { x: 3460, y: 462, w: 80 }, { x: 3880, y: 462, w: 80 }, { x: 4300, y: 462, w: 80 } ],
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
    name: '第十二关 · 暗影巨兽·真身', theme: 'boss', song: 12, w: 1900, boss: true, bossHp: 100,
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
  const nPlat = Math.max(2, Math.min(9, Math.round((w - 800) / 620)));
  for (let i = 0; i < nPlat; i++) {
    const frac = (i + 0.5) / nPlat;
    let x = 650 + frac * (w - 1300) + (rng() - 0.5) * 150;
    x = clamp(x, 320, w - 240);
    const y = Math.round(130 + rng() * 300);
    const pw = Math.round(100 + rng() * 80);
    const move = rng() < 0.22 ? { axis: 'y', range: 40 + rng() * 50, speed: 0.9 + rng() * 0.5 } : null;
    const pl = { x: Math.round(x), y, w: pw, h: 22, move };
    if (move) { pl.baseX = pl.x; pl.baseY = pl.y; pl.ox = 0; pl.oy = 0; pl.dx = 0; pl.dy = 0; pl.mt = rand(0, 6); }
    G.level.platforms.push(pl);
    const cn = Math.max(2, Math.floor(pw / 42));
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
    if (rng() < 0.4) G.enemies.push(makeEnemy({ type: 'bee', x: pl.x + pl.w / 2, y: pl.y - 90 }));
    if (rng() < 0.3) G.stars.push({ x: pl.x + pl.w / 2, y: pl.y - 60, w: 22, h: 22, t: rand(0, 6), got: false });
  }
  if (!def.boss) {
    const spikeN = Math.min(4, Math.max(1, Math.round((w - 1000) / 1400)));
    for (let i = 0; i < spikeN; i++) {
      const sx = clampX(500 + rng() * (w - 1000));
      G.spikes.push({ x: Math.round(sx), y: groundY - 18, w: 40 + Math.round(rng() * 30) });
    }
    const bounceN = 1 + Math.round(rng() * 1.4);
    for (let i = 0; i < bounceN; i++) {
      const bx = clampX(700 + rng() * (w - 1100));
      G.bounces.push({ x: Math.round(bx), y: groundY - 16, w: 70, h: 14, cool: 0, t: rand(0, 6) });
    }
    if (w > 2600) G.checkpoints.push({ x: Math.round(w * 0.65), y: 420, activated: false });
  }
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
  keyItems: [],
  gates: [],
  keys: 0,
  boss: null,
  cam: { x: 0, y: 0 },
  shake: 0,
  hitstop: 0,
  time: 0,
  best: 0,
  combo: 0, comboT: 0,
  clouds: [],
  // 星影分身：录下玩家的一段动作，放出发光分身重放，用来吸引敌人与踩敌
  echo: { recording: false, recT: 0, frames: [], play: null, cool: 0 },
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
    maxHp: 6, hp: 6, atk: 2, maxRun: 300, jumpV: 900, maxJumps: 2,
    jumps: 0, coyote: 0, jumpBuf: 0, dashCD: 0, dashT: 0, dashDir: 1, score: 0,
    attacking: false, atkT: 0, atkCD: 0, swung: new Set(),
    shootCD: 0, charge: 0, rapidT: 0, shieldT: 0, magnetT: 0,
    gunLv: 1, gun: 'pistol', muzzle: 0,
    ammo: { hmg: 0, shotgun: 0, rocket: 0, laser: 0 },
    invuln: 0, coins: 0, stars: 0, upg: { hp: 0, atk: 0, jump: 0, speed: 0, djump: 0 },
    squash: 1, sqv: 0, kPrev: false,
  };
}
function makeEnemy(spec) {
  const base = { x: spec.x, y: spec.y, vx: 0, vy: 0, onGround: false, flash: 0, dead: false, t: rand(0, 6), id: Math.random() };
  if (spec.type === 'slime') return Object.assign(base, { type: 'slime', w: 38, h: 30, hp: 2, speed: 70, dir: Math.random() < 0.5 ? -1 : 1, dmgT: 0 });
  if (spec.type === 'bee') {
    // 领地机制：以出生点为中心、range 为半径，只在这片区域里追玩家
    const b = Object.assign(base, { type: 'bee', w: 30, h: 26, hp: 1, speed: 85, dmgT: 0, range: spec.range || 240 });
    b.homeX = b.x + b.w / 2; b.homeY = b.y + b.h / 2;
    return b;
  }
  if (spec.type === 'turret') return Object.assign(base, { type: 'turret', w: 40, h: 44, hp: 3, fireT: rand(2, 3.2), dmgT: 0 });
  if (spec.type === 'roller') return Object.assign(base, { type: 'roller', w: 34, h: 34, hp: 3, speed: 150, dir: Math.random() < 0.5 ? -1 : 1, dmgT: 0, spin: 0 });
  return base;
}
function makeBoss(spec) {
  const hp = (spec && spec.bossHp) || 55;
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
  p.onGround = false; p.attacking = false; p.atkT = 0; p.invuln = 0.6; p.jumps = 0;
  p.hp = p.maxHp; p.squash = 1; p.sqv = 0;
  G.lastSafe = { x: spawn[0], y: spawn[1] };
  equipGun(p); // 每关开局装备天赋枪并补满弹药
  G.hintUntil = performance.now() + 9000; // 开局 9 秒显示操作提示
  G.echo = { recording: false, recT: 0, frames: [], play: null, cool: 0 };

  G.enemies = def.enemies.map(makeEnemy);
  // 随关卡递增的“增援”：越后面的关卡敌人越多（第1关几乎不变，后期大幅增多）
  if (!def.boss) {
    const extra = Math.min(16, Math.round(G.stage * 1.6));
    const pool = ['slime', 'bee', 'turret', 'roller'];
    for (let i = 0; i < extra; i++) {
      const ty = pool[(Math.random() * pool.length) | 0];
      const x = 420 + Math.random() * Math.max(200, def.w - 840);
      const y = ty === 'bee' ? 110 + Math.random() * 200 : 444;
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
  G.portals = (def.portals || []).map(o => ({ ax: o.ax, ay: o.ay, bx: o.bx, by: o.by, w: o.w || 36, h: o.h || 52, cool: 0 }));
  G.blocks = (def.blocks || []).map(o => ({ x: o.x, y: o.y, w: o.w || 34, h: o.h || 30, t: rand(0, 6), broken: false }));
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
  enrichStage(G, def, n);
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
  G.player.hp = G.player.maxHp; G.player.shieldT = 0; G.player.rapidT = 0; G.player.magnetT = 0;
  startStage(G.stage, [cp.x, cp.y - 12], { keepBgm: true });
}

// ---------- 碰撞 ----------
function moveAndCollide(e, dt) {
  e.x += e.vx * dt;
  for (const p of G.level.platforms) {
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
  // 弹跳板
  for (const b of G.bounces) {
    b.cool = Math.max(0, b.cool - dt);
    if (b.cool <= 0 && p.vy > 0 && aabb(p, { x: b.x, y: b.y - 6, w: b.w, h: b.h + 16 })) {
      p.vy = -1180; p.jumps = p.maxJumps; b.cool = 0.4; p.sqv = -1; SFX.djump();
      spawnDust(p.x + p.w / 2, p.y + p.h, 10);
    }
  }

  // 尖刺伤害
  if (G.level.spikes) for (const s of G.level.spikes) {
    if (p.invuln <= 0 && aabb(p, { x: s.x, y: s.y, w: s.w, h: 18 })) damagePlayer(1, s.x + s.w / 2);
  }

  // 攻击：合金弹头式按住开火键连发（J / 鼠标左键＝主攻击），见下方 fireWeapon。
  // 近身击杀改为「踩踏」——跳起落下踩敌人顶部即秒杀，不再有单独的挥击键。

  // 星影分身（F）与开火逻辑见下方
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

  // 星影分身：按 F 开始录制动作，录满 3 秒或再按一次即放出星影重放
  const E = G.echo;
  if (tap('f') && E.cool <= 0 && !E.play) {
    if (!E.recording) {
      E.recording = true; E.recT = 0; E.frames = [];
      addFloat(p.x + p.w / 2, p.y - 12, '开始录制', '#b98cff');
    } else {
      E.recording = false; releaseEcho();
    }
  }
  if (E.recording) {
    E.recT += dt;
    E.frames.push({ x: p.x, y: p.y, f: p.facing });
    if (E.recT >= 3) { E.recording = false; releaseEcho(); }
  }
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
      // 有星影时优先追星影（分身当诱饵），否则追玩家；两者都不在领地内就回巢悬停
      const ep = G.echo.play;
      const gx = ep ? ep.x + ECHO_W / 2 : p.x + p.w / 2;
      const gy = ep ? ep.y + ECHO_H / 2 : p.y + p.h / 2;
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
      // 有星影时优先打星影（诱饵），并且只在射程内开火，不会隔着半张地图打你
      const ep = G.echo.play;
      const aimX = ep ? ep.x + ECHO_W / 2 : pcx;
      const aimY = ep ? ep.y + ECHO_H / 2 : pcy;
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
    }
    // 接触伤害 / 踩踏
    handleEnemyContact(e);
  }
  G.enemies = G.enemies.filter(e => !e.dead);
}

function handleEnemyContact(e) {
  const p = G.player;
  if (!aabb(p, e)) return;
  // 滚刺球：带刺不能踩，碰到即受伤
  if (e.type === 'roller') {
    if (e.dmgT <= 0) { damagePlayer(1, e.x + e.w / 2); e.dmgT = 0.9; }
    return;
  }
  // 踩踏：下落且脚在敌人上半部
  if (p.vy > 60 && (p.y + p.h) < e.y + e.h * 0.6) {
    e.hp = 0; e.flash = 0.12; p.vy = -460; p.jumps = Math.max(p.jumps, 1);
    SFX.stomp(); addFloat(e.x + e.w / 2, e.y, p.atk, '#9be15d'); hitSpark(e.x + e.w / 2, e.y);
    G.hitstop = 0.05; G.shake = Math.max(G.shake, 2);
    addCombo(); p.score += 100 * Math.max(1, G.combo);
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
  addCombo(); G.player.score += 80 * Math.max(1, G.combo);
}

// ---------- 星影分身 ----------
// 录下玩家的一段动作后放出「星影」重放：星影替你吸引敌人火力，落下时还能踩死敌人
const ECHO_W = 34, ECHO_H = 42;
function releaseEcho() {
  const E = G.echo;
  if (!E.frames.length) { E.cool = 1.5; return; }
  const f0 = E.frames[0];
  E.play = { frames: E.frames, i: 0, x: f0.x, y: f0.y, vy: 0, f: f0.f };
  E.frames = [];
  burst(f0.x + ECHO_W / 2, f0.y + ECHO_H / 2, '#b98cff', 16);
  SFX.djump();
}
function updateEcho(dt) {
  const E = G.echo;
  E.cool = Math.max(0, E.cool - dt);
  const pl = E.play;
  if (!pl) return;
  const fr = pl.frames;
  if (pl.i >= fr.length) { E.play = null; E.cool = 5; return; }
  const s = fr[pl.i];
  pl.vy = s.y - pl.y; // 用位移推算下落，作为踩踏判定依据
  pl.x = s.x; pl.y = s.y; pl.f = s.f;
  pl.i++;
  const box = { x: pl.x, y: pl.y, w: ECHO_W, h: ECHO_H };
  for (const e of G.enemies) {
    if (e.dead || e.asleep || e.type === 'roller') continue;
    if (aabb(box, e) && pl.vy > 1.6 && (pl.y + ECHO_H) < e.y + e.h * 0.7) {
      e.hp = 0; killEnemy(e);
      addFloat(e.x + e.w / 2, e.y, '星影踩击', '#b98cff');
    }
  }
  // 星影还能替你挡下敌方子弹
  for (const pr of G.projectiles) {
    if (pr.fromEnemy && !pr.dead && aabb(box, pr)) { pr.dead = true; hitSpark(pr.x, pr.y); }
  }
}

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
      if (r < 0.38) { b.action = 'slam'; b.vy = -900; b.landed = false; }
      else if (r < 0.72) { b.action = 'spread'; bossSpread(b); b.timer = b.phase >= 2 ? 1.6 : 2.2; b.action = 'idle'; }
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
      addCombo(); p.score += 100 * Math.max(1, G.combo);
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
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
    if (pr.shock) pr.vy += 600 * dt; // 冲击波下坠
    if (pr.life <= 0 || pr.x < -60 || pr.x > G.level.w + 60 || pr.y > VH + 60 || pr.y < -60) { pr.dead = true; continue; }
    // 撞平台
    for (const pl of G.level.platforms) { if (pr.x > pl.x && pr.x < pl.x + pl.w && pr.y > pl.y && pr.y < pl.y + pl.h) { pr.dead = true; hitSpark(pr.x, pr.y); break; } }
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
    } else if (pr.fromEnemy) {
      if (aabb(p, pr)) { damagePlayer(1, pr.x); pr.dead = true; hitSpark(pr.x, pr.y); }
    }
    G.blocks = (G.blocks || []).filter(b => !b.broken);
  }
  G.projectiles = G.projectiles.filter(pr => !pr.dead);
  if (G.beams) { for (const b of G.beams) b.life -= dt; G.beams = G.beams.filter(b => b.life > 0); }
}

// ---------- 伤害玩家 ----------
function damagePlayer(dmg, srcX) {
  const p = G.player;
  if (p.invuln > 0 || p.shieldT > 0) return;
  p.hp -= dmg; p.invuln = 1.6;
  G.combo = 0; G.comboT = 0;
  p.vx = sign(p.x - srcX) * 320; p.vy = -300;
  G.shake = 0; SFX.hurt();
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
      if (G.coins.includes(c)) { p.coins++; p.score += 10; SFX.coin(); burst(c.x, c.y, '#ffd166', 8); }
      else { p.stars++; p.score += 50; SFX.star(); burst(c.x, c.y, '#6fb1ff', 10); addFloat(c.x, c.y, '碎片+1', '#6fb1ff'); }
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
function addCombo() { G.combo++; G.comboT = 2.6; }

// ---------- 移动平台 ----------
function updatePlatforms(dt) {
  for (const p of G.level.platforms) {
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

  if (G.state === 'playing') {
    if (G.hitstop > 0) { G.hitstop -= dt; }
    else {
      updatePlatforms(dt);
      updatePlayer(dt);
      updateEcho(dt);
      if (G.state === 'playing') updateEnemies(dt);
      if (G.state === 'playing') updateBoss(dt);
      if (G.state === 'playing') updateProjectiles(dt);
      if (G.state === 'playing') updateCollect(dt);
      if (G.state === 'playing') updateCheckpoints();
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
  drawSpikes();
  drawCoins();
  drawCheckpoints();
  drawStars();
  drawPowers();
  drawCrates();
  drawSigns();
  drawChests();
  if (G.level.goal) drawGoal();
  drawPortals(); drawKeys(); drawGates(); drawBlocks();
  for (const e of G.enemies) drawEnemy(e);
  if (G.boss) drawBoss(G.boss);
  drawProjectiles();
  drawEcho();
  drawPlayer(G.player);
  drawParticles();
  drawFloats();
  ctx.restore();
  drawHUD();
}

// 星影分身：紫色发光的半透明剪影，跟着录下的轨迹重放
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

function drawEcho() {
  const pl = G.echo.play; if (!pl) return;
  const cx = pl.x + ECHO_W / 2, cy = pl.y + ECHO_H / 2;
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 54);
  g.addColorStop(0, 'rgba(190,150,255,.5)'); g.addColorStop(1, 'rgba(190,150,255,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - 54, cy - 54, 108, 108);
  drawSprite('player', cx, cy, ECHO_H, pl.f, { alpha: 0.62 });
}

function drawTitleBg() {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#bfe3ff'); g.addColorStop(1, '#ffe9f3');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  for (let i = 0; i < 8; i++) { const x = (i * 137 + G.time * 12) % (VW + 120) - 60; ctx.beginPath(); ctx.ellipse(x, 120 + (i % 3) * 60, 60, 26, 0, 0, 7); ctx.fill(); }
}

const THEMES = {
  meadow:  { sky: ['#7fd4ff', '#b6ffce'], hill: ['#54e08a', '#a6f57a'], cloud: 'rgba(255,255,255,.92)', plat: ['#8dff9e', '#23b85f'] },
  cave:    { sky: ['#5466ff', '#b06bff'], hill: ['#7b8cff', '#b07bff'], cloud: 'rgba(230,225,255,.6)',  plat: ['#b59bff', '#6a3fd6'] },
  sky:     { sky: ['#5fc2ff', '#ff9ee0'], hill: ['#ff9ee0', '#8fd4ff'], cloud: 'rgba(255,255,255,.95)', plat: ['#bfe6ff', '#4fa8ff'] },
  boss:    { sky: ['#6a3dff', '#ff5bb8'], hill: ['#9b5bff', '#ff5bb0'], cloud: 'rgba(255,220,245,.5)',  plat: ['#ff9bdd', '#a83fb5'] },
  crystal: { sky: ['#4fe0ff', '#c08bff'], hill: ['#7fd0ff', '#c79bff'], cloud: 'rgba(255,255,255,.88)', plat: ['#aef0ff', '#3fb8e0'] },
  sunset:  { sky: ['#ff944d', '#ff5bb8'], hill: ['#ff8a5b', '#ff5bb0'], cloud: 'rgba(255,245,235,.92)',plat: ['#ffc09a', '#ff5b8a'] },
  forest:  { sky: ['#7fe87f', '#d6ffb0'], hill: ['#33d06a', '#9bf07a'], cloud: 'rgba(255,255,255,.88)', plat: ['#9bf07a', '#1fae5a'] },
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
}
function drawPlatforms() {
  const t = THEMES[G.level.theme] || THEMES.meadow;
  const pc = t.plat || ['#cfe6ff', '#9cc2ec'];
  for (const p of G.level.platforms) {
    if (p.y > VH + 4) continue;
    const moving = !!p.move;
    const grd = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    grd.addColorStop(0, pc[0]);
    grd.addColorStop(1, pc[1]);
    ctx.fillStyle = grd; rr(ctx, p.x, p.y, p.w, p.h, 10); ctx.fill();
    ctx.fillStyle = moving ? 'rgba(150,232,255,.95)' : 'rgba(255,255,255,.92)';
    rr(ctx, p.x, p.y - 5, p.w, 12, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(ctx, p.x + 8, p.y - 2, p.w - 16, 5, 3); ctx.fill();
    if (p.w > 120) {
      const n = Math.floor(p.w / 150);
      for (let i = 1; i <= n; i++) {
        const sx = p.x + (p.w * i) / (n + 1);
        drawStarShape(sx, p.y + p.h * 0.55, 4, 4, 'rgba(255,255,255,.5)', null);
      }
    }
    if (moving) { ctx.strokeStyle = 'rgba(120,220,255,.7)'; ctx.lineWidth = 2; rr(ctx, p.x, p.y, p.w, p.h, 10); ctx.stroke(); }
  }
}
function drawSpikes() {
  for (const s of G.level.spikes || []) {
    ctx.fillStyle = '#ff8a8a';
    const n = Math.floor(s.w / 16);
    for (let i = 0; i < n; i++) {
      const x = s.x + i * 16;
      ctx.beginPath(); ctx.moveTo(x, s.y + 18); ctx.lineTo(x + 8, s.y); ctx.lineTo(x + 16, s.y + 18); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#e06b6b'; ctx.fillRect(s.x, s.y + 16, s.w, 4);
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
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const s of G.signs) {
    const lines = String(s.text).split('\n');
    ctx.font = 'bold 14px sans-serif';
    let w = 0; for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    const padX = 13, padY = 9, lh = 19;
    const bw = w + padX * 2, bh = lines.length * lh + padY * 2;
    const x = s.x - bw / 2, y = s.y - bh;
    ctx.fillStyle = '#6f4a26'; ctx.fillRect(s.x - 3, s.y - 6, 6, 12); // 杆
    ctx.fillStyle = 'rgba(38,28,18,.86)'; rr(ctx, x, y, bw, bh, 9); ctx.fill();
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2.5; rr(ctx, x, y, bw, bh, 9); ctx.stroke();
    ctx.fillStyle = '#fff4d6';
    lines.forEach((l, i) => ctx.fillText(l, s.x, y + padY + lh * i + lh / 2));
    if (s.arrow) drawArrow(s.x, s.y + 8, s.arrow);
  }
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
function drawCheckpoints() {
  if (!G.checkpoints) return;
  for (const c of G.checkpoints) {
    const sx = c.x - G.cam.x, sy = c.y - G.cam.y;
    if (sx < -50 || sx > VW + 50) continue;
    // 旗杆
    ctx.fillStyle = c.activated ? '#7fe7c4' : '#5b6472';
    ctx.fillRect(sx - 2, sy - 70, 4, 70);
    // 旗子
    ctx.beginPath();
    ctx.moveTo(sx + 2, sy - 70);
    ctx.lineTo(sx + 26, sy - 60);
    ctx.lineTo(sx + 2, sy - 50);
    ctx.closePath();
    ctx.fillStyle = c.activated ? '#46d6a0' : '#7a8290';
    ctx.fill();
    if (c.activated) {
      const t = G.time * 3;
      ctx.strokeStyle = 'rgba(127,231,196,' + (0.35 + 0.3 * Math.sin(t)) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy - 24, 15 + 3 * Math.sin(t), 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(150,160,175,0.85)';
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('存档点', sx + 14, sy - 78);
    }
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
    ctx.fillStyle = '#ff7eb3'; ctx.font = 'bold 19px sans-serif';
    ctx.fillText('连击 x' + G.combo, VW / 2, 52);
  }
  ctx.textAlign = 'right';
  if (muted) { ctx.fillStyle = 'rgba(40,55,90,.6)'; ctx.fillText('🔇 静音(M)', VW - 22, 72); }
  // 增益状态
  const chips = [];
  if (p.rapidT > 0) chips.push(['连发', p.rapidT, '#ffb04a']);
  if (p.shieldT > 0) chips.push(['护盾', p.shieldT, '#5b9bff']);
  if (p.magnetT > 0) chips.push(['磁铁', p.magnetT, '#46d6c4']);
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
  // 星影分身状态
  ctx.font = 'bold 13px sans-serif';
  const E = G.echo;
  if (E.recording) {
    ctx.fillStyle = '#b98cff';
    ctx.fillText('● 录制中 ' + Math.max(0, 3 - E.recT).toFixed(1) + 's（再按 F 放出）', 22, 102);
  } else if (E.play) {
    ctx.fillStyle = '#b98cff'; ctx.fillText('星影行动中 · 敌人被它吸引', 22, 102);
  } else if (E.cool > 0) {
    ctx.fillStyle = 'rgba(130,140,165,.9)'; ctx.fillText('分身冷却 ' + Math.ceil(E.cool) + 's', 22, 102);
  } else {
    ctx.fillStyle = 'rgba(95,110,145,.85)';
    ctx.fillText(isTouch ? '分身就绪（点右下「分身」录制）' : 'F 星影分身 就绪', 22, 102);
  }
  // 开局操作提示条：手机显示按钮名、电脑显示键位，几秒后自动淡出
  if (G.hintUntil) {
    const left = (G.hintUntil - performance.now()) / 1000;
    if (left > 0) drawControlHint(Math.min(1, left / 1.5));
  }
}
// 底部的操作提示胶囊
function drawControlHint(alpha) {
  const txt = isTouch
    ? '◀ ▶ 移动    跳 跳跃(可二段)    开火 按住连发    冲 突进    分身 放出星影诱敌'
    : '← → 移动    空格 跳(可二段)    J 开火(按住连发)    Shift/L 冲刺    F 星影分身    P 暂停';
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
document.getElementById('startBtn').onclick = newGame;
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
