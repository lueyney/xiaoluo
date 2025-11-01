const auth = require("../../utils/auth.js");

Page({
  data: {
    phone: "",
    code: "",
    password: "",
    confirmPassword: "",
    inviteCode: "",
    showPassword: false,
    showConfirmPassword: false,
    isLoading: false,
    isCodeSent: false,
    countdown: 0,
    fromInvite: false
  },
  
  onLoad(options) {
    // 检查是否已登录
    if (auth.isLoggedIn()) {
      wx.switchTab({ url: "/pages/writing/index" });
      return;
    }
    
    // 如果有邀请码参数，自动填充
    if (options.inviteCode) {
      this.setData({ 
        inviteCode: options.inviteCode,
        fromInvite: true
      });
      
      wx.showToast({
        title: '邀请码已自动填充，双方各得10积分',
        icon: 'none',
        duration: 2000
      });
    }
  },
  
  onShow() {
    wx.setNavigationBarTitle({ title: "注册论文君" });
  },
  
  onPhoneInput(e) {
    const phone = e.detail.value.trim();
    this.setData({ phone });
  },
  
  onCodeInput(e) {
    const code = e.detail.value.trim();
    this.setData({ code });
  },
  
  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },
  
  onConfirmPasswordInput(e) {
    this.setData({ confirmPassword: e.detail.value });
  },
  
  onInviteCodeInput(e) {
    const inviteCode = e.detail.value.trim().toUpperCase();
    this.setData({ inviteCode });
  },
  
  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },
  
  toggleConfirmPassword() {
    this.setData({ showConfirmPassword: !this.data.showConfirmPassword });
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
  
  validateCode(code) {
    if (!code) {
      return { valid: false, message: "请输入验证码" };
    }
    if (!/^\d{6}$/.test(code)) {
      return { valid: false, message: "请输入6位数字验证码" };
    }
    return { valid: true };
  },
  
  validatePassword(password) {
    if (!password) {
      return { valid: false, message: "请设置密码" };
    }
    if (password.length < 6) {
      return { valid: false, message: "密码至少需要6位" };
    }
    if (password.length > 32) {
      return { valid: false, message: "密码不能超过32位" };
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
    const { phone, isCodeSent, countdown } = this.data;
    
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
      data: { phone, scene: "register" },
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
  submit() {
    const { phone, code, password, confirmPassword, inviteCode, isLoading } = this.data;
    
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
    
    // 校验验证码
    const codeValidation = this.validateCode(code);
    if (!codeValidation.valid) {
      wx.showToast({ title: codeValidation.message, icon: "none" });
      return;
    }
    
    // 校验密码
    const passwordValidation = this.validatePassword(password);
    if (!passwordValidation.valid) {
      wx.showToast({ title: passwordValidation.message, icon: "none" });
      return;
    }
    
    // 校验确认密码
    if (!confirmPassword) {
      wx.showToast({ title: "请再次输入密码", icon: "none" });
      return;
    }
    
    if (password !== confirmPassword) {
      wx.showToast({ title: "两次输入的密码不一致", icon: "none" });
      return;
    }

    // 构建请求数据
    const requestData = {
      phone,
      code,
      password
    };
    
    // 如果有邀请码，添加到请求中
    if (inviteCode) {
      requestData.inviteCode = inviteCode;
    }

    this.setData({ isLoading: true });
    
    wx.request({
      url: `${this.getApiBaseUrl()}/api/auth/register`,
      method: "POST",
      data: requestData,
      header: { "Content-Type": "application/json" },
      timeout: 10000,
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
        
        if (respCode === "SUCCESS" && data && data.token) {
          // 保存登录信息
          try {
            auth.saveLoginInfo(data.token, data.user || {});
            
            // 同步积分到本地
            const points = require("../../utils/points.js");
            if (data.user && typeof data.user.credits === "number") {
              points.setCredits(data.user.credits);
            }
            
            wx.showToast({ 
              title: "注册成功！欢迎加入", 
              icon: "success" 
            });
            
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
            console.error("保存注册信息失败:", e);
            wx.showToast({ title: "注册失败，请重试", icon: "none" });
          }
        } else {
          wx.showToast({ 
            title: message || error || "注册失败，请稍后重试", 
            icon: "none",
            duration: 2000
          });
        }
      },
      fail: err => {
        console.error("注册请求失败:", err);
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
  goLogin() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.redirectTo({ url: "/pages/login/index" });
    }
  },
  onUnload() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  }
});

