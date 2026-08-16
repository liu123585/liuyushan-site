#!/bin/bash
# liuyushan_site 启动脚本（自动探测宝塔安装的 node，无需手写版本号）
NODE_BIN=$(ls /www/server/nodejs/*/bin/node 2>/dev/null | head -1)
[ -z "$NODE_BIN" ] && NODE_BIN=$(command -v node)
if [ -z "$NODE_BIN" ]; then
  echo "未找到 node，请先在宝塔软件商店安装 Node.js 版本管理器"
  exit 1
fi
cd "$(dirname "$0")"
exec "$NODE_BIN" server.js
