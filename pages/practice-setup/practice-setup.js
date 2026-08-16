const store = require('../../utils/store');
const practice = require('../../utils/practice');

Page({
  data: {
    bank: null,
    types: { single: true, multi: true, judge: true, fill: true, short: true },
    countOptions: [],
    countIndex: 0,
    shuffleQuestions: true,
    shuffleOptions: true,
    autoNext: false,
    examMode: false,
    smartMode: false,
    challengeMode: false,
    wrongBooks: [],
    targetIndex: 0,          // 0 = 不加入错题集
    removeAfter: 3
  },
  onLoad(options) {
    this.bankId = options.bankId;
    const settings = store.getSettings();
    this.setData({
      shuffleQuestions: settings.shuffleQuestions,
      shuffleOptions: settings.shuffleOptions,
      autoNext: settings.autoNext,
      removeAfter: settings.removeAfter
    });
  },
  onShow() {
    const bank = store.getBank(this.bankId);
    if (!bank) {
      wx.showToast({ title: '题库不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const countOptions = ['全部（' + bank.total + ' 题）'];
    [5, 10, 20, 30, 50].forEach(n => { if (bank.total >= n) countOptions.push(n + ' 题'); });
    const wbs = store.getWrongBooks();
    const wrongBooks = ['不加入错题集'].concat(wbs.map(w => w.name + '（' + store.getWrongItems(w.id).length + '题）'));
    this.setData({ bank, countOptions, wrongBooks });
    this.rawWrongBooks = wbs;
  },
  toggleType(e) {
    const t = e.currentTarget.dataset.type;
    const types = Object.assign({}, this.data.types);
    types[t] = !types[t];
    this.setData({ types });
  },
  onCountChange(e) {
    this.setData({ countIndex: Number(e.detail.value) });
  },
  onTargetChange(e) {
    this.setData({ targetIndex: Number(e.detail.value) });
  },
  toggleShuffleQ(e) {
    this.setData({ shuffleQuestions: e.detail.value });
  },
  toggleShuffleO(e) {
    this.setData({ shuffleOptions: e.detail.value });
  },
  toggleAutoNext(e) {
    this.setData({ autoNext: e.detail.value });
  },
  toggleExamMode(e) {
    this.setData({ examMode: e.detail.value });
    if (e.detail.value) this.setData({ challengeMode: false }); // 与挑战模式互斥
  },
  toggleSmartMode(e) {
    this.setData({ smartMode: e.detail.value });
  },
  toggleChallengeMode(e) {
    this.setData({ challengeMode: e.detail.value });
    if (e.detail.value) this.setData({ examMode: false }); // 与考试模式互斥
  },
  createWrongBook() {
    wx.showModal({
      title: '新建错题集',
      editable: true,
      placeholderText: '输入错题集名称',
      success: res => {
        if (res.confirm && res.content && res.content.trim()) {
          store.createWrongBook(res.content.trim());
          this.onShow();
          wx.showToast({ title: '已创建', icon: 'success' });
        }
      }
    });
  },
  start() {
    const enabled = Object.keys(this.data.types).filter(t => this.data.types[t]);
    if (enabled.length === 0) {
      wx.showToast({ title: '至少选择一种题型', icon: 'none' });
      return;
    }
    if (!this.data.bank.typeStats || Object.keys(this.data.bank.typeStats).filter(t => this.data.types[t] && this.data.bank.typeStats[t] > 0).length === 0) {
      wx.showToast({ title: '所选题型没有题目', icon: 'none' });
      return;
    }
    const count = this.data.countIndex === 0 ? 0 : parseInt(this.data.countOptions[this.data.countIndex]);
    const targetId = this.data.targetIndex === 0 ? '' : (this.rawWrongBooks[this.data.targetIndex - 1] || {}).id || '';
    try {
      const session = practice.buildSession({
        mode: 'bank',
        bankId: this.bankId,
        types: enabled,
        count,
        shuffleQuestions: this.data.shuffleQuestions,
        shuffleOptions: this.data.shuffleOptions,
        wrongBookTargetId: targetId,
        removeAfter: this.data.removeAfter,
        examMode: this.data.examMode && !this.data.challengeMode,
        smartMode: this.data.smartMode,
        challengeMode: this.data.challengeMode,
        challengeSec: 15
      });
      session.autoNext = this.data.autoNext;   // 答对自动跳下一题（可自行选择）
      store.saveSettings({ lastBankId: this.bankId });   // 首页"快速开始"记住最近题库
      session.setup = {
        bankId: this.bankId,
        types: enabled,
        count,
        shuffleQuestions: this.data.shuffleQuestions,
        shuffleOptions: this.data.shuffleOptions,
        wrongBookTargetId: targetId,
        examMode: this.data.examMode && !this.data.challengeMode,
        smartMode: this.data.smartMode,
        challengeMode: this.data.challengeMode
      };
      store.saveSession(session);
      wx.navigateTo({ url: '/pages/practice/practice' });
    } catch (e) {
      wx.showToast({ title: e.message || '组卷失败', icon: 'none' });
    }
  }
});
