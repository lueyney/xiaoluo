const auth = require("../../utils/auth.js");

Page({
  data: {
    phone: "",
    password: "",
    code: "",
    activeTab: "password", // password | code
    showPassword: false,
    isLoading: false,
    isCodeSent: false,
    countdown: 0,
    isPrivacyAgreed: true
  },
  
  onLoad() {
    // 初始化检查是否已登录
    if (auth.isLoggedIn()) {
      wx.switchTab({ url: "/pages/writing/index" });
      return;
    }
    
    // 检测运行环境
    this.detectEnvironment();
  },
  
  // 检测运行环境（此处返回空实现）
  detectEnvironment() {},
  
  onShow() {
    wx.setNavigationBarTitle({ title: "登录论文君" });
  },
  
  onPhoneInput(e) {
    const phone = e.detail.value.trim();
    this.setData({ phone });
  },
  
  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },
  
  onCodeInput(e) {
    const code = e.detail.value.trim();
    this.setData({ code });
  },
  
  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },
  
  switchTab(e) {
    const { tab } = e.currentTarget.dataset || {};
    if (!tab || tab === this.data.activeTab) {
      return;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    this.setData({
      activeTab: tab,
      password: "",
      code: "",
      showPassword: false,
      isCodeSent: false,
      countdown: 0
    });
  },
  
  validatePhone(phone) {
    if (!phone) {
      return { valid: false, message: "请输入手机号" };
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return { valid: false, message: "请输入正确的11位手机号" };
    }
    return { valid: true };
  },
  
  validatePassword(password) {
    if (!password) {
      return { valid: false, message: "请输入密码" };
    }
    if (password.length < 6) {
      return { valid: false, message: "密码至少需要6位" };
    }
    if (password.length > 32) {
      return { valid: false, message: "密码不能超过32位" };
    }
    return { valid: true };
  },
  
  validateCode(code) {
    if (!code) {
      return { valid: false, message: "请输入验证码" };
    }
    if (!/^\d{6}$/.test(code)) {
      return { valid: false, message: "请输入6位数字验证码" };
    }
    return { valid: true };
  },
  
  getApiBaseUrl() {
    try {
      const app = getApp();
      return (
        wx.getStorageSync("apiBaseUrl") ||
        (app && app.globalData && app.globalData.apiBaseUrl) ||
        "http://127.0.0.1:3000"
      );
    } catch (e) {
      console.error("获取API地址失败:", e);
      return "http://127.0.0.1:3000";
    }
  },
  sendCode() {
    const { phone, activeTab, isCodeSent, countdown } = this.data;
    
    if (activeTab !== "code") {
      return;
    }
    
    // 校验手机号
    const phoneValidation = this.validatePhone(phone);
    if (!phoneValidation.valid) {
      wx.showToast({ title: phoneValidation.message, icon: "none" });
      return;
    }
    
    // 防止重复点击
    if (isCodeSent && countdown > 0) {
      wx.showToast({ title: `请${countdown}秒后再试`, icon: "none" });
      return;
    }
    
    this.setData({ isLoading: true });
    
    wx.request({
      url: `${this.getApiBaseUrl()}/api/auth/send-code`,
      method: "POST",
      data: { phone, scene: "login" },
      header: { "Content-Type": "application/json" },
      success: res => {
        if (!res.data) {
          wx.showToast({ title: "服务器响应异常", icon: "none" });
          return;
        }
        
        const { code: respCode, error, message } = res.data;
        if (respCode === "SUCCESS") {
          this.setData({ isCodeSent: true, countdown: 60 });
          wx.showToast({ title: "验证码已发送", icon: "success" });
          this.startCountdown();
        } else {
          wx.showToast({ 
            title: message || error || "发送失败，请稍后重试", 
            icon: "none",
            duration: 2000
          });
        }
      },
      fail: err => {
        console.error("发送验证码失败:", err);
        wx.showToast({ 
          title: "网络异常，请检查网络连接", 
          icon: "none",
          duration: 2000
        });
      },
      complete: () => {
        this.setData({ isLoading: false });
      }
    });
  },
  startCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    this.countdownTimer = setInterval(() => {
      const value = this.data.countdown - 1;
      if (value <= 0) {
        clearInterval(this.countdownTimer);
        this.setData({ countdown: 0, isCodeSent: false });
      } else {
        this.setData({ countdown: value });
      }
    }, 1000);
  },
  login() {
    const { activeTab, phone, password, code, isLoading } = this.data;
    
    // 防止重复提交
    if (isLoading) {
      return;
    }
    
    // 校验手机号
    const phoneValidation = this.validatePhone(phone);
    if (!phoneValidation.valid) {
      wx.showToast({ title: phoneValidation.message, icon: "none" });
      return;
    }

    // 根据登录方式校验
    let validation;
    if (activeTab === "password") {
      validation = this.validatePassword(password);
      if (!validation.valid) {
        wx.showToast({ title: validation.message, icon: "none" });
        return;
      }
    } else {
      validation = this.validateCode(code);
      if (!validation.valid) {
        wx.showToast({ title: validation.message, icon: "none" });
        return;
      }
    }

    // 构建请求数据
    const payload = {
      phone,
      ...(activeTab === "password" ? { password } : { code })
    };

    this.setData({ isLoading: true });
    
    wx.request({
      url: `${this.getApiBaseUrl()}/api/auth/login`,
      method: "POST",
      data: payload,
      header: { "Content-Type": "application/json" },
      timeout: 10000, // 10秒超时
      success: res => {
        if (!res.data) {
          wx.showToast({ 
            title: "服务器响应异常", 
            icon: "none",
            duration: 2000
          });
          return;
        }
        
        const { code: respCode, data, message, error } = res.data;
        
        if (respCode !== "SUCCESS" || !data || !data.token) {
          wx.showToast({ 
            title: message || error || "登录失败，请检查账号密码", 
            icon: "none",
            duration: 2000
          });
          return;
        }
        
        // 保存登录信息
        try {
          auth.saveLoginInfo(data.token, data.user || {});
          
          // 同步积分到本地
          const points = require("../../utils/points.js");
          if (data.user && typeof data.user.credits === "number") {
            points.setCredits(data.user.credits);
          }
          
          wx.showToast({ title: "登录成功！", icon: "success" });
          
          setTimeout(() => {
            wx.switchTab({ 
              url: "/pages/writing/index",
              fail: err => {
                console.error("跳转失败:", err);
                wx.redirectTo({ url: "/pages/writing/index" });
              }
            });
          }, 800);
        } catch (e) {
          console.error("保存登录信息失败:", e);
          wx.showToast({ title: "登录失败，请重试", icon: "none" });
        }
      },
      fail: err => {
        console.error("登录请求失败:", err);
        let errorMsg = "网络异常，请检查网络连接";
        
        if (err.errMsg) {
          if (err.errMsg.includes("timeout")) {
            errorMsg = "请求超时，请稍后重试";
          } else if (err.errMsg.includes("fail")) {
            errorMsg = "网络连接失败，请检查网络";
          }
        }
        
        wx.showToast({ 
          title: errorMsg, 
          icon: "none",
          duration: 2000
        });
      },
      complete: () => {
        this.setData({ isLoading: false });
      }
    });
  },
  // 快捷登录
  quickLogin() {
    if (this.data.isLoading) {
      return;
    }
    this.setData({
      phone: "13800138000",
      password: "Pass@123",
      activeTab: "password",
      showPassword: false
    });
    setTimeout(() => {
      this.login();
    }, 300);
  },
  
  onPrivacyChange(e) {
    const isAgreed = e.detail.value.includes('agree');
    this.setData({ isPrivacyAgreed: isAgreed });
  },
  
  goToPrivacyPolicy() {
    wx.navigateTo({ url: "/pages/profile/privacy/index" });
  },

  onUnload() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  }
});
