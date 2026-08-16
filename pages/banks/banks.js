const store = require('../../utils/store');
const util = require('../../utils/util');

Page({
  data: { banks: [] },
  onShow() {
    this.refresh();
  },
  refresh() {
    const banks = store.getBanks().map(b => Object.assign({}, b, {
      dateStr: util.formatDate(b.createdAt)
    })).sort((a, b) => b.createdAt - a.createdAt);
    this.setData({ banks });
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/bank-detail/bank-detail?id=' + id });
  },
  deleteBank(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '删除题库',
      content: '确定删除「' + name + '」吗？删除后不可恢复。',
      confirmColor: '#EF4444',
      success: res => {
        if (res.confirm) {
          store.deleteBank(id);
          this.refresh();
        }
      }
    });
  },
  goImport() {
    wx.navigateTo({ url: '/pages/import/import?mode=quiz' });
  }
});
