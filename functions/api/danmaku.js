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
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  try {
    if (method === 'GET') {
      let raw = await kv.get('danmaku');
      let items = raw ? JSON.parse(raw) : [];
      return json({ items: items.slice(-100) });
    }
    if (method === 'POST') {
      let d; try { d = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
      let text = String(d.text || '').trim().slice(0, 40);
      if (!text) return json({ error: 'empty' }, 400);
      let item = { id: Date.now() * 1000 + Math.floor(Math.random() * 1000), text: text, ts: Date.now() };
      let raw = await kv.get('danmaku');
      let items = raw ? JSON.parse(raw) : [];
      items.push(item);
      if (items.length > 500) items = items.slice(-500);
      await kv.put('danmaku', JSON.stringify(items));
      return json({ item: item });
    }
    return new Response('Not Found', { status: 404 });
  } catch (e) { return json({ error: e.message || String(e) }, 500); }
}
