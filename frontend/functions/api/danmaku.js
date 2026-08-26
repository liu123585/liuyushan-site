// EdgeOne 边缘函数: /api/danmaku
// 数据存 KV（绑定名 KV，key = "danmaku"）

function newId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'GET') {
    let raw = await env.KV.get('danmaku');
    let items = raw ? JSON.parse(raw) : [];
    items = items.slice(-100);
    return Response.json({ items });
  }

  if (method === 'POST') {
    let d;
    try { d = await request.json(); }
    catch (e) { return Response.json({ error: 'bad json' }, { status: 400 }); }
    const text = String(d.text || '').trim().slice(0, 40);
    if (!text) return Response.json({ error: 'empty' }, { status: 400 });
    const item = { id: newId(), text: text, ts: Date.now() };
    let raw = await env.KV.get('danmaku');
    let items = raw ? JSON.parse(raw) : [];
    items.push(item);
    if (items.length > 500) items = items.slice(-500);
    await env.KV.put('danmaku', JSON.stringify(items));
    return Response.json({ item });
  }

  return new Response('Not Found', { status: 404 });
}
