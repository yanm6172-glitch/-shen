const store = require('../../utils/store');
const practice = require('../../utils/practice');

Page({
  data: {
    summary: null,
    expanded: {},
    reviewList: []
  },
  onLoad() {
    const session = store.loadSession();
    if (!session) {
      wx.showToast({ title: '没有结果', icon: 'none' });
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 800);
      return;
    }
    const summary = practice.summarizeSession(session);
    summary.comment = summary.score >= 90 ? '太棒了，掌握得很好！'
      : summary.score >= 70 ? '不错，继续保持！'
      : summary.score >= 60 ? '及格了，再巩固一下！'
      : '别灰心，去错题本练一练！';
    if (summary.durationSec > 0) {
      const mm = Math.floor(summary.durationSec / 60);
      const ss = summary.durationSec % 60;
      summary.durText = mm > 0 ? (mm + ' 分 ' + ss + ' 秒') : (ss + ' 秒');
    }
    const reviewList = summary.results.map(r => {
      const typeName = { single: '单选', multi: '多选', judge: '判断', fill: '填空', short: '解答' }[r.type];
      return {
        qid: r.qid,
        type: r.type,
        typeName,
        correct: r.correct,
        stem: r.stem,
        options: (r.options || []).map(o => o.key + '. ' + o.text),
        userAnswerText: this.userText(r),
        answerText: this.answerText(r),
        analysis: r.analysis
      };
    });
    this.session = session;
    this.summary = summary;
    this.allReview = reviewList;
    this.setData({ summary, reviewList, expanded: {}, filterWrong: false });
  },
  setReviewFilter(e) {
    const mode = e.currentTarget.dataset.mode; // all | wrong
    const filterWrong = mode === 'wrong';
    const reviewList = filterWrong ? this.allReview.filter(r => r.correct === false) : this.allReview;
    this.setData({ filterWrong, reviewList, expanded: {} });
  },
  userText(r) {
    const ua = r.userAnswer;
    if (r.type === 'single' || r.type === 'judge') {
      if (r.type === 'judge') return ua === 'T' ? '正确' : (ua === 'F' ? '错误' : '');
      const o = (r.options || []).find(x => x.key === ua);
      return o ? o.text : '';
    }
    if (r.type === 'multi') {
      return (ua || []).map(k => {
        const o = (r.options || []).find(x => x.key === k);
        return o ? o.text : '';
      }).join('、');
    }
    if (r.type === 'fill') {
      return (ua || []).map((v, i) => '第' + (i + 1) + '空：' + (v || '空')).join('　');
    }
    if (ua && ua.text) return ua.text;
    return (r.detail && r.detail.grade === 'right') ? '（自我判定：对）' : ((r.detail && r.detail.grade === 'half') ? '（自我判定：半对）' : '（自我判定：错）');
  },
  answerText(r) {
    const a = r.answer || {};
    if (r.type === 'single' || r.type === 'multi') return (a.correctTexts || []).join('、') || (a.letters || []).join('');
    if (r.type === 'judge') return r.hasAnswer ? (a.judge ? '对' : '错') : '无参考答案';
    if (r.type === 'fill') return (a.blanks || []).map((b, i) => '第' + (i + 1) + '空：' + ((b && b.length) ? b.join(' / ') : '？')).join('　');
    return r.answerText || '';
  },
  toggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    const expanded = Object.assign({}, this.data.expanded);
    expanded[id] = !expanded[id];
    this.setData({ expanded });
  },
  again() {
    const setup = this.session.setup || {};
    try {
      if (this.session.mode === 'bank') {
        const s = practice.buildSession(Object.assign({ mode: 'bank' }, setup, {
          bankId: setup.bankId || this.session.bankId,
          removeAfter: this.session.removeAfter
        }));
        s.autoNext = this.session.autoNext;
        s.setup = setup;
        store.saveSession(s);
      } else {
        const s = practice.buildSession({
          mode: 'wrongbook',
          wrongBookId: this.session.wrongBookId,
          types: null,
          count: 0,
          shuffleQuestions: this.session.shuffleQuestions,
          shuffleOptions: this.session.shuffleOptions,
          removeAfter: this.session.removeAfter
        });
        s.autoNext = this.session.autoNext;
        s.setup = {};
        store.saveSession(s);
      }
      wx.redirectTo({ url: '/pages/practice/practice' });
    } catch (e) {
      wx.showToast({ title: e.message || '无法再来一组', icon: 'none' });
    }
  },
  backHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
  // 生成成绩单图片（canvas）保存到相册
  drawShare() {
    const s = this.data.summary;
    if (!s) return;
    const W = 300, H = 430;
    const ctx = wx.createCanvasContext('shareCanvas', this);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#6C5CE7');
    bg.addColorStop(0.55, '#8E7CFF');
    bg.addColorStop(1, '#A99BFF');
    ctx.setFillStyle(bg);
    ctx.fillRect(0, 0, W, H);
    ctx.setFillStyle('rgba(255,255,255,0.16)');
    ctx.fillRect(20, 78, W - 40, 300);
    ctx.setTextAlign('center');
    ctx.setFillStyle('#FFFFFF');
    ctx.setFontSize(19);
    ctx.fillText('背书刷题神器 · 成绩单', W / 2, 38);
    ctx.setFontSize(12);
    ctx.setFillStyle('rgba(255,255,255,0.9)');
    ctx.fillText((s.title || '') + ' · ' + (s.mode === 'wrongbook' ? '错题集' : '刷题'), W / 2, 58);
    ctx.setFillStyle('#FFFFFF');
    ctx.setFontSize(62);
    ctx.fillText(String(s.score), W / 2, 165);
    ctx.setFontSize(14);
    ctx.setFillStyle('rgba(255,255,255,0.9)');
    ctx.fillText('得 分', W / 2, 190);
    const lines = [
      '共 ' + s.total + ' 题 · 答对 ' + s.correct + ' · 答错 ' + s.wrong,
      s.unjudged ? '解答题提交 ' + s.unjudged + ' 题' : '',
      s.durText ? '用时 ' + s.durText : ''
    ].filter(x => x);
    ctx.setFontSize(13);
    let y = 235;
    lines.forEach(l => { ctx.fillText(l, W / 2, y); y += 26; });
    ctx.setFillStyle('#FFFFFF');
    ctx.setFontSize(15);
    ctx.fillText(s.comment || '', W / 2, y + 8);
    const d = new Date();
    ctx.setFontSize(11);
    ctx.setFillStyle('rgba(255,255,255,0.85)');
    ctx.fillText(d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · 背书刷题神器', W / 2, H - 22);
    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: 'shareCanvas',
        success: res => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => wx.showToast({ title: '成绩单已保存到相册', icon: 'success' }),
            fail: () => wx.showModal({
              title: '保存失败',
              content: '请在设置中允许小程序保存图片到相册，或直接截图分享',
              showCancel: false
            })
          });
        },
        fail: () => wx.showToast({ title: '生成失败，请重试', icon: 'none' })
      }, this);
    });
  },
  backWrong() {
    wx.switchTab({ url: '/pages/wrongbooks/wrongbooks' });
  }
});
