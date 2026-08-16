// 通用工具函数
function uid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Fisher-Yates 洗牌（返回新数组）
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function formatDate(ts) {
  const d = new Date(ts);
  const p = n => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

const TYPE_NAMES = {
  single: '单选题',
  multi: '多选题',
  judge: '判断题',
  fill: '填空题',
  short: '解答题'
};
const TYPE_ORDER = ['single', 'multi', 'judge', 'fill', 'short'];

// 全角转半角 + 小写 + 去空白（用于答案比对）
function normalizeAnswer(s) {
  if (s == null) return '';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c === 0x3000) { out += ' '; continue; }
    if (c >= 0xFF01 && c <= 0xFF5E) { c -= 0xFEE0; }
    out += String.fromCharCode(c);
  }
  return out.toLowerCase().replace(/[\s\u00A0]+/g, '');
}

// 判断题答案归一化：返回 true(对)/false(错)/null
function normalizeJudge(s) {
  const v = normalizeAnswer(String(s || ''));
  if (/^(对|正确|√|是|yes|true|t|a|y)$/.test(v)) return true;
  if (/^(错|错误|×|否|no|false|f|b|n)$/.test(v)) return false;
  return null;
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

module.exports = { uid, shuffle, formatDate, TYPE_NAMES, TYPE_ORDER, normalizeAnswer, normalizeJudge, clamp };
