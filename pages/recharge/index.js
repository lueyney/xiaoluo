const auth = require("../../utils/auth.js");
const points = require("../../utils/points.js");

Page({
  data: {
    credits: 0,
    rechargePackages: [
      { id: 1, credits: 1, price: 1, bonus: 0, label: "体验套餐", recommended: false, isFirstTime: false },
      { id: 2, credits: 10, price: 10, bonus: 0, label: "可生成任务书", recommended: false, isFirstTime: false },
      { id: 3, credits: 20, price: 20, bonus: 0, label: "可生成开题报告", recommended: false, isFirstTime: false },
      { id: 4, credits: 50, price: 50, bonus: 0, label: "热门套餐", recommended: true, isFirstTime: false },
      { id: 5, credits: 100, price: 100, bonus: 0, label: "豪华套餐", recommended: false, isFirstTime: false }
    ],
    firstTimePackage: { id: 0, credits: 50, price: 1, bonus: 49, label: "首充特惠", recommended: true, isFirstTime: true },
    hasFirstRecharge: false,
    selectedPackage: null,
    isLoading: true,
    isCheckingFirstRecharge: false
  },

  onLoad() {
    // 立即显示页面，避免白屏
    this.setData({ isLoading: false });
    wx.hideLoading();
    
    if (!auth.requireLogin(true)) {
      return;
    }
    this.initPage();
  },

  onShow() {
    wx.setNavigationBarTitle({ title: "积分充值" });
    // 清除可能的loading遮罩
    wx.hideLoading();
    // 只在必要时刷新
    this.loadCredits();
  },
  
  initPage() {
    // 显示loading
    this.setData({ isLoading: true });
    
    // 先加载本地数据
    this.loadCredits();
    
    // 异步检查首充状态（不阻塞页面）
    this.checkFirstRecharge();
    
    // 页面加载完成
    this.setData({ isLoading: false });
  },

  loadCredits() {
    const credits = points.getCredits();
    this.setData({ credits });
  },

  // 检查是否已经首充
  checkFirstRecharge() {
    const token = auth.getToken();
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";

    wx.request({
      url: `${apiBaseUrl}/api/wechat-pay/check-first-recharge`,
      method: "GET",
      header: {
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS") {
          const hasFirstRecharge = res.data.data.hasFirstRecharge;
          this.setData({ hasFirstRecharge });
          
          // 如果已经首充，从列表中移除首充套餐
          if (hasFirstRecharge) {
            this.setData({ firstTimePackage: null });
          }
        }
      },
      fail: (err) => {
        console.error("检查首充状态失败:", err);
      }
    });
  },

  selectPackage(e) {
    const packageId = e.currentTarget.dataset.id;
    const isFirstTime = e.currentTarget.dataset.firsttime;
    
    if (isFirstTime) {
      this.selectRecommendPackage();
    } else {
      const selected = this.data.rechargePackages.find(p => p.id === packageId);
      if (selected) {
        this.processPayment(selected);
      }
    }
  },

  processPayment(pkg) {
    const token = auth.getToken();
    if (!token) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }

    wx.showLoading({ title: '正在准备支付...' });

    // 1. 先获取微信登录code
    wx.login({
      success: (loginRes) => {
        if (loginRes.code) {
          console.log('获取到code:', loginRes.code);
          this.createPaymentOrder(pkg, loginRes.code);
        } else {
          wx.hideLoading();
          wx.showToast({ title: '获取登录信息失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('wx.login失败:', err);
        wx.showToast({ title: '登录失败', icon: 'none' });
      }
    });
  },

  // 创建支付订单
  createPaymentOrder(pkg, code) {
    const token = auth.getToken();
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";

    wx.showLoading({ title: '正在创建订单...' });

    wx.request({
      url: `${apiBaseUrl}/api/wechat-pay/create-order`,
      method: "POST",
      header: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      data: {
        code: code,  // 传递code给后端
        packageId: pkg.id,
        amount: pkg.price,
        credits: pkg.credits + pkg.bonus,
        isFirstTime: pkg.isFirstTime || false
      },
      success: (res) => {
        wx.hideLoading();
        
        if (res.data && res.data.code === "SUCCESS") {
          const orderId = res.data.data.orderId;
          const payParams = res.data.data.payParams;
          
          console.log('订单创建成功:', orderId);
          console.log('支付参数:', payParams);
          
          // 调用微信支付
          if (payParams && !payParams.mock) {
            this.requestWeChatPayment(payParams, orderId, pkg);
          } else {
            wx.showModal({
              title: '配置未完成',
              content: '微信支付未配置完整，请联系管理员',
              showCancel: false
            });
          }
        } else {
          // 创建订单失败
          const errorMsg = res.data.message || res.data.error || "创建订单失败";
          console.error("创建订单失败:", res.data);
          
          wx.showModal({
            title: '创建订单失败',
            content: errorMsg,
            showCancel: false,
            confirmText: '我知道了'
          });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error("网络请求失败:", err);
        
        wx.showModal({
          title: '网络异常',
          content: '无法连接到服务器，请检查网络设置',
          showCancel: false,
          confirmText: '确定'
        });
      }
    });
  },

  // 调用微信支付
  requestWeChatPayment(payParams, orderId, pkg) {
    console.log('拉起微信支付:', payParams);
    
    wx.requestPayment({
      timeStamp: payParams.timeStamp,
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType,
      paySign: payParams.paySign,
      success: (res) => {
        // 支付成功（注意：这只是前端成功，不代表最终到账）
        console.log('微信支付成功:', res);
        wx.showToast({ 
          title: '支付成功，处理中...', 
          icon: 'success',
          duration: 2000
        });
        
        // 等待3秒后刷新积分（等待微信回调处理）
        setTimeout(() => {
          this.loadCredits();
          this.checkFirstRecharge();
        }, 3000);
      },
      fail: (err) => {
        console.error("支付失败:", err);
        
        // 详细的错误提示
        if (err.errMsg === 'requestPayment:fail cancel') {
          wx.showModal({
            title: '支付已取消',
            content: '您已取消本次支付，可以重新选择套餐充值',
            showCancel: false,
            confirmText: '我知道了'
          });
        } else if (err.errMsg.includes('参数错误')) {
          wx.showModal({
            title: '支付失败',
            content: '支付参数错误，请联系客服',
            showCancel: false,
            confirmText: '确定'
          });
        } else {
          wx.showModal({
            title: '支付失败',
            content: err.errMsg || '支付过程中出现错误，请稍后重试',
            showCancel: false,
            confirmText: '确定'
          });
        }
      }
    });
  },


  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/profile/index' });
      }
    });
  },
  
  // 选择推荐套餐（首次充值1元）
  selectRecommendPackage() {
    const firstTimePkg = this.data.firstTimePackage;
    if (firstTimePkg && !this.data.hasFirstRecharge) {
      this.processPayment(firstTimePkg);
    } else {
      wx.showToast({ title: "该优惠已使用", icon: "none" });
    }
  },

  // 跳转到支付记录页面
  goToPaymentRecords() {
    wx.navigateTo({ url: "/pages/payment-records/index" });
  }
});


