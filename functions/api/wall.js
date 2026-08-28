function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
  });
}

export async function onRequest(context) {
  const { request } = context;
  // EdgeOne Pages：KV 绑定后作为全局变量注入；Cloudflare Pages 则在 env 里
  const kv = (typeof KV !== 'undefined' && KV) || (context.env && (context.env.KV || context.env.MY_KV));
  if (!kv) return json({ error: 'KV 未绑定：请在 EdgeOne 控制台把 KV 命名空间绑定到变量名 KV' }, 500);
  const method = request.method;
  const url = new URL(request.url);
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  try {
    if (method === 'GET') {
      let raw = await kv.get('wall');
      let posts = raw ? JSON.parse(raw) : [];
      return json({ posts: posts.slice(-60).reverse() });
    }
    if (method === 'POST') {
      let d; try { d = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
      let post = { id: Date.now() * 1000 + Math.floor(Math.random() * 1000), nickname: String(d.nickname || '').trim().slice(0, 16), college: String(d.college || '').trim().slice(0, 20), major: String(d.major || '').trim().slice(0, 20), hometown: String(d.hometown || '').trim().slice(0, 20), tag: String(d.tag || '').trim().slice(0, 12), interests: (Array.isArray(d.interests) ? d.interests : []).map(function(s){return String(s).trim().slice(0,10);}).filter(Boolean).slice(0, 6), sign: String(d.sign || '').trim().slice(0, 50), ts: Date.now() };
      if (!post.nickname) return json({ error: 'nickname required' }, 400);
      let raw = await kv.get('wall');
      let posts = raw ? JSON.parse(raw) : [];
      posts.push(post);
      if (posts.length > 500) posts = posts.slice(-500);
      await kv.put('wall', JSON.stringify(posts));
      return json({ post: post });
    }
    if (method === 'DELETE') {
      if (url.searchParams.get('clear') !== 'haust2026') return json({ error: 'forbidden' }, 403);
      await kv.put('wall', JSON.stringify([]));
      return json({ success: true });
    }
    return new Response('Not Found', { status: 404 });
  } catch (e) { return json({ error: e.message || String(e) }, 500); }
}
