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
  /* 每个地标的真实照片相册（复用站点已有素材），"看实景"会打开照片灯箱 */
  var GAL = {
    lib: ['img/tsg.jpg', 'img/library_cover.jpg', 'img/map_library.jpg'],
    th: ['img/teaching_building.jpg'],
    qh: ['img/qinhu.jpg'],
    canteen: ['img/jiayuan_canteen.jpg', 'img/jiayuan_canteen_real.jpg', 'img/jiayuan_canteen_area.png', 'img/jiayuan_canteen_interior.png', 'img/jiayuan_canteen2.png'],
    dorm: ['img/dorm1.jpg', 'img/dorm_real_1.jpg', 'img/dorm_real_2.jpg', 'img/jiayuan_dorm_real.jpg', 'img/jingyuan_dorm_real.jpg', 'img/dorm_exterior1.jpg', 'img/dorm_interior.jpg'],
    gate: ['img/campus2.jpg'],
    field: ['img/nyzt1.jpg', 'img/nyzt2.jpg', 'img/ztyc.jpg'],
    flag: ['img/campus2.jpg'],
    xy: ['img/xiyuan_campus.jpg'],
    bearing: ['img/gkzt.jpg'],
    bridge: ['img/nyzt1.jpg']
  };
  LANDMARKS.forEach(function (l) { if (GAL[l.id]) l.gallery = GAL[l.id]; });
  // 开元校区定位到「国旗广场」（校园正中央）；西苑校区定位到校区中心（Bigemap 精确坐标）。
  var CENTER = { kaiyuan: [112.4559, 34.6412], xiyuan: [112.37384, 34.661337] };
  // 用户手动校正的国旗广场坐标（localStorage 记忆），优先于默认值
  try {
    var _fp = JSON.parse(localStorage.getItem('flagPos') || 'null');
    if (_fp && _fp.lng && _fp.lat) {
      CENTER.kaiyuan = [_fp.lng, _fp.lat];
      var _fl = findL('flag'); if (_fl) { _fl.lng = _fp.lng; _fl.lat = _fp.lat; }
    }
  } catch (e) {}
  // 越详细越好：开元放大到广场级，西苑校区较小也给到街区级。
  var ZOOM = { kaiyuan: 17, xiyuan: 16.5 };

  var curCampus = 'kaiyuan';
  var map = null, walking = null, curPoly = null, markers = [];
  var routeStart = null, routeEnd = null;
  var pickMode = null, startMark = null, endMark = null;
  var flagMode = false;

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
      '<a class="game-btn" href="https://uri.amap.com/marker?position=' + CENTER.kaiyuan[0] + ',' + CENTER.kaiyuan[1] + '&name=河南科技大学开元校区&src=liuyushan&coordinate=gaode&callnative=1" target="_blank" rel="noopener">用高德地图打开校园</a>' +
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
    s.src = 'https://webapi.amap.com/maps?v=1.4.15&key=' + encodeURIComponent(AMAP_KEY) + (AMAP_SEC ? '&jscode=' + encodeURIComponent(AMAP_SEC) : '') + '&plugin=AMap.ToolBar,AMap.Walking';
    s.async = true;
    s.onload = function () {
      console.log('[campus] AMap 1.4.x script loaded');
      window.AMap = window.AMap || AMap;
      // 显式等插件就绪，避免直接 new AMap.Walking 时插件还没加载完
      AMap.plugin(['AMap.ToolBar', 'AMap.Walking'], function () {
        console.log('[campus] AMap plugins ready');
        buildMap();
      });
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
    // 步行插件延迟到第一次规划时再初始化，避免插件时序问题
    // 兜底：布局稳定后再次 resize，避免底图空白
    setTimeout(function () { if (map) { try { map.resize(); } catch (e) {} } }, 500);
    bindRoutePicking();
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
      bindRoutePicking();
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
    // 开元校区默认把「起点」落在国旗广场（校园几何中心），用户可随时改点
    if (curCampus === 'kaiyuan' && !routeStart) {
      var f = findL('flag');
      if (f) setEndpoint('start', f);
    }
  }

  /* 起点/终点选点：地标弹窗按钮 或 直接在地图上点，都会走到这里 */
  function setEndpoint(which, pt) {
    if (!map) return;
    if (which === 'start') {
      routeStart = pt;
      if (startMark) { try { map.remove(startMark); } catch (e) {} }
      startMark = new AMap.Marker({ position: [pt.lng, pt.lat], map: map, offset: new AMap.Pixel(-14, -28), content: '<div class="mk mk-start">起</div>' });
    } else {
      routeEnd = pt;
      if (endMark) { try { map.remove(endMark); } catch (e) {} }
      endMark = new AMap.Marker({ position: [pt.lng, pt.lat], map: map, offset: new AMap.Pixel(-14, -28), content: '<div class="mk mk-end">终</div>' });
    }
    toast((which === 'start' ? '起点：' : '终点：') + pt.name);
    if (routeStart && routeEnd) planRoute();
  }
  function clearRouteMarks() {
    if (startMark) { try { map.remove(startMark); } catch (e) {} startMark = null; }
    if (endMark) { try { map.remove(endMark); } catch (e) {} endMark = null; }
  }
  function resetRoute() {
    routeStart = routeEnd = null;
    clearRouteMarks();
    if (curPoly) { try { map.remove(curPoly); } catch (e) {} curPoly = null; }
    var panel = $('routePanel'); if (panel) panel.innerHTML = '';
    pickMode = null; updatePickButtons();
  }
  function updatePickButtons() {
    var ps = $('routePickStart'), pe = $('routePickEnd');
    if (ps) ps.classList.toggle('active', pickMode === 'start');
    if (pe) pe.classList.toggle('active', pickMode === 'end');
  }
  function bindRoutePicking() {
    if (!map) return;
    try {
      map.on('click', function (e) {
        // 校正国旗广场：点一下地图，把该点设为国旗广场并记住
        if (flagMode) {
          var fll = e.lnglat; if (!fll) return;
          var flng = fll.getLng(), flat = fll.getLat();
          CENTER.kaiyuan = [flng, flat];
          var fob = findL('flag'); if (fob) { fob.lng = flng; fob.lat = flat; }
          try { localStorage.setItem('flagPos', JSON.stringify({ lng: flng, lat: flat })); } catch (err) {}
          if (map) { try { map.setZoomAndCenter(18, [flng, flat]); } catch (err) {} }
          renderMarkers();
          flagMode = false;
          var coordStr = flng.toFixed(5) + ',' + flat.toFixed(5);
          toast('国旗广场已校正到 ' + coordStr + '（已记住）');
          try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(coordStr); } catch (err) {}
          return;
        }
        if (!pickMode) return;
        var ll = e.lnglat; if (!ll) return;
        setEndpoint(pickMode, { lng: ll.getLng(), lat: ll.getLat(), name: '地图选点' });
        pickMode = null; updatePickButtons();
      });
    } catch (e) {}
  }
  // 确保 walking 插件真正就绪后再调用 search
  function ensureWalking(cb) {
    if (walking) { cb && cb(null); return; }
    if (!window.AMap) { cb && cb(new Error('AMap 未加载')); return; }
    AMap.plugin(['AMap.Walking'], function () {
      try {
        walking = new AMap.Walking({ map: map, panel: '' });
        cb && cb(null);
      } catch (e) {
        cb && cb(e);
      }
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

  /* 实景：展示地标的真实照片相册（高德街景在校园基本无数据，改为照片灯箱） */
  function openPano(l) {
    var modal = $('panoModal'); if (!modal) return;
    var title = $('panoTitle'); if (title) title.textContent = l.name + ' · 实景';
    var box = $('panoBox'); if (!box) return;
    var imgs = (l.gallery && l.gallery.length) ? l.gallery : [l.img];
    var idx = 0;
    function render() {
      var src = imgs[idx];
      box.innerHTML = '<div class="ph-viewer">' +
        (imgs.length > 1 ? '<button class="ph-nav ph-prev" type="button" aria-label="上一张">‹</button>' : '') +
        '<img class="ph-img" src="' + esc(src) + '" alt="' + esc(l.name) + ' 实景' + (imgs.length > 1 ? (' ' + (idx + 1) + '/' + imgs.length) : '') + '">' +
        (imgs.length > 1 ? '<button class="ph-nav ph-next" type="button" aria-label="下一张">›</button>' : '') +
        (imgs.length > 1 ? '<div class="ph-dots">' + imgs.map(function (_, i) { return '<i class="' + (i === idx ? 'on' : '') + '"></i>'; }).join('') + '</div>' : '') +
        '</div>';
      var prev = box.querySelector('.ph-prev');
      var next = box.querySelector('.ph-next');
      if (prev) prev.onclick = function (e) { e.stopPropagation(); idx = (idx - 1 + imgs.length) % imgs.length; render(); };
      if (next) next.onclick = function (e) { e.stopPropagation(); idx = (idx + 1) % imgs.length; render(); };
    }
    render();
    modal.hidden = false;
  }
  function closePano() {
    var modal = $('panoModal'); if (modal) modal.hidden = true;
    var box = $('panoBox'); if (box) box.innerHTML = '';
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
        if (act === 'from') setEndpoint('start', l);
        else if (act === 'to') setEndpoint('end', l);
        else if (act === 'nav') { navigateTo(l); }
        else if (act === 'pano') { openPano(l); }
      });
    }, 30);
  }

  /* 步行路线：优先用 JS 插件画线；不行就兜底用高德官方导航链接 */
  function planRoute() {
    var panel = $('routePanel');
    if (!routeStart || !routeEnd) {
      if (panel) panel.innerHTML = '<div class="route-empty">先选两个地点：点「①选起点」「②选终点」后到地图上点一下，或直接点地标弹窗里的「设为起点 / 终点」。</div>';
      return;
    }
    // 兜底：始终提供「用高德 App 打开导航」链接，校内/小路高德 Web 插件可能没数据，App 一定有
    var amapLink = 'https://uri.amap.com/navigation?from=' + routeStart.lng + ',' + routeStart.lat + ',' + encodeURIComponent(routeStart.name) +
      '&to=' + routeEnd.lng + ',' + routeEnd.lat + ',' + encodeURIComponent(routeEnd.name) +
      '&mode=walk&policy=1&callnative=1';
    if (panel) {
      panel.innerHTML = '<div class="route-loading">路线规划中…<br><a class="route-navi" href="' + amapLink + '" target="_blank" rel="noopener">🗺️ 直接用高德导航打开</a></div>';
    }
    ensureWalking(function (err) {
      if (err || !walking) {
        if (panel) panel.innerHTML = '<div class="route-empty">地图内置路线未就绪，<a class="route-navi" href="' + amapLink + '" target="_blank" rel="noopener">🗺️ 用高德 App 导航更稳</a></div>';
        return;
      }
      try {
        walking.search([routeStart.lng, routeStart.lat], [routeEnd.lng, routeEnd.lat], function (status, result) {
          console.log('[campus] walking search', status, result);
          if (status !== 'complete' || !result.routes || !result.routes.length) {
            if (panel) panel.innerHTML = '<div class="route-empty">地图内置步行路线没查到（可能该路段高德还没收录），<a class="route-navi" href="' + amapLink + '" target="_blank" rel="noopener">🗺️ 点击用高德 App 导航</a></div>';
            return;
          }
          var r = result.routes[0];
          var mins = Math.max(1, Math.round(r.time / 60));
          var dist = r.distance >= 1000 ? (r.distance / 1000).toFixed(1) + ' 公里' : r.distance + ' 米';
          var steps = (r.steps || []).map(function (s, i) {
            return '<li><span class="step-i">' + (i + 1) + '</span><span class="step-t">' + esc(s.instruction) + '</span><span class="step-d">' + (s.distance >= 1000 ? (s.distance / 1000).toFixed(1) + 'km' : s.distance + 'm') + '</span></li>';
          }).join('');
          if (panel) {
            panel.innerHTML = '<div class="route-head"><span>🚶 ' + esc(routeStart.name) + ' → ' + esc(routeEnd.name) + '</span>' +
              '<span class="route-meta">约 ' + dist + ' · 步行 ' + mins + ' 分钟 <a class="route-navi inline" href="' + amapLink + '" target="_blank" rel="noopener">🗺️ 用高德打开</a></span></div><ol class="route-steps">' + steps + '</ol>';
          }
        });
      } catch (e) {
        if (panel) panel.innerHTML = '<div class="route-empty">路线规划出错：' + e.message + '。<a class="route-navi" href="' + amapLink + '" target="_blank" rel="noopener">🗺️ 用高德 App 导航</a></div>';
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
        resetRoute();
        if (map) { try { map.setZoomAndCenter(ZOOM[curCampus], CENTER[curCampus]); renderMarkers(); } catch (e) {} }
      });
    });
    var go = $('routeGo'); if (go) go.addEventListener('click', planRoute);
    var ps = $('routePickStart'); if (ps) ps.addEventListener('click', function () { pickMode = (pickMode === 'start' ? null : 'start'); updatePickButtons(); toast(pickMode ? '点击地图选择起点' : '已取消选点'); });
    var pe = $('routePickEnd'); if (pe) pe.addEventListener('click', function () { pickMode = (pickMode === 'end' ? null : 'end'); updatePickButtons(); toast(pickMode ? '点击地图选择终点' : '已取消选点'); });
    var rr = $('routeReset'); if (rr) rr.addEventListener('click', resetRoute);
    var sf = $('setStartFlag'); if (sf) sf.addEventListener('click', function () {
      var f = findL('flag');
      if (!f) { toast('未找到国旗广场'); return; }
      setEndpoint('start', f);
      if (map) { try { map.setZoomAndCenter(18, [f.lng, f.lat]); } catch (e) {} }
    });
    var cf = $('centerFlag'); if (cf) cf.addEventListener('click', function () {
      var f = findL('flag');
      if (f && map) { try { map.setZoomAndCenter(18, [f.lng, f.lat]); } catch (e) {} }
      else { toast('未找到国旗广场'); }
    });
    var cf2 = $('calibFlag'); if (cf2) cf2.addEventListener('click', function () {
      flagMode = !flagMode;
      cf2.classList.toggle('active', flagMode);
      toast(flagMode ? '请在地图上点一下国旗广场的真实位置' : '已取消校正');
    });
    // 实景弹层关闭
    var pc = $('panoClose'); if (pc) pc.addEventListener('click', closePano);
    var pm = $('panoModal'); if (pm) pm.addEventListener('click', function (e) { if (e.target === pm) closePano(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePano(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
