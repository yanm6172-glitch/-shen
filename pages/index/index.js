const store = require('../../utils/store');
const util = require('../../utils/util');

Page({
  data: {
    stats: { sessions: 0, answered: 0, correct: 0, wrong: 0 },
    bankCount: 0,
    memoCount: 0,
    wrongTotal: 0,
    hasSession: false,
    sessionTitle: ''
  },
  onShow() {
    const stats = store.getStats();
    const banks = store.getBanks();
    const memos = store.getMemos();
    const wbs = store.getWrongBooks();
    let wrongTotal = 0;
    wbs.forEach(w => { wrongTotal += store.getWrongItems(w.id).length; });
    const session = store.loadSession();
    this.setData({
      stats,
      bankCount: banks.length,
      memoCount: memos.length,
      wrongTotal,
      hasSession: !!(session && !session.finished),
      sessionTitle: session ? session.title : ''
    });
  },
  goQuiz() {
    wx.switchTab({ url: '/pages/banks/banks' });
  },
  goMemo() {
    wx.switchTab({ url: '/pages/memorize-list/memorize-list' });
  },
  goWrong() {
    wx.switchTab({ url: '/pages/wrongbooks/wrongbooks' });
  },
  goSettings() {
    wx.switchTab({ url: '/pages/settings/settings' });
  },
  goImport(e) {
    const mode = e.currentTarget.dataset.mode || 'quiz';
    wx.navigateTo({ url: '/pages/import/import?mode=' + mode });
  },
  resumeSession() {
    wx.navigateTo({ url: '/pages/practice/practice?resume=1' });
  }
});
