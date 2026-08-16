const parser = require('../../utils/parser');
const zip = require('../../utils/zip');
const store = require('../../utils/store');
const util = require('../../utils/util');
const builtin = require('../../data/builtin');

Page({
  data: {
    mode: 'quiz',            // quiz | memo
    text: '',
    fileName: '',
    parsed: false,
    stats: null,             // quiz: {single,multi,...}; memo: {sections, qa}
    questions: [],           // 预览
    sections: [],
    warnings: [],
    name: '',
    saving: false
  },
  onLoad(options) {
    if (options && options.mode === 'memo') {
      this.setData({ mode: 'memo' });
      wx.setNavigationBarTitle({ title: '导入背书内容' });
    } else {
      wx.setNavigationBarTitle({ title: '导入刷题文本' });
    }
  },
  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ mode, parsed: false, questions: [], sections: [], stats: null, warnings: [], name: '' });
    wx.setNavigationBarTitle({ title: mode === 'memo' ? '导入背书内容' : '导入刷题文本' });
  },
  onInput(e) {
    this.setData({ text: e.detail.value, parsed: false });
  },
  clearText() {
    this.setData({ text: '', fileName: '', parsed: false, questions: [], sections: [], stats: null, warnings: [] });
  },
  // 解析预览
  parseNow() {
    const text = this.data.text.trim();
    if (!text) {
      wx.showToast({ title: '请先粘贴文本或选择文件', icon: 'none' });
      return;
    }
    if (this.data.mode === 'quiz') {
      const r = parser.parseQuizText(text);
      if (r.questions.length === 0) {
        wx.showToast({ title: '没有识别到题目，请检查格式', icon: 'none' });
        return;
      }
      this.setData({
        parsed: true,
        stats: r.stats,
        questions: r.questions.map(q => Object.assign({}, q, { stemShort: q.stem.slice(0, 60) })),
        warnings: r.warnings.slice(0, 20),
        name: this.data.name || this.data.fileName.replace(/\.(txt|md|docx|doc|json)$/i, '') || '导入题库'
      });
    } else {
      const r = parser.parseMemoText(text);
      if (r.sections.length === 0) {
        wx.showToast({ title: '没有识别到内容', icon: 'none' });
        return;
      }
      this.setData({
        parsed: true,
        stats: r.stats,
        sections: r.sections,
        warnings: [],
        name: this.data.name || this.data.fileName.replace(/\.(txt|md|docx|doc|json)$/i, '') || '背书内容'
      });
    }
  },
  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },
  // 选择文件（从微信聊天/文件传输助手）
  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['txt', 'md', 'json', 'docx', 'doc'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        const name = file.name || '';
        const ext = name.toLowerCase().split('.').pop();
        if (ext === 'doc') {
          wx.showModal({
            title: '暂不支持 .doc',
            content: '老版 .doc 文件请先在电脑上另存为 .docx 或 .txt 再导入。',
            showCancel: false
          });
          return;
        }
        if (ext === 'docx') {
          wx.showLoading({ title: '解析 docx…' });
          this.readBinary(file.path).then(buf => {
            const text = zip.extractDocxText(buf);
            wx.hideLoading();
            this.setData({ text, fileName: name, parsed: false });
            wx.showToast({ title: '已读取，点击"识别预览"', icon: 'none' });
          }).catch(err => {
            wx.hideLoading();
            wx.showModal({ title: '解析失败', content: err.message || '无法解析该 docx 文件', showCancel: false });
          });
          return;
        }
        this.readText(file.path).then(text => {
          this.setData({ text, fileName: name, parsed: false });
          wx.showToast({ title: '已读取，点击"识别预览"', icon: 'none' });
        }).catch(err => {
          wx.showModal({ title: '读取失败', content: err.message || '无法读取文件', showCancel: false });
        });
      }
    });
  },
  readText(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        encoding: 'utf-8',
        success: res => resolve(res.data),
        fail: err => reject(new Error(err.errMsg))
      });
    });
  },
  readBinary(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        success: res => resolve(new Uint8Array(res.data)),
        fail: err => reject(new Error(err.errMsg))
      });
    });
  },
  // 导入内置示例
  loadBuiltin() {
    if (this.data.mode === 'quiz') {
      this.setData({ text: builtin.DEMO_QUIZ_RAW, fileName: '全题型示例.txt', parsed: false });
    } else {
      const memo = builtin.MEMOS[0];
      this.setData({ text: memo.raw, fileName: memo.name + '.txt', parsed: false });
    }
    wx.showToast({ title: '已填充示例，点击"识别预览"', icon: 'none' });
  },
  removeQuestion(e) {
    const idx = e.currentTarget.dataset.idx;
    const questions = this.data.questions.slice();
    questions.splice(idx, 1);
    const stats = { single: 0, multi: 0, judge: 0, fill: 0, short: 0, total: questions.length };
    questions.forEach(q => { if (stats[q.type] != null) stats[q.type]++; });
    this.setData({ questions, stats });
  },
  // 保存
  save() {
    if (!this.data.parsed) {
      wx.showToast({ title: '请先识别预览', icon: 'none' });
      return;
    }
    const name = (this.data.name || '').trim() || (this.data.mode === 'quiz' ? '导入题库' : '背书内容');
    this.setData({ saving: true });
    try {
      if (this.data.mode === 'quiz') {
        if (this.data.questions.length === 0) {
          wx.showToast({ title: '至少保留一道题', icon: 'none' });
          this.setData({ saving: false });
          return;
        }
        const bank = store.buildBank(name, this.data.questions, 'import');
        store.saveBank(bank);
      } else {
        const memo = {
          id: util.uid(), name,
          sections: this.data.sections,
          createdAt: Date.now(), source: 'import'
        };
        store.saveMemo(memo);
      }
      wx.showToast({ title: '导入成功', icon: 'success' });
      setTimeout(() => {
        if (this.data.mode === 'quiz') {
          wx.switchTab({ url: '/pages/banks/banks' });
        } else {
          wx.switchTab({ url: '/pages/memorize-list/memorize-list' });
        }
      }, 600);
    } catch (e) {
      this.setData({ saving: false });
      wx.showModal({ title: '保存失败', content: e.message || '内容过大，请分批导入', showCancel: false });
    }
  }
});
