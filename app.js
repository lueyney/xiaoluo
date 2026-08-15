// 微信小程序 App 入口文件
const { ensureCredits } = require("./utils/points.js");
const { ensureNotifications } = require("./utils/notifications.js");
const docNotifications = require("./utils/doc-notifications.js");

App({
  globalData: {
    // 统一使用公网正式环境作为默认 API 地址（开发版真机 & 上线版本都走这里）
    apiBaseUrl: "https://yaoguangxiaoluo.cn",
    apiBaseUrlLAN: "https://yaoguangxiaoluo.cn", // 保留字段名，实际同样指向公网
    apiBaseUrlProd: "https://yaoguangxiaoluo.cn", // 正式环境域名
    useProdApiInDevtools: true, // 开发工具也默认走线上域名
    userInfo: null
  },
  
  onLaunch() {
    console.log("论文君小程序启动");
    
    // 检测运行环境并设置API地址
    this.detectEnvironmentAndSetAPI();
    
    // 初始化积分系统
    ensureCredits();
    
    // 初始化通知系统
    ensureNotifications();
    
    // 初始化文档通知系统（红点）
    docNotifications.init();
  },
  
  // 检测环境并设置API地址
  detectEnvironmentAndSetAPI() {
    let envVersion = 'develop';
    try {
      const accountInfo = wx.getAccountInfoSync();
      envVersion = accountInfo?.miniProgram?.envVersion || 'develop';
    } catch (error) {
      console.warn('无法获取envVersion，默认按开发环境处理', error);
    }

    // 无论开发版 / 体验版 / 正式版，统一走公网正式域名
      const prodUrl = this.globalData.apiBaseUrlProd;
      wx.setStorageSync('apiBaseUrl', prodUrl);
    console.log(`🌐 [${envVersion}] 统一使用线上域名:`, prodUrl);
  },
  
  onShow() {
    console.log("小程序显示");
  },
  
  onHide() {
    console.log("小程序隐藏");
  },
  
  onError(msg) {
    console.error("小程序错误:", msg);
  }
});
