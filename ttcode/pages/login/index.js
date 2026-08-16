const auth = require("../../utils/auth.js");
const MASTER_CODE = "243012";

Page({
  data: {
    phone: "",
    password: "",
    code: "",
    activeTab: "password",
    showPassword: false,
    isLoading: false,
    isCodeSent: false,
    countdown: 0,
    isPrivacyAgreed: false,
    hasAgreedPrivacy: false,
    loginCode: "",
    masterCode: MASTER_CODE
  },
  
  onLoad() {
    // 初始化检查是否已登录
    if (auth.isLoggedIn && auth.isLoggedIn()) {
      tt.switchTab({ url: "/pages/writing/index" });
      return;
    }
    
    console.log('🔐 登录页面加载完成');
    const agreed = tt.getStorageSync('privacy_agreed');
    this.setData({ isPrivacyAgreed: !!agreed, hasAgreedPrivacy: !!agreed });
    if (agreed) {
      this.refreshCode();
    }
  },
  
  onShow() {
    tt.setNavigationBarTitle({ title: "登录论文君" });
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

  // 隐私弹窗检查
  checkPrivacyAuth() {
    const popup = this.selectComponent('#privacyPopup');
    if (popup && !popup.checkPrivacy()) {
      return;
    }
    this.setData({ hasAgreedPrivacy: true, isPrivacyAgreed: true });
    this.refreshCode();
  },

  onPrivacyAgree() {
    this.setData({ hasAgreedPrivacy: true, isPrivacyAgreed: true });
    this.refreshCode();
  },

  refreshCode() {
    tt.login({
      success: (res) => {
        if (res.code) {
          this.setData({ loginCode: res.code });
          this.loginCode = res.code;
          console.log('Code refreshed:', res.code);
        }
      },
      fail: (err) => {
        console.error('tt.login 失败:', err);
      }
    });
  },
  
  // 兼容模板中的 bindtap="switchTab"
  switchTab(e) {
    const tab = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || 'password';
    this.setData({ activeTab: tab });
  },
  
  // 兼容模板中的 bindtap="login"
  login() {
    this.onLogin();
  },

  // 兼容模板中的 bindtap="sendCode"
  sendCode() {
    this.onSendCode();
  },

  // 兼容模板中的 bindtap="goRegister"
  goRegister() {
    this.onRegister();
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
        tt.getStorageSync("apiBaseUrl") ||
        (app && app.globalData && app.globalData.apiBaseUrl) ||
        "https://yaoguang.yaoguangxiaoluo.cn"
      );
    } catch (e) {
      console.error("获取API地址失败:", e);
      return "https://yaoguang.yaoguangxiaoluo.cn";
    }
  },

  onLogin() {
    if (!this.data.isPrivacyAgreed) {
      tt.showToast({ title: '请先同意隐私协议', icon: 'none' });
      return;
    }
    
    const { activeTab, phone, password, code, isLoading } = this.data;
    
    // 防止重复提交
    if (isLoading) {
      return;
    }
    
    // 校验手机号
    const phoneValidation = this.validatePhone(phone);
    if (!phoneValidation.valid) {
      tt.showToast({ title: phoneValidation.message, icon: "none" });
      return;
    }

    // 根据登录方式校验
    let validation;
    if (activeTab === "password") {
      validation = this.validatePassword(password);
      if (!validation.valid) {
        tt.showToast({ title: validation.message, icon: "none" });
        return;
      }
    } else {
      validation = this.validateCode(code);
      if (!validation.valid) {
        tt.showToast({ title: validation.message, icon: "none" });
        return;
      }
    }

    // 构建请求数据
    const payload = {
      phone,
      ...(activeTab === "password" ? { password } : { code })
    };

    this.setData({ isLoading: true });
    
    tt.request({
      url: `${this.getApiBaseUrl()}/api/auth/login`,
      method: "POST",
      data: payload,
      header: { "Content-Type": "application/json" },
      timeout: 10000, // 10秒超时
      success: res => {
        if (!res.data) {
          tt.showToast({ 
            title: "服务器响应异常", 
            icon: "none",
            duration: 2000
          });
          return;
        }
        
        const { code: respCode, data, message, error } = res.data;
        
        if (respCode === "PASSWORD_NOT_SET") {
          tt.showModal({
            title: "需要先设置密码",
            content: "您的账号尚未设置登录密码，请先使用验证码登录或前往个人中心设置密码。",
            confirmText: "去设置密码",
            cancelText: "改用验证码",
            success: (modalRes) => {
              if (modalRes.confirm) {
                tt.navigateTo({
                  url: "/pages/profile/settings/index?open=password",
                  fail: () => {
                    tt.switchTab({ url: "/pages/profile/index" });
                  }
                });
              } else {
                this.switchTab({ currentTarget: { dataset: { tab: "code" } } });
              }
            }
          });
          return;
        }

        if (respCode !== "SUCCESS" || !data || !data.token) {
          tt.showToast({ 
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
          
          tt.showToast({ title: "登录成功！", icon: "success" });
          
          const needSetPassword = !!data.needSetPassword;
          
          setTimeout(() => {
            if (needSetPassword) {
              tt.showModal({
                title: "建议设置密码",
                content: "为了保障账号安全，请前往个人中心设置登录密码。",
                confirmText: "去设置",
                cancelText: "稍后",
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    tt.navigateTo({
                      url: "/pages/profile/settings/index?open=password",
                      fail: () => {
                        tt.switchTab({ url: "/pages/profile/index" });
                      }
                    });
                    return;
                  }
                  this.navigateToWriting();
                },
                fail: () => {
                  this.navigateToWriting();
                }
              });
            } else {
              this.navigateToWriting();
            }
          }, 800);
        } catch (e) {
          console.error("保存登录信息失败:", e);
          tt.showToast({ title: "登录失败，请重试", icon: "none" });
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
        
        tt.showToast({ 
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

  navigateToWriting() {
    tt.switchTab({ 
      url: "/pages/writing/index",
      fail: err => {
        console.error("跳转失败:", err);
        tt.redirectTo({ url: "/pages/writing/index" });
      }
    });
  },

  handleGetPhoneNumber(e) {
    if (e.detail.errMsg !== "getPhoneNumber:ok") {
      tt.showToast({ title: '登录已取消', icon: 'none' });
      return;
    }

    // 获取加密数据
    const encryptedData = e.detail.encryptedData;
    const iv = e.detail.iv;
    const loginCode = this.data.loginCode || this.loginCode;

    if (!loginCode) {
      tt.showToast({ title: '登录凭证获取失败，请重试', icon: 'none' });
      return;
    }

    if (!encryptedData || !iv) {
      tt.showToast({ title: '获取手机号失败，请重试', icon: 'none' });
      return;
    }

    // 调用后端抖音登录接口
    this.setData({ isLoading: true });
    tt.showLoading({ title: '登录中...' });

    const app = getApp();
    const apiBaseUrl = tt.getStorageSync('apiBaseUrl') || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      'https://yaoguang.yaoguangxiaoluo.cn';

    tt.request({
      url: `${apiBaseUrl}/api/douyin/auth/login`,
      method: 'POST',
      data: {
        code: loginCode,
        anonymousCode: '', // 抖音登录页暂不传 anonymousCode，由后端处理
        encryptedData: encryptedData,
        iv: iv
      },
      header: {
        'Content-Type': 'application/json'
      },
      timeout: 15000,
      success: (res) => {
        tt.hideLoading();
        this.setData({ isLoading: false });

        if (res.data && res.data.code === 'SUCCESS' && res.data.data && res.data.data.token) {
          // 保存登录信息
          auth.saveLoginInfo(res.data.data.token, res.data.data.user || {});
          
          // 同步积分
          const points = require('../../utils/points.js');
          if (res.data.data.user && typeof res.data.data.user.credits === 'number') {
            points.setCredits(res.data.data.user.credits);
          }

          const isNewUser = res.data.data.isNewUser;
          const needSetPassword = !!res.data.data.needSetPassword;

          tt.showToast({
            title: '登录成功！',
            icon: 'success',
            duration: 1500
          });

          // 延迟跳转，让用户看到成功提示
          setTimeout(() => {
            // 跳转到主页面
            tt.switchTab({
              url: '/pages/writing/index',
              fail: () => {
                tt.reLaunch({ url: '/pages/writing/index' });
              }
            });

            // 如果需要设置密码，提示用户
            if (needSetPassword) {
              setTimeout(() => {
                tt.showModal({
                  title: '建议设置密码',
                  content: '为保障账号安全，建议您前往个人中心设置登录密码，方便后续使用密码登录。',
                  confirmText: '去设置',
                  cancelText: '稍后再说',
                  success: (modalRes) => {
                    if (modalRes.confirm) {
                      tt.navigateTo({
                        url: '/pages/profile/settings/index?open=password',
                        fail: () => {
                          tt.switchTab({ url: '/pages/profile/index' });
                        }
                      });
                    }
                  }
                });
              }, 1000);
            }
          }, 1500);
        } else {
          // 登录失败
          const errorMsg = res.data.message || res.data.error || '登录失败，请重试';
          tt.showToast({
            title: errorMsg,
            icon: 'none',
            duration: 2000
          });
        }
      },
      fail: (err) => {
        tt.hideLoading();
        this.setData({ isLoading: false });
        console.error('登录请求失败:', err);
        tt.showToast({
          title: '网络异常，请稍后重试',
          icon: 'none',
          duration: 2000
        });
      }
    });
  },
  
  
  onSendCode() {
    const { phone, activeTab, isCodeSent, countdown } = this.data;
    
    if (activeTab !== "code") {
      return;
    }
    
    // 校验手机号
    const phoneValidation = this.validatePhone(phone);
    if (!phoneValidation.valid) {
      tt.showToast({ title: phoneValidation.message, icon: "none" });
      return;
    }
    
    // 防止重复点击
    if (isCodeSent && countdown > 0) {
      tt.showToast({ title: `请${countdown}秒后再试`, icon: "none" });
      return;
    }
    
    this.setData({ isLoading: true });
    
    tt.request({
      url: `${this.getApiBaseUrl()}/api/auth/send-code`,
      method: "POST",
      data: { phone, scene: "login" },
      header: { "Content-Type": "application/json" },
      success: res => {
        if (!res.data) {
          tt.showToast({ title: "服务器响应异常", icon: "none" });
          return;
        }
        
        const { code: respCode, error, message } = res.data;
        if (respCode === "SUCCESS") {
          this.setData({ isCodeSent: true, countdown: 60 });
          tt.showToast({ title: "验证码已发送", icon: "success" });
          this.startCountdown();
        } else {
          tt.showToast({ 
            title: message || error || `发送失败，可直接输入万能验证码 ${MASTER_CODE}`, 
            icon: "none",
            duration: 2500
          });
        }
      },
      fail: err => {
        console.error("发送验证码失败:", err);
        tt.showToast({ 
          title: `网络异常，可直接输入万能验证码 ${MASTER_CODE}`, 
          icon: "none",
          duration: 2500
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
  
  onRegister() {
    tt.navigateTo({ url: '/pages/register/index' });
  },
  
  onPrivacyChange(e) {
    this.setData({ isPrivacyAgreed: e.detail.value });
  },

  onUnload() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  }
});
