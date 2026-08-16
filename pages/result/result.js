const store = require('../../utils/store');
const practice = require('../../utils/practice');

Page({
  data: {
    summary: null,
    expanded: {},
    reviewList: []
  },
  onLoad() {
    const session = store.loadSession();
    if (!session) {
      wx.showToast({ title: '没有结果', icon: 'none' });
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 800);
      return;
    }
    const summary = practice.summarizeSession(session);
    summary.comment = summary.score >= 90 ? '太棒了，掌握得很好！'
      : summary.score >= 70 ? '不错，继续保持！'
      : summary.score >= 60 ? '及格了，再巩固一下！'
      : '别灰心，去错题本练一练！';
    if (summary.durationSec > 0) {
      const mm = Math.floor(summary.durationSec / 60);
      const ss = summary.durationSec % 60;
      summary.durText = mm > 0 ? (mm + ' 分 ' + ss + ' 秒') : (ss + ' 秒');
    }
    const reviewList = summary.results.map(r => {
      const typeName = { single: '单选', multi: '多选', judge: '判断', fill: '填空', short: '解答' }[r.type];
      return {
        qid: r.qid,
        type: r.type,
        typeName,
        correct: r.correct,
        stem: r.stem,
        options: (r.options || []).map(o => o.key + '. ' + o.text),
        userAnswerText: this.userText(r),
        answerText: this.answerText(r),
        analysis: r.analysis
      };
    });
    this.session = session;
    this.summary = summary;
    this.allReview = reviewList;
    this.setData({ summary, reviewList, expanded: {}, filterWrong: false });
  },
  setReviewFilter(e) {
    const mode = e.currentTarget.dataset.mode; // all | wrong
    const filterWrong = mode === 'wrong';
    const reviewList = filterWrong ? this.allReview.filter(r => r.correct === false) : this.allReview;
    this.setData({ filterWrong, reviewList, expanded: {} });
  },
  userText(r) {
    const ua = r.userAnswer;
    if (r.type === 'single' || r.type === 'judge') {
      if (r.type === 'judge') return ua === 'T' ? '正确' : (ua === 'F' ? '错误' : '');
      const o = (r.options || []).find(x => x.key === ua);
      return o ? o.text : '';
    }
    if (r.type === 'multi') {
      return (ua || []).map(k => {
        const o = (r.options || []).find(x => x.key === k);
        return o ? o.text : '';
      }).join('、');
    }
    if (r.type === 'fill') {
      return (ua || []).map((v, i) => '第' + (i + 1) + '空：' + (v || '空')).join('　');
    }
    if (ua && ua.text) return ua.text;
    return (r.detail && r.detail.grade === 'right') ? '（自我判定：对）' : ((r.detail && r.detail.grade === 'half') ? '（自我判定：半对）' : '（自我判定：错）');
  },
  answerText(r) {
    const a = r.answer || {};
    if (r.type === 'single' || r.type === 'multi') return (a.correctTexts || []).join('、') || (a.letters || []).join('');
    if (r.type === 'judge') return r.hasAnswer ? (a.judge ? '对' : '错') : '无参考答案';
    if (r.type === 'fill') return (a.blanks || []).map((b, i) => '第' + (i + 1) + '空：' + ((b && b.length) ? b.join(' / ') : '？')).join('　');
    return r.answerText || '';
  },
  toggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    const expanded = Object.assign({}, this.data.expanded);
    expanded[id] = !expanded[id];
    this.setData({ expanded });
  },
  again() {
    const setup = this.session.setup || {};
    try {
      if (this.session.mode === 'bank') {
        const s = practice.buildSession(Object.assign({ mode: 'bank' }, setup, {
          bankId: setup.bankId || this.session.bankId,
          removeAfter: this.session.removeAfter
        }));
        s.autoNext = this.session.autoNext;
        s.setup = setup;
        store.saveSession(s);
      } else {
        const s = practice.buildSession({
          mode: 'wrongbook',
          wrongBookId: this.session.wrongBookId,
          types: null,
          count: 0,
          shuffleQuestions: this.session.shuffleQuestions,
          shuffleOptions: this.session.shuffleOptions,
          removeAfter: this.session.removeAfter
        });
        s.autoNext = this.session.autoNext;
        s.setup = {};
        store.saveSession(s);
      }
      wx.redirectTo({ url: '/pages/practice/practice' });
    } catch (e) {
      wx.showToast({ title: e.message || '无法再来一组', icon: 'none' });
    }
  },
  backHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
  backWrong() {
    wx.switchTab({ url: '/pages/wrongbooks/wrongbooks' });
  }
});
