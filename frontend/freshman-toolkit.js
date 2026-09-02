/* 新生实用工具箱
   1) 军训生存清单：可勾选、进度条、localStorage 记忆
   2) 快递地址一键复制
*/
(function () {
  'use strict';

  /* ===== 军训生存清单 ===== */
  var list = document.getElementById('militaryList');
  if (list) {
    var KEY = 'haust_military';
    var boxes = list.querySelectorAll('input[type=checkbox]');
    var count = document.getElementById('militaryCount');
    var bar = document.getElementById('militaryBar');
    function load() {
      try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; }
    }
    var saved = load();
    function update() {
      var n = 0;
      boxes.forEach(function (b) { if (b.checked) n++; });
      if (count) count.textContent = '已备齐 ' + n + ' / ' + boxes.length;
      if (bar) bar.style.width = (boxes.length ? (n / boxes.length * 100) : 0) + '%';
      var arr = [];
      boxes.forEach(function (b) { if (b.checked) arr.push(b.getAttribute('data-i')); });
      try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (_) {}
    }
    boxes.forEach(function (b) {
      if (saved.indexOf(b.getAttribute('data-i')) >= 0) b.checked = true;
      b.addEventListener('change', update);
    });
    update();
  }

  /* ===== 复制地址 ===== */
  function copyText(text, cb) {
    function done() { cb && cb(); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(text, done); });
    } else {
      fallback(text, done);
    }
  }
  function fallback(text, cb) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.top = '-9999px';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta); cb();
    } catch (_) {}
  }
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var el = document.getElementById(btn.getAttribute('data-copy'));
      if (!el) return;
      var label = btn.textContent;
      copyText(el.textContent, function () {
        btn.textContent = '已复制';
        setTimeout(function () { btn.textContent = label; }, 1200);
      });
    });
  });
})();
