const store = require('../../utils/store');
const practice = require('../../utils/practice');
const util = require('../../utils/util');

Page({
  data: {
    stats: { sessions: 0, answered: 0, correct: 0, wrong: 0 },
    bankCount: 0,
    memoCount: 0,
    wrongTotal: 0,
    hasSession: false,
    sessionTitle: '',
    // 打卡 / 目标 / 趋势
    todayAnswered: 0,
    todayCorrect: 0,
    todaySessions: 0,
    streak: 0,
    goal: 0,
    goalPercent: 0,
    goalLeft: 0,
    week: [],
    weekTotal: 0,
    quickBankName: '',
    canQuick: false,
    achievements: [],
    achGot: 0
  },
  onShow() {
    const stats = store.getStats();
    const banks = store.getBanks();
    const memos = store.getMemos();
    const wbs = store.getWrongBooks();
    let wrongTotal = 0;
    wbs.forEach(w => { wrongTotal += store.getWrongItems(w.id).length; });
    const session = store.loadSession();
    const ds = store.getDailyStats();
    const settings = store.getSettings();
    let quickBank = banks.find(b => b.id === settings.lastBankId);
    if (!quickBank) quickBank = banks[0];
    const weekTotal = ds.week.reduce((n, w) => n + w.answered, 0);
    this.setData({
      stats,
      bankCount: banks.length,
      memoCount: memos.length,
      wrongTotal,
      hasSession: !!(session && !session.finished),
      sessionTitle: session ? session.title : '',
      todayAnswered: ds.todayAnswered,
      todayCorrect: ds.todayCorrect,
      todaySessions: ds.todaySessions,
      streak: ds.streak,
      goal: ds.goal,
      goalPercent: ds.goal > 0 ? Math.min(100, Math.round(ds.todayAnswered / ds.goal * 100)) : 0,
      goalLeft: ds.goal > 0 ? Math.max(0, ds.goal - ds.todayAnswered) : 0,
      week: ds.week,
      weekTotal,
      quickBankName: quickBank ? quickBank.name : '',
      canQuick: !!quickBank,
      achievements: store.getAchievements(),
      achGot: store.getAchievements().filter(a => a.got).length
    });
  },
  quickStart() {
    const settings = store.getSettings();
    const banks = store.getBanks();
    let bank = banks.find(b => b.id === settings.lastBankId);
    if (!bank) bank = banks[0];
    if (!bank) {
      wx.navigateTo({ url: '/pages/import/import?mode=quiz' });
      return;
    }
    try {
      const session = practice.buildSession({
        mode: 'bank',
        bankId: bank.id,
        types: null,
        count: 0,
        shuffleQuestions: settings.shuffleQuestions,
        shuffleOptions: settings.shuffleOptions,
        wrongBookTargetId: '',
        removeAfter: settings.removeAfter
      });
      session.autoNext = settings.autoNext;
      session.setup = { bankId: bank.id, types: null, count: 0, shuffleQuestions: settings.shuffleQuestions, shuffleOptions: settings.shuffleOptions, wrongBookTargetId: '' };
      store.saveSession(session);
      wx.navigateTo({ url: '/pages/practice/practice' });
    } catch (e) {
      wx.showToast({ title: e.message || '组卷失败', icon: 'none' });
    }
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
