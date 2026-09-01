/* 新生洞察模块
   1) 开学倒计时 + 校历节点：用真实日期算「还有几天」，每天打开都有事看
   2) 2026 级新生大数据画像：数据来自本站新生墙（/api/wall），纯原生渲染
      —— 学院/专业/家乡/星座/MBTI 分布 + 兴趣词云 + 「和你同频的人有多少」
   纯原生实现，无任何第三方图表库；接口拿不到数据时优雅降级为引导语。
   日期如需调整，直接改下面 EVENTS 即可。
*/
(function () {
  'use strict';
  var API_BASE = window.__API_BASE__ || '';

  /* 重要节点（2026 级）。date 为 null 表示待定，不参与倒计时。 */
  var EVENTS = [
    { name: '新生报到注册', date: '2026-09-10', end: '2026-09-11', emoji: '🎒', main: true },
    { name: '军训开始', date: '2026-09-12', emoji: '🪖' },
    { name: '国庆节', date: '2026-10-01', emoji: '🇨🇳' },
    { name: '元旦', date: '2027-01-01', emoji: '🎆' }
  ];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function parseDate(str) { var p = str.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function daysTo(target) { var now = new Date(); now.setHours(0, 0, 0, 0); return Math.ceil((target - now) / 86400000); }
  function fmtRange(e) {
    if (!e.date) return e.note || '待定';
    if (!e.end) return e.date;
    var a = e.date.split('-'), b = e.end.split('-');
    return a[1] === b[1] ? (+a[1]) + '月' + (+a[2]) + '日—' + (+b[2]) + '日'
      : (+a[1]) + '月' + (+a[2]) + '日—' + (+b[1]) + '月' + (+b[2]) + '日';
  }

  /* ---------------- 倒计时 ---------------- */
  function initCountdown() {
    var box = $('countdownBox');
    if (!box) return;
    var dated = EVENTS.filter(function (e) { return e.date; });
    var upcoming = dated.filter(function (e) { return daysTo(parseDate(e.date)) >= 0; });
    var main = upcoming.filter(function (e) { return e.main; })[0] || upcoming[0];

    var head;
    if (!main) {
      head = '<div class="cd-main"><div class="cd-label">本学年节点都已过</div><div class="cd-days">🎉</div><div class="cd-sub">祝你在科大的每一天都充实</div></div>';
    } else {
      var n = daysTo(parseDate(main.date));
      head = '<div class="cd-main">' +
        '<div class="cd-label">距 ' + esc(main.name) + '</div>' +
        '<div class="cd-days">' + (n === 0 ? '就是今天' : n + ' <span>天</span>') + '</div>' +
        '<div class="cd-sub">' + esc(fmtRange(main)) + (n === 0 ? ' · 加油！' : ' · 倒计时进行中') + '</div></div>';
    }
    var list = EVENTS.map(function (e) {
      var diff = e.date ? daysTo(parseDate(e.date)) : null;
      var tail = diff === null ? (e.note || '待定') : (diff > 0 ? '还有 ' + diff + ' 天' : (diff === 0 ? '就是今天' : '已过'));
      return '<li class="cd-item' + (diff !== null && diff < 0 ? ' past' : '') + '">' +
        '<span class="cd-e">' + e.emoji + ' ' + esc(e.name) + '</span>' +
        '<span class="cd-d">' + esc(fmtRange(e)) + '</span>' +
        '<span class="cd-t">' + tail + '</span></li>';
    }).join('');
    box.innerHTML = head + '<ul class="cd-list">' + list + '</ul>' +
      '<p class="cd-note">日期以录取通知书 / 学校官方通知为准。</p>';
  }

  /* ---------------- 新生大数据画像 ---------------- */
  function tally(items) {
    var m = {};
    items.forEach(function (v) { if (!v) return; m[v] = (m[v] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { k: k, v: m[k] }; }).sort(function (a, b) { return b.v - a.v; });
  }

  function bars(list, limit) {
    if (!list.length) return '<div class="ins-empty">暂无数据</div>';
    var top = list.slice(0, limit);
    var max = top[0].v || 1;
    return '<div class="bars">' + top.map(function (o) {
      var pct = Math.round(o.v / max * 100);
      return '<div class="bar-row"><span class="bar-k">' + esc(o.k) + '</span>' +
        '<span class="bar-track"><i style="width:' + pct + '%"></i></span>' +
        '<span class="bar-v">' + o.v + '</span></div>';
    }).join('') + '</div>';
  }

  function cloud(list, limit) {
    if (!list.length) return '<div class="ins-empty">暂无数据</div>';
    var top = list.slice(0, limit);
    var max = top[0].v || 1, min = top[top.length - 1].v || 1;
    return '<div class="cloud">' + top.map(function (o) {
      var size = min === max ? 20 : 14 + Math.round((o.v - min) / (max - min) * 16);
      return '<span class="cw" style="font-size:' + size + 'px">' + esc(o.k) + '</span>';
    }).join('') + '</div>';
  }

  var posts = [];

  function renderInsights() {
    var box = $('insightsBox');
    if (!box) return;
    if (!posts.length) {
      box.innerHTML = '<div class="ins-empty">还没有同学上墙 🧱<br>去「新生墙」填张身份卡，这里就会长出你们这一届的数据画像。</div>';
      return;
    }
    var colleges = tally(posts.map(function (p) { return p.college; }));
    var majors = tally(posts.map(function (p) { return p.major; }));
    var homes = tally(posts.map(function (p) { return p.hometown; }));
    var signs = tally(posts.map(function (p) { return p.sign; }));
    var mbtis = tally(posts.map(function (p) { return (p.tag || '').toUpperCase(); }));
    var inter = tally(posts.reduce(function (a, p) { return a.concat(p.interests || []); }, []));

    box.innerHTML =
      '<div class="ins-kpis">' +
      kpi(posts.length, '位同学已上墙') +
      kpi(colleges.length, '个学院') +
      kpi(homes.length, '个生源地') +
      kpi(inter.length ? inter[0].k : '—', '最热门兴趣') +
      '</div>' +
      panel('🏫 学院分布 Top' + Math.min(8, colleges.length), bars(colleges, 8)) +
      panel('🎓 专业分布 Top' + Math.min(8, majors.length), bars(majors, 8)) +
      panel('🏠 生源分布 Top' + Math.min(8, homes.length), bars(homes, 8)) +
      '<div class="ins-grid2">' +
      panel('✨ 星座分布', bars(signs, 6)) +
      panel('🧠 MBTI 分布', bars(mbtis, 6)) +
      '</div>' +
      panel('💡 兴趣图谱', cloud(inter, 16)) +
      matchPanel(colleges, homes);
    bindMatch(colleges, homes);
  }

  function kpi(num, label) {
    return '<div class="ins-kpi"><div class="kpi-n">' + esc(num) + '</div><div class="kpi-l">' + esc(label) + '</div></div>';
  }
  function panel(title, body) {
    return '<div class="ins-panel"><h4>' + title + '</h4>' + body + '</div>';
  }

  function matchPanel(colleges, homes) {
    return '<div class="ins-panel match">' +
      '<h4>🤝 找找你的同频同学</h4>' +
      '<div class="match-row">' +
      '<select id="mCollege"><option value="">选你的学院</option>' +
      colleges.map(function (o) { return '<option>' + esc(o.k) + '</option>'; }).join('') + '</select>' +
      '<select id="mHome"><option value="">选你的家乡</option>' +
      homes.map(function (o) { return '<option>' + esc(o.k) + '</option>'; }).join('') + '</select>' +
      '</div><div id="mResult" class="match-result">选一下，看看有多少人和你同学院 / 同乡 👀</div></div>';
  }

  function bindMatch(colleges, homes) {
    var c = $('mCollege'), h = $('mHome'), r = $('mResult');
    if (!c || !h || !r) return;
    function calc() {
      var cv = c.value, hv = h.value;
      if (!cv && !hv) { r.textContent = '选一下，看看有多少人和你同学院 / 同乡 👀'; return; }
      var sameC = cv ? posts.filter(function (p) { return p.college === cv; }).length : 0;
      var sameH = hv ? posts.filter(function (p) { return p.hometown === hv; }).length : 0;
      var both = (cv && hv) ? posts.filter(function (p) { return p.college === cv && p.hometown === hv; }).length : 0;
      var parts = [];
      if (cv) parts.push('同学院 <b>' + sameC + '</b> 人');
      if (hv) parts.push('同乡 <b>' + sameH + '</b> 人');
      if (cv && hv) parts.push('既是同学院又是同乡 <b>' + both + '</b> 人');
      r.innerHTML = parts.join(' · ') + (both > 0 ? ' 🎉 快去新生墙找 TA！' : '');
    }
    c.addEventListener('change', calc);
    h.addEventListener('change', calc);
  }

  function loadPosts() {
    var box = $('insightsBox');
    fetch(API_BASE + '/api/wall').then(function (r) { return r.json(); }).then(function (d) {
      posts = d.posts || [];
      renderInsights();
    }).catch(function () {
      if (box) box.innerHTML = '<div class="ins-empty">数据暂时取不到，稍后刷新看看～</div>';
    });
  }

  function boot() {
    initCountdown();
    loadPosts();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
