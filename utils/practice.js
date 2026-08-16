// 刷题引擎：组卷（乱序）、判分、错题集联动
const util = require('./util');
const store = require('./store');

// 把原始题目转成"展示题"：选项按需乱序，答案以文本集合保存（乱序安全）
function prepareDisplayQuestion(question, shuffleOptions, qidOverride) {
  const dq = {
    qid: qidOverride || question.id,
    type: question.type,
    stem: question.stem,
    analysis: question.analysis || '',
    hasAnswer: !!question.hasAnswer,
    answer: JSON.parse(JSON.stringify(question.answer || {}))
  };
  if ((question.type === 'single' || question.type === 'multi') && question.options && question.options.length) {
    let opts = question.options.map(o => ({ text: o.text }));
    if (shuffleOptions) opts = util.shuffle(opts);
    // 按显示顺序重新编号：最上面永远是 A，往下依次 B、C、D…
    const KEYS = 'ABCDEFGH';
    dq.options = opts.map((o, i) => ({ key: KEYS[i] || String(i + 1), text: o.text }));
  } else {
    dq.options = [];
  }
  if (question.type === 'judge') {
    dq.options = [{ key: 'T', text: '正确' }, { key: 'F', text: '错误' }];
  }
  if (question.type === 'fill') {
    const blanks = (question.answer && question.answer.blanks) || [];
    const stemUnderscores = (question.stem.match(/_{2,}/g) || []).length;
    dq.blankCount = Math.max(blanks.length, stemUnderscores, 1);
    dq.answer.blanks = blanks;
  }
  if (question.type === 'short') {
    dq.answerText = (question.answer && question.answer.text) || '';
  }
  return dq;
}

// 判分：返回 { correct, detail } —— 基于选项文本集合，乱序安全
function gradeDisplayQuestion(dq, userAnswer) {
  const t = dq.type;
  if (t === 'single') {
    const selected = dq.options.find(o => o.key === userAnswer);
    const correctTexts = dq.answer.correctTexts || [];
    const correct = !!selected && correctTexts.indexOf(selected.text) >= 0;
    return { correct, detail: { selectedText: selected ? selected.text : '' } };
  }
  if (t === 'multi') {
    const chosen = (userAnswer || []).map(k => {
      const o = dq.options.find(x => x.key === k);
      return o ? o.text : '';
    });
    const correctTexts = (dq.answer.correctTexts || []).slice().sort();
    const chosenSorted = chosen.slice().sort();
    const correct = correctTexts.length > 0 && correctTexts.length === chosenSorted.length &&
      correctTexts.every((v, i) => v === chosenSorted[i]);
    return { correct, detail: { chosenTexts: chosen } };
  }
  if (t === 'judge') {
    const correct = dq.hasAnswer ? (userAnswer === (dq.answer.judge ? 'T' : 'F')) : null;
    return { correct: correct === null ? false : correct, detail: { manual: correct === null } };
  }
  if (t === 'fill') {
    const accepts = dq.answer.blanks || [];
    const inputs = userAnswer || [];
    const perBlank = [];
    let allCorrect = true;
    for (let i = 0; i < dq.blankCount; i++) {
      const raw = (inputs[i] || '').trim();
      const acceptList = (accepts[i] || []).map(a => util.normalizeAnswer(a)).filter(a => a !== '');
      const mine = util.normalizeAnswer(raw);
      let ok;
      if (!dq.hasAnswer) ok = null;                       // 无参考答案 → 自判
      else if (acceptList.length === 0) ok = mine !== '' ? null : false; // 有答案但空
      else ok = acceptList.indexOf(mine) >= 0;
      if (ok !== true) allCorrect = false;
      perBlank.push({ input: raw, correct: ok, accepts: accepts[i] || [] });
    }
    return { correct: allCorrect, detail: { perBlank, manual: !dq.hasAnswer } };
  }
  if (t === 'short') {
    // userAnswer: {grade: 'right'|'half'|'wrong'}
    const g = userAnswer && userAnswer.grade;
    const correct = g === 'right';
    return { correct, detail: { manual: true, grade: g || 'wrong' } };
  }
  return { correct: false, detail: {} };
}

// 组卷
// mode: 'bank' | 'wrongbook'
// opts: {bankId?, wrongBookId?, wrongBookTargetId?, types:[...], count, shuffleQuestions, shuffleOptions, removeAfter}
function buildSession(opts) {
  const mode = opts.mode;
  const settings = store.getSettings();
  const shuffleOptions = opts.shuffleOptions != null ? opts.shuffleOptions : settings.shuffleOptions;
  const shuffleQuestions = opts.shuffleQuestions != null ? opts.shuffleQuestions : settings.shuffleQuestions;
  const removeAfter = opts.removeAfter != null ? opts.removeAfter : settings.removeAfter;

  let sourceQuestions = [];
  let title = '';
  if (mode === 'bank') {
    const bank = store.getBank(opts.bankId);
    if (!bank) throw new Error('题库不存在');
    title = bank.name;
    sourceQuestions = bank.questions;
  } else {
    const wb = store.getWrongBooks().find(w => w.id === opts.wrongBookId);
    if (!wb) throw new Error('错题集不存在');
    title = '错题集·' + wb.name;
    const items = store.getWrongItems(opts.wrongBookId);
    sourceQuestions = items.map(it => {
      const q = JSON.parse(JSON.stringify(it.question));
      q.id = it.qid;
      q._wrongCount = it.wrongCount;
      q._streak = it.streak;
      return q;
    });
  }

  // 题型过滤
  let questions = sourceQuestions;
  if (opts.types && opts.types.length && opts.types.length < 5) {
    questions = questions.filter(q => opts.types.indexOf(q.type) >= 0);
  }
  if (questions.length === 0) throw new Error('没有符合条件题目');

  if (shuffleQuestions) questions = util.shuffle(questions);
  if (opts.count && opts.count > 0 && opts.count < questions.length) {
    questions = questions.slice(0, opts.count);
  }

  const displayQuestions = questions.map(q => prepareDisplayQuestion(q, shuffleOptions));

  const session = {
    id: util.uid(),
    mode,
    title,
    bankId: opts.bankId || '',
    wrongBookId: opts.wrongBookId || '',
    wrongBookTargetId: opts.wrongBookTargetId || '',
    removeAfter,
    shuffleOptions,
    shuffleQuestions,
    examMode: !!opts.examMode,
    durationSec: 0,
    questions: displayQuestions,
    index: 0,
    results: [],
    startedAt: Date.now(),
    finished: false
  };
  return session;
}

// 记录一次作答结果（含错题集联动），返回 {result, wrongAction}
function recordAnswer(session, dq, gradeResult, userAnswer) {
  const result = {
    qid: dq.qid,
    type: dq.type,
    correct: gradeResult.correct,
    userAnswer: JSON.parse(JSON.stringify(userAnswer || null)),
    detail: gradeResult.detail || {},
    stem: dq.stem,
    options: dq.options,
    answer: dq.answer,
    answerText: dq.answerText || '',
    hasAnswer: dq.hasAnswer,
    analysis: dq.analysis
  };
  session.results.push(result);

  let wrongAction = { action: 'none' };
  const removeAfter = session.removeAfter;
  // correct === null 表示"已提交、不判分"（解答题），不参与错题集自动联动
  if (gradeResult.correct === null) {
    return { result, wrongAction };
  }

  if (session.mode === 'wrongbook' && session.wrongBookId) {
    wrongAction = store.recordWrongResult(session.wrongBookId, dq.qid, gradeResult.correct, removeAfter);
  } else if (session.mode === 'bank' && session.wrongBookTargetId) {
    const exist = store.getWrongItems(session.wrongBookTargetId).find(x => x.qid === dq.qid);
    if (gradeResult.correct) {
      wrongAction = store.recordWrongResult(session.wrongBookTargetId, dq.qid, true, removeAfter);
    } else {
      if (!exist) {
        const item = store.makeWrongItem(dq.qid, session.bankId, session.title, sessionOriginQuestion(dq));
        store.addWrongItem(session.wrongBookTargetId, item);
        wrongAction = { action: 'added' };
      } else {
        wrongAction = store.recordWrongResult(session.wrongBookTargetId, dq.qid, false, removeAfter);
      }
    }
  }
  return { result, wrongAction };
}

// 从展示题还原原始题目（存错题快照用）
function sessionOriginQuestion(dq) {
  return {
    id: dq.qid,
    type: dq.type,
    stem: dq.stem,
    options: dq.options,
    answer: dq.answer,
    analysis: dq.analysis,
    hasAnswer: dq.hasAnswer
  };
}

// 会话小结（correct === null 为"已提交未判分"）
function summarizeSession(session) {
  const answered = session.results.length;
  const judged = session.results.filter(r => r.correct !== null && r.correct !== undefined);
  const correct = judged.filter(r => r.correct === true).length;
  const wrong = judged.filter(r => r.correct === false).length;
  const unjudged = answered - judged.length;
  const byType = { single: { n: 0, c: 0 }, multi: { n: 0, c: 0 }, judge: { n: 0, c: 0 }, fill: { n: 0, c: 0 }, short: { n: 0, c: 0 } };
  session.results.forEach(r => {
    if (byType[r.type]) {
      byType[r.type].n++;
      if (r.correct === true) byType[r.type].c++;
    }
  });
  session.finished = true;
  return {
    sessionId: session.id,
    title: session.title,
    mode: session.mode,
    total: session.questions.length,
    answered,
    correct,
    wrong,
    unjudged,
    durationSec: session.durationSec || 0,
    score: judged.length ? Math.round(correct / judged.length * 100) : 100,
    byType,
    results: session.results,
    questions: session.questions
  };
}

module.exports = {
  prepareDisplayQuestion,
  gradeDisplayQuestion,
  buildSession,
  recordAnswer,
  summarizeSession,
  sessionOriginQuestion
};
