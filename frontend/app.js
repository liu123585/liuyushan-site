
var API_BASE = window.__API_BASE__ || ''; // 部署到云函数后，在 api-config.js 里改成 API 网关公网地址；本地为空=同源

// ===== Star sprinkle background =====
(function(){
  var starsEl = document.getElementById('stars');
  for(var i=0;i<60;i++){
    var s = document.createElement('div');
    s.className = 'star';
    s.style.left = Math.random()*100+'%';
    s.style.top = Math.random()*100+'%';
    s.style.animationDelay = (Math.random()*4)+'s';
    s.style.transform = 'scale('+(0.5+Math.random()*1.5)+')';
    starsEl.appendChild(s);
  }
})();

// ===== Three.js Hero particle field =====
(function(){
  function initHeroParticles(){
  // Three.js 走 CDN：离线/被拦截导致 THREE 未定义时直接跳过
  if (typeof THREE === 'undefined') return;
  try {
  var canvas = document.getElementById('heroCanvas');
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 1, 2000);
  camera.position.z = 600;

  var renderer = new THREE.WebGLRenderer({canvas:canvas, alpha:true, antialias:true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  var isMobile = window.innerWidth < 768;
  var COUNT = isMobile ? 120 : 220;

  // 创建粒子球面分布
  var positions = new Float32Array(COUNT*3);
  var velocities = new Float32Array(COUNT*3);
  var colors = new Float32Array(COUNT*3);
  for(var i=0;i<COUNT;i++){
    var r = 200 + Math.random()*400;
    var theta = Math.random()*Math.PI*2;
    var phi = Math.acos(2*Math.random()-1);
    positions[i*3]   = r*Math.sin(phi)*Math.cos(theta);
    positions[i*3+1] = r*Math.sin(phi)*Math.sin(theta);
    positions[i*3+2] = r*Math.cos(phi);
    velocities[i*3]   = (Math.random()-0.5)*0.4;
    velocities[i*3+1] = (Math.random()-0.5)*0.4;
    velocities[i*3+2] = (Math.random()-0.5)*0.4;
    // 颜色：河科大蓝 + 金色混合
    if(Math.random()<0.3){
      // 金色
      colors[i*3] = 0.83; colors[i*3+1] = 0.69; colors[i*3+2] = 0.22;
    }else{
      // 蓝色系
      colors[i*3] = 0.0 + Math.random()*0.3;
      colors[i*3+1] = 0.33 + Math.random()*0.3;
      colors[i*3+2] = 0.64 + Math.random()*0.3;
    }
  }
  var geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors,3));
  var mat = new THREE.PointsMaterial({
    size:3, vertexColors:true, transparent:true, opacity:0.85,
    blending:THREE.AdditiveBlending, sizeAttenuation:true,
    depthWrite:false
  });
  var points = new THREE.Points(geom, mat);
  scene.add(points);

  // 鼠标影响
  var mouse = {x:0, y:0};
  window.addEventListener('mousemove', function(e){
    mouse.x = (e.clientX/window.innerWidth)*2-1;
    mouse.y = -(e.clientY/window.innerHeight)*2+1;
  });
  window.addEventListener('touchmove', function(e){
    if(e.touches[0]){
      mouse.x = (e.touches[0].clientX/window.innerWidth)*2-1;
      mouse.y = -(e.touches[0].clientY/window.innerHeight)*2+1;
    }
  });

    // 滚动暂停：滑出首屏时停掉渲染循环，避免一直吃 GPU/电（"页面卡"的主因）
    var heroVisible = true;
    var rafId = null;
    function animate(){
      rafId = requestAnimationFrame(animate);
      var time = Date.now()*0.0005;
      // 整体缓慢旋转
      points.rotation.y = time*0.2;
      points.rotation.x = time*0.1;
      // 相机随鼠标轻微偏移
      camera.position.x += (mouse.x*40 - camera.position.x)*0.04;
      camera.position.y += (mouse.y*40 - camera.position.y)*0.04;
      camera.lookAt(scene.position);
      // 粒子轻微振动
      var pos = geom.attributes.position.array;
      for(var i=0;i<COUNT;i++){
        pos[i*3]   += velocities[i*3]   * 0.3;
        pos[i*3+1] += velocities[i*3+1] * 0.3;
        pos[i*3+2] += velocities[i*3+2] * 0.3;
        // 软边界拉回
        var dx = pos[i*3], dy = pos[i*3+1], dz = pos[i*3+2];
        var dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
        if(dist>800 || dist<100){
          velocities[i*3]*=-1; velocities[i*3+1]*=-1; velocities[i*3+2]*=-1;
        }
      }
      geom.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
    }
    function startLoop(){ if(rafId===null) animate(); }
    function stopLoop(){ if(rafId!==null){ cancelAnimationFrame(rafId); rafId=null; } }
    startLoop();
    window.addEventListener('scroll', function(){
      var v = window.scrollY < window.innerHeight * 0.85;
      if(v !== heroVisible){ heroVisible = v; v ? startLoop() : stopLoop(); }
    }, {passive:true});

    window.addEventListener('resize', function(){
      camera.aspect = window.innerWidth/window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    } catch(e){ /* WebGL/Three.js 出错也不要影响页面其余功能 */ console.warn('hero particle error', e); }
    }
    // three.js 已用 defer 加载，DOMContentLoaded 时它必然已就绪；
    // 这样既不会阻塞首屏绘制，又能正常初始化粒子背景。
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHeroParticles);
    else initHeroParticles();
  })();

// ===== Navigation solid on scroll =====
(function(){
  var nav = document.getElementById('nav');
  window.addEventListener('scroll', function(){
    if(window.scrollY > 80) nav.classList.add('solid');
    else nav.classList.remove('solid');
  });
  // Smooth scroll for anchors
  document.querySelectorAll('.nav-links a[href^="#"]').forEach(function(a){
    a.addEventListener('click', function(e){
      e.preventDefault();
      var target = document.querySelector(a.getAttribute('href'));
      if(target){ target.scrollIntoView({behavior:'smooth'}); }
      document.getElementById('navLinks').classList.remove('open');
    });
  });
  // Mobile menu
  document.getElementById('menuToggle').addEventListener('click', function(){
    document.getElementById('navLinks').classList.toggle('open');
  });
})();

// ===== Reveal on scroll (IntersectionObserver) =====
(function(){
  var els = document.querySelectorAll('.reveal, .reveal-stagger, .timeline-item');
  // 兜底：浏览器不支持 IntersectionObserver 时直接全部显示，避免内容永远不可见
  if (!('IntersectionObserver' in window)) {
    els.forEach(function(el){ el.classList.add('in'); });
    return;
  }
  var observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, {threshold:0.01, rootMargin:'0px 0px -8% 0px'});
  els.forEach(function(el){
    observer.observe(el);
  });
})();

// ===== Mobile: Bottom Tab Bar =====
(function(){
  if(window.innerWidth > 768) return;
  var bar = document.getElementById('bottomTabBar');
  if(!bar) return;
  var tabs = bar.querySelectorAll('.btab');
  var sections = {campus:'#campus', life:'#life', prepare:'#prepare', club:'#club'};
  // Highlight active tab on scroll
  var sectEls = [document.getElementById('campus'), document.getElementById('life'), document.getElementById('prepare'), document.getElementById('club'), document.getElementById('freshman'), document.getElementById('fun')];
  function updateTab(){
    var scrollY = window.scrollY + window.innerHeight/3;
    var active = 0;
    sectEls.forEach(function(s,i){ if(s && s.offsetTop <= scrollY) active = i; });
    tabs.forEach(function(t,i){ t.classList.toggle('active', i === active); });
  }
  window.addEventListener('scroll', updateTab, {passive:true});
  updateTab();
  // Tab click -> smooth scroll
  tabs.forEach(function(tab){
    tab.addEventListener('click', function(){
      var target = document.querySelector(this.dataset.href);
      if(target) target.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
  // Show/hide tab bar based on scroll direction
  var lastScroll = 0;
  window.addEventListener('scroll', function(){
    var cur = window.scrollY;
    if(cur > lastScroll && cur > 200) bar.style.transform = 'translateY(100%)';
    else bar.style.transform = 'translateY(0)';
    lastScroll = cur;
  }, {passive:true});
})();

// ===== Mobile: Card Expand on Tap =====
(function(){
  if(window.innerWidth > 768) return;
  document.querySelectorAll('.card.card-link').forEach(function(card){
    card.addEventListener('click', function(e){
      // If clicking a real link inside, don't expand
      if(e.target.tagName === 'A') return;
      var wasExpanded = this.classList.contains('expanded');
      // Collapse all others
      document.querySelectorAll('.card.card-link.expanded').forEach(function(c){ c.classList.remove('expanded'); });
      if(!wasExpanded) this.classList.toggle('expanded');
    });
  });
})();

// ===== Mobile: Touch Ripple Effect =====
(function(){
  document.querySelectorAll('.card-link, .grid-card-link, .btab, .nav-links a').forEach(function(el){
    el.style.position = el.style.position || 'relative';
    el.style.overflow = 'hidden';
    el.addEventListener('click', function(e){
      var rect = this.getBoundingClientRect();
      var ripple = document.createElement('span');
      var size = Math.max(rect.width, rect.height);
      ripple.style.cssText = 'position:absolute;border-radius:50%;background:rgba(212,175,55,.25);pointer-events:none;animation:rippleAnim .6s ease-out forwards;';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
      this.appendChild(ripple);
      setTimeout(function(){ ripple.remove(); }, 700);
    });
  });
  // Inject ripple keyframes
  var style = document.createElement('style');
  style.textContent = '@keyframes rippleAnim{0%{transform:scale(0);opacity:1}100%{transform:scale(2.5);opacity:0}}';
  document.head.appendChild(style);
})();

// ===== Mobile: FAB (Floating Action Button) =====
(function(){
  if(window.innerWidth > 768) return;
  var fab = document.getElementById('mobileFab');
  if(!fab) return;
  var menu = document.getElementById('fabMenu');
  var isOpen = false;
  fab.addEventListener('click', function(){
    isOpen = !isOpen;
    menu.classList.toggle('open', isOpen);
    fab.classList.toggle('open', isOpen);
    fab.querySelector('.fab-icon').textContent = isOpen ? '✕' : '↑';
  });
  // FAB menu item clicks
  menu.querySelectorAll('.fab-item').forEach(function(item){
    item.addEventListener('click', function(){
      if(this.dataset.external){
        window.open(this.dataset.href, '_blank');
      } else {
        var target = document.querySelector(this.dataset.href);
        if(target) target.scrollIntoView({behavior:'smooth'});
      }
      isOpen = false;
      menu.classList.remove('open');
      fab.classList.remove('open');
      fab.querySelector('.fab-icon').textContent = '↑';
    });
  });
  // Auto-hide FAB on scroll down, show on scroll up
  var lastY = 0;
  window.addEventListener('scroll', function(){
    var y = window.scrollY;
    if(y > lastY && y > 400) { fab.style.opacity = '0'; fab.style.pointerEvents = 'none'; }
    else { fab.style.opacity = '1'; fab.style.pointerEvents = 'auto'; }
    lastY = y;
  }, {passive:true});
})();


// ===== 滚动进度条 =====
(function(){
  var bar=document.getElementById('scrollProgress');
  if(!bar)return;
  function upd(){var d=document.documentElement;var max=d.scrollHeight-d.clientHeight;
    var y=d.scrollTop||document.body.scrollTop;bar.style.width=(max>0?y/max*100:0)+'%';}
  window.addEventListener('scroll',upd,{passive:true});upd();
})();

// ===== Hero 轮播标语 =====
(function(){
  var lines=document.querySelectorAll('#heroTaglines .ht');
  if(!lines.length)return;var i=0;lines[0].classList.add('active');
  setInterval(function(){lines[i].classList.remove('active');i=(i+1)%lines.length;lines[i].classList.add('active');},2800);
})();

// ===== 数据看板计数动画 =====
(function(){
  var band=document.getElementById('statsBand');if(!band)return;
  var nums=band.querySelectorAll('.num');
  function run(){nums.forEach(function(el){var t=+el.dataset.target,s=el.dataset.suffix||'',dur=1400,st=null;
    function step(ts){if(!st)st=ts;var p=Math.min((ts-st)/dur,1),v=Math.floor(p*t);
      el.textContent=v+s;if(p<1)requestAnimationFrame(step);else el.textContent=t+s;}
    requestAnimationFrame(step);});}
  if(!('IntersectionObserver'in window)){run();return;}
  var ob=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){run();ob.disconnect();}});},{threshold:.3});
  ob.observe(band);
})();

// ===== 卡片 3D 倾斜（仅桌面） =====
(function(){
  if(window.innerWidth<=768)return;
  document.querySelectorAll('.card.card-link').forEach(function(card){
    card.addEventListener('mousemove',function(e){var r=card.getBoundingClientRect();
      var x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
      card.style.transform='perspective(800px) rotateY('+(x*8).toFixed(2)+'deg) rotateX('+(-y*8).toFixed(2)+'deg) translateY(-6px)';});
    card.addEventListener('mouseleave',function(){card.style.transform='';});
  });
})();

// ===== 校徽点击彩蛋 =====
(function(){
  var badge=document.querySelector('.hero-content img');if(!badge)return;
  badge.style.cursor='pointer';
  badge.addEventListener('click',function(e){e.stopPropagation();badge.classList.remove('badge-pop');void badge.offsetWidth;badge.classList.add('badge-pop');});
})();

// ===== BGM 播放器（多曲 + 歌词 + 进度条 + 随机播放）=====
(function(){
  var player=document.getElementById('musicPlayer'),btn=document.getElementById('mpBtn'),
      audio=document.getElementById('bgmAudio'),titleEl=document.getElementById('mpTitle'),
      subEl=document.getElementById('mpSub'),lyricsEl=document.getElementById('mpLyrics'),
      prevBtn=document.getElementById('mpPrev'),nextBtn=document.getElementById('mpNext'),
      progressEl=document.getElementById('mpProgress'),trackEl=document.getElementById('mpTrack'),
      playedEl=document.getElementById('mpPlayed'),thumbEl=document.getElementById('mpThumb'),
      curEl=document.getElementById('mpCur'),durEl=document.getElementById('mpDur');
  if(!player||!audio)return;

  // 歌单：把想加的歌（mp3 + 同名 .lrc 歌词）放进 bgm/ 目录，在这里加一项即可自动支持切歌与歌词
  var playlist=[
    {title:'吹着晚风想起你', artist:'苏星婕', src:'bgm/bgm.mp3', lrc:''},
    {title:'星与海', artist:'山止川行', src:'bgm/song2.mp3', lrc:''},
    {title:'瞬间', artist:'早八8AM', src:'bgm/song3.mp3', lrc:''},
    {title:'喜欢开始 遗憾终止', artist:'余一', src:'bgm/song4.mp3', lrc:''},
    {title:'星空裂痕', artist:'pro', src:'bgm/song5.mp3', lrc:''},
    {title:'多幸运', artist:'韩安旭', src:'bgm/song6.mp3', lrc:''},
    {title:'遇星', artist:'韩帅（HS）', src:'bgm/song7.mp3', lrc:''},
    {title:'眸cc', artist:'徐靖雯/海绵先生', src:'bgm/song8.mp3', lrc:''},
    {title:'沦陷', artist:'JuggShots', src:'bgm/song9.mp3', lrc:''},
    {title:'夜空中最亮的星', artist:'逃跑计划', src:'bgm/song10.mp3', lrc:''},
    {title:'晴天', artist:'周杰伦', src:'bgm/song11.mp3', lrc:''},
    {title:'起风了', artist:'买辣椒也用券', src:'bgm/song12.mp3', lrc:''},
    {title:'相拥星空', artist:'张洛一', src:'bgm/song13.m4a', lrc:''}
  ];
  var idx=0, lrcLines=[], lrcTimer=null, started=false, seeking=false;

  function formatTime(t){
    if(!isFinite(t)||t<0)return '0:00';
    var m=Math.floor(t/60), s=Math.floor(t%60);
    return m+':'+(s<10?'0':'')+s;
  }
  function loadSong(i){
    idx=(i+playlist.length)%playlist.length;
    var s=playlist[idx];
    audio.src=s.src;
    if(titleEl)titleEl.textContent=s.title;
    if(subEl)subEl.textContent=s.artist;
    if(lyricsEl)lyricsEl.textContent='';
    lrcLines=[];
    if(s.lrc){ fetch(s.lrc).then(function(r){return r.text();}).then(parseLrc).catch(function(){}); }
  }
  function parseLrc(text){
    lrcLines=[];
    text.split(/\r?\n/).forEach(function(line){
      var m=line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.*)/);
      if(m) lrcLines.push({t:parseInt(m[1],10)*60+parseFloat(m[2]), txt:m[3].trim()});
    });
    lrcLines.sort(function(a,b){return a.t-b.t;});
  }
  function updateLyrics(){
    if(!lrcLines.length){ if(lyricsEl)lyricsEl.textContent=''; return; }
    var t=audio.currentTime, cur=-1;
    for(var i=0;i<lrcLines.length;i++){ if(lrcLines[i].t<=t) cur=i; else break; }
    if(lyricsEl) lyricsEl.textContent = cur>=0 ? lrcLines[cur].txt : '';
  }
  function setState(p){
    player.classList.toggle('playing',p);
    if(btn)btn.textContent=p?'⏸':'▶';
    if(!p&&lrcTimer){clearInterval(lrcTimer);lrcTimer=null;}
    if(p&&lrcLines.length&&!lrcTimer) lrcTimer=setInterval(updateLyrics,300);
  }
  function play(){audio.play().then(function(){setState(true);}).catch(function(){});}
  function pause(){audio.pause();setState(false);}
  // 随机切歌：不重复当前这首
  function randomIdx(){
    if(playlist.length<=1)return 0;
    var i; do{ i=Math.floor(Math.random()*playlist.length); }while(i===idx);
    return i;
  }
  function nextSong(){ loadSong(randomIdx()); if(player.classList.contains('playing')) play(); }

  player.addEventListener('click',function(e){
    if(e.target.closest('.mp-ctrl')||e.target.closest('.mp-lyrics')||e.target.closest('.mp-progress')) return;
    e.stopPropagation(); audio.paused?play():pause();
  });
  if(btn)btn.addEventListener('click',function(e){e.stopPropagation();audio.paused?play():pause();});
  if(prevBtn)prevBtn.addEventListener('click',function(e){e.stopPropagation();nextSong();});
  if(nextBtn)nextBtn.addEventListener('click',function(e){e.stopPropagation();nextSong();});
  audio.addEventListener('ended',function(){ nextSong(); });
  audio.addEventListener('play',function(){setState(true);});
  audio.addEventListener('pause',function(){setState(false);});

  // 进度条
  function updateProgress(){
    var d=audio.duration||0, c=audio.currentTime||0, pct=d>0?(c/d*100):0;
    if(playedEl)playedEl.style.width=pct+'%';
    if(thumbEl)thumbEl.style.left=pct+'%';
    if(curEl)curEl.textContent=formatTime(c);
    if(durEl)durEl.textContent=formatTime(d);
  }
  function seekFromEvent(e){
    if(!trackEl)return;
    var rect=trackEl.getBoundingClientRect();
    var clientX=e.touches?e.touches[0].clientX:e.clientX;
    var p=(clientX-rect.left)/rect.width;
    p=Math.max(0,Math.min(1,p));
    var d=audio.duration||0;
    if(d>0){ audio.currentTime=p*d; updateProgress(); }
  }
  if(trackEl){
    trackEl.addEventListener('mousedown',function(e){e.stopPropagation(); seeking=true; seekFromEvent(e);});
    trackEl.addEventListener('touchstart',function(e){e.stopPropagation(); seeking=true; seekFromEvent(e);},{passive:false});
  }
  document.addEventListener('mousemove',function(e){ if(seeking){ seekFromEvent(e); } });
  document.addEventListener('mouseup',function(){ seeking=false; });
  document.addEventListener('touchmove',function(e){ if(seeking){ e.preventDefault(); seekFromEvent(e); } },{passive:false});
  document.addEventListener('touchend',function(){ seeking=false; });
  audio.addEventListener('timeupdate',updateProgress);
  audio.addEventListener('durationchange',updateProgress);
  audio.addEventListener('loadedmetadata',updateProgress);

  function tryAuto(){if(started)return;started=true;audio.play().then(function(){setState(true);}).catch(function(){});}
  window.addEventListener('click',tryAuto,{once:true});
  window.addEventListener('touchstart',tryAuto,{once:true});
  window.addEventListener('scroll',tryAuto,{once:true});

  loadSong(0);
  updateProgress();
})();


// ===== 校区切换 =====
(function(){
  var tabs=document.querySelectorAll('#campusTabs .campus-tab');
  if(!tabs.length)return;
  tabs.forEach(function(t){
    t.addEventListener('click',function(){
      tabs.forEach(function(x){x.classList.remove('active')});
      t.classList.add('active');
      var c=t.dataset.campus;
      document.getElementById('panel-kaiyuan').classList.toggle('active',c==='kaiyuan');
      document.getElementById('panel-xiyuan').classList.toggle('active',c==='xiyuan');
    });
  });
})();

// ===== 今日运势抽卡（可重复抽，抽到满意为止） =====
(function(){
  var btn=document.getElementById('gachaBtn'),box=document.getElementById('fortuneResult'),cnt=document.getElementById('fortuneCount');
  if(!btn)return;
  var F=[
    {lv:"⭐⭐⭐⭐⭐",t:"大吉 · 入学顺风顺水",yi:"宜主动认识新室友、把三个食堂吃一遍",ji:"忌熬夜赶军训、忌迷路还硬撑"},
    {lv:"⭐⭐⭐⭐",t:"中吉 · 元气满满",yi:"宜早起打卡图书馆、逛逛牡丹园",ji:"忌错过迎新志愿者、忌忘带证件"},
    {lv:"⭐⭐⭐",t:"小吉 · 平稳开局",yi:"宜给家里报个平安、整理好行李",ji:"忌冲动网购、忌军训偷懒"},
    {lv:"⭐⭐⭐⭐",t:"吉 · 贵人相助",yi:"宜多问学长学姐、加入心仪社团",ji:"忌社恐自闭、忌错过百团大战"},
    {lv:"⭐⭐⭐",t:"平 · 慢慢来",yi:"宜熟悉校园路线、提前踩点教室",ji:"忌迟到、忌把地址记错校区"},
    {lv:"⭐⭐⭐⭐⭐",t:"大吉 · 西苑工科魂",yi:"宜去轴承陈列馆打卡、梧桐大道拍照",ji:"忌错过上海市场的好吃的"},
    {lv:"⭐⭐⭐",t:"小吉 · 学业运旺",yi:"宜去图书馆占个好座、制定小目标",ji:"忌手机依赖、忌期末突击"},
    {lv:"⭐⭐⭐⭐",t:"吉 · 社交开挂",yi:"宜参加班级破冰、认识不同专业朋友",ji:"忌宅在宿舍、忌错过洛阳美景"}
  ];
  var last=-1, times=0;
  function draw(){
    var idx;
    do { idx=Math.floor(Math.random()*F.length); } while(F.length>1 && idx===last);
    last=idx; var f=F[idx]; times++;
    var d=new Date();var ds=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
    box.innerHTML='<div class="fortune-level">'+f.lv+'</div><div class="fortune-title">'+f.t+'</div>'+
      '<div class="fortune-yi"><b>宜：</b>'+f.yi+'<br><b>忌：</b>'+f.ji+'</div>'+
      '<div class="fortune-day">第 '+times+' 抽 · '+ds+'</div>';
    box.classList.add('show');
    btn.textContent='再抽一张 🎲';
    cnt.textContent='已抽 '+times+' 次，抽到满意为止～';
  }
  btn.addEventListener('click',draw);
})();

// ===== 今天吃什么（食堂盲盒） =====
(function(){
  var wheel=document.getElementById('eatWheel'),btn=document.getElementById('eatBtn'),res=document.getElementById('eatResult');
  if(!wheel)return;
  var FOODS=[
    {e:'🍜',n:'嘉园餐厅',d:'砂锅面、黄焖鸡、三楼麻辣香锅'},
    {e:'🍲',n:'菁园餐厅',d:'大盘鸡面、鸳鸯馄饨、蛋包饭'},
    {e:'🍛',n:'乾园餐厅',d:'黑椒鸡扒饭、小火锅，文艺范食堂'},
    {e:'🥘',n:'西苑科大饭堂',d:'豫湘川家常菜、刀削面、卤肉饭'},
    {e:'🍢',n:'龙翔街·烤串炸串',d:'开元小北门对面，烟火气十足'},
    {e:'🍜',n:'龙翔街·桥头麻辣烫',d:'1元/串，骨汤自选加烩面'},
    {e:'🥣',n:'龙翔街·不翻汤',d:'洛阳特色，配油饼一口入魂'},
    {e:'🍢',n:'上海市场小吃街',d:'西苑旁，烤串炸串逛吃'},
    {e:'🍲',n:'洛阳水席',d:'真不同来一套，宴客必备'},
    {e:'🧋',n:'蜜雪冰城',d:'河南本土，甜筒+柠檬水续命'},
    {e:'🍔',n:'塔斯汀中国汉堡',d:'龙翔街店，现烤胚中国味'}
  ];
  FOODS.forEach(function(f){
    var s=document.createElement('span');s.className='eat-item';s.textContent=f.e+' '+f.n;wheel.appendChild(s);
  });
  var items=wheel.querySelectorAll('.eat-item'),cur=-1,rolling=false;
  var TAG=['开整！','冲就完了～','今天就是它','安排！','干饭！'];
  function hilite(i){ if(items[cur])items[cur].classList.remove('hit'); items[i].classList.add('hit'); cur=i; }
  btn.addEventListener('click',function(){
    if(rolling) return; rolling=true;
    var finalIdx; do { finalIdx=Math.floor(Math.random()*FOODS.length); } while(FOODS.length>1 && finalIdx===cur);
    var ticks=0, max=12;
    var timer=setInterval(function(){
      hilite(Math.floor(Math.random()*FOODS.length));
      if(++ticks>=max){
        clearInterval(timer);
        hilite(finalIdx);
        var el=items[finalIdx]; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
        var f=FOODS[finalIdx];
        res.innerHTML='今天就吃 <b>'+f.e+' '+f.n+'</b><br><span style="opacity:.7;font-size:13px">'+f.d+' · '+(TAG[Math.floor(Math.random()*TAG.length)])+'</span>';
        rolling=false;
      }
    },50);
  });
})();

// ===== 你是哪种鼎宝（人格测试） =====
(function(){
  var box=document.getElementById('personaBox');if(!box)return;
  var Q=[
    {q:'报到第一天，你最想先干嘛？',o:[
      {t:'把校园每个角落逛一遍',k:'social'},{t:'去图书馆占个座',k:'study'},
      {t:'回宿舍躺平休息',k:'zen'},{t:'找学长借工具修修行李',k:'do'}]},
    {q:'百团大战，哪个社团最吸引你？',o:[
      {t:'街舞 / 吉他 / 主持人',k:'social'},{t:'学术科技类',k:'study'},
      {t:'瑜伽 / 养生 / 慢生活',k:'zen'},{t:'创客 / 机器人 / 航模',k:'do'}]},
    {q:'周末洛阳天气超好，你选？',o:[
      {t:'约一帮人去龙门石窟',k:'social'},{t:'泡馆写论文 / 考证',k:'study'},
      {t:'睡到自然醒 + 校园散步',k:'zen'},{t:'去西苑轴承陈列馆 / 实验室',k:'do'}]},
    {q:'期末周你的状态是？',o:[
      {t:'组队复习 + 吃夜宵',k:'social'},{t:'早八晚十泡图书馆',k:'study'},
      {t:'计划随缘，随它去',k:'zen'},{t:'动手做思维导图整理笔记',k:'do'}]}
  ];
  var TYPES={
    social:{e:'🦄',t:'交际花鼎宝',d:'社团、破冰、组局样样在行，大学四年人脉一点点织成网。记得也留点独处时间给自己～'},
    study:{e:'📚',t:'卷王鼎宝',d:'图书馆常驻 VIP，目标感拉满。偶尔抬头看看窗外的梧桐，松弛一点走得更久。'},
    zen:{e:'🍃',t:'淡人鼎宝',d:'情绪稳定、万事随缘，是宿舍的定海神针。别太佛，重要的事还是得上点心哦。'},
    do:{e:'🔧',t:'硬核鼎宝',d:'动手派、实干家，轴承和代码都拿得下。把这份硬核用在热爱上，你会闪闪发光。'}
  };
  var step=0,score={social:0,study:0,zen:0,do:0};
  function prog(){var h='<div class="quiz-progress">';for(var i=0;i<Q.length;i++)h+='<i class="'+(i<step?'on':'')+'"></i>';return h+'</div>';}
  function render(){
    if(step>=Q.length) return finish();
    box.innerHTML=prog()+'<div class="quiz-q">'+(step+1)+'. '+Q[step].q+'</div>';
    Q[step].o.forEach(function(op){
      var b=document.createElement('button');b.className='quiz-opt';b.textContent=op.t;
      b.addEventListener('click',function(){score[op.k]++;step++;render();});
      box.appendChild(b);
    });
  }
  function finish(){
    var best='study',bval=-1;
    for(var k in score){if(score[k]>bval){bval=score[k];best=k;}}
    var t=TYPES[best];
    box.innerHTML='<div class="quiz-result"><div class="qr-emoji">'+t.e+'</div>'+
      '<div class="qr-title">你是 '+t.t+'</div>'+
      '<div class="qr-desc">'+t.d+'</div>'+
      '<button class="game-btn quiz-restart" id="personaRestart">再测一次 🔁</button></div>';
    document.getElementById('personaRestart').addEventListener('click',function(){step=0;score={social:0,study:0,zen:0,do:0};render();});
  }
  render();
})();

// ===== 新生心愿漂流瓶 =====
(function(){
  var input=document.getElementById('wishInput'),send=document.getElementById('wishSend'),show=document.getElementById('wishShow');
  if(!input)return;
  var POOL=[
    '希望四年后能笑着回头，不后悔每一个选择。',
    '想遇到一群能一起熬夜赶作业的好朋友。',
    '绩点稳稳的，恋爱甜甜的。',
    '西苑的梧桐大道，想和喜欢的人走一遍。',
    '学会一门真正有用的技术，不枉这四年。',
    '军训别晒太黑，但也别下雨 😂',
    '图书馆的座位永远为我留着。',
    '洛阳的牡丹，今年一定要去看一次。'
  ];
  var KEY='haust_wishes';
  function load(){try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch(_){return [];}}
  function save(a){try{localStorage.setItem(KEY,JSON.stringify(a));}catch(_){}}
  var mine=load();
  show.innerHTML='<div class="wish-count">洛河里已漂着 '+(POOL.length+mine.length)+' 条心愿，投一个试试 🫧</div>';
  send.addEventListener('click',function(){
    var v=input.value.trim();
    if(!v){show.innerHTML='<div class="wish-bubble">先写点什么再投瓶呀～</div>';return;}
    mine.push(v);if(mine.length>30)mine.shift();save(mine);input.value='';
    var all=POOL.concat(mine);
    var pick=all[Math.floor(Math.random()*all.length)];
    var from=(mine.indexOf(pick)>=0)?'一位匿名的鼎宝':'往届学长学姐';
    show.innerHTML='<div class="wish-bubble">🌊 '+pick+'<span class="wb-from">— '+from+' 的心愿</span></div>'+
      '<div class="wish-count">你已投 '+mine.length+' 个心愿 · 心愿瓶里共有 '+(POOL.length+mine.length)+' 条</div>';
  });
})();

// ===== B站式弹幕（后端共享） =====
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
  function start(){on=true;layer.classList.add('on');btn.textContent='📡 弹幕开';bar.classList.add('show');if(bar.__initDrag)bar.__initDrag();loop();timer=setInterval(loop,1600);}
  function stop(){on=false;layer.classList.remove('on');btn.textContent='📡 弹幕';bar.classList.remove('show');if(timer)clearInterval(timer);}
  btn.addEventListener('click',function(){on?stop():start();});
  function emitLocal(v){if(!on)start();spawn(v);}
  function emit(){var v=input.value.trim();if(!v)return;emitLocal(v);input.value='';
    fetch(API_BASE + '/api/danmaku',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:v})}).catch(function(){});}
  send.addEventListener('click',emit);
  input.addEventListener('keydown',function(e){if(e.key==='Enter')emit();});
  // 拉取已有弹幕 + 轮询新弹幕（跨访客共享）
  function pull(){
    fetch(API_BASE + '/api/danmaku').then(function(r){return r.json();}).then(function(d){
      (d.items||[]).forEach(function(it){ if(it.id>serverMax){serverMax=it.id;pool.push(it.text);} });
    }).catch(function(){});
  }
  pull(); setInterval(pull,6000);
})();

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
    var meta=[val('wfCollege'),val('wfMajor')].filter(Boolean).join(' · ');
    if(val('wfHometown'))meta+=(meta?' · ':'')+'📍'+val('wfHometown');
    document.getElementById('pvMeta').textContent=meta||'学院 · 专业 · 家乡';
    var tag=[val('wfMbti'),val('wfStar')].filter(Boolean).join(' · ');
    document.getElementById('pvTag').textContent=tag||'MBTI · 星座';
    document.getElementById('pvSign').textContent=val('wfSign')||'一句话新生宣言…';
  }
  ['wfName','wfCollege','wfMajor','wfHometown','wfMbti','wfStar','wfSign'].forEach(function(id){
    var el=document.getElementById(id);if(el){el.addEventListener('input',updatePreview);el.addEventListener('change',updatePreview);}
  });
  // 兴趣点选
  var chips=document.getElementById('wfChips'),hid=document.getElementById('wfInterests');
  if(chips){chips.querySelectorAll('.wf-chip').forEach(function(c){c.addEventListener('click',function(){c.classList.toggle('on');var arr=[];chips.querySelectorAll('.wf-chip.on').forEach(function(x){arr.push(x.textContent.trim());});if(hid)hid.value=arr.join(',');updatePreview();});});}
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
      '<div class="wc-foot"><span class="wc-meta" style="opacity:.5">'+timeAgo(post.createdAt||Date.now())+'</span><button class="wc-like" data-id="'+esc(String(post.id))+'">👍 <span>'+likesOf(post)+'</span></button></div>';
    return card;
  }
  var allPosts=[];
  var likes=(function(){try{return JSON.parse(localStorage.getItem('haust_likes')||'{}');}catch(e){return {};}})();
  function likesOf(p){var id=String(p.id||''),base=0;for(var i=0;i<id.length;i++)base+=id.charCodeAt(i);base=base%37+3;return base+(likes[id]?1:0);}
  function renderFeed(){var fc=document.getElementById('filterCollege'),fh=document.getElementById('filterHometown');var c=fc?fc.value:'',h=fh?fh.value:'';var list=allPosts.filter(function(p){return(!c||p.college===c)&&(!h||p.hometown===h);});if(!list.length){feed.innerHTML='<div class="wall-empty">这里还没有同学，快来当第一个～</div>';return;}feed.innerHTML='';list.forEach(function(p){feed.appendChild(render(p));});}
  function populateFilters(){var fc=document.getElementById('filterCollege'),fh=document.getElementById('filterHometown');if(!fc||!fh)return;var cs=[],hs=[];allPosts.forEach(function(p){if(p.college&&cs.indexOf(p.college)<0)cs.push(p.college);if(p.hometown&&hs.indexOf(p.hometown)<0)hs.push(p.hometown);});cs.sort();hs.sort();if(fc.dataset.filled!=='1'){fc.innerHTML='<option value="">全部学院</option>'+cs.map(function(x){return '<option>'+esc(x)+'</option>';}).join('');fc.dataset.filled='1';}if(fh.dataset.filled!=='1'){fh.innerHTML='<option value="">全部家乡</option>'+hs.map(function(x){return '<option>'+esc(x)+'</option>';}).join('');fh.dataset.filled='1';}}
  function load(){
    fetch(API_BASE + '/api/wall').then(function(r){return r.json();}).then(function(d){
      allPosts=d.posts||[]; populateFilters(); renderFeed();
    }).catch(function(){});
  }
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var post={nickname:val('wfName'),college:val('wfCollege'),major:val('wfMajor'),hometown:val('wfHometown'),tag:[val('wfMbti'),val('wfStar')].filter(Boolean).join(' · '),
      interests:(document.getElementById('wfInterests').value||'').split(',').map(function(s){return s.trim();}).filter(Boolean),sign:val('wfSign')};
    if(!post.nickname){msg.textContent='先填个昵称吧～';return;}
    msg.textContent='发布中…';
    fetch(API_BASE + '/api/wall',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(post)}).then(function(r){return r.json();}).then(function(d){
      if(d.post){allPosts.unshift(d.post);renderFeed();form.reset();if(chips)chips.querySelectorAll('.wf-chip.on').forEach(function(c){c.classList.remove('on');});if(hid)hid.value='';updatePreview();msg.textContent='已上墙 🎉 看看你的新生身份卡！';}
      else msg.textContent='发布失败，稍后再试';
    }).catch(function(){msg.textContent='网络错误，稍后再试';});
  });
  var fc=document.getElementById('filterCollege'),fh=document.getElementById('filterHometown'),fr=document.getElementById('filterReset');
  if(fc)fc.addEventListener('change',renderFeed);
  if(fh)fh.addEventListener('change',renderFeed);
  if(fr)fr.addEventListener('click',function(){if(fc)fc.value='';if(fh)fh.value='';load();});
  if(feed)feed.addEventListener('click',function(e){var t=e.target.closest?e.target.closest('.wc-like'):null;if(!t)return;var id=t.getAttribute('data-id');if(!id)return;likes[id]=!likes[id];try{localStorage.setItem('haust_likes',JSON.stringify(likes));}catch(_){}renderFeed();});
  load();
})();

// 新人引导浮层（两个按钮效果不同：一个带你逛生活指南，一个放你自己去互动区）
(function(){
  var g=document.getElementById('guide');
  if(!g)return;
  // 每次打开都显示引导浮层；若只想要首次显示，把下一行取消注释即可
  // try{ if(localStorage.getItem('haust_guide_v1')){g.style.display='none';return;} }catch(e){}
  function close(){g.style.display='none';}
  function goTo(id){close();setTimeout(function(){var t=document.getElementById(id);if(t)t.scrollIntoView({behavior:'smooth',block:'start'});},80);}
  var s=document.getElementById('guideStart'),k=document.getElementById('guideSkip');
  if(s)s.addEventListener('click',function(){close();});   // 好，我知道了 → 直接关闭，留在顶部
  if(k)k.addEventListener('click',function(){close();});    // 不用教了 → 也直接关闭，留在顶部
})();

// 卡片跳转：点一下在新标签打开跳转链接（如百度地图），不跳学校官网（免 VPN）
(function(){
  document.querySelectorAll('[data-jump]').forEach(function(el){
    el.addEventListener('click', function(){
      var url = el.getAttribute('data-jump');
      if (url) window.open(url, '_blank', 'noopener');
    });
  });
})();

// ===== 悬浮元素可拖动（BGM 播放器 / 弹幕栏） =====
(function(){
  function makeDraggable(el, handle, key){
    if(!el) return;
    handle = handle || el;
    var frozen=false, dragging=false, ox=0, oy=0, moved=false, sx=0, sy=0;
    function ensureFrozen(){
      if(frozen) return; frozen=true;
      var r=el.getBoundingClientRect();
      el.style.left=r.left+'px'; el.style.top=r.top+'px';
      el.style.right='auto'; el.style.bottom='auto'; el.style.transform='none';
      var saved=null;
      try{ saved=JSON.parse(localStorage.getItem(key)||'null'); }catch(_){}
      if(saved && typeof saved.x==='number'){
        el.style.left=saved.x+'px'; el.style.top=saved.y+'px';
        el.style.right='auto'; el.style.bottom='auto'; el.style.transform='none';
      }
    }
    // 初始可见的元素（播放器）直接固化位置；隐藏的（弹幕栏）等首次拖动/显示时再固化
    if(el.offsetParent!==null) ensureFrozen();
    el.__initDrag=ensureFrozen;
    handle.style.cursor='grab';
    handle.style.touchAction='none';
    handle.addEventListener('pointerdown', function(e){
      // 点按钮/输入框/链接时不开启拖拽，也不阻止 click，让控件正常响应
      if(e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea') || e.target.closest('a')) return;
      ensureFrozen();
      dragging=true; moved=false;
      var r=el.getBoundingClientRect();
      ox=e.clientX-r.left; oy=e.clientY-r.top;
      sx=e.clientX; sy=e.clientY;
      try{ handle.setPointerCapture(e.pointerId); }catch(_){}
      handle.style.cursor='grabbing';
      e.preventDefault();
    });
    handle.addEventListener('pointermove', function(e){
      if(!dragging) return;
      var nx=e.clientX-ox, ny=e.clientY-oy;
      nx=Math.max(4, Math.min(nx, window.innerWidth-el.offsetWidth-4));
      ny=Math.max(4, Math.min(ny, window.innerHeight-el.offsetHeight-4));
      el.style.left=nx+'px'; el.style.top=ny+'px';
      el.style.right='auto'; el.style.bottom='auto'; el.style.transform='none';
      if(Math.abs(e.clientX-sx)>4 || Math.abs(e.clientY-sy)>4) moved=true;
    });
    function end(){
      if(!dragging) return;
      dragging=false; handle.style.cursor='grab';
      try{ localStorage.setItem(key, JSON.stringify({x:parseFloat(el.style.left)||0, y:parseFloat(el.style.top)||0})); }catch(_){}
    }
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    // 拖动后吞掉误触发的点击（播放/发送），避免一拖就触发
    el.addEventListener('click', function(e){
      if(moved){ e.stopPropagation(); e.preventDefault(); moved=false; }
    }, true);
  }
  makeDraggable(document.getElementById('musicPlayer'), document.getElementById('musicPlayer'), 'haust_mp_pos');
  var bar=document.getElementById('dmBar');
  if(bar){
    var grip=document.createElement('span');
    grip.className='dm-grip'; grip.textContent='⠿'; grip.title='拖动我移动弹幕栏';
    bar.insertBefore(grip, bar.firstChild);
    makeDraggable(bar, grip, 'haust_dmbar_pos');
  }
})();
