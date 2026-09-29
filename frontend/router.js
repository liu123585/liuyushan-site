/* =========================================================
   router.js —— 顶部导航切页（单页多视图）
   把原来「一长条往下滚」的页面拆成 9 个「页」，点导航即切换、其余隐藏。
   URL 走 hash（#/campus），可分享、可前进后退；每个页各自记忆滚动位置。

   对外接口：
     window.WBPage.go('campus')     切到某页
     window.WBPage.current()        当前页名
     事件 'wb:pageshow' { page, prev }  切页后广播，供地图 / canvas 等模块重排
   ========================================================= */
(function () {
  'use strict';

  var PAGES = ['home', 'campus', 'life', 'prepare', 'club', 'toolkit', 'freshman', 'fun', 'assistant'];
  var DEFAULT_PAGE = 'home';

  /* 旧锚点（#campus / #hero …）→ 新页面，老链接和站内旧链接照样能跳 */
  var ANCHOR_MAP = {
    hero: 'home', statsband: 'home', countdown: 'home', hub: 'home',
    campus: 'campus', campusmap: 'campus', dorms: 'campus',
    life: 'life', prepare: 'prepare', club: 'club',
    toolkit: 'toolkit', freshman: 'freshman', fun: 'fun', assistant: 'assistant'
  };

  var current = null;
  var scrollMemo = {};   // 每个页各自的滚动位置，切回来还在原处

  function $(id) { return document.getElementById(id); }

  function normalize(raw) {
    var h = String(raw == null ? '' : raw).replace(/^#\/?/, '').trim().toLowerCase();
    if (!h) return DEFAULT_PAGE;
    if (PAGES.indexOf(h) > -1) return h;
    if (ANCHOR_MAP[h]) return ANCHOR_MAP[h];
    return DEFAULT_PAGE;
  }

  function setActiveLinks(page) {
    var links = document.querySelectorAll('[data-page-link]');
    Array.prototype.forEach.call(links, function (el) {
      if (el.getAttribute('data-page-link') === page) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
  }

  function show(page, opts) {
    opts = opts || {};
    if (page === current && !opts.force) return;
    var prev = current;

    if (prev) scrollMemo[prev] = window.scrollY || window.pageYOffset || 0;

    var nodes = document.querySelectorAll('[data-page]');
    Array.prototype.forEach.call(nodes, function (el) {
      var on = el.getAttribute('data-page') === page;
      el.classList.toggle('pg-off', !on);
      el.classList.remove('pg-first');
    });

    // 当前页第一个区块让开顶部固定导航
    var first = document.querySelector('[data-page="' + page + '"]');
    if (first && !first.classList.contains('hero')) first.classList.add('pg-first');

    current = page;
    document.body.setAttribute('data-current-page', page);
    setActiveLinks(page);

    window.scrollTo(0, scrollMemo[page] || 0);

    // 新页里的 reveal 元素重新进入观察队列，否则会一直隐形
    if (typeof window.__revealRefresh === 'function') window.__revealRefresh();

    // 广播：地图 resize、hero canvas 重排等
    try {
      document.dispatchEvent(new CustomEvent('wb:pageshow', { detail: { page: page, prev: prev } }));
    } catch (e) {
      var ev = document.createEvent('CustomEvent');
      ev.initCustomEvent('wb:pageshow', false, false, { page: page, prev: prev });
      document.dispatchEvent(ev);
    }
  }

  function go(page) {
    if (PAGES.indexOf(page) === -1) page = DEFAULT_PAGE;
    var want = '#/' + page;
    if (location.hash === want) { show(page); return; }
    location.hash = want;          // 触发 hashchange → show()
  }

  /* ---------------- 抽屉导航（窄屏） ---------------- */
  var drawer = null;
  function openDrawer() {
    if (!drawer) return;
    drawer.hidden = false;
    document.documentElement.style.overflow = 'hidden';
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.hidden = true;
    document.documentElement.style.overflow = '';
  }

  /* ---------------- 事件 ---------------- */
  function bindEvents() {
    window.addEventListener('hashchange', function () { show(normalize(location.hash)); });

    // 统一接管所有 [data-page-link] 点击（导航、宫格、抽屉、底部 Tab 都走这里）
    document.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-page-link]') : null;
      if (!el) return;
      var page = el.getAttribute('data-page-link');
      if (PAGES.indexOf(page) === -1) return;
      e.preventDefault();
      if (drawer && !drawer.hidden) closeDrawer();
      go(page);
    });

    // 兜底：站内还留着旧锚点（href="#campus"）的链接，一样能跳到对应页
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (href.indexOf('#/') === 0) return;
      var mapped = ANCHOR_MAP[href.slice(1).toLowerCase()];
      if (mapped) { e.preventDefault(); go(mapped); }
    });

    var toggle = $('menuToggle');
    if (toggle) toggle.addEventListener('click', openDrawer);

    if (drawer) {
      Array.prototype.forEach.call(drawer.querySelectorAll('[data-drawer-close]'), function (el) {
        el.addEventListener('click', closeDrawer);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer && !drawer.hidden) closeDrawer();
    });
  }

  function init() {
    drawer = $('navDrawer');
    bindEvents();
    show(normalize(location.hash), { force: true });
  }

  window.WBPage = {
    go: go,
    show: show,
    current: function () { return current; },
    pages: PAGES.slice()
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
