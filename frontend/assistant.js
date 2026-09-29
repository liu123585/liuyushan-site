/* =========================================================
   assistant.js —— AI 学长（对话前端）
   后端：POST /api/chat  →  SSE 流式返回 { t: "增量文本" }
   Key 只存在后端环境变量里，前端永远拿不到。
   ========================================================= */
(function () {
  'use strict';

  var API = (window.__API_BASE__ || '') + '/api/chat';

  var QUICK = [
    '报到当天要带什么材料？',
    '宿舍是几人间，条件怎么样？',
    '快递寄到学校地址怎么写？',
    '开元校区和西苑校区有什么区别？',
    '食堂哪个好吃？',
    '军训要准备什么？'
  ];

  var SEND_SVG = '<svg viewBox="0 0 24 24"><path d="M4 11.5 20 4l-7.5 16-2.2-6.3L4 11.5Z"/></svg>';
  var STOP_SVG = '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';

  /* AI 可以在回答里写 [[img:文件名|说明]] 来发图。
     这里做**白名单校验**——只认下面这些确实存在的图，
     防止模型编出别的路径（比如外部 URL 或 ../ 穿越）。 */
  var IMG_ALLOW = [
    'bdm.jpg', 'tsg.jpg', 'ztyc.jpg', 'by.jpg', 'xiyuan_campus.jpg',
    'jiayuan_dorm_real.jpg', 'jingyuan_dorm_real.jpg', 'qianyuan_dorm_real.png',
    'jiayuan_canteen_real.jpg', 'jiayuan_canteen_interior.png', 'jiayuan_canteen_area.png'
  ];
  var IMG_RE = /\[\[img:\s*([A-Za-z0-9_.\-]+)\s*(?:\|\s*([^\]]*))?\]\]/g;

  var log, input, form, sendBtn, chips, clearBtn, fab;
  var imgInput, imgBtn, pendingWrap;
  var pendingImages = [];   // 待发送的 base64 图片数组
  var history = [];
  var busy = false;
  var controller = null;

  /* ---------------- 小工具 ---------------- */
  function scrollBottom() {
    if (log) log.scrollTop = log.scrollHeight;
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.readAsDataURL(file);
    });
  }

  function updatePendingPreview() {
    if (!pendingWrap) return;
    pendingWrap.innerHTML = '';
    if (!pendingImages.length) { pendingWrap.hidden = true; return; }
    pendingWrap.hidden = false;
    pendingImages.forEach(function (url, idx) {
      var box = document.createElement('div');
      box.className = 'ai-pending-thumb';
      var img = document.createElement('img');
      img.src = url;
      img.alt = '待发送图片';
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'ai-pending-del';
      del.innerHTML = '×';
      del.title = '移除';
      del.addEventListener('click', function () {
        pendingImages.splice(idx, 1);
        updatePendingPreview();
      });
      box.appendChild(img);
      box.appendChild(del);
      pendingWrap.appendChild(box);
    });
  }

  function clearPending() {
    pendingImages = [];
    updatePendingPreview();
  }

  function handleFiles(files) {
    var arr = Array.from(files).filter(function (f) { return /^image\//.test(f.type); });
    if (!arr.length) return;
    var todo = arr.slice(0, 3 - pendingImages.length); // 最多 3 张
    if (!todo.length) return;
    Promise.all(todo.map(function (f) { return fileToBase64(f); })).then(function (urls) {
      pendingImages = pendingImages.concat(urls);
      updatePendingPreview();
    });
  }

  /* 把回答渲染进气泡：正文照写，[[img:…]] 换成图片。
     流式过程中末尾如果是半个标记（"[[img:xxx" 还没闭合），先藏起来等后面的 chunk 补齐，
     否则用户会看到一闪而过的原始标记。 */
  function renderRich(node, raw) {
    var text = String(raw == null ? '' : raw);
    var open = text.lastIndexOf('[[');
    if (open > -1 && text.indexOf(']]', open) === -1) text = text.slice(0, open);

    var pics = [];
    var clean = text.replace(IMG_RE, function (all, file, cap) {
      if (IMG_ALLOW.indexOf(file) > -1) pics.push({ file: file, cap: (cap || '').trim() });
      return '';
    });
    clean = clean.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').replace(/^\s+|\s+$/g, '');

    node.text.textContent = clean;
    if (!node.imgs) return;
    node.imgs.innerHTML = '';
    pics.slice(0, 3).forEach(function (it) {
      var fig = document.createElement('figure');
      fig.className = 'ai-img';
      var im = document.createElement('img');
      im.loading = 'lazy';
      im.decoding = 'async';
      im.alt = it.cap || '校园实拍';
      im.src = 'img/' + it.file;
      // 图挂了就别留个破图框
      im.addEventListener('error', function () { if (fig.parentNode) fig.parentNode.removeChild(fig); });
      fig.appendChild(im);
      if (it.cap) {
        var fc = document.createElement('figcaption');
        fc.textContent = it.cap;
        fig.appendChild(fc);
      }
      node.imgs.appendChild(fig);
    });
  }

  function addMsg(role, text, userImgs) {
    var wrap = document.createElement('div');
    wrap.className = 'ai-msg ' + (role === 'user' ? 'me' : 'bot');

    var mini = document.createElement('div');
    mini.className = 'ai-mini';
    mini.textContent = role === 'user' ? '我' : 'AI';

    var bubble = document.createElement('div');
    bubble.className = 'ai-bubble';
    var span = document.createElement('span');
    span.className = 'ai-text';
    span.textContent = text || '';
    bubble.appendChild(span);

    // 用户发的图片也显示在气泡里
    if (role === 'user' && userImgs && userImgs.length) {
      var uImgs = document.createElement('div');
      uImgs.className = 'ai-user-imgs';
      userImgs.forEach(function (src) {
        var img = document.createElement('img');
        img.src = src;
        img.alt = '图片';
        uImgs.appendChild(img);
      });
      bubble.appendChild(uImgs);
    }

    var imgs = null;
    if (role !== 'user') {
      imgs = document.createElement('div');
      imgs.className = 'ai-imgs';
      bubble.appendChild(imgs);
    }

    wrap.appendChild(mini);
    wrap.appendChild(bubble);
    log.appendChild(wrap);
    scrollBottom();

    return { wrap: wrap, bubble: bubble, text: span, imgs: imgs };
  }

  function showDots(node) {
    node.text.innerHTML = '<span class="ai-dots"><i></i><i></i><i></i></span>';
  }

  function setBusy(on) {
    busy = on;
    if (!sendBtn) return;
    sendBtn.classList.toggle('stop', on);
    sendBtn.innerHTML = on ? STOP_SVG : SEND_SVG;
    sendBtn.setAttribute('aria-label', on ? '停止生成' : '发送');
  }

  function autoGrow() {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 132) + 'px';
  }

  function fail(node, msg) {
    node.text.textContent = '';
    var e = document.createElement('div');
    e.className = 'ai-err';
    e.textContent = msg;
    node.bubble.appendChild(e);
    scrollBottom();
  }

  /* ---------------- 发问 ---------------- */
  function ask(q) {
    if (busy) return;
    var text = String(q != null ? q : (input ? input.value : '')).trim();
    if (!text && !pendingImages.length) return;
    setBusy(true);
    setChips(false);          // 开始对话了，快捷提问收起来

    // 构造用户消息：纯文字 → string；有图 → OpenAI vision 数组
    var userContent = text;
    var userImgs = pendingImages.slice();
    if (userImgs.length) {
      var parts = [];
      if (text) parts.push({ type: 'text', text: text });
      userImgs.forEach(function (url) { parts.push({ type: 'image_url', image_url: { url: url } }); });
      userContent = parts;
    }

    addMsg('user', text, userImgs);
    history.push({ role: 'user', content: userContent });
    clearPending();
    if (input) { input.value = ''; autoGrow(); }

    var bot = addMsg('assistant', '');
    showDots(bot);

    var answer = '';
    controller = new AbortController();

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: history.slice(-10),
        page: (window.WBPage && window.WBPage.current && window.WBPage.current()) || 'home'
      }),
      signal: controller.signal
    }).then(function (res) {
      var ct = (res.headers.get('content-type') || '');
      if (!res.ok || ct.indexOf('text/event-stream') === -1) {
        return res.text().then(function (txt) {
          var msg = '请求失败（HTTP ' + res.status + '）';
          try { var j = JSON.parse(txt); if (j && j.error) msg = j.error; } catch (e) {}
          throw new Error(msg);
        });
      }
      bot.text.textContent = '';

      var reader = res.body.getReader();
      var dec = new TextDecoder();
      var buf = '';

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return;
          buf += dec.decode(r.value, { stream: true });
          var lines = buf.split('\n');
          buf = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line.indexOf('data:') !== 0) continue;
            var payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            var o = null;
            try { o = JSON.parse(payload); } catch (e) { continue; }
            if (o && o.error) throw new Error(o.error);
            if (o && o.t) {
              answer += o.t;
              renderRich(bot, answer);
              scrollBottom();
            }
          }
          return pump();
        });
      }
      return pump();
    }).then(function () {
      if (!answer) {
        bot.text.textContent = '（这次没生成出内容，换个问法再试试？）';
      } else {
        history.push({ role: 'assistant', content: answer });
      }
    }).catch(function (err) {
      if (err && err.name === 'AbortError') {
        if (answer) history.push({ role: 'assistant', content: answer });
        else bot.text.textContent = '（已停止）';
      } else {
        fail(bot, '出错了：' + ((err && err.message) || '网络异常') + '。');
      }
    }).then(function () {
      controller = null;
      setBusy(false);
      scrollBottom();
      if (input) input.focus();
    });
  }

  /* ---------------- 初始化 ---------------- */
  function greet() {
    var h = new Date().getHours();
    var hi = h < 6 ? '这么晚还没睡？' : h < 11 ? '早啊' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    addMsg('assistant',
      hi + '，我是科大 AI 学长 👋\n' +
      '报到流程、宿舍条件、快递地址、食堂口味、军训清单……关于河科大新生的事都可以问我。\n' +
      '我会基于本站内容回答；拿不准的会直接告诉你「不确定」，不瞎编。'
    );
  }

  function buildChips() {
    if (!chips) return;
    chips.innerHTML = '';
    QUICK.forEach(function (q) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ai-chip';
      b.textContent = q;
      b.addEventListener('click', function () { ask(q); });
      chips.appendChild(b);
    });
  }

  /* 快捷提问只在「空对话」时露脸：一旦用户问过一句就收起来，别一直杵在那儿。
     点「清空」重新开始对话时再放出来。（跟豆包的做法一致） */
  function setChips(show) {
    if (!chips) return;
    chips.hidden = !show;
  }

  function init() {
    log = document.getElementById('aiLog');
    input = document.getElementById('aiInput');
    form = document.getElementById('aiForm');
    sendBtn = document.getElementById('aiSend');
    chips = document.getElementById('aiChips');
    clearBtn = document.getElementById('aiClear');
    fab = document.getElementById('aiFab');
    imgInput = document.getElementById('aiImgInput');
    imgBtn = document.getElementById('aiImgBtn');
    pendingWrap = document.getElementById('aiPendingImgs');
    if (!log || !form || !input || !sendBtn) return;

    setBusy(false);
    greet();
    buildChips();
    setChips(true);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) { if (controller) controller.abort(); return; }
      ask();   // ask() 自己会读 input.value 和 pendingImages
    });

    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (form.requestSubmit) form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (busy) return;
        history = [];
        log.innerHTML = '';
        greet();
        setChips(true);          // 回到空对话，快捷提问重新出现
        clearPending();
        if (input) input.focus();
      });
    }

    // 图片上传按钮
    if (imgBtn && imgInput) {
      imgBtn.addEventListener('click', function () { imgInput.click(); });
      imgInput.addEventListener('change', function () { handleFiles(imgInput.files); imgInput.value = ''; });
    }

    // 粘贴图片（Ctrl+V / Cmd+V）
    if (input) {
      input.addEventListener('paste', function (e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        var files = [];
        for (var i = 0; i < items.length; i++) {
          if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
            files.push(items[i].getAsFile());
          }
        }
        if (files.length) { e.preventDefault(); handleFiles(files); }
      });
    }

    // 拖拽图片到对话区
    if (log) {
      log.addEventListener('dragover', function (e) { e.preventDefault(); log.classList.add('ai-dragover'); });
      log.addEventListener('dragleave', function (e) { log.classList.remove('ai-dragover'); });
      log.addEventListener('drop', function (e) {
        e.preventDefault();
        log.classList.remove('ai-dragover');
        handleFiles(e.dataTransfer.files);
      });
    }

    // 点 AI 发来的图 → 全屏放大看（点任意处关掉）
    log.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || t.tagName !== 'IMG' || !t.closest || !t.closest('.ai-img')) return;
      var box = document.createElement('div');
      box.className = 'ai-lightbox';
      var big = document.createElement('img');
      big.src = t.src;
      big.alt = t.alt || '';
      box.appendChild(big);
      box.addEventListener('click', function () { if (box.parentNode) box.parentNode.removeChild(box); });
      document.body.appendChild(box);
    });

    // 悬浮球：在 AI 页时收起来
    document.addEventListener('wb:pageshow', function (e) {
      if (fab) fab.hidden = (e.detail && e.detail.page === 'assistant');
    });
    if (fab) fab.hidden = !!(window.WBPage && window.WBPage.current && window.WBPage.current() === 'assistant');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
