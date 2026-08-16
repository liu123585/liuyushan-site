const fs = require('fs');
const path = require('path');

const SRC = 'D:/桌面/河南科技大学导航网站.html';
const OUT = 'D:/桌面/liuyushan_site/frontend';
const html = fs.readFileSync(SRC, 'utf8');

// ===================== CSS =====================
const styleRe = /<style>([\s\S]*?)<\/style>/g;
let m, css = '';
while ((m = styleRe.exec(html))) css += m[1] + '\n';
// 去掉小测验样式
css = css.replace(/\/\* 小测验 \*\/[\s\S]*?(?=\/\* ===== 弹幕)/, '');

const WALL_CSS = `
/* ===== 新生墙 ===== */
.wall-grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));margin-top:24px}
.wall-card{position:relative;padding:20px;background:var(--glass);border:1px solid var(--glass-border);border-radius:16px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:transform .3s,border-color .3s}
.wall-card:hover{transform:translateY(-4px);border-color:var(--gold)}
.wall-card .wc-top{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.wall-card .wc-ava{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;background:linear-gradient(135deg,var(--primary),var(--gold));flex-shrink:0}
.wall-card .wc-name{font-weight:700;font-size:16px;color:var(--white)}
.wall-card .wc-meta{font-size:12px;color:rgba(245,240,235,.6)}
.wall-card .wc-tag{display:inline-block;margin:8px 6px 0 0;padding:2px 10px;border-radius:20px;font-size:11px;background:rgba(212,175,55,.15);color:var(--gold2)}
.wall-card .wc-sign{margin-top:10px;font-size:14px;color:rgba(245,240,235,.85);line-height:1.6;border-left:3px solid var(--gold);padding-left:10px}
.wall-form{background:var(--glass);border:1px solid var(--glass-border);border-radius:18px;padding:24px;margin-top:20px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.wall-form .wf-row{display:flex;gap:14px;flex-wrap:wrap}
.wall-form .wf-field{flex:1;min-width:160px;margin-bottom:14px}
.wall-form label{display:block;font-size:13px;color:rgba(245,240,235,.7);margin-bottom:6px;letter-spacing:.5px}
.wall-form input,.wall-form textarea{width:100%;background:rgba(255,255,255,.06);border:1px solid var(--glass-border);color:var(--white);border-radius:10px;padding:10px 12px;font-size:14px;outline:none;font-family:inherit}
.wall-form input:focus,.wall-form textarea:focus{border-color:var(--gold)}
.wall-form textarea{resize:vertical;min-height:60px}
.wf-submit{margin-top:6px;padding:12px 28px;border:none;border-radius:12px;cursor:pointer;font-size:15px;letter-spacing:2px;background:linear-gradient(135deg,var(--primary),var(--gold));color:#fff;font-weight:700;box-shadow:0 6px 20px rgba(212,175,55,.3)}
.wf-submit:active{transform:scale(.98)}
.wf-msg{margin-top:10px;font-size:13px;color:var(--gold2);min-height:18px}
.wf-preview{margin-top:18px;display:flex;justify-content:center}
.wf-preview .wall-card{width:100%;max-width:340px;border-style:dashed}
@media(max-width:768px){
  .wall-form .wf-row{flex-direction:column;gap:0}
  .wall-form .wf-field{min-width:0}
}
`;
css += WALL_CSS;
fs.writeFileSync(path.join(OUT, 'style.css'), css);

// ===================== JS =====================
const scriptRe = /<script>([\s\S]*?)<\/script>/g;
let js = '';
while ((m = scriptRe.exec(html))) js += m[1] + '\n';
// 去掉小测验 JS
js = js.replace(/\/\/ ===== 新生小测验 =====[\s\S]*?(?=\/\/ ===== 每日运势抽卡 =====)/, '');
// 底部 Tab 高亮支持新生墙/互动
js = js.replace(
  "var sectEls = [document.getElementById('campus'), document.getElementById('life'), document.getElementById('prepare'), document.getElementById('club')];",
  "var sectEls = [document.getElementById('campus'), document.getElementById('life'), document.getElementById('prepare'), document.getElementById('club'), document.getElementById('freshman'), document.getElementById('fun')];"
);

// 弹幕改为后端共享
const newDanmaku = `// ===== B站式弹幕（后端共享） =====
(function(){
  var layer=document.getElementById('danmakuLayer'),btn=document.getElementById('dmToggle'),
      bar=document.getElementById('dmBar'),input=document.getElementById('dmInput'),send=document.getElementById('dmSend');
  if(!layer)return;
  var PRESET=["欢迎来到河科大🎉","开元校区的图书馆真的很大","西苑的梧桐大道秋天超美","报到别忘带录取通知书原件","洛阳水席 yyds","军训记得带防晒霜","鼎宝冲冲冲","祝你大学四年开心","图书馆占座要趁早","上海市场好吃的很多","轴承陈列馆值得打卡","明德博学 日新笃行"];
  var COLORS=['#ffffff','#FFD166','#4FC3F7','#FF8A80','#AED581','#CE93D8','#80DEEA'];
  var pool=PRESET.slice(),timer=null,on=false,serverMax=0;
  function spawn(text){
    var s=document.createElement('span');s.className='dm';s.textContent=text;
    s.style.top=(8+Math.random()*70)+'%';
    s.style.color=COLORS[Math.floor(Math.random()*COLORS.length)];
    var dur=8+Math.random()*8;s.style.animationDuration=dur+'s';
    layer.appendChild(s);
    setTimeout(function(){if(s.parentNode)s.parentNode.removeChild(s);},dur*1000+200);
  }
  function loop(){spawn(pool[Math.floor(Math.random()*pool.length)]);}
  function start(){on=true;layer.classList.add('on');btn.textContent='📡 弹幕开';bar.classList.add('show');loop();timer=setInterval(loop,1600);}
  function stop(){on=false;layer.classList.remove('on');btn.textContent='📡 弹幕';bar.classList.remove('show');if(timer)clearInterval(timer);}
  btn.addEventListener('click',function(){on?stop():start();});
  function emitLocal(v){if(!on)start();spawn(v);}
  function emit(){var v=input.value.trim();if(!v)return;emitLocal(v);input.value='';
    fetch('/api/danmaku',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:v})}).catch(function(){});}
  send.addEventListener('click',emit);
  input.addEventListener('keydown',function(e){if(e.key==='Enter')emit();});
  // 拉取已有弹幕 + 轮询新弹幕（跨访客共享）
  function pull(){
    fetch('/api/danmaku').then(function(r){return r.json();}).then(function(d){
      (d.items||[]).forEach(function(it){ if(it.id>serverMax){serverMax=it.id;pool.push(it.text);} });
    }).catch(function(){});
  }
  pull(); setInterval(pull,6000);
})();
`;
js = js.replace(/\/\/ ===== B站式弹幕 =====[\s\S]*$/, newDanmaku);

// 新生墙 JS
const WALL_JS = `
// ===== 新生墙（后端） =====
(function(){
  var form=document.getElementById('wallForm'),feed=document.getElementById('wallFeed'),msg=document.getElementById('wallMsg');
  if(!form)return;
  var AV=['🐯','🐱','🦊','🐼','🐨','🦁','🐸','🐧','🦄','🐝','🌟','🍀'];
  function val(id){var el=document.getElementById(id);return el?(el.value||'').trim():'';}
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function updatePreview(){
    var pv=document.getElementById('pvCard');if(!pv)return;
    document.getElementById('pvName').textContent=val('wfName')||'你的昵称';
    document.getElementById('pvMeta').textContent=[val('wfCollege'),val('wfMajor')].filter(Boolean).join(' · ')||'学院 · 专业';
    document.getElementById('pvTag').textContent=val('wfTag')||'星座/MBTI';
    document.getElementById('pvSign').textContent=val('wfSign')||'一句话新生宣言…';
  }
  ['wfName','wfCollege','wfMajor','wfTag','wfSign'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.addEventListener('input',updatePreview);
  });
  function timeAgo(ts){var s=Math.floor((Date.now()-ts)/1000);if(s<60)return'刚刚';if(s<3600)return Math.floor(s/60)+'分钟前';if(s<86400)return Math.floor(s/3600)+'小时前';return Math.floor(s/86400)+'天前';}
  function render(post){
    var card=document.createElement('div');card.className='wall-card';
    var ava=AV[post.id%AV.length];
    var tags='';if(post.tag)tags+='<span class="wc-tag">'+esc(post.tag)+'</span>';
    (post.interests||[]).forEach(function(t){tags+='<span class="wc-tag">'+esc(t)+'</span>';});
    card.innerHTML='<div class="wc-top"><div class="wc-ava">'+ava+'</div><div><div class="wc-name">'+esc(post.nickname)+'</div><div class="wc-meta">'+esc([post.college,post.major].filter(Boolean).join(' · '))+'</div></div></div>'+
      (tags?'<div>'+tags+'</div>':'')+
      (post.hometown?'<div class="wc-meta" style="margin-top:6px">📍 '+esc(post.hometown)+'</div>':'')+
      (post.sign?'<div class="wc-sign">“'+esc(post.sign)+'”</div>':'')+
      '<div class="wc-meta" style="margin-top:8px;opacity:.5">'+timeAgo(post.ts||Date.now())+'</div>';
    feed.insertBefore(card,feed.firstChild);
  }
  function load(){
    fetch('/api/wall').then(function(r){return r.json();}).then(function(d){
      feed.innerHTML='';(d.posts||[]).forEach(render);
    }).catch(function(){});
  }
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var post={nickname:val('wfName'),college:val('wfCollege'),major:val('wfMajor'),hometown:val('wfHometown'),tag:val('wfTag'),
      interests:val('wfInterests').split(/[,，\\s]+/).map(function(s){return s.trim();}).filter(Boolean),sign:val('wfSign')};
    if(!post.nickname){msg.textContent='先填个昵称吧～';return;}
    msg.textContent='发布中…';
    fetch('/api/wall',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(post)}).then(function(r){return r.json();}).then(function(d){
      if(d.post){render(d.post);form.reset();updatePreview();msg.textContent='已上墙 🎉 看看你的新生身份卡！';}
      else msg.textContent='发布失败，稍后再试';
    }).catch(function(){msg.textContent='网络错误，稍后再试';});
  });
  load();
})();
`;
js += WALL_JS;
fs.writeFileSync(path.join(OUT, 'app.js'), js);

// ===================== HTML =====================
let out = html;
out = out.replace(/<style>[\s\S]*?<\/style>/g, '');
out = out.replace(/<script>[\s\S]*?<\/script>/g, '');
out = out.replace('</head>', '<link rel="stylesheet" href="style.css">\n</head>');
out = out.replace('</body>', '<script src="app.js"></script>\n</body>');
// 资源路径
out = out.replace(/河南科技大学图片\//g, 'img/');
out = out.replace(/河南科技大学bgm\//g, 'bgm/');
out = out.replace(/<link rel="icon"[^>]*>/, '<link rel="icon" type="image/png" href="img/logo.png">');
// Hero 轮播加一条新生墙标语
out = out.replace('<span class="ht">收藏这一页，大学四年用得上</span>',
  '<span class="ht">收藏这一页，大学四年用得上</span>\n      <span class="ht">来新生墙，找到同专业的 TA 👀</span>');

// 去掉小测验面板
out = out.replace(/<div class="panel-card reveal">\s*<h3>🧠 新生小测验<\/h3>[\s\S]*?<div class="quiz-score" id="quizScore"><\/div>\s*<\/div>/, '');
// 互动玩法说明更新 + 抽卡面板居中
out = out.replace('学长给新生埋了两个小彩蛋：测测你是哪种河科大人，再抽一张今日专属运势卡。顺手把右下角的「弹幕」打开，给下一届学弟学妹留句话 🎉',
  '学长给新生埋了几个小彩蛋：抽一张今日专属运势卡，再去「新生墙」认领你的身份卡、找找同专业的缘分同学。顺手把右下角的「弹幕」打开，给下一届学弟学妹留句话 🎉');
out = out.replace('<div class="panel-card reveal">\n      <h3>🎴 今日新生运势</h3>',
  '<div class="panel-card reveal" style="grid-column:1/-1;max-width:520px;margin:0 auto;width:100%">\n      <h3>🎴 今日新生运势</h3>');

// 新生墙区块（插在互动玩法之前）
const WALL_HTML = `
<!-- 新生墙 -->
<section class="section" id="freshman">
  <span class="section-eyebrow reveal">FRESHMAN WALL · 新生墙</span>
  <h2 class="section-title reveal">遇见和你<span class="accent">一样的 TA</span></h2>
  <p class="section-desc reveal">这是 2026 级新生的专属墙——填上你的学院、专业、家乡和一句宣言，生成你的「新生身份卡」并上墙。看看有没有同专业、同乡、同星座的缘分同学就在你旁边 👀</p>

  <div class="wall-form reveal">
    <form id="wallForm">
      <div class="wf-row">
        <div class="wf-field"><label>昵称 *</label><input id="wfName" maxlength="16" placeholder="比如：爱睡觉的喵"></div>
        <div class="wf-field"><label>学院</label><input id="wfCollege" maxlength="20" placeholder="比如：信息工程学院"></div>
      </div>
      <div class="wf-row">
        <div class="wf-field"><label>专业 / 方向</label><input id="wfMajor" maxlength="20" placeholder="比如：物联网工程"></div>
        <div class="wf-field"><label>家乡</label><input id="wfHometown" maxlength="20" placeholder="比如：河南郑州"></div>
      </div>
      <div class="wf-row">
        <div class="wf-field"><label>星座 / MBTI</label><input id="wfTag" maxlength="12" placeholder="比如：天蝎座 / INFP"></div>
        <div class="wf-field"><label>兴趣标签（空格或逗号分隔）</label><input id="wfInterests" maxlength="60" placeholder="比如：篮球 摄影 二次元"></div>
      </div>
      <div class="wf-field" style="flex-basis:100%"><label>一句新生宣言</label><textarea id="wfSign" maxlength="50" placeholder="比如：希望在科大遇见有趣的人和事～"></textarea></div>
      <div class="wf-preview">
        <div class="wall-card" id="pvCard">
          <div class="wc-top"><div class="wc-ava">🌟</div><div><div class="wc-name" id="pvName">你的昵称</div><div class="wc-meta" id="pvMeta">学院 · 专业</div></div></div>
          <div><span class="wc-tag" id="pvTag">星座/MBTI</span></div>
          <div class="wc-sign" id="pvSign">一句话新生宣言…</div>
        </div>
      </div>
      <button class="wf-submit" type="submit">上墙 🚀</button>
      <div class="wf-msg" id="wallMsg"></div>
    </form>
  </div>

  <h3 style="font-size:22px;color:var(--gold2);margin:36px 0 0;letter-spacing:2px">🧱 墙上的新生们</h3>
  <div class="wall-grid" id="wallFeed"></div>
</section>

<div class="divider-flow"></div>
`;
out = out.replace('<!-- 05 互动玩法 -->', WALL_HTML + '<!-- 05 互动玩法 -->');

// 导航、底部 Tab、悬浮按钮 加新生墙
out = out.replace('<li><a href="#fun">互动玩法</a></li>',
  '<li><a href="#freshman">新生墙</a></li>\n    <li><a href="#fun">互动玩法</a></li>');
out = out.replace('<div class="btab" data-href="#fun">',
  '<div class="btab" data-href="#freshman">\n      <img class="btab-icon" loading="lazy" src="img/tsg.jpg" alt="墙" style="width:22px;height:22px;border-radius:4px;object-fit:cover">\n      <span>新生墙</span>\n    </div>\n    <div class="btab" data-href="#fun">');
out = out.replace('<div class="fab-item" data-href="#fun">',
  '<div class="fab-item" data-href="#freshman">\n      <img src="img/tsg.jpg" alt="墙" loading="lazy" style="width:18px;height:18px;border-radius:3px;object-fit:cover">\n      <span>新生墙</span>\n    </div>\n    <div class="fab-item" data-href="#fun">');
// 页脚文案
out = out.replace('单文件HTML · 自适应移动端', '前后端分离 · 静态前端 + Node 后端 API');

fs.writeFileSync(path.join(OUT, 'index.html'), out);
console.log('生成完成： index.html / style.css / app.js');
