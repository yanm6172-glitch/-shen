const store = require('../../utils/store');

Page({
  data: {
    bank: null,
    questions: [],
    expanded: {}
  },
  onLoad(options) {
    this.bankId = options.id;
  },
  onShow() {
    this.refresh();
  },
  refresh() {
    const bank = store.getBank(this.bankId);
    if (!bank) {
      wx.showToast({ title: '题库不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const questions = bank.questions.map(q => {
      const display = {
        id: q.id, type: q.type, typeName: this.typeName(q.type),
        stem: q.stem,
        options: (q.options || []).map(o => o.key + '. ' + o.text),
        answerText: this.answerText(q),
        analysis: q.analysis,
        hasAnswer: q.hasAnswer
      };
      return display;
    });
    this.setData({
      bank: { id: bank.id, name: bank.name, typeStats: bank.typeStats, total: bank.total },
      questions,
      expanded: {}
    });
  },
  typeName(t) {
    return { single: '单选', multi: '多选', judge: '判断', fill: '填空', short: '解答' }[t] || t;
  },
  answerText(q) {
    const a = q.answer || {};
    if (q.type === 'single' || q.type === 'multi') return (a.letters || []).join('');
    if (q.type === 'judge') return a.judge ? '对' : '错';
    if (q.type === 'fill') return (a.blanks || []).map(b => (b || []).join('/')).filter(x => x).join('；') || '';
    return a.text || '';
  },
  toggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    const expanded = Object.assign({}, this.data.expanded);
    expanded[id] = !expanded[id];
    this.setData({ expanded });
  },
  startPractice() {
    wx.navigateTo({ url: '/pages/practice-setup/practice-setup?bankId=' + this.bankId });
  },
  deleteBank() {
    wx.showModal({
      title: '删除题库',
      content: '确定删除「' + this.data.bank.name + '」吗？',
      confirmColor: '#EF4444',
      success: res => {
        if (res.confirm) {
          store.deleteBank(this.bankId);
          wx.navigateBack();
        }
      }
    });
  }
});
