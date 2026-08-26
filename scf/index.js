'use strict';

// liuyushan_site 后端接口 —— 部署为腾讯云 SCF 云函数（函数 URL / API 网关触发）。
// 前端 fetch 公网地址 + 本文件已加 CORS 头，不受 CloudBase 免费版「Web 安全域名」限制。
//
// 兼容的事件格式：
//   1) API 网关 v1 : event.httpMethod / event.path / event.body / event.isBase64Encoded
//   2) API 网关 v2 / SCF 函数 URL : event.requestContext.http.method /
//                                    event.rawPath 或 event.requestContext.http.path /
//                                    event.body / event.isBase64Encoded
//   3) 本地测试格式 : { httpMethod, path, body }
// 返回格式：
//   { isBase64Encoded, statusCode, headers, body }
//
// 数据层：EdgeOne KV 存储。弹幕与新生墙分别以 wall 和 danmaku 两个 key 存放。
// KV 绑定在函数配置中设置，运行时通过 context.env 访问。

// 读 KV 中的 JSON 数组；key 不存在时返回空数组。
async function readList(kv, key) {
  try {
    const val = await kv.get(key, { type: 'json' });
    return Array.isArray(val) ? val : [];
  } catch (e) {
    return [];
  }
}

// 写入 KV（覆盖整份 JSON）。
async function writeList(kv, key, arr) {
  await kv.put(key, JSON.stringify(arr), { type: 'application/json' });
}

const WALL_KEY = 'wall';
const DANMAKU_KEY = 'danmaku';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
}

function ok(body, cache) {
  const headers = corsHeaders();
  if (cache) headers['Cache-Control'] = 'public, max-age=60';
  return { isBase64Encoded: false, statusCode: 200, headers: headers, body: JSON.stringify(body) };
}
function fail(statusCode, obj) {
  return { isBase64Encoded: false, statusCode: statusCode, headers: corsHeaders(), body: JSON.stringify(obj) };
}
function preflight() {
  return { isBase64Encoded: false, statusCode: 204, headers: corsHeaders(), body: '' };
}

function parseBody(event) {
  let raw = event.body;
  if (!raw) return {};
  if (event.isBase64Encoded) {
    try { raw = Buffer.from(raw, 'base64').toString('utf8'); } catch (e) { return {}; }
  }
  try { return JSON.parse(raw); } catch (e) { return null; } // null = 非法 JSON
}

// 兼容不同网关的路径前缀：只要路径以 /api/wall 或 /api/danmaku 结尾即可路由。
function apiName(p) {
  if (/\/api\/wall\/?$/.test(p)) return '/api/wall';
  if (/\/api\/danmaku\/?$/.test(p)) return '/api/danmaku';
  return null;
}

// 把 API 网关 v1 / v2 / 函数 URL / 本地测试 的事件格式统一成 { method, path, body, isBase64Encoded }
function normalizeEvent(event) {
  if (!event || typeof event !== 'object') {
    return { method: 'GET', path: '/', body: null, isBase64Encoded: false };
  }

  // API 网关 v2 / 函数 URL 格式
  const ctx = event.requestContext || {};
  const httpCtx = ctx.http || {};

  let method = event.httpMethod || httpCtx.method || 'GET';
  let path = event.path || event.rawPath || httpCtx.path || '/';
  let body = event.body;
  let isBase64 = !!event.isBase64Encoded;

  return { method: String(method).toUpperCase(), path: String(path), body: body, isBase64Encoded: isBase64 };
}

function cleanWallPayload(d) {
  const interests = (Array.isArray(d.interests) ? d.interests : [])
    .map(function (s) { return String(s).trim().slice(0, 10); })
    .filter(Boolean).slice(0, 6);
  return {
    nickname: String(d.nickname || '').trim().slice(0, 16),
    college: String(d.college || '').trim().slice(0, 20),
    major: String(d.major || '').trim().slice(0, 20),
    hometown: String(d.hometown || '').trim().slice(0, 20),
    tag: String(d.tag || '').trim().slice(0, 12),
    interests: interests,
    sign: String(d.sign || '').trim().slice(0, 50),
    ts: Date.now()
  };
}

async function getWall(kv) {
  const posts = await readList(kv, WALL_KEY);
  return ok({ posts: posts });
}

async function postWall(kv, event) {
  const d = parseBody(event);
  if (d === null) return fail(400, { error: 'bad json' });
  const post = cleanWallPayload(d);
  if (!post.nickname) return fail(400, { error: 'nickname required' });
  post.id = Date.now();
  const posts = await readList(kv, WALL_KEY);
  posts.unshift(post);
  await writeList(kv, WALL_KEY, posts.slice(0, 200)); // 只保留最新 200 条
  return ok({ post: post });
}

async function getDanmaku(kv) {
  const items = await readList(kv, DANMAKU_KEY);
  return ok({ items: items });
}

async function postDanmaku(kv, event) {
  const d = parseBody(event);
  if (d === null) return fail(400, { error: 'bad json' });
  const text = String(d.text || '').trim().slice(0, 40);
  if (!text) return fail(400, { error: 'empty' });

  const item = { id: Date.now(), text: text, ts: Date.now() };
  const items = await readList(kv, DANMAKU_KEY);
  items.unshift(item);
  await writeList(kv, DANMAKU_KEY, items.slice(0, 300)); // 只保留最新 300 条
  return ok({ item: item });
}

async function dispatch(kv, rawEvent) {
  const event = normalizeEvent(rawEvent);
  const method = event.method;
  if (method === 'OPTIONS') return preflight(); // 浏览器 CORS 预检
  const p = event.path || '/';
  const name = apiName(p);
  if (!name) return fail(404, { error: 'not found' });

  try {
    if (name === '/api/wall') {
      if (method === 'GET') return await getWall(kv);
      if (method === 'POST') return await postWall(kv, event);
      return fail(405, { error: 'method not allowed' });
    }
    // /api/danmaku
    if (method === 'GET') return await getDanmaku(kv);
    if (method === 'POST') return await postDanmaku(kv, event);
    return fail(405, { error: 'method not allowed' });
  } catch (e) {
    const detail = String((e && e.message) || e);
    return fail(500, { error: 'server error', detail: detail });
  }
}

// EdgeOne SCF 入口：从 context.env 获取 KV 绑定
async function main_handler(event, context) {
  // EdgeOne KV 通过 context.env.KV 访问（需在函数配置中绑定 KV 命名空间）
  const kv = context.env && context.env.KV;
  if (!kv) {
    return fail(500, { error: 'KV not configured', detail: '请在 EdgeOne 函数配置中绑定 KV 命名空间' });
  }
  return await dispatch(kv, event);
}
exports.main_handler = main_handler;
exports.main = main_handler;
