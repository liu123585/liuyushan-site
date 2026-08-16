# 河南科技大学 · 大一新生指南（前后端分离版）

学长用 vibe coding 做的校园导航网站。静态前端 + Node 后端 API，互动数据（新生墙、弹幕）存服务端、跨访客共享。

## 目录结构

```
liuyushan_site/
├── frontend/            # 前端（静态，可直接丢到任意静态服务器）
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── img/             # 校园图片资源
│   └── bgm/             # 背景音乐 bgm.mp3
└── backend/             # 后端（Node.js，零依赖）
    ├── server.js        # http 服务：静态托管 + /api 接口
    └── data/            # 运行时生成：wall.json / danmaku.json
```

## 本地运行

```bash
# 需要 Node.js（>=14 即可，零 npm 依赖）
cd backend
node server.js
# 默认 http://localhost:3000
# 自定义端口： PORT=8080 node server.js
```

启动后访问 `http://localhost:3000` 即可。

## 后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/wall`      | 获取新生墙列表（最新 60 条） |
| POST | `/api/wall`      | 发布一条新生身份卡（字段见下） |
| GET  | `/api/danmaku`   | 获取弹幕列表（最新 100 条） |
| POST | `/api/danmaku`   | 发送一条弹幕 `{text}` |

POST `/api/wall` 请求体示例：
```json
{
  "nickname": "喵",
  "college": "信息工程学院",
  "major": "物联网工程",
  "hometown": "河南郑州",
  "tag": "INFP",
  "interests": ["篮球", "摄影"],
  "sign": "希望在科大遇见有趣的人"
}
```

数据用 JSON 文件持久化（`backend/data/`），零数据库依赖，适合个人小站。

## 部署到服务器（腾讯云 CVM）

1. 把整个 `liuyushan_site/` 传到服务器。
2. `cd backend && node server.js`（建议用 pm2 守护：`npm i -g pm2 && pm2 start server.js`）。
3. 域名 `liuyushan.top` 已在阿里云解析，CVM 上用 Nginx 反代 `localhost:3000` 即可；如需 HTTPS 在 Nginx 配免费 DV 证书。
4. 注意：云服务器上浏览器自动播放策略依旧需要用户首次交互才出声，页面的 BGM 播放器已做「首次点击/滚动自动起播」。

## 说明

- 本页为非官方新生指南，信息以河南科技大学官方发布为准。
- 图片与 BGM 为本地资源，离线可用；three.js 走国内镜像（baomitu）。
