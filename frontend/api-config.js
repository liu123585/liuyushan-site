// 前端 API 地址配置 —— 部署到腾讯云 SCF / CloudBase 云函数后，把下面改成 API 网关（或 HTTP 触发）的公网地址（到 stage 前缀，不要带 /api）。
// 例：window.__API_BASE__ = 'https://xxx.apigw.tencentcs.com/release';
//     （CloudBase HTTP 触发则填它给的公网地址）
// 本地用 node server.js 调试时保持空字符串 '' 即可（同源）。
window.__API_BASE__ = '';
