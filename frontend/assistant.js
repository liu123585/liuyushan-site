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
    '军训要准备什么？',
    '你能帮我做什么？',
    '帮我写个 Python 小脚本'
  ];

  var SEND_SVG = '<svg viewBox="0 0 24 24"><path d="M4 11.5 20 4l-7.5 16-2.2-6.3L4 11.5Z"/></svg>';
  var STOP_SVG = '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';

  /* AI 可以在回答里写 [[img:文件名|说明]] 来发图。
     这里做**白名单校验**——只认下面这些确实存在的图，
     防止模型编出别的路径（比如外部 URL 或 ../ 穿越）。 */
  var IMG_ALLOW = [
    'bdm.jpg', 'tsg.jpg', 'ztyc.jpg', 'by.jpg', 'flag_plaza.jpg', 'xiyuan_campus.jpg',
    'bearing_museum.jpg', 'xiyuan_bridge.jpg',
    'jiayuan_dorm_real.jpg', 'jingyuan_dorm_real.jpg', 'qianyuan_dorm_real.png',
    'jiayuan_canteen_real.jpg', 'jiayuan_canteen_interior.png', 'jiayuan_canteen_area.png'
  ];
  var IMG_RE = /\[\[img:\s*([A-Za-z0-9_.\-]+)\s*(?:\|\s*([^\]]*))?\]\]/g;
  /* AI 可以用 [[ask:问题1|问题2|问题3]] 给追问建议，前端渲染成可点的小按钮 */
  var ASK_RE = /\[\[ask:\s*([^\]]+)\]\]/g;
  /* 长期记忆：AI 用 [[note:xxx]] 记下用户说过的事，用 [[forget:xxx]] 忘掉。
     存在 localStorage，每次请求带给后端，注入到系统提示词里。 */
  var NOTE_RE = /\[\[note:\s*([^\]]+)\]\]/g;
  var FORGET_RE = /\[\[forget:\s*([^\]]+)\]\]/g;
  var MEM_KEY = 'haust_ai_memory_v1';
  var MEM_MAX = 20;
  /* 个人「全局规则」：用户用 /规则 xxx 设的说话偏好（称呼、长度、侧重）。
     和记忆分开放 —— 记忆是"关于我的事实"，规则是"你要怎么跟我说话"。 */
  var RULE_KEY = 'haust_ai_rules_v1';
  var RULE_MAX = 8;

  function loadMemory() {
    try {
      var raw = localStorage.getItem(MEM_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (x) { return typeof x === 'string' && x.trim(); }).slice(-MEM_MAX);
    } catch (e) { return []; }
  }
  function saveMemory(list) {
    try { localStorage.setItem(MEM_KEY, JSON.stringify(list.slice(-MEM_MAX))); } catch (e) {}
  }

  /* ---------------- 个人全局规则（/规则 设定） ---------------- */
  function loadRules() {
    try {
      var raw = localStorage.getItem(RULE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (x) { return typeof x === 'string' && x.trim(); }).slice(-RULE_MAX);
    } catch (e) { return []; }
  }
  function saveRules(list) {
    try { localStorage.setItem(RULE_KEY, JSON.stringify(list.slice(-RULE_MAX))); } catch (e) {}
    updateMemBadge();
  }
  function addRule(text) {
    var v = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!v) return false;
    var list = loadRules();
    if (list.indexOf(v) > -1) return false;
    list.push(v);
    saveRules(list);
    return true;
  }
  /* 从一条回答里抽 [[note:]] / [[forget:]]，更新本地记忆。
     返回本次新记住的内容（用于给用户一个轻提示）。 */
  function applyNotes(text) {
    var list = loadMemory();
    var added = [];
    String(text == null ? '' : text).replace(NOTE_RE, function (all, body) {
      var v = String(body).replace(/\s+/g, ' ').trim().slice(0, 120);
      if (v && list.indexOf(v) === -1) { list.push(v); added.push(v); }
      return '';
    });
    var forgetAll = false, keys = [];
    String(text == null ? '' : text).replace(FORGET_RE, function (all, body) {
      var v = String(body).trim();
      if (!v || /^(all|全部|所有|一切)$/i.test(v)) forgetAll = true;
      else keys.push(v);
      return '';
    });
    if (forgetAll) list = [];
    else if (keys.length) {
      list = list.filter(function (x) {
        return !keys.some(function (k) { return x.indexOf(k) > -1; });
      });
    }
    saveMemory(list);
    updateMemBadge();
    return added;
  }
  /* 头部「记忆 N」小标签：没有记忆也没有规则时隐藏；点一下打开面板 */
  function updateMemBadge() {
    if (!memBtn) return;
    var n = loadMemory().length;
    var r = loadRules().length;
    var parts = [];
    if (n) parts.push('记忆 ' + n);
    if (r) parts.push('规则 ' + r);
    memBtn.textContent = parts.join(' · ') || '记忆 0';
    memBtn.hidden = n === 0 && r === 0;
    memBtn.title = 'AI 记住的关于你的信息 / 你定的规则，点一下可以查看和管理';
  }

  var log, input, form, sendBtn, chips, clearBtn, fab, memBtn;

  /* ---------------- 记忆 / 规则管理面板 ---------------- */
  var memPanel = null;

  function closeMemPanel() {
    if (memPanel && memPanel.parentNode) memPanel.parentNode.removeChild(memPanel);
    memPanel = null;
  }

  function mpRow(text, onDel) {
    var row = document.createElement('div');
    row.className = 'ai-mp-row';
    var span = document.createElement('span');
    span.textContent = text;
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'ai-mp-del';
    del.textContent = '×';
    del.title = '删掉这条';
    del.addEventListener('click', function () {
      onDel();
      closeMemPanel();
      openMemPanel();          // 删完就地刷新
    });
    row.appendChild(span);
    row.appendChild(del);
    return row;
  }

  function openMemPanel() {
    if (memPanel) { closeMemPanel(); return; }
    var mem = loadMemory();
    var rules = loadRules();

    var box = document.createElement('div');
    box.className = 'ai-mem-panel';

    var head = document.createElement('div');
    head.className = 'ai-mp-head';
    var title = document.createElement('b');
    title.textContent = 'AI 记住的事';
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'ai-mp-x';
    x.textContent = '×';
    x.setAttribute('aria-label', '关闭');
    x.addEventListener('click', closeMemPanel);
    head.appendChild(title);
    head.appendChild(x);
    box.appendChild(head);

    var body = document.createElement('div');
    body.className = 'ai-mp-body';

    var sec1 = document.createElement('div');
    sec1.className = 'ai-mp-sec';
    sec1.textContent = '关于我（记忆）';
    body.appendChild(sec1);
    if (!mem.length) {
      var e1 = document.createElement('p');
      e1.className = 'ai-mp-empty';
      e1.textContent = '还没有。跟它说「/记住 我叫小明」就会记下来。';
      body.appendChild(e1);
    } else {
      mem.forEach(function (item, i) {
        body.appendChild(mpRow(item, function () {
          var list = loadMemory();
          list.splice(i, 1);
          saveMemory(list);
          updateMemBadge();
        }));
      });
    }

    var sec2 = document.createElement('div');
    sec2.className = 'ai-mp-sec';
    sec2.textContent = '你给我定的规则';
    body.appendChild(sec2);
    if (!rules.length) {
      var e2 = document.createElement('p');
      e2.className = 'ai-mp-empty';
      e2.textContent = '还没有。比如「/规则 回答简短点」「/规则 叫我老王」。';
      body.appendChild(e2);
    } else {
      rules.forEach(function (item, i) {
        body.appendChild(mpRow(item, function () {
          var list = loadRules();
          list.splice(i, 1);
          saveRules(list);
        }));
      });
    }

    box.appendChild(body);

    var foot = document.createElement('div');
    foot.className = 'ai-mp-foot';
    if (mem.length) {
      var c1 = document.createElement('button');
      c1.type = 'button';
      c1.className = 'ai-mp-btn';
      c1.textContent = '清空记忆';
      c1.addEventListener('click', function () {
        saveMemory([]); updateMemBadge(); closeMemPanel(); openMemPanel();
      });
      foot.appendChild(c1);
    }
    if (rules.length) {
      var c2 = document.createElement('button');
      c2.type = 'button';
      c2.className = 'ai-mp-btn';
      c2.textContent = '清空规则';
      c2.addEventListener('click', function () {
        saveRules([]); closeMemPanel(); openMemPanel();
      });
      foot.appendChild(c2);
    }
    if (foot.children.length) box.appendChild(foot);

    /* 挂在 AI 面板上，跟着面板滚动，不遮住输入框 */
    var host = document.querySelector('.ai-shell') || document.body;
    host.style.position = host.style.position || 'relative';
    host.appendChild(box);
    memPanel = box;
  }

  /* ---------------- 对话框指令 ----------------
     全部在本地处理，不花模型额度、也不会因为网络卡住没反应。 */
  var HELP_TEXT =
    '可以这样直接指挥我（都是在本地生效，不耗额度）：\n' +
    '· /记住 我叫小明，住嘉园 —— 让我长期记住关于你的事\n' +
    '· /记忆 —— 看看我记住了什么，能逐条删\n' +
    '· /忘掉 —— 清空全部记忆；/忘掉 名字 —— 只删相关的那条\n' +
    '· /规则 回答控制在 100 字内 —— 给我定一条长期规矩（称呼、长度、偏重都可以）\n' +
    '· /规则 —— 看已设的规矩\n' +
    '· /删规则 2 —— 删掉第 2 条规矩\n' +
    '· /清空 —— 清空当前对话\n' +
    '· /关于 —— 这个站是谁做的\n' +
    '另外：直接发图片我也会看图；粘贴或拖进来都行。';

  function say(text) {
    addMsg('assistant', text);
    scrollBottom();
  }

  /* 返回 true 表示这条被当成指令处理掉了，不再发给模型 */
  function handleCommand(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return false;

    var m = s.match(/^[\/／]\s*([^\s\/／]+)\s*([\s\S]*)$/);
    var cmd, arg;

    if (m) {
      cmd = m[1].toLowerCase();
      arg = m[2].trim();
    } else {
      // 允许中文自然写法：「记住：xxx」「忘掉：xxx」
      var m2 = s.match(/^(记住|记一下|忘掉|忘记)[:：]\s*([\s\S]+)$/);
      if (!m2) return false;
      cmd = m2[1].indexOf('记') === 0 ? '记住' : '忘掉';
      arg = m2[2].trim();
    }

    if (cmd === 'help' || cmd === '帮助' || cmd === '?' || cmd === '？') {
      say(HELP_TEXT);
      return true;
    }

    if (cmd === '记住' || cmd === 'remember' || cmd === 'note') {
      if (!arg) { say('要记什么呢？这样写：/记住 我叫小明，住嘉园'); return true; }
      var list = loadMemory();
      var v = arg.replace(/\s+/g, ' ').slice(0, 120);
      if (list.indexOf(v) > -1) { say('这条我已经记着了 👍'); return true; }
      list.push(v);
      saveMemory(list);
      updateMemBadge();
      say('记住了：' + v + '\n（现在一共记着 ' + loadMemory().length + ' 条，输入 /记忆 可以查看或删掉）');
      return true;
    }

    if (cmd === '记忆' || cmd === 'memory') {
      openMemPanel();
      return true;
    }

    if (cmd === '忘掉' || cmd === '忘记' || cmd === 'forget') {
      if (!arg) {
        var n = loadMemory().length;
        saveMemory([]);
        updateMemBadge();
        say(n ? '好的，关于你的记忆已经全部清空了。' : '本来就没记着什么 🙂');
        return true;
      }
      var before = loadMemory();
      var after = before.filter(function (x) { return x.indexOf(arg) === -1; });
      saveMemory(after);
      updateMemBadge();
      var removed = before.length - after.length;
      say(removed ? '删掉了 ' + removed + ' 条相关的记忆。' : '没找到包含「' + arg + '」的记忆。');
      return true;
    }

    if (cmd === '规则' || cmd === 'rules' || cmd === 'rule') {
      if (!arg) {
        var rs = loadRules();
        if (!rs.length) {
          say('还没定规矩。比如：\n· /规则 回答简短点，最多 100 字\n· /规则 叫我老王\n· /规则 多讲食堂和宿舍');
        } else {
          say('你定的规矩：\n' + rs.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') +
              '\n\n删掉某条用 /删规则 序号，全清空用 /清空规则。');
        }
        return true;
      }
      if (addRule(arg)) {
        say('好，记下这条规矩了：' + arg + '\n之后的回答我都会照这个来。');
      } else {
        say('这条规矩已经在列表里了 🙂');
      }
      return true;
    }

    if (cmd === '删规则' || cmd === 'delrule') {
      var idx = parseInt(arg, 10);
      var arr = loadRules();
      if (!arr.length) { say('现在没有设过规矩。'); return true; }
      if (!idx || idx < 1 || idx > arr.length) {
        say('序号不对，当前共 ' + arr.length + ' 条。用法：/删规则 2');
        return true;
      }
      var gone = arr[idx - 1];
      arr.splice(idx - 1, 1);
      saveRules(arr);
      say('删掉了：「' + gone + '」');
      return true;
    }

    if (cmd === '清空规则') {
      saveRules([]);
      say('规矩都清掉了，回到默认风格。');
      return true;
    }

    if (cmd === '清空' || cmd === 'clear') {
      if (busy) { say('等这条答完再清空吧～'); return true; }
      history = [];
      log.innerHTML = '';
      greet();
      setChips(true);
      clearPending();
      return true;
    }

    if (cmd === '关于' || cmd === 'about') {
      say('这个站是河南科技大学物联网 241 班刘昱善的个人项目，一个人独立做的。\n' +
          '具体制作方式：是用 WorkBuddy 做的 😄\n' +
          '站里的信息来自学校官方渠道整理，不代表学校，政策以官方通知为准。');
      return true;
    }

    say('没认出来这个指令：' + s + '\n输入 /help 看我能接哪些指令。');
    return true;
  }

  var imgInput, imgBtn, pendingWrap;
  var micBtn, recog = null, listening = false;
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

  /* 发之前先压一遍：原图直接转 base64 动辄好几 MB，
     一是请求体过大模型直接拒（返回 400），二是白白浪费流量。
     统一缩到最长边 1024、JPEG 质量 0.82，一般能压到 100-200KB。 */
  function compressImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          var scale = Math.min(1, maxDim / Math.max(w, h));
          var nw = Math.max(1, Math.round(w * scale));
          var nh = Math.max(1, Math.round(h * scale));
          var cv = document.createElement('canvas');
          cv.width = nw; cv.height = nh;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff';        // PNG 透明区补白，否则转 JPEG 会变黑
          ctx.fillRect(0, 0, nw, nh);
          ctx.drawImage(img, 0, 0, nw, nh);
          resolve(cv.toDataURL('image/jpeg', quality));
        } catch (e) {
          reject(e);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
      img.src = url;
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

  /* ---------------- 语音输入（录音转文字） ----------------
     用浏览器自带的 Web Speech API。Chrome / Edge 支持；
     不支持的浏览器直接把这个按钮藏起来 —— 不给用户一个点了没反应的按钮。 */
  function micTip(msg) {
    var t = document.getElementById('aiMicTip');
    if (!t) {
      t = document.createElement('div');
      t.id = 'aiMicTip';
      t.className = 'ai-mic-tip';
      if (pendingWrap && pendingWrap.parentNode) pendingWrap.parentNode.insertBefore(t, pendingWrap);
    }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.hidden = true; }, 4500);
  }

  function initSpeech() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!micBtn) return;
    if (!SR) { micBtn.hidden = true; return; }
    try { recog = new SR(); } catch (e) { micBtn.hidden = true; return; }

    recog.lang = 'zh-CN';
    recog.continuous = false;      // 说完一句自动停
    recog.interimResults = true;   // 边说边出字
    recog.maxAlternatives = 1;

    var base = '';                 // 开始录音时输入框里已有的内容

    recog.onstart = function () {
      listening = true;
      base = input ? input.value : '';
      micBtn.classList.add('listening');
      micBtn.setAttribute('title', '正在听…点一下停止');
    };
    recog.onresult = function (e) {
      var txt = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        txt += e.results[i][0].transcript;
      }
      if (input) {
        input.value = (base + txt).slice(0, 300);
        autoGrow();
      }
    };
    recog.onerror = function (e) {
      listening = false;
      micBtn.classList.remove('listening');
      micBtn.setAttribute('title', '语音输入');
      var err = e && e.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        micTip('麦克风权限被拒绝了 —— 在浏览器地址栏的权限设置里允许麦克风，再点一次试试。');
      } else if (err === 'network') {
        micTip('语音识别服务连不上（部分浏览器要能访问语音服务），先用键盘输入吧。');
      } else if (err === 'no-speech') {
        micTip('没听到声音，再说一次？');
      }
    };
    recog.onend = function () {
      listening = false;
      micBtn.classList.remove('listening');
      micBtn.setAttribute('title', '语音输入');
      if (input) input.focus();
    };

    micBtn.addEventListener('click', function () {
      if (listening) { try { recog.stop(); } catch (e) { /* ignore */ } return; }
      try { recog.start(); } catch (e) { /* 可能已经在录音 */ }
    });
  }

  function handleFiles(files) {
    var arr = Array.from(files).filter(function (f) { return /^image\//.test(f.type); });
    if (!arr.length) return;
    var room = 3 - pendingImages.length;     // 最多 3 张
    if (room <= 0) return;
    var todo = arr.slice(0, room);
    Promise.all(todo.map(function (f) { return compressImage(f, 1024, 0.82); })).then(function (urls) {
      pendingImages = pendingImages.concat(urls);
      updatePendingPreview();
    }).catch(function () {
      // 压缩失败就退回原图，至少还能发出去
      Promise.all(todo.map(fileToBase64)).then(function (urls) {
        pendingImages = pendingImages.concat(urls);
        updatePendingPreview();
      }).catch(function () {});
    });
  }

  /* 把回答渲染进气泡：正文照写，[[img:…]] 换成图片。
     流式过程中末尾如果是半个标记（"[[img:xxx" 还没闭合），先藏起来等后面的 chunk 补齐，
     否则用户会看到一闪而过的原始标记。 */
  function renderRich(node, raw) {
    /* 模型写完代码还爱补"怎么运行 / 需要装什么 / 这个脚本会……"，
       在这里一次性清掉（代码块本身不动），见 textclean.js */
    if (typeof window !== 'undefined' && window.stripCodeNoise) raw = window.stripCodeNoise(raw);
    var text = String(raw == null ? '' : raw);
    var open = text.lastIndexOf('[[');
    if (open > -1 && text.indexOf(']]', open) === -1) text = text.slice(0, open);

    var pics = [];
    var clean = text.replace(IMG_RE, function (all, file, cap) {
      if (IMG_ALLOW.indexOf(file) > -1) pics.push({ file: file, cap: (cap || '').trim() });
      return '';
    });
    // 追问建议：抽出来单独渲染成按钮，正文里不留标记
    var asks = [];
    clean = clean.replace(ASK_RE, function (all, body) {
      String(body).split('|').forEach(function (q) {
        q = q.trim();
        if (q && asks.length < 4) asks.push(q);
      });
      return '';
    });
    // 记忆标记只在后台处理，正文里一个字都不能露出来
    clean = clean.replace(NOTE_RE, '').replace(FORGET_RE, '');
    clean = clean.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').replace(/^\s+|\s+$/g, '');

    node.text.textContent = clean;

    if (node.asks) {
      node.asks.innerHTML = '';
      asks.forEach(function (q) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ai-ask-chip';
        b.textContent = q;
        b.addEventListener('click', function () { ask(q); });
        node.asks.appendChild(b);
      });
    }
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

    var imgs = null, asks = null, ops = null;
    if (role !== 'user') {
      imgs = document.createElement('div');
      imgs.className = 'ai-imgs';
      bubble.appendChild(imgs);

      asks = document.createElement('div');
      asks.className = 'ai-asks';
      bubble.appendChild(asks);

      // 操作条（复制）：平时藏起来，鼠标移到气泡上才出现，不干扰阅读
      ops = document.createElement('div');
      ops.className = 'ai-ops';
      var cp = document.createElement('button');
      cp.type = 'button';
      cp.className = 'ai-op';
      cp.textContent = '复制';
      cp.addEventListener('click', function () {
        var txt = span.textContent || '';
        if (!txt) return;
        var done = function () {
          cp.textContent = '已复制';
          setTimeout(function () { cp.textContent = '复制'; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(done).catch(function () {});
        } else {
          var ta = document.createElement('textarea');
          ta.value = txt;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
          document.body.removeChild(ta);
        }
      });
      ops.appendChild(cp);
      bubble.appendChild(ops);
    }

    wrap.appendChild(mini);
    wrap.appendChild(bubble);
    log.appendChild(wrap);
    scrollBottom();

    return { wrap: wrap, bubble: bubble, text: span, imgs: imgs, asks: asks, ops: ops };
  }

  function showDots(node) {
    node.text.innerHTML = '<span class="ai-dots"><i></i><i></i><i></i></span>';
  }

  /* 等待期间给一句话，别让用户对着三个跳动的点猜是不是卡死了 */
  function showWaitTip(node, txt) {
    var dots = node.text.querySelector('.ai-dots');
    if (!dots) return;
    var tip = node.text.querySelector('.ai-wait');
    if (!tip) {
      tip = document.createElement('span');
      tip.className = 'ai-wait';
      node.text.appendChild(tip);
    }
    tip.textContent = txt;
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
  function ask(q, opts) {
    if (busy) return;
    var text = String(q != null ? q : (input ? input.value : '')).trim();
    if (!text && !pendingImages.length) return;

    /* 纯文字且像指令 → 本地处理，不发网络请求（响应最快，也不烧额度） */
    if (!pendingImages.length && handleCommand(text)) {
      if (input) { input.value = ''; autoGrow(); }
      return;
    }

    setBusy(true);
    setChips(false);          // 开始对话了，快捷提问收起来

    var skipUser = !!(opts && opts.skipUser);   // 「重新回答」时不再插一条用户消息

    // 构造用户消息：纯文字 → string；有图 → OpenAI vision 数组
    var userContent = text;
    var userImgs = pendingImages.slice();
    if (userImgs.length) {
      var parts = [];
      if (text) parts.push({ type: 'text', text: text });
      userImgs.forEach(function (url) { parts.push({ type: 'image_url', image_url: { url: url } }); });
      userContent = parts;
    }

    if (!skipUser) {
      addMsg('user', text, userImgs);
      history.push({ role: 'user', content: userContent });
      clearPending();
      if (input) { input.value = ''; autoGrow(); }
    }

    var bot = addMsg('assistant', '');
    showDots(bot);

    var answer = '';
    controller = new AbortController();

    /* 模型偶尔要排队十几秒。分档给个说法，比一直"思考中"强。 */
    var wait1 = setTimeout(function () { showWaitTip(bot, '正在整理答案…'); }, 4500);
    var wait2 = setTimeout(function () { showWaitTip(bot, '模型有点忙，还在排队…'); }, 15000);
    var wait3 = setTimeout(function () { showWaitTip(bot, '还在写，再等一下下…'); }, 28000);
    function clearWait() { clearTimeout(wait1); clearTimeout(wait2); clearTimeout(wait3); }

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: history.slice(-10),
        memory: loadMemory(),
        rules: loadRules(),
        page: (window.WBPage && window.WBPage.current && window.WBPage.current()) || 'home'
      }),
      signal: controller.signal
    }).then(function (res) {
      var ct = (res.headers.get('content-type') || '');
      if (!res.ok || ct.indexOf('text/event-stream') === -1) {
        return res.text().then(function (txt) {
          var msg = '';
          try { var j = JSON.parse(txt); if (j && j.error) msg = j.error; } catch (e) {}
          /* 网关超时会给回一整页 HTML，不能把那串 <!DOCTYPE html> 甩给新生看 */
          if (!msg) {
            msg = (res.status === 502 || res.status === 504 || res.status === 524)
              ? '这次等太久了，回答没生成出来。再问一次通常就好；问题大的话可以拆成两步问我'
              : '请求失败（HTTP ' + res.status + '）';
          }
          throw new Error(msg);
        });
      }
      /* 注意：这里**不**清掉那三个点 —— 后端现在会立刻返回流、再慢慢连模型，
         清早了用户就只剩一片空白，反而更像卡死。等第一个字到了再清。 */

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
              if (!answer) clearWait();   // 第一个字到了，撤掉"排队中"的提示
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
      clearWait();
      if (!answer) {
        bot.text.textContent = '（这次没生成出内容，换个问法再试试？）';
      } else {
        history.push({ role: 'assistant', content: answer });
        // 回答里如果带了 [[note:…]]，存进本地记忆；给个轻提示让用户知道
        var added = applyNotes(answer);
        if (added.length) micTip('已记住：' + added.join('、'));
      }
    }).catch(function (err) {
      clearWait();
      if (err && err.name === 'AbortError') {
        // 中断时把已生成的部分也存进上下文（保持 user/assistant 交替，
        // 否则下次会连着两条 user）；但标明它是半截的，免得模型当成完整回答。
        if (answer) history.push({ role: 'assistant', content: answer + '\n（这条回答被用户中断了，并未说完）' });
        else bot.text.textContent = '（已停止）';
      } else {
        // 网络类错误转成中文 —— 别把 "Failed to fetch" 这种英文甩给新生
        var raw = String((err && err.message) || '');
        var em = /fetch|network|load failed|timeout|aborted/i.test(raw)
          ? '网络好像断了，检查一下网络再试一次'
          : (raw || '网络异常');
        // 后端给的提示句末常带句号，这里先去掉再补一个，免得出现"。。"
        em = em.replace(/[。.!！,，]+$/, '');
        fail(bot, '出错了：' + em + '。');
      }
    }).then(function () {
      controller = null;
      setBusy(false);
      scrollBottom();
      if (input) input.focus();
      if (answer) addRegen(bot, text);   // 生成成功才给「重新回答」
    });
  }

  /* 重新回答：删掉这条回答（保留问题），用同样的问题再问一次 */
  function addRegen(bot, q) {
    if (!bot.ops || !q) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ai-op';
    b.textContent = '重新回答';
    b.addEventListener('click', function () {
      if (busy) return;
      if (history.length && history[history.length - 1].role === 'assistant') history.pop();
      if (bot.wrap.parentNode) bot.wrap.parentNode.removeChild(bot.wrap);
      ask(q, { skipUser: true });
    });
    bot.ops.appendChild(b);
  }

  /* ---------------- 初始化 ---------------- */
  function greet() {
    var h = new Date().getHours();
    var hi = h < 6 ? '这么晚还没睡？' : h < 11 ? '早啊' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    addMsg('assistant',
      hi + '，我是科大 AI 学长 👋\n' +
      '报到流程、宿舍条件、快递地址、食堂口味、军训清单……关于河科大新生的事都可以问我；\n' +
      '写代码、算题、写文案这类活儿也能接。\n' +
      '直接发图片我能看图；想让我记住你的事、或者给我定规矩，输入 /help 看指令。'
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
    memBtn = document.getElementById('aiMem');
    fab = document.getElementById('aiFab');
    imgInput = document.getElementById('aiImgInput');
    imgBtn = document.getElementById('aiImgBtn');
    pendingWrap = document.getElementById('aiPendingImgs');
    micBtn = document.getElementById('aiMicBtn');
    if (!log || !form || !input || !sendBtn) return;

    setBusy(false);
    greet();
    buildChips();
    setChips(true);
    initSpeech();
    updateMemBadge();

    // 点「记忆 N · 规则 M」→ 打开面板，可逐条查看 / 删除
    if (memBtn) {
      memBtn.addEventListener('click', function () { openMemPanel(); });
    }

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

    // 点面板外面 / 按 Esc 关掉记忆面板
    document.addEventListener('click', function (e) {
      if (!memPanel) return;
      var t = e.target;
      if (memPanel.contains(t) || (memBtn && memBtn.contains(t))) return;
      closeMemPanel();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && memPanel) closeMemPanel();
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
