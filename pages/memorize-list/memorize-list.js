const store = require('../../utils/store');
const util = require('../../utils/util');

function reviewStatus(m) {
  if (!m.reviewedAt) return { text: '未背诵', cls: 'st-new' };
  const days = Math.floor((Date.now() - m.reviewedAt) / 86400000);
  if (days <= 0) return { text: '今日已背', cls: 'st-ok' };
  if (days < 3) return { text: '已背 ' + days + ' 天前', cls: 'st-new' };
  if (days < 7) return { text: '该复习了', cls: 'st-due' };
  return { text: '逾期 ' + days + ' 天未复习', cls: 'st-over' };
}

Page({
  data: { memos: [] },
  onShow() {
    this.refresh();
  },
  refresh() {
    const memos = store.getMemos().map(m => {
      const st = reviewStatus(m);
      return Object.assign({}, m, {
        dateStr: util.formatDate(m.createdAt),
        statusText: st.text,
        statusCls: st.cls
      });
    }).sort((a, b) => b.createdAt - a.createdAt);
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
