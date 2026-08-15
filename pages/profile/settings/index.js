const auth = require("../../../utils/auth.js");

Page({
  data: {
    loading: true,
    userInfo: {
      avatar: "",
      nickname: "",
      phone: "",
      email: "",
      maskedPhone: ""
    },
    basicEditMode: false,
    basicForm: {
      nickname: "",
      email: ""
    },
    savingBasic: false,
    isUpdatingAvatar: false,
    passwordModalVisible: false,
    passwordForm: {
      code: "",
      newPassword: "",
      confirmPassword: ""
    },
    passwordSubmitting: false,
    sendingCode: false,
    countdown: 0
  },

  onLoad(options = {}) {
    wx.setNavigationBarTitle({ title: "账号设置" });
    if (!auth.requireLogin(true)) {
      return;
    }
    this.openPasswordAfterFetch = options.open === "password";
    this.fetchProfile();
  },

  onUnload() {
    this.clearCountdownTimer();
  },

  noop() {},

  getApiBaseUrl() {
    const app = getApp();
    return wx.getStorageSync("apiBaseUrl") || (app && app.globalData && app.globalData.apiBaseUrl) || "http://127.0.0.1:3000";
  },

  fetchProfile() {
    const token = auth.getToken();
    if (!token) {
      return;
    }

    wx.showLoading({ title: "加载中..." });

    wx.request({
      url: `${this.getApiBaseUrl()}/api/user/profile`,
      method: "GET",
      header: {
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.code === "SUCCESS") {
          const info = res.data.data.userInfo || {};
          const nickname = info.nickname || "学术研究者";
          const email = info.email || "";
          const phone = info.phone || "";
          const maskedPhone = this.maskPhone(phone);
          const avatar = info.avatar || "";

          this.setData({
            userInfo: {
              avatar,
              nickname,
              email,
              phone,
              maskedPhone,
              registerDate: info.registerDate,
              vipLevel: info.vipLevel || "普通会员"
            },
            basicForm: {
              nickname,
              email
            },
            loading: false
          });

          if (this.openPasswordAfterFetch) {
            this.openPasswordAfterFetch = false;
            this.openPasswordModal();
          }

          const cached = auth.getUserInfo() || {};
          cached.nickname = nickname;
          cached.avatar = avatar;
          cached.email = email;
          cached.phone = phone;
          wx.setStorageSync("userData", cached);
        } else if (res.statusCode === 401) {
          auth.clearLoginInfo();
          auth.requireLogin(true);
        } else {
          wx.showToast({ title: res.data?.error || "加载失败", icon: "none" });
        }
      },
      fail: (err) => {
        console.error("获取账号信息失败:", err);
        wx.showToast({ title: "网络异常，请稍后再试", icon: "none" });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  maskPhone(phone) {
    if (!phone) return "未绑定";
    return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
  },

  toggleBasicEdit() {
    const next = !this.data.basicEditMode;
    this.setData({
      basicEditMode: next,
      basicForm: {
        nickname: this.data.userInfo.nickname || "",
        email: this.data.userInfo.email || ""
      }
    });
  },

  cancelBasicEdit() {
    this.setData({
      basicEditMode: false,
      basicForm: {
        nickname: this.data.userInfo.nickname || "",
        email: this.data.userInfo.email || ""
      }
    });
  },

  handleBasicEditTap() {
    if (this.data.basicEditMode) {
      this.cancelBasicEdit();
    } else {
      this.toggleBasicEdit();
    }
  },

  onBasicInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ [`basicForm.${field}`]: value });
  },

  saveBasicInfo() {
    if (this.data.savingBasic) return;

    const nickname = (this.data.basicForm.nickname || "").trim();
    let email = (this.data.basicForm.email || "").trim();

    if (!nickname) {
      wx.showToast({ title: "请输入用户名", icon: "none" });
      return;
    }

    if (email && !/^([a-zA-Z0-9_\-.+])+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(email)) {
      wx.showToast({ title: "邮箱格式不正确", icon: "none" });
      return;
    }

    const token = auth.getToken();
    if (!token) {
      auth.requireLogin(true);
      return;
    }

    this.setData({ savingBasic: true });

    const payload = { nickname };
    payload.email = email;

    wx.request({
      url: `${this.getApiBaseUrl()}/api/user/profile`,
      method: "PUT",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      data: payload,
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.code === "SUCCESS") {
          this.setData({
            savingBasic: false,
            basicEditMode: false
          });
          wx.showToast({ title: "资料已更新", icon: "success" });
          this.fetchProfile();
        } else {
          wx.showToast({ title: res.data?.error || "更新失败", icon: "none" });
          this.setData({ savingBasic: false });
        }
      },
      fail: (err) => {
        console.error("更新资料失败:", err);
        wx.showToast({ title: "网络异常，请稍后重试", icon: "none" });
        this.setData({ savingBasic: false });
      }
    });
  },

  onChooseAvatar() {
    if (this.data.isUpdatingAvatar) return;

    if (!auth.requireLogin(true)) {
      return;
    }

    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      success: (selectRes) => {
        if (!selectRes.tempFilePaths || !selectRes.tempFilePaths.length) {
          return;
        }
        const filePath = selectRes.tempFilePaths[0];
        this.uploadAvatar(filePath);
      }
    });
  },

  uploadAvatar(filePath) {
    this.setData({ isUpdatingAvatar: true });
    wx.showLoading({ title: "上传中...", mask: true });

    wx.getImageInfo({
      src: filePath,
      success: (info) => {
        const format = (info.type || "png").toLowerCase() === "jpg" ? "jpeg" : (info.type || "png").toLowerCase();
        wx.getFileSystemManager().readFile({
          filePath,
          encoding: "base64",
          success: (readRes) => {
            const base64 = `data:image/${format};base64,${readRes.data}`;
            this.submitAvatar(base64);
          },
          fail: (err) => {
            console.error("读取头像失败:", err);
            wx.showToast({ title: "读取文件失败", icon: "none" });
            wx.hideLoading();
            this.resetAvatarUploadState();
          }
        });
      },
      fail: (err) => {
        console.error("获取图片信息失败:", err);
        wx.showToast({ title: "无法识别图片", icon: "none" });
        wx.hideLoading();
        this.resetAvatarUploadState();
      }
    });
  },

  submitAvatar(imageData) {
    const token = auth.getToken();
    if (!token) {
      this.resetAvatarUploadState();
      wx.hideLoading();
      auth.requireLogin(true);
      return;
    }

    wx.request({
      url: `${this.getApiBaseUrl()}/api/user/avatar`,
      method: "POST",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      data: { image: imageData },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.code === "SUCCESS") {
          const newAvatar = res.data.data?.url || "";
          this.setData({
            userInfo: {
              ...this.data.userInfo,
              avatar: newAvatar
            }
          });

          const cached = auth.getUserInfo() || {};
          cached.avatar = newAvatar;
          wx.setStorageSync("userData", cached);

          wx.showToast({ title: "头像已更新", icon: "success" });
        } else {
          wx.showToast({ title: res.data?.error || "上传失败", icon: "none" });
        }
      },
      fail: (err) => {
        console.error("上传头像失败:", err);
        wx.showToast({ title: "网络异常，请稍后再试", icon: "none" });
      },
      complete: () => {
        this.resetAvatarUploadState();
        wx.hideLoading();
      }
    });
  },

  resetAvatarUploadState() {
    this.setData({ isUpdatingAvatar: false });
  },

  openPasswordModal() {
    this.setData({
      passwordModalVisible: true,
      passwordForm: {
        code: "",
        newPassword: "",
        confirmPassword: ""
      }
    });
  },

  closePasswordModal() {
    this.setData({
      passwordModalVisible: false,
      passwordSubmitting: false
    });
  },

  goNotice() {
    wx.navigateTo({
      url: "/pages/profile/notice/index"
    });
  },

  goPrivacy() {
    wx.navigateTo({
      url: "/pages/profile/privacy/index"
    });
  },

  goHelp() {
    wx.navigateTo({
      url: "/pages/profile/help/index"
    });
  },

  onPasswordInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ [`passwordForm.${field}`]: value });
  },

  sendPasswordCode() {
    if (this.data.sendingCode || this.data.countdown > 0) return;

    const phone = this.data.userInfo.phone;
    if (!phone) {
      wx.showToast({ title: "账号未绑定手机号", icon: "none" });
      return;
    }

    if (!/^\d{11}$/.test(phone)) {
      wx.showToast({ title: "手机号格式异常", icon: "none" });
      return;
    }

    this.setData({ sendingCode: true });

    wx.request({
      url: `${this.getApiBaseUrl()}/api/auth/send-code`,
      method: "POST",
      header: { "Content-Type": "application/json" },
      data: {
        phone,
        scene: 'password_reset'
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.code === "SUCCESS") {
          wx.showToast({ title: "验证码已发送", icon: "success" });
          this.startCountdown();
        } else {
          wx.showToast({ title: res.data?.error || "发送失败", icon: "none" });
        }
      },
      fail: (err) => {
        console.error("发送验证码失败:", err);
        wx.showToast({ title: "网络异常，请稍后再试", icon: "none" });
      },
      complete: () => {
        this.setData({ sendingCode: false });
      }
    });
  },

  startCountdown() {
    this.clearCountdownTimer();
    this.setData({ countdown: 60 });
    this.countdownTimer = setInterval(() => {
      const next = this.data.countdown - 1;
      if (next <= 0) {
        this.clearCountdownTimer();
        this.setData({ countdown: 0 });
      } else {
        this.setData({ countdown: next });
      }
    }, 1000);
  },

  clearCountdownTimer() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  },

  submitPasswordChange() {
    if (this.data.passwordSubmitting) return;

    const { code, newPassword, confirmPassword } = this.data.passwordForm;

    if (!/^[0-9]{6}$/.test(code)) {
      wx.showToast({ title: "请输入6位短信验证码", icon: "none" });
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      wx.showToast({ title: "密码至少6位", icon: "none" });
      return;
    }

    if (newPassword !== confirmPassword) {
      wx.showToast({ title: "两次密码不一致", icon: "none" });
      return;
    }

    const token = auth.getToken();
    if (!token) {
      auth.requireLogin(true);
      return;
    }

    this.setData({ passwordSubmitting: true });

    wx.request({
      url: `${this.getApiBaseUrl()}/api/user/change-password`,
      method: "POST",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      data: {
        code,
        newPassword
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data && res.data.code === "SUCCESS") {
          wx.showToast({ title: "密码已修改", icon: "success" });
          this.closePasswordModal();
          this.setData({
            passwordForm: {
              code: "",
              newPassword: "",
              confirmPassword: ""
            }
          });
        } else {
          wx.showToast({ title: res.data?.error || "修改失败", icon: "none" });
        }
      },
      fail: (err) => {
        console.error("修改密码失败:", err);
        wx.showToast({ title: "网络异常，请稍后再试", icon: "none" });
      },
      complete: () => {
        this.setData({ passwordSubmitting: false });
      }
    });
  },

  onBindWechat() {
    wx.showToast({ title: "功能开发中", icon: "none" });
  }
});

