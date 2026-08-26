// EdgeOne 边缘函数: /api/danmaku
// 数据存 KV（绑定名 KV，key = "danmaku"）

function newId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  try {
    if (method === 'GET') {
      let raw = await env.KV.get('danmaku');
      let items = raw ? JSON.parse(raw) : [];
      items = items.slice(-100);
      return json({ items });
    }

    if (method === 'POST') {
      let d;
      try { d = await request.json(); }
      catch (e) { return json({ error: 'bad json' }, 400); }
      const text = String(d.text || '').trim().slice(0, 40);
      if (!text) return json({ error: 'empty' }, 400);
      const item = { id: newId(), text: text, ts: Date.now() };
      let raw = await env.KV.get('danmaku');
      let items = raw ? JSON.parse(raw) : [];
      items.push(item);
      if (items.length > 500) items = items.slice(-500);
      await env.KV.put('danmaku', JSON.stringify(items));
      return json({ item });
    }

    return new Response('Not Found', { status: 404 });
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
