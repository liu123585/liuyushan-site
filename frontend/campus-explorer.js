/* 校园探索模块
   1) 立体校园地图：高德 JSAPI 3D（俯仰/旋转看立体校园）+ 校园 POI 弹卡 + 步行路线规划
      —— 需要高德 Key（在 api-config.js 配置）；没有 Key 时自动降级为下面的手绘地图
   2) 手绘集章打卡地图：纯原生 SVG/Canvas，不依赖任何外部服务，点建筑打卡集章，
      集满解锁「老生认证」并可生成分享海报
   除高德 JSAPI（可选、CDN 引入）外无任何依赖，不改动原有逻辑。
*/
(function () {
  'use strict';
  var AMAP_KEY = window.__AMAP_KEY__ || '';
  var AMAP_SEC = window.__AMAP_SECURITY_CODE__ || '';

  /* 校园地标：坐标复用小程序「校园探索」已标注的数据，图片用站点已有素材 */
  var LANDMARKS = [
    { id: 'lib', name: '图书馆', campus: 'kaiyuan', lng: 112.4558, lat: 34.6412, cat: '学习', desc: '鼎形建筑，豫西最大的图书馆，藏书 450 万册，期末一座难求。', img: 'img/tsg.jpg', emoji: '📚', x: 46, y: 34 },
    { id: 'th', name: '教学楼', campus: 'kaiyuan', lng: 112.4565, lat: 34.6398, cat: '学习', desc: '一~六号教学楼连成片，上课前看清楼号别跑错。', img: 'img/teaching_building.jpg', emoji: '🏫', x: 58, y: 50 },
    { id: 'qh', name: '琴湖', campus: 'kaiyuan', lng: 112.4540, lat: 34.6420, cat: '风景', desc: '傍晚散步吹风的好地方，离宿舍区很近。', img: 'img/qinhu.jpg', emoji: '🌊', x: 22, y: 28 },
    { id: 'canteen', name: '嘉园餐厅', campus: 'kaiyuan', lng: 112.4575, lat: 34.6390, cat: '吃喝', desc: '开元最大的食堂之一，一楼平价、二楼风味窗口多。', img: 'img/jiayuan_canteen.jpg', emoji: '🍜', x: 74, y: 58 },
    { id: 'dorm', name: '宿舍区', campus: 'kaiyuan', lng: 112.4580, lat: 34.6385, cat: '生活', desc: '嘉园、菁园、乾园等园区，空调独卫看分配运气。', img: 'img/dorm1.jpg', emoji: '🛏️', x: 76, y: 30 },
    { id: 'gate', name: '开元校门', campus: 'kaiyuan', lng: 112.4560, lat: 34.6450, cat: '地标', desc: '开元大道 263 号，新生报到处就在这片。', img: 'img/campus2.jpg', emoji: '🏛️', x: 50, y: 88 },
    { id: 'field', name: '运动场', campus: 'kaiyuan', lng: 112.4545, lat: 34.6380, cat: '运动', desc: '操场加篮球场，夜跑和打球的人不少。', img: 'img/nyzt1.jpg', emoji: '🏃', x: 20, y: 64 },
    { id: 'xy', name: '西苑校区', campus: 'xiyuan', lng: 112.3780, lat: 34.6570, cat: '校区', desc: '老校区，秋天梧桐大道很出片，工科强院聚集地。', img: 'img/xiyuan_campus.jpg', emoji: '🌳', x: 50, y: 50 },
    { id: 'bearing', name: '中国轴承陈列馆', campus: 'xiyuan', lng: 112.3785, lat: 34.6575, cat: '特色', desc: '轴承强校的门面，馆里能看到不少轴承实物。', img: 'img/gkzt.jpg', emoji: '⚙️', x: 68, y: 32 },
    { id: 'bridge', name: '连接天桥', campus: 'xiyuan', lng: 112.3775, lat: 34.6565, cat: '风景', desc: '连南北两院的天桥，经典打卡点。', img: 'img/nyzt1.jpg', emoji: '🌉', x: 38, y: 70 }
  ];
  var CENTER = { kaiyuan: [112.4560, 34.6405], xiyuan: [112.3780, 34.6570] };
  var STAMP_KEY = 'haust_stamps_web';

  var curCampus = 'kaiyuan';
  var stamps = loadStamps();
  var map = null, walking = null, curPoly = null, markers = [];
  var routeStart = null, routeEnd = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function loadStamps() { try { return JSON.parse(localStorage.getItem(STAMP_KEY) || '[]'); } catch (e) { return []; } }
  function saveStamps() { try { localStorage.setItem(STAMP_KEY, JSON.stringify(stamps)); } catch (e) { } }
  function byCampus(c) { return LANDMARKS.filter(function (l) { return l.campus === c; }); }
  function findL(id) { for (var i = 0; i < LANDMARKS.length; i++) if (LANDMARKS[i].id === id) return LANDMARKS[i]; return null; }

  /* ---------------- 1. 立体校园地图（高德，需 Key） ---------------- */
  function initAmap() {
    var box = $('amapContainer'), fb = $('mapFallback');
    if (!box) return;
    if (!AMAP_KEY) { showFallback('还未配置高德 Key：在 api-config.js 里填 window.__AMAP_KEY__ 即可开启 3D 立体校园（免费申请）。下面「手绘集章地图」不受影响，照常能玩。'); return; }
    // 2021-12 之后申请的 Key 需配安全密钥，且必须在加载 maps 脚本前设置
    if (AMAP_SEC) { window._AMapSecurityConfig = { securityJsCode: AMAP_SEC }; }
    window.__amapReady = function () { try { buildMap(); } catch (e) { showFallback('地图初始化失败：' + e.message); } };
    var s = document.createElement('script');
    s.src = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(AMAP_KEY) + '&plugin=AMap.Walking,AMap.ToolBar,AMap.ControlBar&callback=__amapReady';
    s.onerror = function () { showFallback('高德地图脚本加载失败，请检查网络或 Key 是否正确。下面「手绘集章地图」不受影响。'); };
    document.head.appendChild(s);
    // 5 秒没就绪也降级，避免一直空白
    setTimeout(function () { if (!map && fb && fb.hidden) showFallback('地图加载超时（可能是 Key 无效或未开通 Web 端 JSAPI）。下面「手绘集章地图」不受影响。'); }, 6000);
  }

  function showFallback(msg) {
    var fb = $('mapFallback'); if (!fb) return;
    fb.innerHTML = '<div class="fb-inner"><div class="fb-ico">🗺️</div><p>' + esc(msg) + '</p></div>';
    fb.hidden = false;
  }

  function buildMap() {
    if (!window.AMap) return;
    map = new AMap.Map('amapContainer', {
      zoom: 16.4,
      pitch: 62,          // 俯仰角：越大越有立体感
      rotation: -18,
      viewMode: '3D',     // 开启 3D 视图（楼块自动立体）
      pitchEnable: true,
      rotateEnable: true,
      mapStyle: 'amap://styles/dark',
      center: CENTER[curCampus]
    });
    AMap.plugin(['AMap.ToolBar', 'AMap.ControlBar'], function () {
      map.addControl(new AMap.ToolBar({ position: { right: '12px', bottom: '80px' } }));
      map.addControl(new AMap.ControlBar({ position: { right: '6px', top: '12px' } }));
    });
    AMap.plugin('AMap.Walking', function () {
      walking = new AMap.Walking({ map: map, panel: '' }); // 不用默认面板，自己渲染成深色步骤列表
    });
    renderMarkers();
  }

  function clearMarkers() {
    if (!map) return;
    markers.forEach(function (m) { map.remove(m); });
    markers = [];
  }

  function renderMarkers() {
    if (!map) return;
    clearMarkers();
    byCampus(curCampus).forEach(function (l) {
      var done = stamps.indexOf(l.id) >= 0;
      var mk = new AMap.Marker({
        position: [l.lng, l.lat],
        offset: new AMap.Pixel(-14, -14),
        content: '<div class="mk' + (done ? ' done' : '') + '" title="' + esc(l.name) + '">' + l.emoji + '</div>',
        map: map
      });
      mk.on('click', function () { openInfo(l); });
      markers.push(mk);
    });
  }

  function openInfo(l) {
    if (!map) { openCard(l); return; }
    var done = stamps.indexOf(l.id) >= 0;
    var html = '<div class="iw">' +
      '<img class="iw-img" src="' + esc(l.img) + '" alt="' + esc(l.name) + '">' +
      '<div class="iw-body">' +
      '<div class="iw-name">' + esc(l.name) + '<span class="iw-cat">' + esc(l.cat) + '</span></div>' +
      '<p class="iw-desc">' + esc(l.desc) + '</p>' +
      '<div class="iw-btns">' +
      '<button class="iw-btn" data-act="from">设为起点</button>' +
      '<button class="iw-btn" data-act="to">设为终点</button>' +
      '<button class="iw-btn gold" data-act="stamp">' + (done ? '已盖章 ✓' : '盖个章 📍') + '</button>' +
      '</div></div></div>';
    var iw = new AMap.InfoWindow({ content: html, offset: new AMap.Pixel(0, -18), isCustom: false });
    iw.open(map, [l.lng, l.lat]);
    setTimeout(function () {
      var box = document.querySelector('.iw');
      if (!box) return;
      box.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.iw-btn') : null;
        if (!b) return;
        var act = b.getAttribute('data-act');
        if (act === 'from') { routeStart = l; toast('起点：' + l.name); }
        else if (act === 'to') { routeEnd = l; toast('终点：' + l.name); }
        else { doStamp(l, b); }
      });
    }, 30);
  }

  /* 步行路线：自己渲染成深色步骤列表（高德默认面板是白底，和站点风格不搭） */
  function planRoute() {
    var panel = $('routePanel');
    if (!walking) { if (panel) panel.innerHTML = '<div class="route-empty">路线规划需要高德 Key 支持（当前为手绘地图模式）。</div>'; return; }
    if (!routeStart || !routeEnd) { if (panel) panel.innerHTML = '<div class="route-empty">先在地图上点两个地点，分别设为「起点」和「终点」。</div>'; return; }
    if (panel) panel.innerHTML = '<div class="route-loading">路线规划中…</div>';
    walking.search([routeStart.lng, routeStart.lat], [routeEnd.lng, routeEnd.lat], function (status, result) {
      if (status !== 'complete' || !result.routes || !result.routes.length) {
        if (panel) panel.innerHTML = '<div class="route-empty">没查到步行路线，换个起点/终点试试。</div>';
        return;
      }
      var r = result.routes[0];
      var mins = Math.max(1, Math.round(r.time / 60));
      var dist = r.distance >= 1000 ? (r.distance / 1000).toFixed(1) + ' 公里' : r.distance + ' 米';
      var steps = (r.steps || []).map(function (s, i) {
        return '<li><span class="step-i">' + (i + 1) + '</span><span class="step-t">' + esc(s.instruction) + '</span><span class="step-d">' + (s.distance >= 1000 ? (s.distance / 1000).toFixed(1) + 'km' : s.distance + 'm') + '</span></li>';
      }).join('');
      if (panel) {
        panel.innerHTML = '<div class="route-head">🚶 ' + esc(routeStart.name) + ' → ' + esc(routeEnd.name) +
          '<span class="route-meta">约 ' + dist + ' · 步行 ' + mins + ' 分钟</span></div><ol class="route-steps">' + steps + '</ol>';
      }
    });
  }

  /* ---------------- 2. 手绘集章打卡地图（不依赖 Key） ---------------- */
  function initHandMap() {
    var wrap = $('handMap');
    if (!wrap) return;
    renderHandMap();
    renderStampProgress();
    var tabs = document.querySelectorAll('#mapCampusTabs .campus-tab');
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        curCampus = t.getAttribute('data-campus');
        routeStart = routeEnd = null;
        if (map) { map.setCenter(CENTER[curCampus]); }
        renderMarkers();
        renderHandMap();
      });
    });
    var go = $('routeGo'); if (go) go.addEventListener('click', planRoute);
    var pb = $('posterBtn'); if (pb) pb.addEventListener('click', makePoster);
  }

  function renderHandMap() {
    var wrap = $('handMap');
    if (!wrap) return;
    var list = byCampus(curCampus);
    var dots = list.map(function (l) {
      var done = stamps.indexOf(l.id) >= 0;
      return '<button class="hm-dot' + (done ? ' done' : '') + '" data-id="' + l.id + '" style="left:' + l.x + '%;top:' + l.y + '%">' +
        '<span class="hm-ico">' + l.emoji + '</span><span class="hm-name">' + esc(l.name) + '</span></button>';
    }).join('');
    wrap.innerHTML =
      '<div class="hm-grid"></div>' +
      '<div class="hm-road v" style="left:50%"></div><div class="hm-road h" style="top:62%"></div>' +
      '<div class="hm-lake"></div>' +
      dots +
      '<div class="hm-tip">👆 点建筑打卡集章（手绘示意图，位置为示意）</div>';
    var btns = wrap.querySelectorAll('.hm-dot');
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function () { openCard(findL(b.getAttribute('data-id'))); });
    });
  }

  function openCard(l) {
    if (!l) return;
    var card = $('stampCard');
    var done = stamps.indexOf(l.id) >= 0;
    if (card) {
      card.innerHTML = '<img src="' + esc(l.img) + '" alt="' + esc(l.name) + '">' +
        '<div class="sc-body"><div class="sc-name">' + esc(l.name) + '<span class="sc-cat">' + esc(l.cat) + '</span></div>' +
        '<p>' + esc(l.desc) + '</p>' +
        '<button class="iw-btn gold" id="scStamp">' + (done ? '已盖章 ✓' : '在这里盖个章 📍') + '</button></div>';
      card.hidden = false;
      var sb = $('scStamp');
      if (sb) sb.addEventListener('click', function () { doStamp(l, sb); });
    }
  }

  function doStamp(l, btn) {
    if (stamps.indexOf(l.id) >= 0) { toast('这枚已经盖过啦'); return; }
    stamps = stamps.concat(l.id);
    saveStamps();
    if (btn) btn.textContent = '已盖章 ✓';
    toast('盖章成功：' + l.name + ' 🎉');
    renderHandMap();
    renderMarkers();
    renderStampProgress();
    if (stamps.length >= LANDMARKS.length) toast('全部集齐！你是真正的「老生」了 🎓 可以生成海报啦');
  }

  function renderStampProgress() {
    var box = $('stampProgress');
    if (!box) return;
    var total = LANDMARKS.length, n = stamps.length;
    var pct = Math.round(n / total * 100);
    var all = n >= total;
    box.innerHTML = '<div class="sp-top"><span class="sp-num">' + n + '</span><span class="sp-tot">/ ' + total + ' 枚印章</span>' +
      (all ? '<span class="sp-badge">老生认证 ✓</span>' : '') + '</div>' +
      '<div class="sp-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="sp-list">' + LANDMARKS.map(function (l) {
        var on = stamps.indexOf(l.id) >= 0;
        return '<span class="sp-chip' + (on ? ' on' : '') + '" title="' + esc(l.name) + '">' + l.emoji + '</span>';
      }).join('') + '</div>';
  }

  /* 集章海报：Canvas 画好后提示长按/下载保存 */
  function makePoster() {
    var cv = $('posterCanvas');
    if (!cv) return;
    var W = 720, H = 1100;
    cv.width = W; cv.height = H; cv.hidden = false;
    var g = cv.getContext('2d');
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0e1a'); bg.addColorStop(0.5, '#0f1a30'); bg.addColorStop(1, '#160a2e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // 金色描边
    g.strokeStyle = 'rgba(212,175,55,.55)'; g.lineWidth = 6; g.strokeRect(18, 18, W - 36, H - 36);
    g.textAlign = 'center';
    g.fillStyle = '#D4AF37'; g.font = 'bold 46px "Microsoft YaHei",sans-serif';
    g.fillText('河南科技大学 · 校园集章', W / 2, 120);
    g.fillStyle = '#F5F0EB'; g.font = '28px "Microsoft YaHei",sans-serif';
    g.fillText('2026 级新生 · 探索打卡证书', W / 2, 176);
    // 进度环
    var cx = W / 2, cy = 330, r = 96;
    var pct = stamps.length / LANDMARKS.length;
    g.lineWidth = 20; g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,.10)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    var grad = g.createLinearGradient(cx - r, cy, cx + r, cy);
    grad.addColorStop(0, '#1E88E5'); grad.addColorStop(1, '#D4AF37');
    g.strokeStyle = grad; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 60px "Microsoft YaHei",sans-serif';
    g.fillText(stamps.length + ' / ' + LANDMARKS.length, cx, cy + 20);
    // 章列表
    g.textAlign = 'left';
    var x0 = 90, y0 = 500;
    LANDMARKS.forEach(function (l, i) {
      var col = i % 2, row = Math.floor(i / 2);
      var x = x0 + col * 280, y = y0 + row * 78;
      var on = stamps.indexOf(l.id) >= 0;
      g.globalAlpha = on ? 1 : 0.32;
      g.fillStyle = on ? 'rgba(212,175,55,.16)' : 'rgba(255,255,255,.05)';
      g.beginPath(); if (g.roundRect) { g.roundRect(x, y, 250, 60, 12); } else { g.rect(x, y, 250, 60); } g.fill();
      g.strokeStyle = on ? 'rgba(212,175,55,.6)' : 'rgba(255,255,255,.12)'; g.lineWidth = 2; g.stroke();
      g.fillStyle = on ? '#F4D078' : '#8b95a8';
      g.font = '26px "Microsoft YaHei",sans-serif';
      g.fillText((on ? '✓ ' : '· ') + l.emoji + ' ' + l.name, x + 18, y + 40);
      g.globalAlpha = 1;
    });
    g.textAlign = 'center';
    g.fillStyle = '#8b95a8'; g.font = '22px "Microsoft YaHei",sans-serif';
    g.fillText('明德 博学 日新 笃行 · site.liuyushan.top', W / 2, H - 60);
    try {
      var url = cv.toDataURL('image/png');
      var a = document.createElement('a');
      a.href = url; a.download = '河科大校园集章.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast('海报已生成，去相册/下载里看看 🎨');
    } catch (e) { toast('生成成功，长按下方图片可保存'); }
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('mapToast');
    if (!t) { t = document.createElement('div'); t.id = 'mapToast'; t.className = 'map-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function boot() {
    if (!document.getElementById('handMap')) return;
    initHandMap();
    initAmap();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
