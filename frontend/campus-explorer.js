/* 校园探索模块
   立体校园地图：使用高德官方 Loader 加载 JSAPI 2.0（3D/2D 自动降级）+ POI 弹卡 + 步行路线规划
   在 api-config.js 配置 window.__AMAP_KEY__ 与 window.__AMAP_SECURITY_CODE__。
*/
(function () {
  'use strict';
  var AMAP_KEY = window.__AMAP_KEY__ || '';
  var AMAP_SEC = window.__AMAP_SECURITY_CODE__ || '';
  console.log('[campus] loaded. AMAP_KEY present:', !!AMAP_KEY, 'SEC present:', !!AMAP_SEC);

  /* 校园地标：坐标复用小程序「校园探索」已标注的数据，图片用站点已有素材 */
  var LANDMARKS = [
    { id: 'lib', name: '图书馆', campus: 'kaiyuan', lng: 112.4558, lat: 34.6412, cat: '学习', desc: '鼎形建筑，豫西最大的图书馆，藏书 450 万册，期末一座难求。', img: 'img/tsg.jpg', emoji: '📚' },
    { id: 'th', name: '教学楼', campus: 'kaiyuan', lng: 112.4565, lat: 34.6398, cat: '学习', desc: '一~六号教学楼连成片，上课前看清楼号别跑错。', img: 'img/teaching_building.jpg', emoji: '🏫' },
    { id: 'qh', name: '琴湖', campus: 'kaiyuan', lng: 112.4540, lat: 34.6420, cat: '风景', desc: '傍晚散步吹风的好地方，离宿舍区很近。', img: 'img/qinhu.jpg', emoji: '🌊' },
    { id: 'canteen', name: '嘉园餐厅', campus: 'kaiyuan', lng: 112.4575, lat: 34.6390, cat: '吃喝', desc: '开元最大的食堂之一，一楼平价、二楼风味窗口多。', img: 'img/jiayuan_canteen.jpg', emoji: '🍜' },
    { id: 'dorm', name: '宿舍区', campus: 'kaiyuan', lng: 112.4580, lat: 34.6385, cat: '生活', desc: '嘉园、菁园、乾园等园区，空调独卫看分配运气。', img: 'img/dorm1.jpg', emoji: '🛏️' },
    { id: 'gate', name: '开元校门', campus: 'kaiyuan', lng: 112.4560, lat: 34.6450, cat: '地标', desc: '开元大道 263 号，新生报到处就在这片。', img: 'img/campus2.jpg', emoji: '🏛️' },
    { id: 'field', name: '运动场', campus: 'kaiyuan', lng: 112.4545, lat: 34.6380, cat: '运动', desc: '操场加篮球场，夜跑和打球的人不少。', img: 'img/nyzt1.jpg', emoji: '🏃' },
    { id: 'xy', name: '西苑校区', campus: 'xiyuan', lng: 112.3780, lat: 34.6570, cat: '校区', desc: '老校区，秋天梧桐大道很出片，工科强院聚集地。', img: 'img/xiyuan_campus.jpg', emoji: '🌳' },
    { id: 'bearing', name: '中国轴承陈列馆', campus: 'xiyuan', lng: 112.3785, lat: 34.6575, cat: '特色', desc: '轴承强校的门面，馆里能看到不少轴承实物。', img: 'img/gkzt.jpg', emoji: '⚙️' },
    { id: 'bridge', name: '连接天桥', campus: 'xiyuan', lng: 112.3775, lat: 34.6565, cat: '风景', desc: '连南北两院的天桥，经典打卡点。', img: 'img/nyzt1.jpg', emoji: '🌉' }
  ];
  var CENTER = { kaiyuan: [112.4560, 34.6405], xiyuan: [112.3780, 34.6570] };

  var curCampus = 'kaiyuan';
  var map = null, walking = null, curPoly = null, markers = [];
  var routeStart = null, routeEnd = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function byCampus(c) { return LANDMARKS.filter(function (l) { return l.campus === c; }); }
  function findL(id) { for (var i = 0; i < LANDMARKS.length; i++) if (LANDMARKS[i].id === id) return LANDMARKS[i]; return null; }

  function showMsg(msg) {
    var fb = $('mapFallback'); if (!fb) return;
    fb.innerHTML = '<div class="fb-inner"><div class="fb-ico">🗺️</div><p>' + esc(msg) + '</p></div>';
    fb.hidden = false;
  }


  function initAmap() {
    console.log('[campus] initAmap called. box:', !!$('amapContainer'), 'AMAP_KEY:', !!AMAP_KEY);
    var box = $('amapContainer');
    if (!box) return;
    if (!AMAP_KEY) { console.log('[campus] no AMAP_KEY, abort'); showMsg('还未配置高德 Key：在 api-config.js 里填 window.__AMAP_KEY__ 即可开启立体校园地图（免费申请）。'); return; }
    // 安全密钥必须在加载地图脚本前设置
    if (AMAP_SEC) { window._AMapSecurityConfig = { securityJsCode: AMAP_SEC }; }

    // 改用高德 1.4.x 传统栅格地图脚本，避免 JSAPI 2.0 WebGL 矢量底图
    // 在某些 Key/浏览器/域名组合下出现「控件可见、底图空白」的问题。
    var s = document.createElement('script');
    s.src = 'https://webapi.amap.com/maps?v=1.4.15&key=' + encodeURIComponent(AMAP_KEY) + '&plugin=AMap.ToolBar,AMap.Walking';
    s.async = true;
    s.onload = function () {
      console.log('[campus] AMap 1.4.x script loaded');
      window.AMap = window.AMap || AMap;
      buildMap();
    };
    s.onerror = function () {
      console.error('[campus] AMap 1.4.x script load error');
      showMsg('高德地图脚本加载失败，请检查 Key / 安全密钥 / 域名白名单是否配置正确。');
    };
    document.head.appendChild(s);
  }

  function buildMap() {
    console.log('[campus] buildMap called');
    if (!window.AMap) return;
    var mapReady = false;
    var opts = {
      zoom: 16.4,
      center: CENTER[curCampus],
      viewMode: '2D',
      rotateEnable: true,
      resizeEnable: true
    };
    try {
      console.log('[campus] creating AMap.Map with opts', JSON.stringify({viewMode: opts.viewMode, center: opts.center, zoom: opts.zoom}));
      map = new AMap.Map('amapContainer', opts);
      console.log('[campus] AMap.Map created');
    } catch (e) {
      console.error('[campus] AMap.Map create error', e);
      showMsg('地图初始化失败：' + e.message + '。');
      return;
    }
    map.on('complete', function () {
      console.log('[campus] map complete');
      mapReady = true;
      var fb = $('mapFallback'); if (fb) fb.hidden = true;
      try { map.resize(); } catch (e) {}
      renderMarkers();
      // 诊断：3 秒后若底图仍未渲染，给出可见提示，方便排查 Key/网络问题
      setTimeout(function () {
        var e = $('amapContainer'); if (!e) return;
        var layers = e.querySelectorAll('.amap-layer').length;
        var imgs = e.querySelectorAll('img').length;
        var cv = e.querySelectorAll('canvas').length;
        console.log('[campus] diag layers=', layers, 'imgs=', imgs, 'canvas=', cv);
        if (layers === 0 && imgs === 0 && cv === 0) {
          showMsg('底图加载失败：高德瓦片未返回。请确认高德 Key 已开通「Web端(JS API)」且 域名白名单 包含 site.liuyushan.top，并检查网络能否访问 is.autonavi.com。');
        }
      }, 3000);
    });
    map.on('error', function (e) {
      console.error('[campus] AMap error', e);
      showMsg('地图渲染出错：' + (e && e.info || '未知错误') + '。');
    });

    try { map.addControl(new AMap.ToolBar({ position: { right: '12px', bottom: '80px' } })); } catch (e) {}
    try { map.addControl(new AMap.ControlBar({ position: { right: '6px', top: '12px' } })); } catch (e) {}
    try { walking = new AMap.Walking({ map: map, panel: '' }); } catch (e) {}
    // 兜底：布局稳定后再次 resize，避免底图空白
    setTimeout(function () { if (map) { try { map.resize(); } catch (e) {} } }, 500);
  }

  function rebuild2D() {
    if (map) { try { map.destroy(); } catch (e) {} map = null; walking = null; }
    var fb = $('mapFallback'); if (fb) fb.hidden = true;
    try {
      map = new AMap.Map('amapContainer', {
        zoom: 16.4,
        center: CENTER[curCampus],
        viewMode: '2D',
        rotateEnable: true,
        resizeEnable: true
      });
      map.on('complete', function () {
        var fb2 = $('mapFallback'); if (fb2) fb2.hidden = true;
        renderMarkers();
      });
      map.on('error', function (e) {
        console.error('AMap 2D error', e);
        showMsg('2D 地图也加载失败：' + (e && e.info || '未知错误') + '。请检查 Key / 安全密钥 / 域名白名单。');
      });
      setTimeout(function () {
        if (!map || !map.getCenter) showMsg('2D 地图加载超时，请检查高德 Key 是否开通「Web端(JS API)」且白名单包含当前域名 site.liuyushan.top。');
      }, 10000);
      try { walking = new AMap.Walking({ map: map, panel: '' }); } catch (e) {}
    } catch (e) {
      showMsg('2D 地图初始化失败：' + e.message + '。请检查 Key / 安全密钥 / 域名白名单。');
    }
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
      var mk = new AMap.Marker({
        position: [l.lng, l.lat],
        offset: new AMap.Pixel(-14, -14),
        content: '<div class="mk" title="' + esc(l.name) + '">' + l.emoji + '</div>',
        map: map
      });
      mk.on('click', function () { openInfo(l); });
      markers.push(mk);
    });
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'map-toast';
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);background:rgba(10,14,26,.92);color:var(--gold2);border:1px solid rgba(212,175,55,.35);padding:8px 16px;border-radius:999px;font-size:13px;z-index:200;pointer-events:none;opacity:0;transition:opacity .25s;';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250); }, 1600);
  }

  function openInfo(l) {
    if (!map) return;
    var html = '<div class="iw">' +
      '<img class="iw-img" src="' + esc(l.img) + '" alt="' + esc(l.name) + '">' +
      '<div class="iw-body">' +
      '<div class="iw-name">' + esc(l.name) + '<span class="iw-cat">' + esc(l.cat) + '</span></div>' +
      '<p class="iw-desc">' + esc(l.desc) + '</p>' +
      '<div class="iw-btns">' +
      '<button class="iw-btn" data-act="from">设为起点</button>' +
      '<button class="iw-btn" data-act="to">设为终点</button>' +
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
      });
    }, 30);
  }

  /* 步行路线：自己渲染成深色步骤列表（高德默认面板是白底，和站点风格不搭） */
  function planRoute() {
    var panel = $('routePanel');
    if (!walking) { if (panel) panel.innerHTML = '<div class="route-empty">路线规划功能正在加载中，请稍等。</div>'; return; }
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

  function boot() {
    console.log('[campus] boot. amapContainer found:', !!document.getElementById('amapContainer'));
    if (!document.getElementById('amapContainer')) return;

    // 关键修复：地图区块在页面较靠下，初始处于 reveal 入场动画（容器带 opacity/transform）。
    // 若在此时初始化，高德 WebGL 底图会在未稳定的容器里渲染成空白且事后不重绘。
    // 改为：滚动进入视口后再创建地图；并监听窗口尺寸变化触发 resize。
    var mapInited = false;
    function initWhenReady() {
      if (mapInited) return;
      mapInited = true;
      initAmap();
    }
    // 关键修复：必须等地图容器真正可见（opacity:1）后再初始化。
    // 否则高德在隐藏/位移状态（被 reveal 动画覆盖）下创建地图，底图会渲染成空白。
    function waitVisibleThenInit() {
      if (mapInited) return;
      var w = document.querySelector('.map-wrap') || $('amapContainer');
      var op = w ? getComputedStyle(w).opacity : '1';
      if (op === '1') { initWhenReady(); }
      else { setTimeout(waitVisibleThenInit, 150); }
    }
    var wrap = document.querySelector('.map-wrap') || $('amapContainer');
    if (wrap && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { waitVisibleThenInit(); io.disconnect(); }
        });
      }, { threshold: 0.15 });
      io.observe(wrap);
      // 兜底：6 秒内若仍未触发（如脚本加载极慢），也强制初始化
      setTimeout(waitVisibleThenInit, 6000);
    } else {
      waitVisibleThenInit();
    }
    window.addEventListener('resize', function () { if (map) { try { map.resize(); } catch (e) {} } });

    var tabs = document.querySelectorAll('#mapCampusTabs .campus-tab');
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        curCampus = t.getAttribute('data-campus');
        routeStart = routeEnd = null;
        if (map) { try { map.setCenter(CENTER[curCampus]); renderMarkers(); } catch (e) {} }
      });
    });
    var go = $('routeGo'); if (go) go.addEventListener('click', planRoute);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
