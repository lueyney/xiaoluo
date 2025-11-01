// 微信小程序 App 入口文件
const { ensureCredits } = require("./utils/points.js");
const { ensureNotifications } = require("./utils/notifications.js");
const docNotifications = require("./utils/doc-notifications.js");

App({
  globalData: {
    apiBaseUrl: "http://127.0.0.1:3000", // 模拟器默认地址
    apiBaseUrlLAN: "http://172.20.10.8:3000", // 局域网地址（真机调试用）
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
    wx.getSystemInfo({
      success: (res) => {
        let apiUrl;
        
        // 判断是否为模拟器
        if (res.platform === 'devtools') {
          // 模拟器环境：使用 localhost
          apiUrl = this.globalData.apiBaseUrl;
          console.log('🔧 [开发模式] 模拟器环境，使用 localhost');
        } else {
          // 真机环境：使用局域网IP
          apiUrl = this.globalData.apiBaseUrlLAN;
          console.log('📱 [生产模式] 真机环境，使用局域网IP');
        }
        
        // 保存API地址到本地存储
        wx.setStorageSync("apiBaseUrl", apiUrl);
        console.log("API地址:", apiUrl);
      },
      fail: () => {
        // 获取失败时使用默认地址
        wx.setStorageSync("apiBaseUrl", this.globalData.apiBaseUrl);
        console.log("API地址（默认）:", this.globalData.apiBaseUrl);
      }
    });
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
