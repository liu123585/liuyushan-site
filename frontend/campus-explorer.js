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
    { id: 'flag', name: '国旗广场', campus: 'kaiyuan', lng: 112.4559, lat: 34.6412, cat: '地标', desc: '校园正中央的升旗广场，开学典礼、重大活动都在这里举行，是开元校区的几何中心。', img: 'img/campus2.jpg', emoji: '🚩' },
    { id: 'xy', name: '西苑校区', campus: 'xiyuan', lng: 112.37384, lat: 34.661337, cat: '校区', desc: '老校区，秋天梧桐大道很出片，工科强院聚集地。', img: 'img/xiyuan_campus.jpg', emoji: '🌳' },
    { id: 'bearing', name: '中国轴承陈列馆', campus: 'xiyuan', lng: 112.3785, lat: 34.6575, cat: '特色', desc: '轴承强校的门面，馆里能看到不少轴承实物。', img: 'img/gkzt.jpg', emoji: '⚙️' },
    { id: 'bridge', name: '连接天桥', campus: 'xiyuan', lng: 112.3775, lat: 34.6565, cat: '风景', desc: '连南北两院的天桥，经典打卡点。', img: 'img/nyzt1.jpg', emoji: '🌉' }
  ];
  // 开元校区定位到「国旗广场」（校园正中央）；西苑校区定位到校区中心（Bigemap 精确坐标）。
  var CENTER = { kaiyuan: [112.4559, 34.6412], xiyuan: [112.37384, 34.661337] };
  // 越详细越好：开元放大到广场级，西苑校区较小也给到街区级。
  var ZOOM = { kaiyuan: 17, xiyuan: 16.5 };

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

  function showMapFallback() {
    var fb = $('mapFallback'); if (!fb) return;
    fb.innerHTML = '<div class="fb-inner">' +
      '<div class="fb-ico">🗺️</div>' +
      '<p><b>地图控件已加载，但底图没有显示出来。</b></p>' +
      '<p>最常见原因：① 高德 Key 未授权当前域名 <code>site.liuyushan.top</code>；② 浏览器/网络拦截了地图瓦片；③ 高德服务临时波动。</p>' +
      '<div class="fb-btns">' +
      '<button class="game-btn" id="mapRetryBtn">重新加载地图</button>' +
      '<a class="game-btn" href="https://uri.amap.com/marker?position=112.4559,34.6412&name=河南科技大学开元校区&src=liuyushan&coordinate=gaode&callnative=1" target="_blank" rel="noopener">用高德地图打开校园</a>' +
      '</div>' +
      '<p class="fb-tip">若一直空白，请去 <a href="https://lbs.amap.com" target="_blank" rel="noopener">高德控制台</a> → 应用管理 → HAUST_Campus → 域名白名单里添加 <code>site.liuyushan.top</code>。</p>' +
      '</div>';
    fb.hidden = false;
    var btn = $('mapRetryBtn');
    if (btn) btn.addEventListener('click', function () { fb.hidden = true; rebuild2D(); });
  }


  function initAmap() {
    console.log('[campus] initAmap called. box:', !!$('amapContainer'), 'AMAP_KEY:', !!AMAP_KEY);
    var box = $('amapContainer');
    if (!box) return;
    if (!AMAP_KEY) { console.log('[campus] no AMAP_KEY, abort'); showMsg('还未配置高德 Key：在 api-config.js 里填 window.__AMAP_KEY__ 即可开启立体校园地图（免费申请）。'); return; }
    // 1.4.x 传统栅格地图：安全密钥通过 URL 的 jscode 参数传入。
    // window._AMapSecurityConfig 是 JSAPI 2.0 的写法，1.4.x 无效。

    // 改用高德 1.4.x 传统栅格地图脚本，避免 JSAPI 2.0 WebGL 矢量底图
    // 在某些 Key/浏览器/域名组合下出现「控件可见、底图空白」的问题。
    var s = document.createElement('script');
    s.src = 'https://webapi.amap.com/maps?v=1.4.15&key=' + encodeURIComponent(AMAP_KEY) + (AMAP_SEC ? '&jscode=' + encodeURIComponent(AMAP_SEC) : '') + '&plugin=AMap.ToolBar,AMap.Walking,AMap.Panorama';
    s.async = true;
    s.onload = function () {
      console.log('[campus] AMap 1.4.x script loaded');
      window.AMap = window.AMap || AMap;
      buildMap();
    };
    s.onerror = function () {
      console.error('[campus] AMap 1.4.x script load error');
      showMapFallback();
    };
    document.head.appendChild(s);
  }

  function buildMap() {
    console.log('[campus] buildMap called');
    if (!window.AMap) return;
    var mapReady = false;
    var opts = {
      zoom: ZOOM[curCampus],
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
    // 兜底：地图创建后持续 resize 一段时间，彻底避免「隐藏/尺寸不稳导致底图空白不重绘」
    var ri = 0;
    var rt = setInterval(function () {
      if (!map) { clearInterval(rt); return; }
      try { map.resize(); } catch (e) {}
      if (++ri > 12) clearInterval(rt);
    }, 250);
    map.on('complete', function () {
      console.log('[campus] map complete');
      mapReady = true;
      var fb = $('mapFallback'); if (fb) fb.hidden = true;
      try { map.resize(); } catch (e) {}
      renderMarkers();
      // 诊断：网络慢时瓦片可能晚到，先 resize 再延后判定，避免误报 fallback
      setTimeout(function () {
        var e = $('amapContainer'); if (!e) return;
        var imgs = e.querySelectorAll('img');
        var cv = e.querySelectorAll('canvas');
        var loadedTiles = 0;
        for (var i = 0; i < imgs.length; i++) {
          if (imgs[i].naturalWidth > 0 && imgs[i].naturalHeight > 0) loadedTiles++;
        }
        for (var j = 0; j < cv.length; j++) {
          if (cv[j].width > 0 && cv[j].height > 0) loadedTiles++;
        }
        console.log('[campus] diag imgs=', imgs.length, 'canvas=', cv.length, 'loadedTiles=', loadedTiles);
        if (loadedTiles === 0) {
          try { map.resize(); } catch (err) {}
          // 再宽限 4 秒，给慢网络瓦片加载时间，仍为空才提示
          setTimeout(function () {
            var e2 = $('amapContainer'); if (!e2) return;
            var imgs2 = e2.querySelectorAll('img');
            var cv2 = e2.querySelectorAll('canvas');
            var lt2 = 0;
            for (var a = 0; a < imgs2.length; a++) { if (imgs2[a].naturalWidth > 0) lt2++; }
            for (var b = 0; b < cv2.length; b++) { if (cv2[b].width > 0) lt2++; }
            if (lt2 === 0) showMapFallback();
          }, 4000);
        }
      }, 4000);
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
        zoom: ZOOM[curCampus],
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

  /* 导航：跳转到高德（有 App 直接唤起导航，否则打开网页版） */
  function navigateTo(l) {
    var url = 'https://uri.amap.com/navigation?to=' + l.lng + ',' + l.lat + ',' +
      encodeURIComponent(l.name) + '&mode=car&policy=1&src=liuyushan&coordinate=gaode&callnative=1';
    window.open(url, '_blank');
  }

  /* 实景：高德全景（街景），支持点箭头在相邻点位间移动 */
  var panoInstance = null;
  function openPano(l) {
    var modal = $('panoModal'); if (!modal) return;
    var title = $('panoTitle'); if (title) title.textContent = l.name + ' · 实景';
    var box = $('panoBox'); if (box) box.innerHTML = '<div class="pano-loading">实景加载中…</div>';
    modal.hidden = false;
    if (!window.AMap || !AMap.Panorama) {
      if (box) box.innerHTML = '<div class="pano-empty">实景功能需等地图脚本加载完成后重试。</div>';
      return;
    }
    if (panoInstance) { try { panoInstance.destroy(); } catch (e) {} panoInstance = null; }
    try {
      panoInstance = new AMap.Panorama('panoBox', {
        position: [l.lng, l.lat],
        zoom: 1,
        linksControl: true,
        keyboard: true,
        scrollWheel: true,
        showClose: false
      });
      panoInstance.on('error', function () {
        var b = $('panoBox'); if (b) b.innerHTML = '<div class="pano-empty">该位置暂无可用的实景图，换个地标试试。</div>';
      });
    } catch (e) {
      if (box) box.innerHTML = '<div class="pano-empty">实景加载失败：' + e.message + '。</div>';
    }
  }
  function closePano() {
    var modal = $('panoModal'); if (modal) modal.hidden = true;
    if (panoInstance) { try { panoInstance.destroy(); } catch (e) {} panoInstance = null; }
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
      '<button class="iw-btn iw-btn-nav" data-act="nav">导航前往</button>' +
      '<button class="iw-btn iw-btn-pano" data-act="pano">看实景</button>' +
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
        else if (act === 'nav') { navigateTo(l); }
        else if (act === 'pano') { openPano(l); }
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

    // 地图容器（.map-wrap）已被强制可见且尺寸固定，无需再等滚动/显形时序。
    // 直接初始化，创建后由 buildMap 内的 resize 循环兜底，彻底避免底图空白。
    var mapInited = false;
    function initWhenReady() {
      if (mapInited) return;
      mapInited = true;
      initAmap();
    }
    // 立即初始化，最稳妥；若 AMap 脚本还没加载完，initAmap 内部会等 onload 再建图。
    initWhenReady();
    window.addEventListener('load', function () { if (map) { try { map.resize(); } catch (e) {} } });
    window.addEventListener('resize', function () { if (map) { try { map.resize(); } catch (e) {} } });

    var tabs = document.querySelectorAll('#mapCampusTabs .campus-tab');
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        curCampus = t.getAttribute('data-campus');
        routeStart = routeEnd = null;
        if (map) { try { map.setZoomAndCenter(ZOOM[curCampus], CENTER[curCampus]); renderMarkers(); } catch (e) {} }
      });
    });
    var go = $('routeGo'); if (go) go.addEventListener('click', planRoute);
    // 实景弹层关闭
    var pc = $('panoClose'); if (pc) pc.addEventListener('click', closePano);
    var pm = $('panoModal'); if (pm) pm.addEventListener('click', function (e) { if (e.target === pm) closePano(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePano(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
