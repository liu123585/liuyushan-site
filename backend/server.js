const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', 'frontend');
const DATA = path.join(__dirname, 'data');
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const CACHEABLE = /\.(jpg|jpeg|png|gif|webp|svg|ico|woff2?|mp3)$/i;
const GZIPPABLE = /\.(html|css|js|json|svg)$/i;

function readJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { return def; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function sendJSON(res, code, obj, cache) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': cache ? 'public, max-age=60' : 'no-store'
  });
  res.end(JSON.stringify(obj));
}
function newId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

const server = http.createServer(function (req, res) {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;

  // ===================== API =====================
  if (p.indexOf('/api/') === 0) {

    if (p === '/api/wall' && req.method === 'GET') {
      let posts = readJSON(path.join(DATA, 'wall.json'), []);
      posts = posts.slice(-60).reverse();
      return sendJSON(res, 200, { posts: posts });
    }
    if (p === '/api/wall' && req.method === 'POST') {
      let body = '';
      req.on('data', function (c) { body += c; if (body.length > 1e5) req.destroy(); });
      return req.on('end', function () {
        let d; try { d = JSON.parse(body); } catch (e) { return sendJSON(res, 400, { error: 'bad json' }); }
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
        if (!post.nickname) return sendJSON(res, 400, { error: 'nickname required' });
        const posts = readJSON(path.join(DATA, 'wall.json'), []);
        posts.push(post);
        if (posts.length > 500) posts = posts.slice(-500);
        writeJSON(path.join(DATA, 'wall.json'), posts);
        return sendJSON(res, 200, { post: post });
      });
    }

    if (p === '/api/danmaku' && req.method === 'GET') {
      let items = readJSON(path.join(DATA, 'danmaku.json'), []);
      items = items.slice(-100);
      return sendJSON(res, 200, { items: items });
    }
    if (p === '/api/danmaku' && req.method === 'POST') {
      let body = '';
      req.on('data', function (c) { body += c; if (body.length > 1e4) req.destroy(); });
      return req.on('end', function () {
        let d; try { d = JSON.parse(body); } catch (e) { return sendJSON(res, 400, { error: 'bad json' }); }
        const text = String(d.text || '').trim().slice(0, 40);
        if (!text) return sendJSON(res, 400, { error: 'empty' });
        const item = { id: newId(), text: text, ts: Date.now() };
        const items = readJSON(path.join(DATA, 'danmaku.json'), []);
        items.push(item);
        if (items.length > 500) items = items.slice(-500);
        writeJSON(path.join(DATA, 'danmaku.json'), items);
        return sendJSON(res, 200, { item: item });
      });
    }

    return sendJSON(res, 404, { error: 'not found' });
  }

  // ===================== 静态文件 =====================
  let rel = p === '/' ? '/index.html' : p;
  const fp = path.join(ROOT, decodeURIComponent(rel));
  if (fp.indexOf(ROOT) !== 0) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }
  fs.stat(fp, function (err, st) {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(fp).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Access-Control-Allow-Origin': '*'
    };
    // 图片/字体/音频类长缓存（文件名即版本，可安全缓存1年）
    if (CACHEABLE.test(fp)) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else {
      // html/css/js 不缓存或短缓存，保证改动能及时生效
      headers['Cache-Control'] = 'no-cache';
    }
    const accept = req.headers['accept-encoding'] || '';
    if (GZIPPABLE.test(fp) && /gzip/.test(accept)) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      fs.createReadStream(fp).pipe(zlib.createGzip()).pipe(res);
    } else {
      res.writeHead(200, headers);
      fs.createReadStream(fp).pipe(res);
    }
  });
});

// 复用 TCP 连接，减少握手开销
server.keepAliveTimeout = 60000;
server.headersTimeout = 65000;

const PORT = process.env.PORT || 3000;
server.listen(PORT, function () {
  console.log('liuyushan_site 已启动： http://localhost:' + PORT);
});
