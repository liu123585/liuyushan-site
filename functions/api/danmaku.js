/* 展示基线：早于此刻的历史弹幕不再返回。
   用途一：清空历史（把值改大到当前时间即可）；
   用途二：屏蔽误发的脏数据（例如联调时发的"测试"串）。 */
const SINCE = 1790681900000;

/* 内置种子弹幕：KV 被清空/换绑时，墙上也不会显得一个人都没有。
   id 固定且很小，前端按 id 增量拉取时只在首次加载收到一次，不会重复刷屏。 */
const SEED = [
  { id: 1,  text: '有没有计算机学院的群呀，想早点找到组织', ts: SINCE + 1000 },
  { id: 2,  text: '军训要准备啥？过来人给点建议', ts: SINCE + 2000 },
  { id: 3,  text: '快递到学校地址怎么写啊，我的被子还在路上', ts: SINCE + 3000 },
  { id: 4,  text: '开元到西苑骑车大概要多久', ts: SINCE + 4000 },
  { id: 5,  text: '食堂哪家好吃，求不踩雷推荐', ts: SINCE + 5000 },
  { id: 6,  text: '学校里有共享单车吗', ts: SINCE + 6000 },
  { id: 7,  text: '刚下高铁，学校迎接点的车几点收班', ts: SINCE + 7000 },
  { id: 8,  text: '选课系统怎么进，有没有教程', ts: SINCE + 8000 },
  { id: 9,  text: '洛阳的秋天是不是特别短', ts: SINCE + 9000 },
  { id: 10, text: '图书馆自习位真的好难抢', ts: SINCE + 10000 },
  { id: 11, text: '有没有同专业的同学冒个泡', ts: SINCE + 11000 },
  { id: 12, text: '明天早上一起去操场跑圈？', ts: SINCE + 12000 },
  { id: 13, text: '舍友都还没到，一个人在宿舍有点慌', ts: SINCE + 13000 },
  { id: 14, text: '第一次离家这么远，大家都要加油呀', ts: SINCE + 14000 },
  { id: 15, text: '学校附近哪买生活用品划算', ts: SINCE + 15000 },
  { id: 16, text: '学姐说开学第一周最轻松哈哈哈', ts: SINCE + 16000 },
  { id: 17, text: '宿舍墙上能贴东西吗，想贴点照片', ts: SINCE + 17000 },
  { id: 18, text: '谁懂啊，行李收拾到怀疑人生', ts: SINCE + 18000 },
];

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
      if (!Array.isArray(items)) items = [];
      // 过掉基线之前的历史（清空历史 / 屏蔽脏数据），再拼上种子
      items = items.filter((it) => it && typeof it.text === 'string' && it.ts >= SINCE);
      return json({ items: SEED.concat(items).slice(-100) });
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
