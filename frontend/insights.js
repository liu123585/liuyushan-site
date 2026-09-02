/*
  新生大数据画像：实时统计新生墙(/api/wall) + 弹幕(/api/danmaku) 的真实数据。
  - KPI：已上墙身份卡数、覆盖学院数、来自城市数、弹幕数
  - 学院分布条形图、家乡词云
  - 同频匹配：按学院/家乡统计墙上的同频人数
  数据随新生上墙动态更新，不编造假数字。
*/
(function () {
  'use strict';
  var API_BASE = window.__API_BASE__ || '';
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var posts = [];
  var danmakuCount = 0;

  function byKey(arr, key) {
    var m = {};
    arr.forEach(function (p) { var k = p[key]; if (k) m[k] = (m[k] || 0) + 1; });
    return m;
  }
  function topN(map, n) {
    return Object.keys(map).map(function (k) { return { k: k, v: map[k] }; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, n);
  }

  function renderKpis() {
    var colleges = byKey(posts, 'college');
    var hometowns = byKey(posts, 'hometown');
    var kpis = [
      { n: posts.length, l: '张新生身份卡已上墙' },
      { n: Object.keys(colleges).length, l: '个学院的同学在这里' },
      { n: Object.keys(hometowns).length, l: '座城市飞来的萌新' },
      { n: danmakuCount, l: '条弹幕已送达学弟学妹' }
    ];
    var box = $('insKpis'); if (!box) return;
    box.innerHTML = kpis.map(function (k) {
      return '<div class="ins-kpi"><div class="kpi-n">' + k.n + '</div><div class="kpi-l">' + esc(k.l) + '</div></div>';
    }).join('');
  }

  function renderCollegeBars() {
    var box = $('insCollegeBars'); if (!box) return;
    var top = topN(byKey(posts, 'college'), 8);
    if (!top.length) { box.innerHTML = '<div class="ins-empty">还没有学院数据，去「新生墙」认领身份卡吧～</div>'; return; }
    var max = top[0].v;
    box.innerHTML = top.map(function (t) {
      var pct = Math.max(8, Math.round(t.v / max * 100));
      return '<div class="bar-row"><span class="bar-k" title="' + esc(t.k) + '">' + esc(t.k) + '</span>' +
        '<span class="bar-track"><i style="width:' + pct + '%"></i></span>' +
        '<span class="bar-v">' + t.v + '</span></div>';
    }).join('');
  }

  function renderCloud() {
    var box = $('insCloud'); if (!box) return;
    var top = topN(byKey(posts, 'hometown'), 14);
    if (!top.length) { box.innerHTML = '<div class="ins-empty">还没有家乡数据～</div>'; return; }
    var max = top[0].v;
    box.innerHTML = top.map(function (t) {
      var fs = 13 + Math.round(t.v / max * 13);
      return '<span class="cw" style="font-size:' + fs + 'px">' + esc(t.k) + '</span>';
    }).join('');
  }

  function populateMatch() {
    var sc = $('matchCollege'), sh = $('matchHometown');
    if (sc) {
      var cs = Object.keys(byKey(posts, 'college')).sort();
      sc.innerHTML = '<option value="">选择你的学院</option>' + cs.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
    }
    if (sh) {
      var hs = Object.keys(byKey(posts, 'hometown')).sort();
      sh.innerHTML = '<option value="">选择你的家乡</option>' + hs.map(function (h) { return '<option>' + esc(h) + '</option>'; }).join('');
    }
  }

  function renderMatch() {
    var sc = $('matchCollege'), sh = $('matchHometown'), out = $('matchResult');
    if (!out) return;
    var c = sc ? sc.value : '', h = sh ? sh.value : '';
    if (!c && !h) { out.innerHTML = '选一下学院或家乡，看看有多少同频的小伙伴 👀'; return; }
    var sameC = c ? posts.filter(function (p) { return p.college === c; }).length : 0;
    var sameH = h ? posts.filter(function (p) { return p.hometown === h; }).length : 0;
    var both = (c && h) ? posts.filter(function (p) { return p.college === c && p.hometown === h; }).length : 0;
    var parts = [];
    if (c) parts.push('同学院 <b>' + sameC + '</b> 人');
    if (h) parts.push('同家乡 <b>' + sameH + '</b> 人');
    var txt = '哇，和你';
    if (c && h) txt += '同频的（同院＋同乡）有 <b>' + both + '</b> 人；其中';
    txt += parts.join('、') + '。开学别错过面基呀！';
    out.innerHTML = txt;
  }

  function renderAll() {
    renderKpis(); renderCollegeBars(); renderCloud(); populateMatch(); renderMatch();
  }

  function load() {
    var w = fetch(API_BASE + '/api/wall').then(function (r) { return r.json(); })
      .then(function (d) { posts = (d && d.posts) || []; }).catch(function () { posts = []; });
    var dk = fetch(API_BASE + '/api/danmaku').then(function (r) { return r.json(); })
      .then(function (d) { danmakuCount = (d && d.items) ? d.items.length : 0; }).catch(function () { danmakuCount = 0; });
    Promise.all([w, dk]).then(renderAll).catch(function () {
      var b = $('insKpis'); if (b) b.innerHTML = '<div class="ins-empty">数据加载失败，稍后刷新看看～</div>';
    });
  }

  document.addEventListener('change', function (e) {
    if (e.target && (e.target.id === 'matchCollege' || e.target.id === 'matchHometown')) renderMatch();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
