# 河南科技大学 · 大一新生指南（前后端分离版）

学长用 vibe coding 做的校园导航网站。静态前端 + Node 后端 API，互动数据（新生墙、弹幕）存服务端、跨访客共享。

**顶部导航切页**：整站拆成 9 个「页」（首页 / 校区 / 生活 / 入学 / 社团 / 工具箱 / 新生墙 / 互动 / AI 学长），点导航即切换、其余隐藏，不用一路往下翻。桌面端用顶部导航条，移动端用汉堡抽屉 + 底部 Tab。URL 走 `#/campus` 这种 hash，可分享、可前进后退，每页各自记忆滚动位置。

## 目录结构

```
liuyushan_site/
├── frontend/            # 前端（静态，可直接丢到任意静态服务器）
│   ├── index.html       # 单页多视图：所有「页」都在这一个文件里，靠 data-page 分组
│   ├── style.css        # 原有全站样式
│   ├── pages.css        # 切页体系：页面容器 / 首页中枢宫格 / 抽屉导航 / 底部 Tab
│   ├── assistant.css    # AI 学长对话界面
│   ├── router.js        # 切页路由（hash 路由 + 抽屉 + 高亮 + 滚动记忆）
│   ├── app.js           # 原有主逻辑：弹幕、新生墙、抽卡、BGM 等
│   ├── assistant.js     # AI 学长对话前端（SSE 流式）
│   ├── campus-explorer.js # 高德立体校园地图（进入「校区」页才初始化）
│   ├── freshman-*.js    # 倒计时 / 工具箱
│   ├── img/             # 校园图片资源
│   └── bgm/             # 背景音乐
├── functions/api/       # EdgeOne 边缘函数（线上后端）
│   ├── wall.js          # 新生墙
│   ├── danmaku.js       # 弹幕
│   └── chat.js          # AI 学长 → 转发大模型（Key 走环境变量 LLM_API_KEY）
└── backend/             # 本地调试用的 Node 服务（零依赖）
    ├── server.js        # 静态托管 + /api/*（含 /api/chat）
    └── data/            # 运行时生成：wall.json / danmaku.json
```

## 本地运行

```bash
# 需要 Node.js（>=14 即可，零 npm 依赖）
cd backend
node server.js
# 默认 http://localhost:3000
# 自定义端口： PORT=8080 node server.js
# 想本地测 AI 真回答（用智谱 GLM，glm-4.7-flash 免费）：
#   LLM_PROVIDER=zhipu LLM_API_KEY=xxx node server.js
# 用 DeepSeek 就省略 LLM_PROVIDER；不传 Key 则返回占位文本
```

启动后访问 `http://localhost:3000` 即可。

## 后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/wall`      | 获取新生墙列表（最新 60 条） |
| POST | `/api/wall`      | 发布一条新生身份卡（字段见下） |
| GET  | `/api/danmaku`   | 获取弹幕列表（最新 100 条） |
| POST | `/api/danmaku`   | 发送一条弹幕 `{text}` |
| POST | `/api/chat`      | AI 学长，SSE 流式返回 `{t:"增量文本"}`，结尾 `data: [DONE]` |

POST `/api/chat` 请求体：
```json
{ "messages": [{"role":"user","content":"宿舍几人间？"}], "page": "campus" }
```
`page` 用来告诉模型用户当前在看哪个板块，可选。

数据用 JSON 文件持久化（`backend/data/`），零数据库依赖，适合个人小站。

## AI 学长

- 前端：`assistant.js` 负责对话、流式渲染、中断、快捷提问。
- 后端：`functions/api/chat.js`（线上）/ `backend/server.js`（本地）把对话转发给大模型。
- **Key 只放服务端环境变量**，前端永远拿不到。
- 环境变量：`LLM_PROVIDER`（选填，`zhipu`/`deepseek`/`moonshot`/`dashscope`，自动套好地址和模型）+ `LLM_API_KEY`（必填）；
  也可以用 `LLM_BASE_URL` / `LLM_MODEL` 手动指定（优先级更高）。
- 任何 **OpenAI 兼容接口**都能接。智谱 GLM 用 `LLM_PROVIDER=zhipu`，默认模型 `glm-4-flash-250414`（免费且稳定）。
- 配置步骤见 `DEPLOY_EDGEONE.md` 的「步骤 5.5」。不配 Key 时页面会明确提示，不会静默失败。

## 部署到服务器（腾讯云 CVM）

1. 把整个 `liuyushan_site/` 传到服务器。
2. `cd backend && node server.js`（建议用 pm2 守护：`npm i -g pm2 && pm2 start server.js`）。
3. 域名 `liuyushan.top` 已在阿里云解析，CVM 上用 Nginx 反代 `localhost:3000` 即可；如需 HTTPS 在 Nginx 配免费 DV 证书。
4. 注意：云服务器上浏览器自动播放策略依旧需要用户首次交互才出声，页面的 BGM 播放器已做「首次点击/滚动自动起播」。

## 说明

- 本页为非官方新生指南，信息以河南科技大学官方发布为准。
- 图片与 BGM 为本地资源，离线可用；three.js 走国内镜像（baomitu）。
