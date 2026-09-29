// 前端 API 地址配置 —— 部署到腾讯云 SCF / CloudBase 云函数后，把下面改成 API 网关（或 HTTP 触发）的公网地址（到 stage 前缀，不要带 /api）。
// 例：window.__API_BASE__ = 'https://xxx.apigw.tencentcs.com/release';
//     （CloudBase HTTP 触发则填它给的公网地址）
// 本地用 node server.js 调试时保持空字符串 '' 即可（同源）。
window.__API_BASE__ = '';

// ===== 高德地图 Key（立体校园地图用，免费）=====
// 1) 打开 https://lbs.amap.com/ 注册 → 控制台「应用管理」→ 创建新应用 → 添加 Key → 服务平台选「Web端(JS API)」
// 2) 把生成的 Key 填到下面；2021-12-02 之后申请的 Key 必须配合「安全密钥 jscode」，一并填到 __AMAP_SECURITY_CODE__。
//    （两个值必须来自同一个 Key，填错就会「控件可见、底图空白」。）
// 3) 控制台里这个 Key 的「域名白名单」要么留空（不限制），要么把实际访问的域名加进去。
window.__AMAP_KEY__ = '4977bc6d6d06b528e35f2115f1c8ef6f';
window.__AMAP_SECURITY_CODE__ = '14942987a7a5864b944d7e956a1f5614';
// 说明：页面走的是高德 JSAPI 2.0，安全密钥由 campus-explorer.js 在加载脚本前
// 通过 window._AMapSecurityConfig 设置（1.4.x 才用 URL 的 jscode 参数）。
