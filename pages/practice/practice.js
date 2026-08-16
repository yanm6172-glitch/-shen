const store = require('../../utils/store');
const practice = require('../../utils/practice');

const TYPE_NAMES = { single: '单选', multi: '多选', judge: '判断', fill: '填空', short: '解答' };

Page({
  data: {
    title: '',
    index: 0,
    total: 0,
    progress: 0,
    correctCount: 0,
    dq: null,
    phase: 'answer',          // answer | manual | graded
    selected: '',
    multiSelected: {},
    judgeChoice: '',
    fillInputs: [],
    shortText: '',
    optionStates: {},         // key -> normal|correct|wrong|dim
    fillStates: [],
    gradeMsg: '',
    wrongActionMsg: '',
    correctAnswerText: '',
    hasAnswer: true,
    lastResult: null,
    canAddShortWrong: false,
    canRemoveShortWrong: false
  },
  onUnload() {
    if (this.autoNextTimer) clearTimeout(this.autoNextTimer);
  },
  onLoad() {
    const session = store.loadSession();
    if (!session || session.questions.length === 0) {
      wx.showToast({ title: '没有进行中的刷题', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.session = session;
    this.renderCurrent();
  },
  renderCurrent() {
    const s = this.session;
    const dq = s.questions[s.index];
    const optionStates = {};
    (dq.options || []).forEach(o => { optionStates[o.key] = 'normal'; });
    this.setData({
      title: s.title,
      index: s.index,
      total: s.questions.length,
      progress: Math.round(s.index / s.questions.length * 100),
      correctCount: s.results.filter(r => r.correct).length,
      dq,
      phase: 'answer',
      selected: '',
      multiSelected: {},
      judgeChoice: '',
      fillInputs: new Array(dq.blankCount || 1).fill('').map((v, i) => ({ id: 'f' + i, value: '' })),
      shortText: '',
      optionStates,
      fillStates: [],
      gradeMsg: '',
      wrongActionMsg: '',
      correctAnswerText: this.answerTextOf(dq),
      hasAnswer: dq.hasAnswer,
      canAddShortWrong: false,
      canRemoveShortWrong: false
    });
  },
  answerTextOf(dq) {
    const a = dq.answer || {};
    if (dq.type === 'single' || dq.type === 'multi') {
      return (a.correctTexts || []).map(t => '「' + t + '」').join('、') || (a.letters || []).join('');
    }
    if (dq.type === 'judge') return dq.hasAnswer ? (a.judge ? '对' : '错') : '';
    if (dq.type === 'fill') {
      const parts = (a.blanks || []).map((b, i) => '第' + (i + 1) + '空：' + ((b && b.length) ? b.join(' / ') : '？'));
      return parts.join('　');
    }
    return dq.answerText || '';
  },
  /* ---------- 作答交互 ---------- */
  tapOption(e) {
    if (this.data.phase !== 'answer') return;
    const key = e.currentTarget.dataset.key;
    if (this.data.dq.type === 'single') {
      this.setData({ selected: key });
      if (this.data.dq.hasAnswer) this.grade(key);
      else this.enterManual();
    } else {
      const multiSelected = Object.assign({}, this.data.multiSelected);
      multiSelected[key] = !multiSelected[key];
      this.setData({ multiSelected });
    }
  },
  tapJudge(e) {
    if (this.data.phase !== 'answer') return;
    const key = e.currentTarget.dataset.key;
    this.setData({ judgeChoice: key });
    if (this.data.dq.hasAnswer) this.grade(key);
    else this.enterManual();
  },
  confirmMulti() {
    if (this.data.phase !== 'answer') return;
    const keys = Object.keys(this.data.multiSelected).filter(k => this.data.multiSelected[k]);
    if (keys.length === 0) {
      wx.showToast({ title: '请先选择答案', icon: 'none' });
      return;
    }
    this.setData({ selected: keys.join('') });
    if (this.data.dq.hasAnswer) this.grade(keys);
    else this.enterManual();
  },
  fillInput(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const fillInputs = this.data.fillInputs.map((f, i) =>
      i === idx ? { id: f.id, value: e.detail.value } : f
    );
    this.setData({ fillInputs });
  },
  confirmFill() {
    if (this.data.phase !== 'answer') return;
    const inputs = this.data.fillInputs.map(f => f.value || '');
    this.setData({ selected: inputs.join('｜') });
    if (this.data.dq.hasAnswer) this.grade(inputs);
    else this.enterManual();
  },
  shortInput(e) {
    this.setData({ shortText: e.detail.value });
  },
  // 解答题：只提交，不判对错
  submitShort() {
    if (this.data.phase !== 'answer') return;
    const text = (this.data.shortText || '').trim();
    if (!text) {
      wx.showToast({ title: '请先写下答案再提交', icon: 'none' });
      return;
    }
    const g = { correct: null, detail: { unjudged: true, grade: 'submit' } };
    this.finishGrade(g, { grade: 'submit', text });
  },
  // 解答题提交后手动加入错题集
  addShortWrong() {
    const s = this.session;
    const dq = this.data.dq;
    if (s.mode === 'wrongbook') return;
    if (!s.wrongBookTargetId) {
      wx.showToast({ title: '请先在刷题设置里选择错题去向', icon: 'none' });
      return;
    }
    const exist = store.getWrongItems(s.wrongBookTargetId).find(x => x.qid === dq.qid);
    if (exist) {
      wx.showToast({ title: '已在错题集中', icon: 'none' });
      return;
    }
    store.addWrongItem(s.wrongBookTargetId, store.makeWrongItem(dq.qid, s.bankId, s.title, practice.sessionOriginQuestion(dq)));
    wx.showToast({ title: '已加入错题集', icon: 'success' });
    this.setData({ canAddShortWrong: false });
  },
  // 错题集模式下的解答题：手动移出错题集
  removeShortWrong() {
    const s = this.session;
    if (s.mode !== 'wrongbook' || !s.wrongBookId) return;
    store.removeWrongItem(s.wrongBookId, this.data.dq.qid);
    wx.showToast({ title: '已移出错题集', icon: 'success' });
    this.setData({ canRemoveShortWrong: false });
  },
  /* ---------- 无参考答案：自判 ---------- */
  enterManual() {
    this.setData({ phase: 'manual' });
  },
  selfGrade(e) {
    if (this.data.phase !== 'manual') return;
    const grade = e.currentTarget.dataset.grade; // right | wrong
    const g = { correct: grade === 'right', detail: { manual: true, grade } };
    this.finishGrade(g, this.userAnswerOf());
  },
  userAnswerOf() {
    const dq = this.data.dq;
    if (dq.type === 'single' || dq.type === 'judge') return this.data.selected || this.data.judgeChoice;
    if (dq.type === 'multi') return Object.keys(this.data.multiSelected).filter(k => this.data.multiSelected[k]);
    if (dq.type === 'fill') return this.data.fillInputs.map(f => f.value || '');
    if (dq.type === 'short') return { grade: 'submit', text: this.data.shortText };
    return null;
  },
  /* ---------- 判分 ---------- */
  grade(userAnswer) {
    const g = practice.gradeDisplayQuestion(this.data.dq, userAnswer);
    this.finishGrade(g, userAnswer);
  },
  finishGrade(g, userAnswer) {
    const dq = this.data.dq;
    const { result, wrongAction } = practice.recordAnswer(this.session, dq, g, userAnswer);
    store.saveSession(this.session);

    // 计算展示状态
    const optionStates = {};
    (dq.options || []).forEach(o => { optionStates[o.key] = 'dim'; });
    const correctTexts = (dq.answer && dq.answer.correctTexts) || [];
    if (dq.type === 'single' || dq.type === 'multi') {
      correctTexts.forEach(t => {
        const o = dq.options.find(x => x.text === t);
        if (o) optionStates[o.key] = 'correct';
      });
      const chosen = dq.type === 'single' ? [userAnswer] : (userAnswer || []);
      chosen.forEach(k => {
        const o = dq.options.find(x => x.key === k);
        if (o && optionStates[o.key] !== 'correct') optionStates[o.key] = 'wrong';
      });
    }
    let fillStates = [];
    if (dq.type === 'fill' && g.detail && g.detail.perBlank) {
      fillStates = g.detail.perBlank.map(p => p.correct === true ? 'ok' : (p.correct === false ? 'bad' : 'neutral'));
    }

    let wrongActionMsg = '';
    if (wrongAction.action === 'added') wrongActionMsg = '📕 已加入错题集';
    else if (wrongAction.action === 'removed') wrongActionMsg = '🎉 连续做对 ' + wrongAction.streak + ' 遍，已移出错题集！';
    else if (wrongAction.action === 'updated') {
      wrongActionMsg = g.correct
        ? (this.session.removeAfter > 0 ? '✅ 连续做对 ' + wrongAction.streak + ' / ' + this.session.removeAfter + ' 遍（做对' + this.session.removeAfter + '遍移除）' : '✅ 做对了')
        : '❌ 答错了，连续做对记录清零';
    }

    let gradeMsg;
    if (g.correct === null) gradeMsg = '已提交，本题不判分';
    else if (g.correct) gradeMsg = '回答正确';
    else gradeMsg = '回答错误';

    const isShort = dq.type === 'short';
    this.setData({
      phase: 'graded',
      optionStates,
      fillStates,
      gradeMsg,
      wrongActionMsg,
      lastResult: result,
      canAddShortWrong: isShort && this.session.mode === 'bank' && !!this.session.wrongBookTargetId,
      canRemoveShortWrong: isShort && this.session.mode === 'wrongbook'
    });
    if (g.correct === true) wx.vibrateShort({ type: 'light' });

    // 答对自动跳下一题（设置开关，可自行选择）
    if (g.correct === true && this.session.autoNext) {
      if (this.autoNextTimer) clearTimeout(this.autoNextTimer);
      this.autoNextTimer = setTimeout(() => { this.autoNextTimer = null; this.next(); }, 1100);
    }
  },
  next() {
    if (this.autoNextTimer) { clearTimeout(this.autoNextTimer); this.autoNextTimer = null; }
    this.session.index++;
    if (this.session.index >= this.session.questions.length) {
      const sum = practice.summarizeSession(this.session);
      store.addStats(sum);
      store.saveSession(this.session);
      wx.redirectTo({ url: '/pages/result/result' });
      return;
    }
    store.saveSession(this.session);
    this.renderCurrent();
  },
  exit() {
    if (this.data.phase !== 'answer' || this.session.results.length === 0) {
      wx.navigateBack();
      return;
    }
    wx.showModal({
      title: '退出刷题',
      content: '进度已保存，可稍后在首页继续。确定退出吗？',
      success: res => {
        if (res.confirm) wx.navigateBack();
      }
    });
  }
});
