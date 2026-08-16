const store = require('../../utils/store');
const ai = require('../../utils/ai');

Page({
  data: {
    removeAfter: 3,
    shuffleOptions: true,
    shuffleQuestions: true,
    autoNext: false,
    dailyGoal: 20,
    ai: { baseURL: '', apiKey: '', model: '' },
    testing: false,
    stats: null
  },
  onShow() {
    const s = store.getSettings();
    this.setData({
      removeAfter: s.removeAfter,
      shuffleOptions: s.shuffleOptions,
      shuffleQuestions: s.shuffleQuestions,
      autoNext: s.autoNext,
      dailyGoal: s.dailyGoal,
      ai: { baseURL: s.ai.baseURL, apiKey: s.ai.apiKey, model: s.ai.model },
      stats: store.getStats()
    });
  },
  changeRemove(e) {
    const v = Number(e.detail.value);
    this.applyRemove(v);
  },
  stepRemove(e) {
    const d = Number(e.currentTarget.dataset.v);
    this.applyRemove(this.data.removeAfter + d);
  },
  applyRemove(v) {
    const val = Math.max(0, Math.min(10, v));
    this.setData({ removeAfter: val });
    store.saveSettings({ removeAfter: val });
  },
  toggleShuffleO(e) {
    this.setData({ shuffleOptions: e.detail.value });
    store.saveSettings({ shuffleOptions: e.detail.value });
  },
  toggleShuffleQ(e) {
    this.setData({ shuffleQuestions: e.detail.value });
    store.saveSettings({ shuffleQuestions: e.detail.value });
  },
  toggleAutoNext(e) {
    this.setData({ autoNext: e.detail.value });
    store.saveSettings({ autoNext: e.detail.value });
  },
  stepGoal(e) {
    const d = Number(e.currentTarget.dataset.v);
    const val = Math.max(0, Math.min(200, this.data.dailyGoal + d));
    this.setData({ dailyGoal: val });
    store.saveSettings({ dailyGoal: val });
  },
  onAIInput(e) {
    const field = e.currentTarget.dataset.field;
    const aiCfg = Object.assign({}, this.data.ai);
    aiCfg[field] = e.detail.value;
    this.setData({ ai: aiCfg });
    store.saveSettings({ ai: aiCfg });
  },
  testAI() {
    if (!this.data.ai.apiKey) {
      wx.showToast({ title: '请先填写 apiKey', icon: 'none' });
      return;
    }
    this.setData({ testing: true });
    ai.callAI([
      { role: 'user', content: '你好，请只回复两个字：收到' }
    ], { maxTokens: 10, timeout: 20000 }).then(reply => {
      this.setData({ testing: false });
      wx.showModal({ title: '连接成功 ✅', content: 'AI 回复：' + reply.slice(0, 40), showCancel: false });
    }).catch(err => {
      this.setData({ testing: false });
      wx.showModal({ title: '连接失败', content: ai.friendlyError(err), showCancel: false });
    });
  },
  showHelp() {
    wx.showModal({
      title: '导入格式说明',
      content: '【刷题】支持考试系统导出（学习通/豆包等）：\n(单选题, 2.0 分) 题目( )\nA. 选项 B. 选项 C. 选项 D. 选项\n答案：A\n\n也支持：\n1.【单选】题目\nA. xx B. xx\n答案：B\n\n【判断】题目\n答案：对\n\n【填空】题目____\n答案：xxx\n\n【简答】题目\n答案：xxx\n\n还支持 Markdown、纯文本、docx 文件。\n\n【背书】支持 # 标题、1. 要点、问：/答：问答卡、普通段落，任意排版都能识别。',
      showCancel: false,
      confirmText: '知道了'
    });
  },
  showAbout() {
    wx.showModal({
      title: '关于',
      content: '背书刷题神器 v1.0\n\n· 任意文本格式识别五类题型\n· 选项乱序 / 题目乱序\n· 多错题集 · 做对N遍自动移除\n· AI 交互背书\n\n内容文件夹：F:\\背书刷题神器\\内容\nAI 接口：默认 DeepSeek，可换成任意 OpenAI 兼容接口。',
      showCancel: false,
      confirmText: '好的'
    });
  },
  reimportBuiltin() {
    wx.showModal({
      title: '重新导入内置内容',
      content: '将重新导入豆包题库（11章）、全题型示例和背书示例。不会删除已有数据。',
      success: res => {
        if (res.confirm) {
          wx.removeStorageSync(store.KEYS.firstRun);
          store.ensureBuiltinImported();
          wx.showToast({ title: '已导入', icon: 'success' });
        }
      }
    });
  },
  exportData() {
    try {
      const json = store.exportAllData();
      wx.setClipboardData({
        data: json,
        success: () => wx.showToast({ title: '备份已复制到剪贴板（' + Math.round(json.length / 1024) + 'KB）', icon: 'none' })
      });
    } catch (e) {
      wx.showToast({ title: '备份失败', icon: 'none' });
    }
  },
  importData() {
    wx.showModal({
      title: '恢复备份',
      editable: true,
      placeholderText: '粘贴之前复制的备份文本',
      success: res => {
        if (!res.confirm || !res.content || !res.content.trim()) return;
        try {
          store.importAllData(res.content.trim()); // 先解析验证
          wx.showModal({
            title: '确认恢复',
            content: '将用备份覆盖当前全部数据（题库/背书/错题集/统计/设置），确定吗？',
            confirmColor: '#EF4444',
            success: r2 => {
              if (!r2.confirm) return;
              const n = store.importAllData(res.content.trim());
              wx.showToast({ title: '恢复成功（' + n + ' 项数据）', icon: 'success' });
              this.onShow();
            }
          });
        } catch (e) {
          wx.showToast({ title: '解析失败：' + (e.message || '格式不正确'), icon: 'none' });
        }
      }
    });
  },
  clearAll() {
    wx.showModal({
      title: '清空所有数据',
      content: '将删除全部题库、背书内容、错题集和统计，并恢复内置内容。确定吗？',
      confirmColor: '#EF4444',
      success: res => {
        if (res.confirm) {
          store.clearAllData();
          wx.showToast({ title: '已清空', icon: 'success' });
          this.onShow();
        }
      }
    });
  }
});
