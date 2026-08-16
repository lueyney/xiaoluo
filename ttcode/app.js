// 抖音小程序 App 入口文件

App({
  globalData: {
    apiBaseUrl: "https://yaoguangxiaoluo.cn",
    userInfo: null
  },
  
  onLaunch: function(options) {
    console.log("📱 论文君小程序启动");
    
    // 最小化启动逻辑，避免阻塞
    this.minimalInitialize();
  },
  
  minimalInitialize: function() {
    try {
      // 仅设置必要的全局数据
      this.globalData.apiBaseUrl = "https://yaoguangxiaoluo.cn";
      console.log('🌐 API地址设置完成');
      
      // 延迟异步初始化
      setTimeout(() => {
        this.asyncInitialize();
      }, 0);
    } catch (error) {
      console.error('❌ App初始化失败:', error);
    }
  },
  
  asyncInitialize: function() {
    try {
      // 异步加载模块，避免阻塞启动
      require("./utils/auth.js");
      console.log('✅ 核心模块加载完成');
    } catch (error) {
      console.warn('⚠️ 模块加载失败:', error);
    }
  },
  
  onShow: function(options) {
    console.log("📱 小程序显示");
  },
  
  onHide: function() {
    console.log("📱 小程序隐藏");
  },
  
  onError: function(msg) {
    console.error("❌ 小程序错误:", msg);
  }
});
