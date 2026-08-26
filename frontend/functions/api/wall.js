// EdgeOne 边缘函数: /api/wall
// 数据存 KV（绑定名 KV，key = "wall"）

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
      let raw = await env.KV.get('wall');
      let posts = raw ? JSON.parse(raw) : [];
      posts = posts.slice(-60).reverse();
      return json({ posts });
    }

    if (method === 'POST') {
      let d;
      try { d = await request.json(); }
      catch (e) { return json({ error: 'bad json' }, 400); }
      const post = {
        id: newId(),
        nickname: String(d.nickname || '').trim().slice(0, 16),
        college: String(d.college || '').trim().slice(0, 20),
        major: String(d.major || '').trim().slice(0, 20),
        hometown: String(d.hometown || '').trim().slice(0, 20),
        tag: String(d.tag || '').trim().slice(0, 12),
        interests: (Array.isArray(d.interests) ? d.interests : [])
          .map(function (s) { return String(s).trim().slice(0, 10); })
          .filter(Boolean).slice(0, 6),
        sign: String(d.sign || '').trim().slice(0, 50),
        ts: Date.now()
      };
      if (!post.nickname) return json({ error: 'nickname required' }, 400);
      let raw = await env.KV.get('wall');
      let posts = raw ? JSON.parse(raw) : [];
      posts.push(post);
      if (posts.length > 500) posts = posts.slice(-500);
      await env.KV.put('wall', JSON.stringify(posts));
      return json({ post });
    }

    return new Response('Not Found', { status: 404 });
  } catch (e) {
    return json({ error: e.message || String(e) }, 500);
  }
}
