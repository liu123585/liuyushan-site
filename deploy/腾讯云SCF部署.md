# liuyushan_site 部署文档（独立 SCF + API 网关 + COS）

## 为什么是这个方案
CloudBase 免费体验版**阉割了 HTTP 触发入口**（函数详情页无「触发管理」），所以放弃 CloudBase 云函数。
改用**独立腾讯云 SCF 函数计算 + API 网关（共享实例）+ COS 对象存储**：同一个腾讯云账号，HTTP 触发原生支持，全部在免费额度内。

架构：
```
前端(CloudBase 静态托管) → fetch 公网 API 地址 → SCF 云函数 liuyushan-api → COS(data/wall.json, data/danmaku.json)
```

## 费用（全部免费）
- SCF：100 万次/月调用 + 40 万 GBs 资源使用量
- API 网关共享实例：100 万次/月调用
- COS 标准存储：免费额度内（小站用不完）
- CloudBase 静态托管：1GB 容量 + 5GB/月流量

## 你已准备好的
- COS 桶：`liuyushan-1433301175`（地域 `ap-guangzhou`，私有）
- API 密钥：SecretId / SecretKey（已创建）
- 代码包：`E:\workbuddy生成的文件\liuyushan-api.zip`（已含 cos 依赖）

---

## 步骤

### 1. 建 SCF 函数
打开 `console.cloud.tencent.com/scf` → 函数服务 → **新建**
- 创建方式：**本地上传 zip**
- 函数名称：`liuyushan-api`
- 运行环境：**Nodejs 16.13** 或 18.15（任选）
- 上传文件：选 `E:\workbuddy生成的文件\liuyushan-api.zip`
- 执行方法：`index.main_handler`（默认就是这个，不用改）
- 提交

### 2. 配置环境变量
函数详情 → **函数配置 → 环境变量 → 编辑**，添加 4 个：

| key | value |
|---|---|
| `COS_SECRET_ID` | 你的 SecretId |
| `COS_SECRET_KEY` | 你的 SecretKey |
| `COS_BUCKET` | `liuyushan-1433301175` |
| `COS_REGION` | `ap-guangzhou` |

保存。

### 3. 建 API 网关触发（拿公网 URL）
函数详情 → **触发管理 → 创建触发器**
- 触发方式：**API 网关**
- 请求方法：**ANY**（或勾 GET + POST）
- 鉴权：**免鉴权**
- 提交

提交后会生成一个**公网 URL**，形如：
```
https://service-xxxxx-xxxxxx.gz.apigw.tencentcs.com/release/liuyushan-api
```
复制保存。

### 4. 填前端 API 地址
打开本地 `D:\桌面\vibe coding\liuyushan_site\frontend\api-config.js`，把空字符串换成第 3 步的 URL：
```js
window.__API_BASE__ = 'https://service-xxxxx-xxxxxx.gz.apigw.tencentcs.com/release/liuyushan-api';
```

### 5. 上传前端到静态托管 + 绑域名
- CloudBase 控制台 → **静态网站托管** → 上传 `frontend/` 整个文件夹
- 绑定自定义域名 `liuyushan.top`（阿里云 DNS 加 CNAME 指向托管地址）
- 开启 HTTPS

### 6. 验收
浏览器开 `https://liuyushan.top`，按 Ctrl+F5 强刷，测试新生墙上墙、发弹幕。

---

## 联调排错
- 前端弹幕/墙不显示：打开浏览器 F12 → Network，看 `/api/...` 请求是否 200；若跨域报错，确认函数返回头含 `Access-Control-Allow-Origin: *`（代码已加）。
- 函数报错：SCF 控制台 → 函数详情 → 日志查询，看具体错误（常见是 COS 环境变量填错或桶地域不对）。
- API 网关 404：确认触发器已创建且鉴权为「免鉴权」，URL 完整复制。
