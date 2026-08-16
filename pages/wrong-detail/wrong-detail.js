const store = require('../../utils/store');
const practice = require('../../utils/practice');

Page({
  data: {
    book: null,
    items: [],
    removeAfter: 3
  },
  onLoad(options) {
    this.bookId = options.id;
  },
  onShow() {
    this.refresh();
  },
  refresh() {
    const book = store.getWrongBooks().find(w => w.id === this.bookId);
    if (!book) {
      wx.showToast({ title: '错题集不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const settings = store.getSettings();
    const items = store.getWrongItems(this.bookId).map(it => {
      const q = it.question || {};
      return {
        qid: it.qid,
        type: q.type,
        typeName: { single: '单选', multi: '多选', judge: '判断', fill: '填空', short: '解答' }[q.type],
        stem: (q.stem || '').slice(0, 80),
        wrongCount: it.wrongCount,
        streak: it.streak,
        bankName: it.bankName || '',
        progress: settings.removeAfter > 0 ? Math.min(it.streak / settings.removeAfter * 100, 100) : (it.streak > 0 ? 100 : 0)
      };
    });
    this.setData({ book, items, removeAfter: settings.removeAfter });
  },
  goRule() {
    wx.switchTab({ url: '/pages/settings/settings' });
  },
  goBanks() {
    wx.switchTab({ url: '/pages/banks/banks' });
  },
  removeOne(e) {
    const qid = e.currentTarget.dataset.qid;
    wx.showModal({
      title: '移出错题',
      content: '确定把这题移出错题集吗？',
      success: res => {
        if (res.confirm) {
          store.removeWrongItem(this.bookId, qid);
          this.refresh();
        }
      }
    });
  },
  clearAll() {
    wx.showModal({
      title: '清空错题集',
      content: '确定清空「' + this.data.book.name + '」的全部错题吗？',
      confirmColor: '#EF4444',
      success: res => {
        if (res.confirm) {
          store.saveWrongData(this.bookId, { id: this.bookId, items: [] });
          this.refresh();
        }
      }
    });
  },
  copyAll() {
    const items = store.getWrongItems(this.bookId);
    if (items.length === 0) {
      wx.showToast({ title: '错题集是空的', icon: 'none' });
      return;
    }
    const typeName = { single: '单选', multi: '多选', judge: '判断', fill: '填空', short: '解答' };
    const lines = [];
    items.forEach((it, i) => {
      const q = it.question || {};
      const a = q.answer || {};
      lines.push((i + 1) + '.（' + (typeName[q.type] || '') + '）' + q.stem);
      (q.options || []).forEach(o => { lines.push(o.key + '. ' + o.text); });
      let ans = '';
      if (q.type === 'single' || q.type === 'multi') ans = (a.correctTexts || []).join('、') || (a.letters || []).join('');
      else if (q.type === 'judge') ans = a.judge ? '对' : '错';
      else if (q.type === 'fill') ans = (a.blanks || []).map(b => (b || []).join('/')).filter(x => x).join('；');
      else ans = a.text || '';
      lines.push('答案：' + (ans || '无'));
      lines.push('');
    });
    wx.setClipboardData({
      data: lines.join('\n'),
      success: () => wx.showToast({ title: '已复制 ' + items.length + ' 道错题', icon: 'success' })
    });
  },
  startPractice() {
    if (this.data.items.length === 0) {
      wx.showToast({ title: '错题集是空的', icon: 'none' });
      return;
    }
    const settings = store.getSettings();
    try {
      const session = practice.buildSession({
        mode: 'wrongbook',
        wrongBookId: this.bookId,
        types: null,
        count: 0,
        shuffleQuestions: settings.shuffleQuestions,
        shuffleOptions: settings.shuffleOptions,
        removeAfter: settings.removeAfter
      });
      session.autoNext = settings.autoNext;
      session.setup = {};
      store.saveSession(session);
      wx.navigateTo({ url: '/pages/practice/practice' });
    } catch (e) {
      wx.showToast({ title: e.message || '组卷失败', icon: 'none' });
    }
  }
});
