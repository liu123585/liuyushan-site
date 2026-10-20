/**
 * 代码回答的"去废话"清理。
 *
 * 背景：小模型（glm-4-flash）即便被反复要求"只给代码"，仍会在代码块后面补一堆东西：
 *   「安装依赖：pip install collections」（collections 是标准库，纯属编造）
 *   「这个脚本会统计……你可以将路径替换为你实际的文件夹」
 *   「要运行请先打开终端，执行 gcc hello.c -o hello」
 * 光靠提示词不保险，所以渲染前再做一次确定性过滤：
 *   · 代码块本身一个字不动；
 *   · 代码块之后的内容，只保留真正的第三方依赖安装命令，其余全部丢弃。
 *
 * 用法：stripCodeNoise(text) → 清理后的文本。文本里没有完整代码块时原样返回。
 */
(function (root) {
  /* 这些都是标准库，模型常编成 pip install xxx，必须当废话 */
  var STDLIB = [
    'os', 'sys', 'json', 're', 'math', 'time', 'datetime', 'collections', 'itertools',
    'functools', 'pathlib', 'random', 'string', 'typing', 'shutil', 'subprocess',
    'threading', 'socket', 'csv', 'io', 'unittest', 'logging', 'argparse', 'glob',
    'hashlib', 'base64', 'tempfile', 'statistics', 'queue', 'heapq', 'bisect',
    'stdio', 'stdlib', 'iostream', 'vector', 'algorithm', 'ctypes', 'urllib'
  ];

  var INSTALL_RE = /(?:pip3?\s+install|npm\s+(?:i|install)|yarn\s+add|pnpm\s+add|apt(?:-get)?\s+install|brew\s+install|go\s+get|gem\s+install|cargo\s+add)\s+([a-zA-Z0-9_@/.\-]+)/gi;

  /** 这段里是不是真有第三方依赖要装（包名不在标准库列表里） */
  function isRealDep(seg) {
    var m;
    INSTALL_RE.lastIndex = 0;
    while ((m = INSTALL_RE.exec(seg)) !== null) {
      var name = String(m[1] || '').toLowerCase().replace(/^.*\//, '');
      if (name && STDLIB.indexOf(name) === -1) return true;
    }
    return false;
  }

  function stripCodeNoise(raw) {
    var text = String(raw == null ? '' : raw).trim();
    var first = text.indexOf('```');
    if (first === -1) return text;

    var before = text.slice(0, first).trim();
    var rest = text.slice(first);

    /* 代码块内部可能有空行，先整块换成占位符，免得被段落切分切碎 */
    var blocks = [];
    var guarded = rest.replace(/```[\s\S]*?```/g, function (m) {
      blocks.push(m);
      return '\u0000B' + (blocks.length - 1) + '\u0000';
    });

    /* 第一个代码块之后：只留完整代码块和真实的第三方安装命令，其余全丢 */
    var out = [];
    guarded.split(/\n{2,}/).forEach(function (seg) {
      var s = seg.trim();
      if (!s) return;
      if (s.indexOf('\u0000B') === 0) { out.push(s); return; }
      // [[ask:…]] / [[note:…]] 这类给前端用的标记必须留住，否则追问按钮和记忆就没了
      if (s.indexOf('[[') !== -1) { out.push(s); return; }
      if (isRealDep(s)) out.push(s);
    });

    var body = out.join('\n\n').replace(/\u0000B(\d+)\u0000/g, function (all, n) {
      return blocks[Number(n)];
    });

    return (before ? before + '\n\n' : '') + body;
  }

  root.stripCodeNoise = stripCodeNoise;
  if (typeof module !== 'undefined' && module.exports) module.exports = stripCodeNoise;
})(typeof self !== 'undefined' ? self : this);
