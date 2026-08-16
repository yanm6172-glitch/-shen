// 背书刷题神器 - 全局逻辑
const store = require('./utils/store');

App({
  globalData: {
    version: '1.0.0'
  },
  onLaunch() {
    // 首次启动：自动导入内置题库与背书示例
    try {
      store.ensureBuiltinImported();
    } catch (e) {
      console.error('内置数据导入失败', e);
    }
  }
});
