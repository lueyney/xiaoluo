const points = require("../../utils/points.js");
const notifications = require("../../utils/notifications.js");
const auth = require("../../utils/auth.js");
const { getApiBaseUrl } = require("../../utils/request.js");

Page({
  data: {
    userInfo: {
      nickname: "学术研究者",
      avatar: "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=256&h=256&fit=crop&crop=face",
      vipLevel: "VIP会员",
      registerDate: "2024-01-01",
      credits: 0,
      inviteCode: "",
      hasUsedInvite: false
    },
    stats: {
      totalOrders: 0,
      generatedDocs: 0,
      balance: 0
    },
    inviteStats: {
      invitedCount: 0,
      earnedCredits: 0
    },
    inputInviteCode: "",
    submittingInvite: false,
    inviteTab: "my",
    hasUnreadNotification: false,
    showPhoneLoginModal: false,
    isLoading: true,
    lastLoadTime: 0
  },
  onLoad() {
    // 立即显示页面，避免白屏
    this.setData({ isLoading: false });
    tt.hideLoading();
    
    if (!this.checkLoginStatus()) {
      return;
    }
    this.initPage();
  },
  
  onShow() {
    tt.setNavigationBarTitle({ title: "我的" });
    
    // 清除可能的loading遮罩
    tt.hideLoading();
    
    if (!this.checkLoginStatus()) {
      return;
    }
    
    // 避免频繁刷新：5秒内不重复加载
    const now = Date.now();
    if (now - this.data.lastLoadTime < 5000) {
      return;
    }
    
    this.loadUserInfoFromServer();
    this.refreshNotifications();
  },
  
  initPage() {
    // 先从本地加载
    this.loadLocalUserInfo();
    
    // 异步从服务器加载
    this.loadUserInfoFromServer();
    this.refreshNotifications();
  },
  
  loadLocalUserInfo() {
    // 从缓存加载用户信息，快速显示
    const userData = auth.getUserInfo();
    if (userData) {
      const credits = points.getCredits();
      this.setData({
        'userInfo.nickname': userData.nickname || '学术研究者',
        'userInfo.avatar': userData.avatar || this.data.userInfo.avatar,
        'userInfo.credits': credits,
        'stats.balance': credits,
        isLoading: false
      });
    }
  },
  
  checkLoginStatus() {
    return auth.requireLogin(true);
  },
  
  loadUserInfoFromServer() {
    this.setData({ lastLoadTime: Date.now() });
    const token = auth.getToken();
    if (!token) {
      return;
    }
    
    tt.showLoading({ title: "加载中..." });
    
    const apiBaseUrl = getApiBaseUrl();
    
    tt.request({
      url: `${apiBaseUrl}/api/user/profile`,
      method: "GET",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS" && res.data.data) {
          const { userInfo, stats, hasUnreadNotification } = res.data.data;
          
          // 更新用户信息
          this.setData({
            userInfo: {
              nickname: userInfo.nickname || "用户",
              avatar: userInfo.avatar,
              vipLevel: userInfo.vipLevel || "普通会员",
              registerDate: userInfo.registerDate || "2024-01-01",
              credits: userInfo.credits || 0,
              inviteCode: userInfo.inviteCode || "",
              hasUsedInvite: userInfo.hasUsedInvite || false
            },
            stats: {
              totalOrders: stats.totalOrders || 0,
              generatedDocs: stats.generatedDocs || 0,
              balance: stats.balance || 0
            },
            inviteStats: {
              invitedCount: stats.invitedCount || 0,
              earnedCredits: stats.gainedCredits || 0
            },
            hasUnreadNotification: hasUnreadNotification || false
          });
          
          // 更新本地存储的用户数据
          const userData = auth.getUserInfo();
          if (userData) {
            userData.credits = userInfo.credits;
            tt.setStorageSync("userData", userData);
          }
          
          // 更新积分缓存
          points.setCredits(userInfo.credits);
          
          // 同时获取真实订单数
          this.loadRealOrderCount();
        } else {
          tt.showToast({ 
            title: "获取用户信息失败", 
            icon: "none" 
          });
        }
      },
      fail: (err) => {
        console.error("获取用户信息失败:", err);
        tt.showToast({ 
          title: "网络异常，请稍后重试", 
          icon: "none" 
        });
      },
      complete: () => {
        tt.hideLoading();
      }
    });
  },
  
  loadRealOrderCount() {
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();
    
    tt.request({
      url: `${apiBaseUrl}/api/orders`,
      method: "GET",
      header: {
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS" && res.data.data) {
          const totalOrders = res.data.data.pagination.total || 0;
          this.setData({
            "stats.totalOrders": totalOrders
          });
        }
      },
      fail: (err) => {
        console.error("获取订单数失败:", err);
      }
    });
  },
  
  loadUserInfo() {
    const userData = auth.getUserInfo();
    if (userData) {
      this.setData({
        userInfo: {
          nickname: userData.nickname || "用户",
          avatar: userData.avatar,
          vipLevel: userData.vipLevel || "普通会员",
          registerDate: userData.registerDate || "2024-01-01",
          credits: userData.credits || 0
        },
        inviteCode: userData.inviteCode || "LUNJUN2024"
      });
    }
  },
  refreshCredits() {
    const balance = points.getCredits();
    this.setData({
      "userInfo.credits": balance,
      "stats.balance": balance
    });
  },
  refreshNotifications() {
    const unread = notifications.hasUnread();
    this.setData({ hasUnreadNotification: unread });
    if (unread) {
      tt.showTabBarRedDot({ index: 4 });
    } else {
      tt.hideTabBarRedDot({ index: 4 });
    }
  },
  handleQuickAction(e) {
    const action = e.currentTarget.dataset.key;
    if (action === "balance") {
      tt.showToast({ title: "余额功能开发中", icon: "none" });
      return;
    }
    if (action === "invite") {
      this.handleInviteNow();
      return;
    }
    if (action === "wheel") {
      tt.showToast({ title: "幸运转盘敬请期待", icon: "none" });
      return;
    }
  },
  handleInviteNow() {
    tt.showModal({
      title: "邀请好友",
      content: "邀请好友注册，即可双方各得100积分奖励",
      showCancel: false
    });
  },
  copyInviteCode() {
    tt.setClipboardData({
      data: this.data.inviteCode,
      success: () => tt.showToast({ title: "邀请码已复制", icon: "success" })
    });
  },
  handleFeatureTap(e) {
    const key = e.currentTarget.dataset.key;
    const routeMap = {
      settings: "/pages/profile/settings/index",
      notice: "/pages/profile/notice/index",
      privacy: "/pages/profile/privacy/index",
      help: "/pages/profile/help/index"
    };
    if (key === "wheel") {
      tt.navigateTo({ url: "/pages/profile/wheel/index" });
      return;
    }
    const url = routeMap[key];
    if (url) {
      tt.navigateTo({ url });
      return;
    }
    tt.showToast({ title: "功能开发中", icon: "none" });
  },
  handleLogout() {
    auth.logout();
  },
  
  // 复制邀请码
  copyInviteCode() {
    const inviteCode = this.data.userInfo.inviteCode;
    if (!inviteCode) {
      tt.showToast({
        title: '邀请码加载中',
        icon: 'none'
      });
      return;
    }
    
    tt.setClipboardData({
      data: inviteCode,
      success: () => {
        tt.showToast({
          title: '邀请码已复制',
          icon: 'success'
        });
      }
    });
  },
  
  // 分享邀请码
  shareInviteCode() {
    const inviteCode = this.data.userInfo.inviteCode;
    if (!inviteCode) {
      tt.showToast({
        title: '邀请码加载中',
        icon: 'none'
      });
      return;
    }
    
    tt.showModal({
      title: '邀请好友',
      content: `您的邀请码是：${inviteCode}\n\n好友注册时填写此邀请码，双方各得10积分！`,
      confirmText: '复制邀请码',
      success: (res) => {
        if (res.confirm) {
          this.copyInviteCode();
        }
      }
    });
  },
  
  // 切换邀请Tab
  switchInviteTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ inviteTab: tab });
  },
  
  // 输入邀请码
  onInviteCodeInput(e) {
    this.setData({ inputInviteCode: e.detail.value.trim() });
  },
  
  // 提交邀请码
  submitInviteCode() {
    const code = this.data.inputInviteCode;
    
    if (!code) {
      tt.showToast({
        title: '请输入邀请码',
        icon: 'none'
      });
      return;
    }
    
    if (code === this.data.userInfo.inviteCode) {
      tt.showToast({
        title: '不能使用自己的邀请码',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ submittingInvite: true });
    
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();
    
    tt.request({
      url: `${apiBaseUrl}/api/user/use-invite-code`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      data: { inviteCode: code },
      success: (res) => {
        if (res.data && res.data.code === 'SUCCESS') {
          tt.showToast({
            title: '邀请码使用成功！已获得10积分',
            icon: 'success',
            duration: 2000
          });
          
          // 重新加载用户信息
          setTimeout(() => {
            this.loadUserInfoFromServer();
            this.setData({ inputInviteCode: '' });
          }, 2000);
        } else {
          tt.showToast({
            title: res.data.message || '邀请码无效',
            icon: 'none',
            duration: 2000
          });
        }
      },
      fail: (err) => {
        console.error('提交邀请码失败:', err);
        tt.showToast({
          title: '网络异常，请重试',
          icon: 'none'
        });
      },
      complete: () => {
        this.setData({ submittingInvite: false });
      }
    });
  },
  
  // 显示一键登录弹窗
  showPhoneLoginModal() {
    this.setData({ showPhoneLoginModal: true });
  },
  
  // 关闭一键登录弹窗
  onPhoneLoginClose() {
    this.setData({ showPhoneLoginModal: false });
  },
  
  // 一键登录成功
  onPhoneLoginSuccess(e) {
    console.log('[我的] 一键登录成功', e.detail);
    this.loadUserInfoFromServer();
  },
  
  // 微信分享功能
  onShareAppMessage(res) {
    const inviteCode = this.data.userInfo.inviteCode;
    
    return {
      title: `论文君邀请您注册！使用邀请码 ${inviteCode}，双方各得10积分`,
      path: `/pages/register/index?inviteCode=${inviteCode}`,
      imageUrl: '/assets/app-logo.png'
    };
  }
});
