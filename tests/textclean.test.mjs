/**
 * textclean.js 测试：代码回答的"去废话"清理
 * 跑法：node tests/textclean.test.mjs
 */
import stripCodeNoise from '../frontend/textclean.js';

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra)); }
}

const j = (...lines) => lines.join('\n');

/* 1. 编造的"标准库依赖"要删掉（collections 是标准库，不需要 pip install） */
console.log('\n[1] 假依赖 pip install collections');
{
  const src = j('```python', 'import collections', '```', '',
    '安装依赖命令（如果需要）：', '```bash', 'pip install collections', '```');
  const out = stripCodeNoise(src);
  ok(out.indexOf('collections') > -1, '代码本身还在');
  ok(out.indexOf('pip install') === -1, '假安装命令被删');
  ok(out.indexOf('\u0000') === -1, '没有残留占位符');
}

/* 2. 真实第三方依赖要保留 */
console.log('\n[2] 真依赖 pip install requests');
{
  const src = j('```python', 'import requests', '```', '', '需要先 pip install requests 才能跑。');
  const out = stripCodeNoise(src);
  ok(out.indexOf('pip install requests') > -1, '真依赖保留');
}

/* 3. 编译/运行步骤要删 */
console.log('\n[3] 编译与运行步骤');
{
  const src = j('```c', 'int main(){return 0;}', '```', '',
    '1. 打开文本编辑器', '2. 保存为 a.c', '3. 终端执行 gcc a.c -o a', '4. 运行 ./a');
  const out = stripCodeNoise(src);
  ok(out.indexOf('gcc') === -1, 'gcc 步骤被删');
  ok(out.indexOf('打开文本编辑器') === -1, '编辑器步骤被删');
  ok(out.indexOf('int main') > -1, '代码还在');
}

/* 4. 结尾总结要删 */
console.log('\n[4] 结尾总结');
{
  const src = j('```python', 'print(1)', '```', '', '这个脚本会统计文件数量，你可以将路径替换为你实际的文件夹。');
  const out = stripCodeNoise(src);
  ok(out.indexOf('这个脚本会') === -1, '"这个脚本会……"被删');
  ok(out.trim().endsWith('```'), '结尾干净，就是代码块');
}

/* 5. 没有代码块的普通回答，一个字都不能动 */
console.log('\n[5] 普通回答不受影响');
{
  const src = '宿舍是四人间，上床下桌。\n\n如果要装空调只有乾园能申请。';
  ok(stripCodeNoise(src) === src, '原样返回');
}

/* 6. 代码块前的说明句保留 */
console.log('\n[6] 代码块前的一句话');
{
  const src = j('下面这个脚本统计文件后缀：', '', '```python', 'print(1)', '```', '', '这个脚本会……');
  const out = stripCodeNoise(src);
  ok(out.indexOf('下面这个脚本统计文件后缀') > -1, '前置说明保留');
  ok(out.indexOf('这个脚本会') === -1, '后置废话删除');
}

/* 7. [[ask:…]] 追问标记不能被删 */
console.log('\n[7] 追问标记');
{
  const src = j('```python', 'print(1)', '```', '', '[[ask:怎么改成递归|能按大小排序吗]]');
  const out = stripCodeNoise(src);
  ok(out.indexOf('[[ask:') > -1, '追问标记保留');
}

/* 8. 多个代码块都要保留 */
console.log('\n[8] 多个代码块');
{
  const src = j('```python', 'print(1)', '```', '', '```bash', 'pip install requests', '```');
  const out = stripCodeNoise(src);
  ok((out.match(/```/g) || []).length === 4, '两个代码块共 4 个围栏', (out.match(/```/g) || []).length);
}

console.log('\n==== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ====');
process.exit(fail ? 1 : 0);
