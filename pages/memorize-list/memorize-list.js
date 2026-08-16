const store = require('../../utils/store');
const util = require('../../utils/util');

Page({
  data: { memos: [] },
  onShow() {
    this.refresh();
  },
  refresh() {
    const memos = store.getMemos().map(m => Object.assign({}, m, {
      dateStr: util.formatDate(m.createdAt)
    })).sort((a, b) => b.createdAt - a.createdAt);
    this.setData({ memos });
  },
  goMemo(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/memorize/memorize?id=' + id });
  },
  deleteMemo(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '删除背书内容',
      content: '确定删除「' + name + '」吗？',
      confirmColor: '#EF4444',
      success: res => {
        if (res.confirm) {
          store.deleteMemo(id);
          this.refresh();
        }
      }
    });
  },
  goImport() {
    wx.navigateTo({ url: '/pages/import/import?mode=memo' });
  }
});
