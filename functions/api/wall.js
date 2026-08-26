// EdgeOne 边缘函数: /api/wall
// 数据存 KV（绑定名 KV，key = "wall"）

function newId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  try {
    if (method === 'GET') {
      let raw = await env.KV.get('wall');
      let posts = raw ? JSON.parse(raw) : [];
      posts = posts.slice(-60).reverse();
      return Response.json({ posts });
    }

    if (method === 'POST') {
      let d;
      try { d = await request.json(); }
      catch (e) { return Response.json({ error: 'bad json' }, { status: 400 }); }
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
      if (!post.nickname) return Response.json({ error: 'nickname required' }, { status: 400 });
      let raw = await env.KV.get('wall');
      let posts = raw ? JSON.parse(raw) : [];
      posts.push(post);
      if (posts.length > 500) posts = posts.slice(-500);
      await env.KV.put('wall', JSON.stringify(posts));
      return Response.json({ post });
    }

    return new Response('Not Found', { status: 404 });
  } catch (e) {
    return Response.json({ error: e.message || String(e) }, { status: 500 });
  }
}
