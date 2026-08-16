> **方案已改用腾讯云 EdgeOne Pages（国内版），见 `DEPLOY_EDGEONE.md`** —— EdgeOne 有中国大陆节点，
> 国内访问快且稳，免费额度更大，更适合你的需求。本文件保留作为海外备选。

# 部署到 Cloudflare（免费 · 前后端一体）

把 `liuyushan_site` 部署到 Cloudflare，前端用 Pages 托管，后端用 Pages Functions（已写好），
数据存 KV。墙 / 弹幕功能完整保留，全部免费，代码在云端，**你电脑关机网站照常在线**。

---

## 你只需要做 5 步（约 10 分钟）

### 1. 注册 Cloudflare
打开 https://dash.cloudflare.com/sign-up 注册（免费，不用绑卡）。

### 2. 把代码推到 GitHub
如果你还没有仓库：
- GitHub 新建仓库，比如 `liuyushan-site`。
- 把整个 `liuyushan_site/` 目录 push 上去。
  （`frontend/functions/api/` 就是后端，已经放好了，不用动。）

> 不会 push？用 PyCharm 底部 Terminal：`git init` → `git add .` → `git commit -m init`
> → 在 GitHub 建好空仓库后 `git remote add origin <仓库地址>` → `git push -u origin main`。

### 3. 创建 KV 存储
Cloudflare 控制台 → 左侧 **Workers & Pages** → **KV** → 创建 namespace，
命名 `liuyushan-kv`，**记下它生成的 ID**（一串字母数字）。

### 4. 部署 Pages
- 控制台 → **Workers & Pages** → **创建** → 选 **Pages** → **连接到 Git**。
- 选你的 `liuyushan-site` 仓库。
- 构建设置：
  - Framework preset：**None**
  - Build command：**留空**
  - Build output directory：**`frontend`**
- 点 Deploy。
- 部署完成后，进项目 **Settings → Functions → KV 绑定**：
  - 添加绑定：变量名填 **`MY_KV`**，命名空间选第 3 步的 `liuyushan-kv`。
  - 改完绑定后，**再点一次 Deploy（重新部署）** 让它生效。

### 5. 访问 & 绑域名（国内更稳）
- 部署完默认拿到 `xxx.pages.dev`，直接能访问，墙 / 弹幕都正常 ✅。
- 想国内更稳：在 Cloudflare 添加你的域名 `liuyushan.top`（免费，按提示把域名 NS 转到 Cloudflare），
  然后在 Pages 项目里 **Custom domains** 绑定该域名。国内直连香港边缘节点，基本稳。

---

## 架构对照
| 原架构（本地） | Cloudflare 线上 |
|---------------|----------------|
| `frontend/`（静态） | Pages 托管 |
| `backend/server.js`（/api） | `frontend/functions/api/wall.js` + `danmaku.js`（Workers） |
| `backend/data/*.json` | KV namespace（`MY_KV`） |

- 原 `backend/server.js` 仅本地测试用，线上不需要。
- 免费额度：Pages 无限静态请求、Workers 每天 10 万请求、KV 免费层，个人站绰绰有余。
