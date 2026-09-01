// 前端 API 地址配置 —— 部署到腾讯云 SCF / CloudBase 云函数后，把下面改成 API 网关（或 HTTP 触发）的公网地址（到 stage 前缀，不要带 /api）。
// 例：window.__API_BASE__ = 'https://xxx.apigw.tencentcs.com/release';
//     （CloudBase HTTP 触发则填它给的公网地址）
// 本地用 node server.js 调试时保持空字符串 '' 即可（同源）。
window.__API_BASE__ = '';

// ===== 高德地图 Key（立体校园地图用，免费）=====
// 1) 打开 https://lbs.amap.com/ 注册 → 控制台「应用管理」→ 创建新应用 → 添加 Key → 服务平台选「Web端(JS API)」
// 2) 把生成的 Key 填到下面；2021-12 之后申请的 Key 还会给一个「安全密钥 jscode」，一并填到 __AMAP_SECURITY_CODE__
window.__AMAP_KEY__ = '4977bc6d6d06b528e35f2115f1c8ef6f';
window.__AMAP_SECURITY_CODE__ = '14942987a7a5864b944d7e956a1f5614';
