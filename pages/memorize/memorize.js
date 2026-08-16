const store = require('../../utils/store');
const ai = require('../../utils/ai');
const util = require('../../utils/util');

const STOPS = ['的', '了', '是', '在', '和', '与', '及', '或', '等', '之', '为', '不', '也', '都', '就', '而', '以', '把', '被', '从', '向', '对', '于', '这', '那', '有', '我们', '他们', '一个'];

function pickWord(sentence) {
  const re = /[\u4e00-\u9fa5]{2,4}/g;
  let m, cands = [];
  while ((m = re.exec(sentence)) !== null) {
    if (STOPS.indexOf(m[0]) >= 0) continue;
    cands.push({ w: m[0], i: m.index });
  }
  if (!cands.length) return null;
  const mid = Math.floor(sentence.length / 2);
  cands.sort((a, b) => Math.abs(a.i - mid) - Math.abs(b.i - mid));
  return cands[0];
}

Page({
  data: {
    memo: null,
    mode: 'browse',           // browse | cloze | cards | ai
    sections: [],
    flipped: {},
    reviewedText: '',
    // 挖空
    clozeItems: [],
    clozeChecked: false,
    clozeScore: '',
    // 闪卡
    cardCur: null,
    cardFlipped: false,
    cardLeft: 0,
    cardsDone: 0,
    cardsEmpty: false,
    cardDone: false,
    // AI
    aiMode: 'quiz',
    messages: [],
    input: '',
    aiLoading: false,
    scrollTo: ''
  },
  onLoad(options) {
    this.memoId = options.id;
  },
  onShow() {
    const memo = store.getMemo(this.memoId);
    if (!memo) {
      wx.showToast({ title: '内容不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    const sections = memo.sections.map(s => ({
      title: s.title,
      lines: s.lines || [],
      qa: s.qa || []
    }));
    const meta = store.getMemos().find(m => m.id === this.memoId);
    let reviewedText = '从未标记';
    if (meta && meta.reviewedAt) {
      const days = Math.floor((Date.now() - meta.reviewedAt) / 86400000);
      reviewedText = days <= 0 ? '今日已背' : (days + ' 天前背过');
    }
    this.setData({ memo: { id: memo.id, name: memo.name }, sections, flipped: {}, reviewedText });
    // AI 内容文本
    this.contentText = sections.map(s => {
      let t = s.title ? '【' + s.title + '】\n' : '';
      t += (s.lines || []).join('\n');
      if (s.qa && s.qa.length) t += '\n' + s.qa.map(qa => '问：' + qa.q + '\n答：' + qa.a).join('\n');
      return t;
    }).join('\n\n');
  },
  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    const patch = { mode };
    if (mode === 'cloze' && !this.data.clozeItems.length) {
      this.buildCloze();
    }
    if (mode === 'cards' && !this.data.cardCur && !this.data.cardDone) {
      this.buildCards();
    }
    if (mode === 'ai' && !this.data.messages.length) {
      patch.messages = ai.newChat(this.data.aiMode, this.contentText);
      patch.scrollTo = 'msg-end';
    }
    this.setData(patch);
  },
  /* ---------- 浏览 ---------- */
  flipQA(e) {
    const key = e.currentTarget.dataset.key;
    const flipped = Object.assign({}, this.data.flipped);
    flipped[key] = !flipped[key];
    this.setData({ flipped });
  },
  markReviewed() {
    store.markMemoReviewed(this.memoId);
    this.setData({ reviewedText: '今日已背' });
    wx.showToast({ title: '已标记，3 天后提醒复习', icon: 'success' });
  },
  /* ---------- 闪卡 ---------- */
  buildCards() {
    const qa = [];
    this.data.sections.forEach(s => {
      (s.qa || []).forEach(pair => qa.push({ front: pair.q, back: pair.a }));
    });
    if (qa.length === 0) {
      this.setData({ cardsEmpty: true });
      return;
    }
    const deck = util.shuffle(qa);
    this.cardDeck = deck;
    this.setData({
      cardsEmpty: false,
      cardDone: false,
      cardCur: deck[0],
      cardFlipped: false,
      cardLeft: deck.length,
      cardsDone: 0
    });
  },
  flipCard() {
    this.setData({ cardFlipped: !this.data.cardFlipped });
  },
  markCard(e) {
    const know = e.currentTarget.dataset.know === '1';
    const deck = (this.cardDeck || []).slice();
    const cur = deck.shift();
    if (!cur) return;
    if (know) {
      // 会了：移出队列
      const cardsDone = this.data.cardsDone + 1;
      this.cardDeck = deck;
      if (deck.length === 0) {
        this.setData({ cardDone: true, cardsDone, cardLeft: 0, cardCur: null, cardFlipped: false });
        wx.vibrateShort({ type: 'light' });
        return;
      }
      this.setData({ cardCur: deck[0], cardFlipped: false, cardsDone, cardLeft: deck.length });
    } else {
      // 不会：排到队尾再来一遍
      deck.push(cur);
      this.cardDeck = deck;
      this.setData({ cardCur: deck[0], cardFlipped: false, cardLeft: deck.length });
    }
  },
  restartCards() {
    this.cardDeck = null;
    this.setData({ cardDone: false, cardCur: null });
    this.buildCards();
  },
  /* ---------- 挖空自测 ---------- */
  buildCloze() {
    const items = [];
    this.data.sections.forEach((sec, si) => {
      const sentences = (sec.qa && sec.qa.length) ? sec.qa.map(qa => ({ text: qa.a, hint: qa.q })) : (sec.lines || []).map(l => ({ text: l, hint: '' }));
      sentences.forEach(sen => {
        if (sen.text.length < 8 || items.length >= 20) return;
        const hit = pickWord(sen.text);
        if (!hit) return;
        items.push({
          hint: sen.hint,
          before: sen.text.slice(0, hit.i),
          after: sen.text.slice(hit.i + hit.w.length),
          answer: hit.w,
          blankLen: hit.w.length,
          underscores: new Array(Math.min(hit.w.length, 10) + 1).join('＿'),
          input: '',
          state: 'pending'
        });
      });
    });
    this.setData({ clozeItems: items, clozeChecked: false, clozeScore: '' });
  },
  clozeInput(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const clozeItems = this.data.clozeItems.slice();
    clozeItems[idx].input = e.detail.value;
    this.setData({ clozeItems });
  },
  checkCloze() {
    const clozeItems = this.data.clozeItems.map(it => {
      const ok = util.normalizeAnswer(it.input) === util.normalizeAnswer(it.answer);
      return Object.assign({}, it, { state: ok ? 'ok' : 'bad' });
    });
    const right = clozeItems.filter(it => it.state === 'ok').length;
    this.setData({ clozeItems, clozeChecked: true, clozeScore: right + ' / ' + clozeItems.length + ' 空填对' });
  },
  resetCloze() {
    this.buildCloze();
  },
  /* ---------- AI 互动 ---------- */
  switchAiMode(e) {
    const aiMode = e.currentTarget.dataset.mode;
    this.setData({ aiMode, messages: ai.newChat(aiMode, this.contentText), scrollTo: 'msg-end' });
  },
  aiInput(e) {
    this.setData({ input: e.detail.value });
  },
  sendAi() {
    const text = this.data.input.trim();
    if (!text || this.data.aiLoading) return;
    const messages = this.data.messages.concat([{ role: 'user', content: text }]);
    this.setData({ messages, input: '', aiLoading: true, scrollTo: 'msg-end' });
    ai.callAI(messages).then(reply => {
      this.setData({
        messages: messages.concat([{ role: 'assistant', content: reply }]),
        aiLoading: false,
        scrollTo: 'msg-end'
      });
    }).catch(err => {
      this.setData({ aiLoading: false });
      wx.showModal({
        title: 'AI 调用失败',
        content: ai.friendlyError(err),
        confirmText: '去设置',
        cancelText: '关闭',
        success: res => {
          if (res.confirm) wx.switchTab({ url: '/pages/settings/settings' });
        }
      });
    });
  },
  resetAi() {
    this.setData({ messages: ai.newChat(this.data.aiMode, this.contentText), scrollTo: 'msg-end' });
  }
});
