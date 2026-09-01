/* 开学倒计时模块
   显示距「新生报到注册 / 军训开始 / 国庆节 / 元旦」等关键节点还有几天。
   日期如需调整，直接改下面 EVENTS 即可。
*/
(function () {
  'use strict';

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

  function boot() { initCountdown(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
