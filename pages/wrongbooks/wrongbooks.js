const store = require('../../utils/store');
const util = require('../../utils/util');

Page({
  data: { books: [], removeAfter: 3 },
  onShow() {
    this.refresh();
  },
  refresh() {
    const settings = store.getSettings();
    const books = store.getWrongBooks().map(w => {
      const items = store.getWrongItems(w.id);
      const mastered = items.filter(i => i.streak >= 1).length;
      return Object.assign({}, w, {
        count: items.length,
        mastered,
        dateStr: util.formatDate(w.createdAt)
      });
    }).sort((a, b) => b.createdAt - a.createdAt);
    this.setData({ books, removeAfter: settings.removeAfter });
  },
  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/wrong-detail/wrong-detail?id=' + id });
  },
  goRule() {
    wx.switchTab({ url: '/pages/settings/settings' });
  },
  create() {
    wx.showModal({
      title: '新建错题集',
      editable: true,
      placeholderText: '输入错题集名称，如：错题集A',
      success: res => {
        if (res.confirm && res.content && res.content.trim()) {
          store.createWrongBook(res.content.trim());
          this.refresh();
          wx.showToast({ title: '已创建', icon: 'success' });
        }
      }
    });
  },
  rename(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '重命名错题集',
      editable: true,
      content: name,
      placeholderText: '输入新名称',
      success: res => {
        if (res.confirm && res.content && res.content.trim()) {
          store.renameWrongBook(id, res.content.trim());
          this.refresh();
        }
      }
    });
  },
  remove(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '删除错题集',
      content: '确定删除「' + name + '」吗？里面的错题记录也会删除。',
      confirmColor: '#EF4444',
      success: res => {
        if (res.confirm) {
          store.deleteWrongBook(id);
          this.refresh();
        }
      }
    });
  }
});
