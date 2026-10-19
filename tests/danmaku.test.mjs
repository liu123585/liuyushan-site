/**
 * danmaku.js 本地测试（不联网）
 * 跑法：node tests/danmaku.test.mjs
 */
const mod = await import('../functions/api/danmaku.js');
const onRequest = mod.onRequest;

let pass = 0, fail = 0;
function ok(c, name, extra) {
  if (c) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra)); }
}

function makeKV() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    _map: m
  };
}

function req(method, body, opts) {
  const o = opts || {};
  const headers = {
    'Origin': o.origin === undefined ? 'https://site.liuyushan.top' : o.origin,
    'User-Agent': o.ua === undefined ? 'Mozilla/5.0 Chrome/120' : o.ua,
    'x-forwarded-for': o.ip || '9.9.9.9'
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request('https://site.liuyushan.top/api/danmaku', {
    method,
    headers,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
}

const KV = makeKV();
const ctx = (r) => ({ request: r, env: { KV } });

/* 1. GET 空库 → 只有种子 */
console.log('\n[1] GET 空库');
{
  const res = await onRequest(ctx(req('GET')));
  const j = await res.json();
  ok(res.status === 200, '200');
  ok(j.items.length === 18, '返回 18 条种子弹幕', j.items.length);
  ok(j.items[0].text.indexOf('计算机学院') > -1, '种子内容正确');
}

/* 2. POST 正常弹幕 */
console.log('\n[2] POST 正常弹幕');
{
  const res = await onRequest(ctx(req('POST', { text: '  你好河科大  ' })));
  const j = await res.json();
  ok(res.status === 200, '200');
  ok(j.item.text === '你好河科大', '首尾空白被清掉', j.item.text);

  const res2 = await onRequest(ctx(req('GET')));
  const j2 = await res2.json();
  ok(j2.items.some((it) => it.text === '你好河科大'), '新弹幕能被读到');
}

/* 3. 蜜罐字段 */
console.log('\n[3] 蜜罐字段');
{
  const res = await onRequest(ctx(req('POST', { text: '正常内容', hp: 'i am bot' })));
  ok(res.status === 403, '蜜罐被填 → 403', res.status);
}

/* 4. 爬虫 UA / 外站 Origin */
console.log('\n[4] 爬虫与跨站');
{
  const r1 = await onRequest(ctx(req('POST', { text: 'x' }, { ua: 'python-requests/2.31' })));
  ok(r1.status === 403, 'python-requests → 403');
  const r2 = await onRequest(ctx(req('POST', { text: 'x' }, { ua: '' })));
  ok(r2.status === 403, '空 UA → 403');
  const r3 = await onRequest(ctx(req('POST', { text: 'x' }, { origin: 'https://evil.example.com' })));
  ok(r3.status === 403, '外站 Origin → 403');
  const r4 = await onRequest(ctx(req('GET', undefined, { origin: 'https://abc.edgeone.app' })));
  ok(r4.status === 200, 'EdgeOne 默认域名放行', r4.status);
}

/* 5. 频率限制：每分钟 4 条 */
console.log('\n[5] 频率限制');
{
  const ip = '7.7.7.7';
  const codes = [];
  for (let i = 0; i < 6; i++) {
    const r = await onRequest(ctx(req('POST', { text: '刷屏测试' + i }, { ip })));
    codes.push(r.status);
  }
  ok(codes.slice(0, 4).every((c) => c === 200), '前 4 条成功', codes);
  ok(codes[4] === 429, '第 5 条被限流', codes);
}

/* 6. 重复内容 */
console.log('\n[6] 重复提交');
{
  const r1 = await onRequest(ctx(req('POST', { text: '同样的话' }, { ip: '6.6.6.6' })));
  ok(r1.status === 200, '第一条通过');
  const r2 = await onRequest(ctx(req('POST', { text: '同样的话' }, { ip: '6.6.6.6' })));
  ok(r2.status === 429, '一模一样的内容被挡', r2.status);
}

/* 7. 体积限制 */
console.log('\n[7] 超大请求');
{
  const big = JSON.stringify({ text: 'x'.repeat(4000) });
  const res = await onRequest(ctx(req('POST', big, { ip: '5.5.5.5' })));
  const j = await res.json();
  ok(res.status === 413 || (res.status === 200 && j.item.text.length === 40), '过大请求被拒或截断', res.status);
}

/* 8. 脏字符清理 */
console.log('\n[8] 危险字符清理');
{
  const res = await onRequest(ctx(req('POST', { text: '<script>alert(1)</script>正常\u200b文字' }, { ip: '4.4.4.4' })));
  const j = await res.json();
  ok(res.status === 200, '200');
  ok(j.item.text.indexOf('<') === -1 && j.item.text.indexOf('>') === -1, '尖括号被剥离', j.item.text);
  ok(j.item.text.indexOf('\u200b') === -1, '零宽字符被去掉', j.item.text);
}

/* 9. 空内容 */
console.log('\n[9] 空内容');
{
  const res = await onRequest(ctx(req('POST', { text: '   ' }, { ip: '3.3.3.3' })));
  ok(res.status === 400, '空弹幕 → 400', res.status);
}

/* 10. 非法 JSON */
console.log('\n[10] 非法 JSON');
{
  const res = await onRequest(ctx(req('POST', '{oops', { ip: '2.2.2.2' })));
  ok(res.status === 400, '非法 JSON → 400', res.status);
}

console.log('\n==== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ====');
process.exit(fail ? 1 : 0);
