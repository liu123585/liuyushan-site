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

  /* ===== 行前行李分类清单 =====
     多个 ul.lug-list 合并为一个清单（data-key 相同），进度统一显示在 #lugCount / #lugBar */
  var lugLists = document.querySelectorAll('ul.lug-list');
  if (lugLists.length) {
    var KEY2 = 'haust_luggage';
    var boxes2 = [];
    lugLists.forEach(function (l) {
      boxes2 = boxes2.concat(Array.prototype.slice.call(l.querySelectorAll('input[type=checkbox]')));
    });
    if (!boxes2.length) return;
    var count2 = document.getElementById('lugCount');
    var bar2 = document.getElementById('lugBar');
    function load2() {
      try { return JSON.parse(localStorage.getItem(KEY2) || '[]'); } catch (_) { return []; }
    }
    var saved2 = load2();
    function update2() {
      var n = 0;
      boxes2.forEach(function (b) { if (b.checked) n++; });
      if (count2) count2.textContent = '已备齐 ' + n + ' / ' + boxes2.length;
      if (bar2) bar2.style.width = (boxes2.length ? (n / boxes2.length * 100) : 0) + '%';
      var arr = [];
      boxes2.forEach(function (b) { if (b.checked) arr.push(b.getAttribute('data-i')); });
      try { localStorage.setItem(KEY2, JSON.stringify(arr)); } catch (_) {}
    }
    boxes2.forEach(function (b) {
      if (saved2.indexOf(b.getAttribute('data-i')) >= 0) b.checked = true;
      b.addEventListener('change', update2);
    });
    update2();
  }
})();
