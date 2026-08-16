// 本地存储层：题库 / 背书内容 / 错题集 / 设置 / 统计 / 刷题会话
const util = require('./util');

const KEYS = {
  settings: 'bsds_settings',
  banks: 'bsds_banks',
  bank: 'bsds_bank_',
  memos: 'bsds_memos',
  memo: 'bsds_memo_',
  wrongbooks: 'bsds_wrongbooks',
  wrong: 'bsds_wrong_',
  stats: 'bsds_stats',
  daily: 'bsds_daily',
  fav: 'bsds_fav',
  qstats: 'bsds_qstats',
  session: 'bsds_session',
  firstRun: 'bsds_firstrun_v1'
};

function get(k, def) {
  try {
    const v = wx.getStorageSync(k);
    return v === '' || v == null ? def : v;
  } catch (e) { return def; }
}
function set(k, v) {
  try { wx.setStorageSync(k, v); } catch (e) { console.error('存储失败', k, e); }
}
function remove(k) {
  try { wx.removeStorageSync(k); } catch (e) { }
}

/* ---------------- 设置 ---------------- */

function defaultSettings() {
  return {
    removeAfter: 3,              // 连续做对 N 遍移出错题集（0 = 永不自动移除）
    shuffleOptions: true,        // 刷题默认：选项乱序
    shuffleQuestions: true,      // 刷题默认：题目乱序
    autoNext: false,             // 刷题默认：答对自动跳下一题（可自行选择）
    dailyGoal: 20,               // 每日刷题目标（题数，0 = 不设目标）
    ai: {
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: '',
      model: 'deepseek-chat'
    }
  };
}
function getSettings() {
  const s = get(KEYS.settings, {});
  const d = defaultSettings();
  return Object.assign({}, d, s, { ai: Object.assign({}, d.ai, s.ai || {}) });
}
function saveSettings(patch) {
  const s = Object.assign({}, getSettings(), patch);
  if (patch && patch.ai) s.ai = Object.assign({}, getSettings().ai, patch.ai);
  set(KEYS.settings, s);
  return s;
}

/* ---------------- 题库 ---------------- */

function getBanks() {
  return get(KEYS.banks, []);
}
function getBank(id) {
  const data = get(KEYS.bank + id, null);
  if (!data) return null;
  const meta = getBanks().find(b => b.id === id);
  // 合并元信息（name/total/typeStats/createdAt/source），题目在 data.questions
  return Object.assign({}, meta || {}, data);
}
function saveBank(bank) {
  // bank: {id, name, questions, typeStats, total, createdAt, source}
  const banks = getBanks();
  const meta = {
    id: bank.id, name: bank.name, total: bank.total,
    typeStats: bank.typeStats, createdAt: bank.createdAt, source: bank.source || 'import'
  };
  const idx = banks.findIndex(b => b.id === bank.id);
  if (idx >= 0) banks[idx] = meta; else banks.push(meta);
  set(KEYS.banks, banks);
  set(KEYS.bank + bank.id, { id: bank.id, questions: bank.questions });
  return meta;
}
function deleteBank(id) {
  const banks = getBanks().filter(b => b.id !== id);
  set(KEYS.banks, banks);
  remove(KEYS.bank + id);
  // 错题集中来自该题库的题保留快照，但标记题库已删除
  const wbs = getWrongBooks();
  wbs.forEach(wb => {
    const data = getWrongData(wb.id);
    let changed = false;
    data.items.forEach(it => {
      if (it.bankId === id && it.bankName) { it.bankName += '（已删除）'; changed = true; }
    });
    if (changed) set(KEYS.wrong + wb.id, data);
  });
}
function buildBank(name, questions, source) {
  const typeStats = { single: 0, multi: 0, judge: 0, fill: 0, short: 0 };
  questions.forEach(q => { if (typeStats[q.type] != null) typeStats[q.type]++; });
  return {
    id: util.uid(),
    name: name,
    questions: questions,
    typeStats: typeStats,
    total: questions.length,
    createdAt: Date.now(),
    source: source || 'import'
  };
}

/* ---------------- 背书内容 ---------------- */

function getMemos() {
  return get(KEYS.memos, []);
}
function getMemo(id) {
  const data = get(KEYS.memo + id, null);
  if (!data) return null;
  const meta = getMemos().find(m => m.id === id);
  return Object.assign({}, meta || {}, data);
}
function saveMemo(memo) {
  const memos = getMemos();
  const meta = { id: memo.id, name: memo.name, sections: memo.sections.length, createdAt: memo.createdAt, source: memo.source || 'import' };
  const idx = memos.findIndex(m => m.id === memo.id);
  if (idx >= 0) memos[idx] = meta; else memos.push(meta);
  set(KEYS.memos, memos);
  set(KEYS.memo + memo.id, { id: memo.id, sections: memo.sections });
  return meta;
}
function deleteMemo(id) {
  set(KEYS.memos, getMemos().filter(m => m.id !== id));
  remove(KEYS.memo + id);
}
// 标记今日已背（记忆曲线复习提醒用）
function markMemoReviewed(id) {
  const memos = getMemos();
  const m = memos.find(x => x.id === id);
  if (m) {
    m.reviewedAt = Date.now();
    set(KEYS.memos, memos);
  }
  return m;
}

/* ---------------- 错题集 ---------------- */

function getWrongBooks() {
  return get(KEYS.wrongbooks, []);
}
function getWrongData(bookId) {
  const d = get(KEYS.wrong + bookId, null);
  if (!d) return { id: bookId, items: [] };
  if (!d.items) d.items = [];
  return d;
}
function saveWrongData(bookId, data) {
  set(KEYS.wrong + bookId, { id: bookId, items: data.items });
}
function createWrongBook(name) {
  const wbs = getWrongBooks();
  const wb = { id: util.uid(), name: name, createdAt: Date.now() };
  wbs.push(wb);
  set(KEYS.wrongbooks, wbs);
  set(KEYS.wrong + wb.id, { id: wb.id, items: [] });
  return wb;
}
function renameWrongBook(id, name) {
  const wbs = getWrongBooks();
  const wb = wbs.find(w => w.id === id);
  if (wb) { wb.name = name; set(KEYS.wrongbooks, wbs); }
}
function deleteWrongBook(id) {
  set(KEYS.wrongbooks, getWrongBooks().filter(w => w.id !== id));
  remove(KEYS.wrong + id);
}
// 错题快照（保存原始题目，题库删除后仍可用）
function makeWrongItem(qid, bankId, bankName, question) {
  return {
    qid, bankId, bankName,
    question: JSON.parse(JSON.stringify(question)),
    wrongCount: 0,
    streak: 0,
    addedAt: Date.now(),
    lastAt: Date.now()
  };
}
// 记录一次作答：correct=true 连续对+1；false 重置连续并计错
// 返回 {action: 'none'|'added'|'updated'|'removed', streak, removeAfter}
function recordWrongResult(bookId, qid, correct, removeAfter) {
  const data = getWrongData(bookId);
  const it = data.items.find(x => x.qid === qid);
  if (!it) return { action: 'none' };
  it.lastAt = Date.now();
  if (correct) {
    it.streak = (it.streak || 0) + 1;
    if (removeAfter > 0 && it.streak >= removeAfter) {
      data.items = data.items.filter(x => x.qid !== qid);
      saveWrongData(bookId, data);
      return { action: 'removed', streak: it.streak };
    }
    saveWrongData(bookId, data);
    return { action: 'updated', streak: it.streak };
  }
  it.wrongCount = (it.wrongCount || 0) + 1;
  it.streak = 0;
  saveWrongData(bookId, data);
  return { action: 'updated', streak: 0 };
}
// 正常刷题答错 → 加入错题集（已存在则计错）
function addWrongItem(bookId, item) {
  const data = getWrongData(bookId);
  const exist = data.items.find(x => x.qid === item.qid);
  if (exist) {
    exist.wrongCount = (exist.wrongCount || 0) + 1;
    exist.streak = 0;
    exist.lastAt = Date.now();
  } else {
    item.wrongCount = 1;
    item.streak = 0;
    data.items.unshift(item);
  }
  saveWrongData(bookId, data);
}
function removeWrongItem(bookId, qid) {
  const data = getWrongData(bookId);
  data.items = data.items.filter(x => x.qid !== qid);
  saveWrongData(bookId, data);
}
function getWrongItems(bookId) {
  return getWrongData(bookId).items;
}

/* ---------------- 统计 ---------------- */

function getStats() {
  return get(KEYS.stats, { sessions: 0, answered: 0, correct: 0, wrong: 0 });
}
function addStats(result) {
  const s = getStats();
  s.sessions = (s.sessions || 0) + 1;
  s.answered = (s.answered || 0) + (result.answered || 0);
  s.correct = (s.correct || 0) + (result.correct || 0);
  s.wrong = (s.wrong || 0) + (result.wrong || 0);
  set(KEYS.stats, s);
  // 每日记录（打卡 / 趋势）
  const daily = get(KEYS.daily, {});
  const k = todayKey();
  const d = daily[k] || { answered: 0, correct: 0, sessions: 0 };
  d.answered += (result.answered || 0);
  d.correct += (result.correct || 0);
  d.sessions += 1;
  daily[k] = d;
  set(KEYS.daily, daily);
  return s;
}

/* ---------------- 每日统计（打卡/趋势/目标） ---------------- */

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function keyOf(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function todayKey() { return keyOf(new Date()); }

// 返回 {todayAnswered, todayCorrect, todaySessions, streak, week, goal}
function getDailyStats() {
  const daily = get(KEYS.daily, {});
  const goal = getSettings().dailyGoal || 0;
  const today = daily[todayKey()] || { answered: 0, correct: 0, sessions: 0 };
  // 连续打卡天数：今天没刷则从昨天起算
  let streak = 0;
  const cur = new Date();
  if (!today.sessions) cur.setDate(cur.getDate() - 1);
  for (let i = 0; i < 3650; i++) {
    if (daily[keyOf(cur)] && daily[keyOf(cur)].sessions) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else {
      break;
    }
  }
  // 近 7 天趋势（含今天）
  const labels = ['日', '一', '二', '三', '四', '五', '六'];
  const week = [];
  const base = new Date();
  base.setDate(base.getDate() - 6);
  for (let i = 0; i < 7; i++) {
    const d = daily[keyOf(base)] || { answered: 0, correct: 0 };
    week.push({
      label: labels[base.getDay()],
      answered: d.answered || 0,
      correct: d.correct || 0,
      isToday: i === 6
    });
    base.setDate(base.getDate() + 1);
  }
  const max = Math.max.apply(null, week.map(w => w.answered).concat([1]));
  week.forEach(w => { w.percent = Math.round((w.answered / max) * 100); });
  return {
    todayAnswered: today.answered || 0,
    todayCorrect: today.correct || 0,
    todaySessions: today.sessions || 0,
    streak,
    week,
    goal
  };
}

/* ---------------- 刷题会话 ---------------- */

function saveSession(session) { set(KEYS.session, session); }
function loadSession() { return get(KEYS.session, null); }
function clearSession() { remove(KEYS.session); }

/* ---------------- 首次启动内置数据 ---------------- */

function ensureBuiltinImported() {
  if (get(KEYS.firstRun, false)) return;
  try {
    const builtin = require('../data/builtin');
    const parser = require('./parser');
    builtin.QUIZ_BANKS.forEach(b => {
      const r = parser.parseQuizText(b.raw);
      if (r.questions.length) {
        saveBank(buildBank(b.name, r.questions, 'builtin'));
      }
    });
    // 全题型示例题库
    const demo = parser.parseQuizText(builtin.DEMO_QUIZ_RAW);
    if (demo.questions.length) {
      saveBank(buildBank('全题型示例', demo.questions, 'builtin'));
    }
    builtin.MEMOS.forEach(m => {
      const r = parser.parseMemoText(m.raw);
      if (r.sections.length) {
        saveMemo({
          id: util.uid(), name: m.name, sections: r.sections,
          createdAt: Date.now(), source: 'builtin'
        });
      }
    });
    set(KEYS.firstRun, true);
  } catch (e) {
    console.error('内置数据导入失败', e);
  }
}

/* ---------------- 数据总量 ---------------- */

function clearAllData() {
  remove(KEYS.banks);
  remove(KEYS.memos);
  remove(KEYS.wrongbooks);
  remove(KEYS.stats);
  remove(KEYS.daily);
  remove(KEYS.fav);
  remove(KEYS.qstats);
  remove(KEYS.session);
  // 清理所有 bank_ / memo_ / wrong_ 前缀
  try {
    const info = wx.getStorageInfoSync();
    (info.keys || []).forEach(k => {
      if (k.indexOf(KEYS.bank) === 0 || k.indexOf(KEYS.memo) === 0 || k.indexOf(KEYS.wrong) === 0) remove(k);
    });
  } catch (e) { }
  set(KEYS.firstRun, true); // 重新导入内置数据
  set(KEYS.settings, getSettings());
}

/* ---------------- 每周学习报告 ---------------- */

// 返回 {answered, rate, delta, trend, prevAnswered}：本周(近7天) vs 上周(再往前7天)
function getWeeklyReport() {
  const daily = get(KEYS.daily, {});
  const sum = (offsetDays, len) => {
    let answered = 0, correct = 0;
    for (let i = 0; i < len; i++) {
      const d = new Date();
      d.setDate(d.getDate() - offsetDays - i);
      const rec = daily[keyOf(d)];
      if (rec) { answered += rec.answered || 0; correct += rec.correct || 0; }
    }
    return { answered, correct };
  };
  const cur = sum(0, 7);
  const prev = sum(7, 7);
  const rate = cur.answered ? Math.round(cur.correct / cur.answered * 100) : 0;
  const delta = cur.answered - prev.answered;
  let trend = 'flat';
  if (prev.answered === 0 && delta > 0) trend = 'new';
  else if (delta > 0) trend = 'up';
  else if (delta < 0) trend = 'down';
  return { answered: cur.answered, rate, delta: Math.abs(delta), trend, prevAnswered: prev.answered };
}

/* ---------------- 成就系统 ---------------- */

// 返回徽章列表（实时根据数据计算）
function getAchievements() {
  const stats = getStats();
  const daily = getDailyStats();
  const favs = getFavorites();
  const banks = getBanks();
  const memos = getMemos();
  const acc = stats.answered ? Math.round(stats.correct / stats.answered * 100) : 0;
  const favCount = Object.keys(favs).length;
  const hasReview = memos.some(m => m.reviewedAt);
  return [
    { id: 'first', icon: '🌱', name: '初次刷题', desc: '完成第 1 道题', got: stats.answered >= 1, prog: Math.min(stats.answered, 1) + '/1' },
    { id: 'q50', icon: '✏️', name: '小试牛刀', desc: '累计刷 50 题', got: stats.answered >= 50, prog: Math.min(stats.answered, 50) + '/50' },
    { id: 'q100', icon: '⚔️', name: '百题斩', desc: '累计刷 100 题', got: stats.answered >= 100, prog: Math.min(stats.answered, 100) + '/100' },
    { id: 'q1000', icon: '🏆', name: '千题达人', desc: '累计刷 1000 题', got: stats.answered >= 1000, prog: Math.min(stats.answered, 1000) + '/1000' },
    { id: 's3', icon: '🔥', name: '坚持 3 天', desc: '连续打卡 3 天', got: daily.streak >= 3, prog: Math.min(daily.streak, 3) + '/3' },
    { id: 's7', icon: '💪', name: '坚持 7 天', desc: '连续打卡 7 天', got: daily.streak >= 7, prog: Math.min(daily.streak, 7) + '/7' },
    { id: 'fav5', icon: '⭐', name: '收藏家', desc: '收藏 5 道题', got: favCount >= 5, prog: Math.min(favCount, 5) + '/5' },
    { id: 'bank5', icon: '📚', name: '题海无涯', desc: '拥有 5 个题库', got: banks.length >= 5, prog: Math.min(banks.length, 5) + '/5' },
    { id: 'memo1', icon: '🧠', name: '记忆达人', desc: '完成 1 次背书标记', got: hasReview, prog: (hasReview ? 1 : 0) + '/1' },
    { id: 'acc', icon: '🎯', name: '神射手', desc: '正确率 ≥ 80%（刷满 50 题）', got: stats.answered >= 50 && acc >= 80, prog: acc + '%' }
  ];
}

/* ---------------- 数据备份 ---------------- */

// 导出全部 bsds_* 数据为 JSON 字符串
function exportAllData() {
  const data = {};
  try {
    const info = wx.getStorageInfoSync();
    (info.keys || []).forEach(k => {
      if (k.indexOf('bsds_') === 0) data[k] = wx.getStorageSync(k);
    });
  } catch (e) { }
  return JSON.stringify({ app: 'bsds', version: 1, exportedAt: Date.now(), data });
}
// 从备份 JSON 恢复（覆盖现有 bsds_* 数据），返回恢复的键数量
function importAllData(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  const data = (parsed && parsed.data) ? parsed.data : parsed;
  if (!data || typeof data !== 'object') throw new Error('备份格式不正确');
  const keys = Object.keys(data);
  let n = 0;
  keys.forEach(k => {
    if (k.indexOf('bsds_') === 0) {
      try { wx.setStorageSync(k, data[k]); n++; } catch (e) { }
    }
  });
  return n;
}

function getFavorites() {
  return get(KEYS.fav, {});
}
// 返回切换后的收藏状态
function toggleFavorite(qid) {
  const favs = getFavorites();
  if (favs[qid]) {
    delete favs[qid];
    set(KEYS.fav, favs);
    return false;
  }
  favs[qid] = Date.now();
  set(KEYS.fav, favs);
  return true;
}

/* ---------------- 每题作答记录（智能组卷/状态点） ---------------- */

function getQStats() {
  return get(KEYS.qstats, {});
}
// correct: true/false；null（不判分）不记录
function recordQuestionResult(qid, correct) {
  if (correct === null || correct === undefined || !qid) return;
  const qs = getQStats();
  const r = qs[qid] || { done: 0, correct: 0, wrong: 0, last: 0 };
  r.done++;
  r.last = Date.now();
  if (correct) r.correct++; else r.wrong++;
  qs[qid] = r;
  set(KEYS.qstats, qs);
}

module.exports = {
  KEYS,
  getSettings, saveSettings,
  getBanks, getBank, saveBank, deleteBank, buildBank,
  getMemos, getMemo, saveMemo, deleteMemo, markMemoReviewed,
  getWrongBooks, createWrongBook, renameWrongBook, deleteWrongBook,
  getWrongData, getWrongItems, addWrongItem, removeWrongItem,
  recordWrongResult, makeWrongItem,
  getStats, addStats, getDailyStats,
  getFavorites, toggleFavorite,
  getQStats, recordQuestionResult,
  getAchievements, exportAllData, importAllData,
  getWeeklyReport,
  saveSession, loadSession, clearSession,
  ensureBuiltinImported, clearAllData
};
