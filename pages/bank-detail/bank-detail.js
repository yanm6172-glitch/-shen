const store = require('../../utils/store');

Page({
  data: {
    bank: null,
    questions: [],
    allCount: 0,
    favCount: 0,
    filterMode: 'all',     // all | fav
    keyword: '',
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
    const favs = store.getFavorites();
    const qs = store.getQStats();
    const all = bank.questions.map(q => {
      const fav = !!favs[q.id];
      const st = qs[q.id];
      let status = 'new', statusText = '未做';
      if (st && st.done) {
        if (st.wrong > 0) { status = 'wrong'; statusText = '做错过'; }
        else { status = 'ok'; statusText = '已掌握'; }
      }
      return {
        id: q.id,
        type: q.type,
        typeName: this.typeName(q.type),
        stem: q.stem,
        options: (q.options || []).map(o => o.key + '. ' + o.text),
        answerText: this.answerText(q),
        analysis: q.analysis,
        hasAnswer: q.hasAnswer,
        fav,
        status,
        statusText
      };
    });
    this.allQuestions = all;
    this.setData({
      bank: { id: bank.id, name: bank.name, typeStats: bank.typeStats, total: bank.total },
      allCount: all.length,
      favCount: all.filter(q => q.fav).length,
      expanded: {}
    });
    this.applyFilter();
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
  applyFilter() {
    const kw = this.data.keyword.trim();
    let list = this.allQuestions;
    if (this.data.filterMode === 'fav') list = list.filter(q => q.fav);
    if (kw) {
      list = list.filter(q =>
        q.stem.indexOf(kw) >= 0 ||
        q.answerText.indexOf(kw) >= 0 ||
        q.options.some(o => o.indexOf(kw) >= 0)
      );
    }
    this.setData({ questions: list });
  },
  setFilter(e) {
    this.setData({ filterMode: e.currentTarget.dataset.mode });
    this.applyFilter();
  },
  onSearch(e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter();
  },
  clearSearch() {
    this.setData({ keyword: '' });
    this.applyFilter();
  },
  toggleFavQ(e) {
    const id = e.currentTarget.dataset.id;
    store.toggleFavorite(id);
    const item = this.allQuestions.find(q => q.id === id);
    if (item) item.fav = !item.fav;
    this.setData({ favCount: this.allQuestions.filter(q => q.fav).length });
    this.applyFilter();
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
