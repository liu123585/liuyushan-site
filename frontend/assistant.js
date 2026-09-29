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

  var log, input, form, sendBtn, chips, clearBtn, fab;
  var history = [];
  var busy = false;
  var controller = null;

  /* ---------------- 小工具 ---------------- */
  function scrollBottom() {
    if (log) log.scrollTop = log.scrollHeight;
  }

  function addMsg(role, text) {
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

    wrap.appendChild(mini);
    wrap.appendChild(bubble);
    log.appendChild(wrap);
    scrollBottom();

    return { wrap: wrap, bubble: bubble, text: span };
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
    if (busy || !q) return;
    setBusy(true);
    setChips(false);          // 开始对话了，快捷提问收起来

    addMsg('user', q);
    history.push({ role: 'user', content: q });

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
              bot.text.textContent = answer;
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
    if (!log || !form || !input || !sendBtn) return;

    setBusy(false);
    greet();
    buildChips();
    setChips(true);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) { if (controller) controller.abort(); return; }
      var q = input.value.trim();
      if (!q) return;
      input.value = '';
      autoGrow();
      ask(q);
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
        if (input) input.focus();
      });
    }

    // 悬浮球：在 AI 页时收起来
    document.addEventListener('wb:pageshow', function (e) {
      if (fab) fab.hidden = (e.detail && e.detail.page === 'assistant');
    });
    if (fab) fab.hidden = !!(window.WBPage && window.WBPage.current && window.WBPage.current() === 'assistant');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
