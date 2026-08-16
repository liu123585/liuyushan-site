'use strict';

// 本地路由/CORS 验证：用内存 mock 掉腾讯云 COS，检查 4 个接口的
// 路由、入参校验、响应结构与 CORS 头是否正确。无需安装 cos-nodejs-sdk-v5。

// ---- 内存 COS mock ----
const store = {};
global.__TEST_COS__ = {
  async getObject(params) {
    const key = params.Key;
    if (!(key in store)) {
      const err = new Error('NoSuchKey');
      err.statusCode = 404;
      err.code = 'NoSuchKey';
      throw err;
    }
    return { Body: Buffer.from(store[key], 'utf8') };
  },
  async putObject(params) {
    store[params.Key] = typeof params.Body === 'string'
      ? params.Body
      : params.Body.toString('utf8');
    return { ETag: 'mock' };
  }
};

const mod = require('./index.js');
const handler = mod.main_handler;

function assert(cond, msg) {
  if (!cond) { console.error('✗ FAIL:', msg); process.exitCode = 1; }
  else { console.log('✓', msg); }
}
function parse(res) { return JSON.parse(res.body); }

(async function () {
  // 1. OPTIONS 预检
  let r = await handler({ httpMethod: 'OPTIONS', path: '/api/wall' }, {});
  assert(r.statusCode === 204, 'OPTIONS 返回 204');
  assert(r.headers['Access-Control-Allow-Origin'] === '*', 'OPTIONS 带 CORS 头');

  // 2. GET /api/wall 初始为空
  r = await handler({ httpMethod: 'GET', path: '/api/wall' }, {});
  assert(r.statusCode === 200, 'GET /api/wall 200');
  assert(parse(r).posts instanceof Array, 'GET /api/wall 返回 posts 数组');
  assert(r.headers['Access-Control-Allow-Origin'] === '*', 'GET 带 CORS 头');

  // 3. POST /api/wall 正常
  r = await handler({ httpMethod: 'POST', path: '/api/wall', body: JSON.stringify({ nickname: '小明', college: '计科院', sign: '加油' }) }, {});
  assert(r.statusCode === 200, 'POST /api/wall 200');
  assert(parse(r).post && parse(r).post.nickname === '小明', 'POST 后返回 post.nickname');
  assert(parse(r).post.id > 0, 'POST 后返回 post.id 数值');

  // 4. POST /api/wall 缺昵称 → 400
  r = await handler({ httpMethod: 'POST', path: '/api/wall', body: JSON.stringify({ sign: '没名字' }) }, {});
  assert(r.statusCode === 400 && parse(r).error === 'nickname required', 'POST 缺昵称 400');

  // 5. POST /api/wall 非法 JSON → 400
  r = await handler({ httpMethod: 'POST', path: '/api/wall', body: '{bad' }, {});
  assert(r.statusCode === 400 && parse(r).error === 'bad json', 'POST 非法 JSON 400');

  // 6. 字段长度截断
  r = await handler({ httpMethod: 'POST', path: '/api/wall', body: JSON.stringify({ nickname: '一二三四五六七八九十十一二三四五六七八九十X' }) }, {});
  assert(parse(r).post.nickname.length === 16, 'nickname 截断到 16 字');

  // 7. GET /api/wall 现在应有至少 2 条（第3、6步已各发1条）
  r = await handler({ httpMethod: 'GET', path: '/api/wall' }, {});
  assert(parse(r).posts.length >= 2, 'GET 现含已发布的 wall 记录');

  // 8. GET /api/danmaku 初始空
  r = await handler({ httpMethod: 'GET', path: '/api/danmaku' }, {});
  assert(r.statusCode === 200 && parse(r).items instanceof Array, 'GET /api/danmaku 200 + items 数组');

  // 9. POST /api/danmaku 正常
  r = await handler({ httpMethod: 'POST', path: '/api/danmaku', body: JSON.stringify({ text: '欢迎来到河科大' }) }, {});
  assert(r.statusCode === 200 && parse(r).item.text === '欢迎来到河科大', 'POST /api/danmaku 正常');

  // 10. POST /api/danmaku 空文本 → 400
  r = await handler({ httpMethod: 'POST', path: '/api/danmaku', body: JSON.stringify({ text: '   ' }) }, {});
  assert(r.statusCode === 400 && parse(r).error === 'empty', 'POST 空弹幕 400');

  // 11. 带 stage 前缀的路径也能路由（API 网关 /release 前缀）
  r = await handler({ httpMethod: 'GET', path: '/release/api/danmaku' }, {});
  assert(r.statusCode === 200, '带 /release 前缀仍能路由到 /api/danmaku');

  // 12. 未知路径 → 404
  r = await handler({ httpMethod: 'GET', path: '/api/unknown' }, {});
  assert(r.statusCode === 404, '未知 API 404');

  // 13. base64 body 解析
  const b64 = Buffer.from(JSON.stringify({ text: 'base64测试' })).toString('base64');
  r = await handler({ httpMethod: 'POST', path: '/api/danmaku', body: b64, isBase64Encoded: true }, {});
  assert(r.statusCode === 200 && parse(r).item.text === 'base64测试', 'base64 body 解析正确');

  // 14. 函数 URL / API 网关 v2 格式 GET
  r = await handler({
    version: '2.0',
    rawPath: '/api/danmaku',
    requestContext: { http: { method: 'GET', path: '/api/danmaku' } },
    headers: {},
    body: null,
    isBase64Encoded: false
  }, {});
  assert(r.statusCode === 200 && Array.isArray(parse(r).items), '函数 URL 格式 GET /api/danmaku 正常');

  // 15. 函数 URL / API 网关 v2 格式 POST
  r = await handler({
    version: '2.0',
    rawPath: '/api/wall',
    requestContext: { http: { method: 'POST', path: '/api/wall' } },
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: '函数URL', college: '云函数' }),
    isBase64Encoded: false
  }, {});
  assert(r.statusCode === 200 && parse(r).post.nickname === '函数URL', '函数 URL 格式 POST /api/wall 正常');

  // 16. 函数 URL 带 stage 前缀（如 /default/api/wall）
  r = await handler({
    version: '2.0',
    rawPath: '/default/api/wall',
    requestContext: { http: { method: 'GET', path: '/default/api/wall' } },
    headers: {},
    body: null,
    isBase64Encoded: false
  }, {});
  assert(r.statusCode === 200 && Array.isArray(parse(r).posts), '函数 URL 带 /default 前缀路由正常');

  console.log('\n全部断言完成。');
})();
