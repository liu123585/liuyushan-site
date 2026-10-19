/* /api/wall —— 新生墙
   安全策略：来源校验 + 爬虫 UA 过滤 + 滑动窗口限流 + 请求体限制。
   管理口令**不再写死在代码里**（原来那个口令在公开仓库里，谁都能看到并清空整面墙），
   改成从环境变量 WALL_ADMIN_KEY 读；没配就直接禁用 DELETE。 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
const MAX_BODY = 8 * 1024;

const BAD_UA = /(scrapy|python-requests|python-urllib|aiohttp|httpx|node-fetch|axios\/|go-http-client|java\/|libwww-perl|wget\/|curl\/|ahrefsbot|semrushbot|mj12bot|dotbot|blexbot|dataforseo|petalbot|gptbot|ccbot|claudebot|bytespider|masscan|nmap)/i;

const _mem = new Map();
function memHit(key, limit, windowMs) {
  const now = Date.now();
  const arr = (_mem.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) return false;
  arr.push(now);
  _mem.set(key, arr);
  if (_mem.size > 3000) _mem.clear();
  return true;
}
function clientIp(request) {
  const h = request.headers;
  const raw = h.get('cf-connecting-ip') || h.get('x-real-ip') || h.get('x-forwarded-for') || '';
  return String(raw).split(',')[0].trim() || 'unknown';
}
function originAllowed(origin) {
  if (!origin) return true;
  if (/^https?:\/\/([a-z0-9-]+\.)*liuyushan\.top(:\d+)?$/i.test(origin)) return true;
  // EdgeOne 默认域名（没绑自定义域名、或用默认域名自测时也要能用）
  if (/^https?:\/\/([a-z0-9-]+\.)*(edgeone\.app|edgeone\.site|edgeone\.ai)(:\d+)?$/i.test(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}
async function rateHit(kv, key, limit, windowMs) {
  const now = Date.now();
  if (kv) {
    try {
      const raw = await kv.get(key);
      let arr = [];
      try { arr = JSON.parse(raw || '[]'); } catch (e) { arr = []; }
      if (!Array.isArray(arr)) arr = [];
      arr = arr.filter((t) => typeof t === 'number' && now - t < windowMs);
      if (arr.length >= limit) return false;
      arr.push(now);
      const val = JSON.stringify(arr);
      try { await kv.put(key, val, { expirationTtl: Math.ceil(windowMs / 1000) + 120 }); }
      catch (e) { await kv.put(key, val); }
      return true;
    } catch (e) { /* KV 故障退到内存 */ }
  }
  return memHit(key, limit, windowMs);
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS, SEC)
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const E = env || {};
  const kv = (typeof KV !== 'undefined' && KV) || (E.KV || E.MY_KV) || null;
  if (!kv) return json({ error: 'KV 未绑定：请在 EdgeOne 控制台把 KV 命名空间绑定到变量名 KV' }, 500);

  const method = request.method;
  const url = new URL(request.url);
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const UA = request.headers.get('user-agent') || '';
  if (!UA || BAD_UA.test(UA)) return json({ error: 'forbidden' }, 403);
  if (!originAllowed(request.headers.get('origin') || '')) return json({ error: 'forbidden' }, 403);

  const ip = clientIp(request);
  const ipKey = 'sec:wall:' + ip;

  try {
    if (method === 'GET') {
      if (!(await rateHit(kv, ipKey + ':g', 90, 60 * 1000))) return json({ error: 'too many requests' }, 429);
      const raw = await kv.get('wall');
      let posts = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(posts)) posts = [];
      return json({ posts: posts.slice(-60).reverse() });
    }

    if (method === 'POST') {
      if (!(await rateHit(kv, ipKey + ':m', 5, 60 * 1000))) return json({ error: '发得有点快，歇一会儿再试' }, 429);
      if (!(await rateHit(kv, ipKey + ':h', 30, 60 * 60 * 1000))) return json({ error: '今天发得够多啦，明天再来' }, 429);

      const CL = parseInt(request.headers.get('content-length') || '0', 10);
      if (CL > MAX_BODY) return json({ error: 'too large' }, 413);
      const rawBody = await request.text();
      if (!rawBody || rawBody.length > MAX_BODY) return json({ error: 'too large' }, 413);

      let d;
      try { d = JSON.parse(rawBody); } catch (e) { return json({ error: 'bad json' }, 400); }
      if (!d || typeof d !== 'object') return json({ error: 'bad json' }, 400);

      // 蜜罐字段：页面上是隐藏的，正常人不会填，脚本会无脑填满 → 直接丢
      if (d.hp || d.website) return json({ error: 'forbidden' }, 403);

      const post = {
        id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
        nickname: String(d.nickname || '').trim().slice(0, 16),
        college: String(d.college || '').trim().slice(0, 20),
        major: String(d.major || '').trim().slice(0, 20),
        hometown: String(d.hometown || '').trim().slice(0, 20),
        tag: String(d.tag || '').trim().slice(0, 12),
        interests: (Array.isArray(d.interests) ? d.interests : [])
          .map((s) => String(s).trim().slice(0, 10)).filter(Boolean).slice(0, 6),
        sign: String(d.sign || '').trim().slice(0, 50),
        ts: Date.now()
      };
      if (!post.nickname) return json({ error: 'nickname required' }, 400);

      // 同一 IP 30 秒内发一模一样的内容 → 当成重复提交
      const dupKey = 'sec:wall:dup:' + ip;
      const lastRaw = await kv.get(dupKey);
      const fingerprint = post.nickname + '|' + post.sign;
      if (lastRaw === fingerprint) return json({ error: '刚发过啦' }, 429);
      try { await kv.put(dupKey, fingerprint, { expirationTtl: 30 }); } catch (e) {}

      const raw = await kv.get('wall');
      let posts = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(posts)) posts = [];
      posts.push(post);
      if (posts.length > 500) posts = posts.slice(-500);
      await kv.put('wall', JSON.stringify(posts));
      return json({ post: post });
    }

    if (method === 'DELETE') {
      /* 管理口令只从环境变量读。没配 = 这个接口直接关掉，避免公开仓库里的旧口令被利用。 */
      const ADMIN = String(E.WALL_ADMIN_KEY || '');
      if (!ADMIN) return json({ error: 'admin disabled' }, 403);
      const given = url.searchParams.get('key') || url.searchParams.get('clear') || '';
      if (given !== ADMIN) return json({ error: 'forbidden' }, 403);

      const delId = url.searchParams.get('del');
      if (delId) {
        const raw = await kv.get('wall');
        let posts = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(posts)) posts = [];
        const before = posts.length;
        posts = posts.filter((p) => String(p && p.id) !== String(delId));
        await kv.put('wall', JSON.stringify(posts));
        return json({ success: true, removed: before - posts.length });
      }
      await kv.put('wall', JSON.stringify([]));
      return json({ success: true });
    }

    return new Response('Not Found', { status: 404, headers: SEC });
  } catch (e) {
    return json({ error: '服务暂时不可用' }, 500);
  }
}
