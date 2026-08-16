// AI 交互背书：可配置 OpenAI 兼容接口（DeepSeek / OpenAI / 通义等）
const store = require('./store');

function getAIConfig() {
  const s = store.getSettings();
  return s.ai || { baseURL: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat' };
}

// 调用 chat/completions，返回 Promise<string>
function callAI(messages, opts) {
  const cfg = getAIConfig();
  const o = Object.assign({ temperature: 0.6, maxTokens: 1000, timeout: 60000 }, opts || {});
  if (!cfg.apiKey) {
    return Promise.reject(new Error('NO_KEY'));
  }
  const url = cfg.baseURL.replace(/\/+$/, '') + '/chat/completions';
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'POST',
      timeout: o.timeout,
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey
      },
      data: {
        model: cfg.model,
        messages: messages,
        temperature: o.temperature,
        max_tokens: o.maxTokens
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.choices && res.data.choices[0]) {
          resolve(res.data.choices[0].message.content || '');
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error('AUTH'));
        } else {
          reject(new Error('HTTP_' + res.statusCode + ':' + JSON.stringify(res.data || {}).slice(0, 120)));
        }
      },
      fail(err) {
        reject(new Error('NET:' + (err.errMsg || '网络请求失败')));
      }
    });
  });
}

function buildSystemPrompt(contentText, mode) {
  const base = '你是"背书刷题神器"里的背书助教。你手头只有下面这段【要背的内容】，一切问题、答案和讲解都必须严格围绕这段内容，不得编造内容以外的事实。回答用简体中文，语气亲切简洁。';
  const content = '\n\n【要背的内容】\n' + contentText;
  if (mode === 'quiz') {
    return base + '\n你的任务：根据内容出题考用户背诵情况。第一轮：出一道简答/填空/选择题（不要出答案）。当用户作答后，判断对错（回答"对/半对/错"），给出正确答案与一句讲解，然后再出下一道题。每次只出一题。' + content;
  }
  if (mode === 'cloze') {
    return base + '\n你的任务：把内容中的关键句改写成填空题（关键处用____替换），一次给3道，等用户作答后再判分并给出原文。' + content;
  }
  if (mode === 'ask') {
    return base + '\n你的任务：回答用户关于这段内容的提问。如果内容中没有答案，就明确说"这段内容里没有提到"，不要编造。' + content;
  }
  return base + content;
}

// 三种交互模式的消息构建
function newChat(mode, contentText) {
  return [
    { role: 'system', content: buildSystemPrompt(contentText, mode) },
    { role: 'assistant', content: initialGreeting(mode) }
  ];
}

function initialGreeting(mode) {
  if (mode === 'quiz') return '好的！我已经把内容读完了，现在开始考你。请听第一题：';
  if (mode === 'cloze') return '好的！我给你出3道填空，试试看：';
  return '我在呢！关于这段内容，你可以随便问我，比如"这一段的核心观点是什么？"';
}

// 把错误转成用户可读信息
function friendlyError(err) {
  const msg = (err && err.message) || '';
  if (msg === 'NO_KEY') return '还没有配置 AI 接口密钥，请到"设置"页填写 apiKey。';
  if (msg === 'AUTH') return 'API 密钥无效或没有权限，请检查设置。';
  if (msg.indexOf('NET:') === 0) return '网络请求失败：' + msg.slice(4) + '（开发工具中请勾选"不校验合法域名"，真机需配置 request 合法域名）';
  if (msg.indexOf('HTTP_') === 0) return '接口返回错误：' + msg;
  return 'AI 调用失败：' + msg;
}

module.exports = { getAIConfig, callAI, newChat, friendlyError };
