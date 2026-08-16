# 部署到腾讯云 EdgeOne Pages（国内版 · 免费 · 前后端一体）

为什么选 EdgeOne 国内版：它是腾讯云产品，**有中国大陆节点**，别人在国内访问快且稳；
而 Cloudflare / Vercel 免费版都没有大陆节点。免费额度也很慷慨（边缘函数 100 万次/月、
KV 10GB、CDN 流量免费）。墙 / 弹幕功能完整保留，全部免费，代码在云端，**你电脑关机网站照常在线**。

---

## 你只需做 5 步（约 10 分钟）

### 1. 开通 EdgeOne（国内版）
打开 https://console.cloud.tencent.com/edgeone ，用**微信/QQ 扫码登录腾讯云主账号**（免费，不用绑卡）。
> ⚠️ 国内版必须先用该账号完成 **实名认证**（个人实名：登录后按提示上传身份证，几分钟审核，免费），
> 否则无法开通 Pages 服务、也无法绑自有域名。国际版（edgeone.ai）才不用实名——但你选了国内版，这一步省不掉。
实名完成后，左侧找到「Pages 服务」→ 立即开通。

### 2. 推代码到 GitHub
如果你还没有仓库：
- GitHub 新建仓库，比如 `liuyushan-site`。
- 把整个 `liuyushan_site/` 目录 push 上去。
  （`frontend/functions/api/` 就是后端，已经放好了，不用动。）

> 不会 push？用 PyCharm 底部 Terminal：
> `git init` → `git add .` → `git commit -m init`
> → 在 GitHub 建好空仓库后 `git remote add origin <仓库地址>` → `git push -u origin main`。

### 3. 建 KV 存储
EdgeOne 控制台 → 找到「边缘存储 / KV」（或 Pages 项目里的函数设置处）→ 创建 KV 命名空间，
命名 `liuyushan-kv`，**记下它生成的命名空间 ID**。

### 4. 部署 Pages
- 控制台 → 「Pages 服务」→ 创建项目 → 绑定 GitHub → 选你的 `liuyushan-site` 仓库。
- 构建设置：
  - 构建命令：**留空**
  - 输出目录：**`frontend`**
- 点 Deploy。
- 部署完成后，进项目 **设置 → 函数 / KV 绑定**：
  - 添加绑定：变量名填 **`MY_KV`**，命名空间选第 3 步的 `liuyushan-kv`。
  - 改完绑定后，**再点一次重新部署** 让它生效。

### 5. 访问 & 绑域名
- 部署完默认拿到 `xxx.edgeone.app`，**国内直接能开**，墙 / 弹幕都正常 ✅，不用备案。
- 想用自己域名（如 `liuyushan.top`）：在「域名」里添加，国内加速需该域名已完成 ICP 备案
  （在阿里云办）；未备案也能绑但走国际线路。备案后国内更快更稳。

---

## 架构对照
| 原架构（本地） | EdgeOne 线上 |
|---------------|--------------|
| `frontend/`（静态） | Pages 托管 |
| `backend/server.js`（/api） | `frontend/functions/api/wall.js` + `danmaku.js`（边缘函数） |
| `backend/data/*.json` | KV 命名空间（`MY_KV`） |

- 原 `backend/server.js` 仅本地测试用，线上不需要。
- 免费额度：边缘函数 100 万次/月、KV 10GB、CDN 流量免费，个人站绰绰有余。
- 边缘函数路由约定与 Cloudflare Pages Functions 一致：`functions/api/wall.js` → `/api/wall`。

---

## 备选：Cloudflare Pages
见 `DEPLOY_CLOUDFLARE.md`（无大陆节点，国内访问不如 EdgeOne，但海外更快；注册无需实名）。
