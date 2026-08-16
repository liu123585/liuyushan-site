# liuyushan.top 部署到腾讯云 CVM 实战步骤

> 目标：把 `liuyushan_site/` 传到你的腾讯云 CVM，用 Nginx 反代 + Node 跑起来，
> 域名 `liuyushan.top`（阿里云解析）指向 CVM 公网 IP，配免费 HTTPS 证书。

---

## 0. 前提确认

- 腾讯云 CVM 一台，公网 IP 已知（比如 `1.2.3.4`）
- 阿里云 `liuyushan.top` 域名能改解析（A 记录指向 CVM 公网 IP）
- 本地（这台 Windows）能 SSH 到 CVM（用 PowerShell 的 `ssh` 即可，Win10+ 自带 OpenSSH）
- CVM 上装好 Node.js（>=14，零 npm 依赖，不用 `npm install`）

---

## 1. 把工程传到 CVM

本地 PowerShell 执行（把 `root@1.2.3.4` 换成你的真实 SSH 地址）：

```powershell
# 在 D:/桌面/liuyushan_site 的父目录执行，整体打包
cd D:/桌面
Compress-Archive -Path liuyushan_site -DestinationPath liuyushan_site.zip

# 上传到 CVM 的 /opt
scp liuyushan_site.zip root@1.2.3.4:/opt/

# 登录 CVM
ssh root@1.2.3.4
```

登录后解压：

```bash
cd /opt
unzip liuyushan_site.zip
# 最终代码在 /opt/liuyushan_site/
```

> 如果 `unzip` 没装：`apt install -y unzip`（Ubuntu/Debian）或 `yum install -y unzip`（CentOS）。

---

## 2. 启动 Node 服务（二选一）

### 方案 A：systemd（推荐，开机自启、崩溃自动拉起）

```bash
# 把本仓库 deploy/haust-site.service 传到 /etc/systemd/system/
scp D:/桌面/liuyushan_site/deploy/haust-site.service root@1.2.3.4:/etc/systemd/system/

# 在 CVM 上：先确认 node 真实路径
which node          # 比如 /usr/bin/node，若不同就改 service 文件里的 ExecStart

sudo systemctl daemon-reload
sudo systemctl enable haust-site
sudo systemctl start haust-site
sudo systemctl status haust-site    # 看到 active(running) 就对了
```

### 方案 B：pm2（更简单，但要先装）

```bash
npm i -g pm2
cd /opt/liuyushan_site/backend
pm2 start server.js --name liuyushan
pm2 save
pm2 startup        # 按它提示的命令执行，实现开机自启
```

验证 Node 本身在跑：
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
# 返回 200 说明 Node 服务正常
```

---

## 3. 配置 Nginx 反代

```bash
# 安装 Nginx（没装的话）
apt install -y nginx        # Ubuntu/Debian
# 或 yum install -y nginx    # CentOS

# 把本仓库 deploy/nginx-liuyushan.conf 内容写到 conf.d
# 可以直接 scp 上去，或手动 vim 粘贴
scp D:/桌面/liuyushan_site/deploy/nginx-liuyushan.conf root@1.2.3.4:/etc/nginx/conf.d/liuyushan.conf

# 检查配置并重启
sudo nginx -t
sudo systemctl reload nginx      # 或 sudo systemctl restart nginx
```

此时用 `http://1.2.3.4`（CVM 公网 IP）应该能打开网站（还没 https，浏览器标「不安全」是正常的）。

---

## 4. 域名解析（阿里云）

1. 登录阿里云控制台 → 云解析 DNS → `liuyushan.top`
2. 把 **A 记录**指向你的 CVM 公网 IP（`1.2.3.4`）
3. 等几分钟（TTL 生效），本地 `ping liuyushan.top` 看到 CVM 的 IP 即生效

> 易踩坑：DNS 没指向新 IP / 改了但 TTL 没过，会一直访问旧站。改完多等几分钟、并用 `ping` 确认。

---

## 5. 申请免费 HTTPS 证书

### 方式一：certbot（最常用，自动续期）

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d liuyushan.top -d www.liuyushan.top
# 按提示填邮箱、同意条款；证书会自动签发并写进 Nginx 配置
```

certbot 会自动帮你把 80→443 重定向也配好。

### 方式二：腾讯云/阿里云免费 DV 证书

1. 在云厂商 SSL 证书控制台申请「免费 DV 证书」（绑定 `liuyushan.top`）
2. 下载 Nginx 格式（含 `.pem` + `.key`），上传到 CVM，比如 `/etc/ssl/liuyushan/`
3. 把 `nginx-liuyushan.conf` 里 `ssl_certificate` / `ssl_certificate_key` 改成你的路径
4. 取消 80 段里 `return 301` 那行注释，让它跳 https
5. `sudo nginx -t && sudo systemctl reload nginx`

---

## 6. 最终验证

- 浏览器开 `https://liuyushan.top`，**Ctrl+F5 强刷**，确认是新站内容（不是旧缓存）
- 试一下：填新生墙身份卡上墙、发弹幕、点西苑卡片跳转推文、BGM 播放
- 检查锁头标志（https 生效）

---

## 7. 常见坑

| 现象 | 原因 | 解决 |
|------|------|------|
| 访问还是旧站 | DNS 未指向新 IP / CDN 缓存 | `ping` 确认 IP；清 CDN/浏览器缓存强刷 |
| 页面能开但上墙/弹幕报错 | Node 没起 / 端口不对 | `systemctl status haust-site` 看日志；确认 3000 在跑 |
| 标「不安全」 | 还没配 SSL | 走第 5 步申请证书 |
| 502 Bad Gateway | Nginx 起了但 Node 没起 / 端口错 | `curl 127.0.0.1:3000` 测 Node；确认 service 里 PORT=3000 |
| BGM 不自动响 | 浏览器策略要首次交互 | 正常，点一下页面或滚动即起播 |

---

## 8. 更新代码

以后改了前端，只需重新上传 `frontend/` 并重启 Node：

```bash
# 本地改完，重新传 frontend
scp -r D:/桌面/liuyushan_site/frontend/* root@1.2.3.4:/opt/liuyushan_site/frontend/
# CVM 上重启服务
sudo systemctl restart haust-site      # 或 pm2 restart liuyushan
```

> 注意：`backend/data/` 是运行时数据（新生墙/弹幕），重新传整包会清空。
> 只更新前端就只传 frontend/，别覆盖 data/。
