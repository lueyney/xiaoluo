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
      earnedCredits: 0,
      claimableCount: 0
    },
    inputInviteCode: "",
    submittingInvite: false,
    claimingInviteReward: false,
    inviteTab: "my",
    hasUnreadNotification: false,
    showPhoneLoginModal: false,
    isLoading: true,
    lastLoadTime: 0
  },

  onLoad() {
    this.setData({ isLoading: false });
    wx.hideLoading();

    if (!this.checkLoginStatus()) {
      return;
    }
    this.initPage();
  },

  onShow() {
    wx.setNavigationBarTitle({ title: "我的" });
    wx.hideLoading();

    if (!this.checkLoginStatus()) {
      return;
    }

    const now = Date.now();
    if (now - this.data.lastLoadTime < 5000) {
      return;
    }

    this.loadUserInfoFromServer();
    this.loadInviteStatus();
    this.refreshNotifications();
  },

  initPage() {
    this.loadLocalUserInfo();
    this.loadUserInfoFromServer();
    this.loadInviteStatus();
    this.refreshNotifications();
  },

  loadLocalUserInfo() {
    const userData = auth.getUserInfo();
    if (userData) {
      const credits = points.getCredits();
      this.setData({
        'userInfo.nickname': userData.nickname || '学术研究者',
        'userInfo.avatar': userData.avatar || this.data.userInfo.avatar,
        'userInfo.credits': credits,
        'userInfo.inviteCode': userData.inviteCode || '',
        'userInfo.hasUsedInvite': !!userData.hasUsedInvite,
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

    wx.showLoading({ title: "加载中..." });

    const apiBaseUrl = getApiBaseUrl();

    wx.request({
      url: `${apiBaseUrl}/api/user/profile`,
      method: "GET",
      header: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS" && res.data.data) {
          const { userInfo, stats, hasUnreadNotification } = res.data.data;

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
              earnedCredits: stats.gainedCredits || 0,
              claimableCount: this.data.inviteStats.claimableCount || 0
            },
            hasUnreadNotification: hasUnreadNotification || false
          });

          const userData = auth.getUserInfo() || {};
          userData.credits = userInfo.credits || 0;
          userData.inviteCode = userInfo.inviteCode || "";
          userData.hasUsedInvite = !!userInfo.hasUsedInvite;
          wx.setStorageSync("userData", userData);

          points.setCredits(userInfo.credits || 0);
          this.loadRealOrderCount();
        } else {
          wx.showToast({
            title: "获取用户信息失败",
            icon: "none"
          });
        }
      },
      fail: (err) => {
        console.error("获取用户信息失败:", err);
        wx.showToast({
          title: "网络异常，请稍后重试",
          icon: "none"
        });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  loadInviteStatus() {
    const token = auth.getToken();
    if (!token) {
      return;
    }

    const apiBaseUrl = getApiBaseUrl();
    wx.request({
      url: `${apiBaseUrl}/api/user/invite/status`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === 'SUCCESS' && res.data.data) {
          this.setData({
            'userInfo.inviteCode': res.data.data.inviteCode || this.data.userInfo.inviteCode,
            'inviteStats.claimableCount': Number(res.data.data.claimableCount || 0)
          });
        }
      },
      fail: (err) => {
        console.error('获取邀请状态失败:', err);
      }
    });
  },

  loadRealOrderCount() {
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    wx.request({
      url: `${apiBaseUrl}/api/orders`,
      method: "GET",
      header: {
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS" && res.data.data) {
          const totalOrders = (res.data.data.pagination && res.data.data.pagination.total) || 0;
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
      wx.showTabBarRedDot({ index: 4 });
    } else {
      wx.hideTabBarRedDot({ index: 4 });
    }
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
      wx.navigateTo({ url: "/pages/profile/wheel/index" });
      return;
    }
    const url = routeMap[key];
    if (url) {
      wx.navigateTo({ url });
      return;
    }
    wx.showToast({ title: "功能开发中", icon: "none" });
  },

  handleLogout() {
    auth.logout();
  },

  copyInviteCode() {
    const inviteCode = this.data.userInfo.inviteCode;
    if (!inviteCode) {
      wx.showToast({
        title: '邀请码加载中',
        icon: 'none'
      });
      return;
    }

    wx.setClipboardData({
      data: inviteCode,
      success: () => {
        wx.showToast({
          title: '邀请码已复制',
          icon: 'success'
        });
      }
    });
  },

  shareInviteCode() {
    const inviteCode = this.data.userInfo.inviteCode;
    if (!inviteCode) {
      wx.showToast({
        title: '邀请码加载中',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '邀请好友',
      content: `您的邀请码是：${inviteCode}\n\n好友填写后可得10积分，您可领取30积分邀请奖励。`,
      confirmText: '复制邀请码',
      success: (res) => {
        if (res.confirm) {
          this.copyInviteCode();
        }
      }
    });
  },

  claimInviteReward() {
    if (this.data.claimingInviteReward) {
      return;
    }

    const count = Number(this.data.inviteStats.claimableCount || 0);
    if (count <= 0) {
      wx.showToast({ title: '暂无可领取奖励', icon: 'none' });
      return;
    }

    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();
    this.setData({ claimingInviteReward: true });

    wx.request({
      url: `${apiBaseUrl}/api/user/invite/claim`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === 'SUCCESS' && res.data.data) {
          const claimedCredits = Number(res.data.data.claimedCredits || 0);
          if (claimedCredits > 0) {
            wx.showToast({ title: `已领取${claimedCredits}积分`, icon: 'success' });
          } else {
            wx.showToast({ title: res.data.message || '暂无可领取奖励', icon: 'none' });
          }
          this.loadUserInfoFromServer();
          this.loadInviteStatus();
        } else {
          wx.showToast({ title: (res.data && (res.data.error || res.data.message)) || '领取失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('领取邀请奖励失败:', err);
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
      },
      complete: () => {
        this.setData({ claimingInviteReward: false });
      }
    });
  },

  switchInviteTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ inviteTab: tab });
  },

  onInviteCodeInput(e) {
    this.setData({ inputInviteCode: e.detail.value.trim() });
  },

  submitInviteCode() {
    const code = this.data.inputInviteCode;

    if (!code) {
      wx.showToast({
        title: '请输入邀请码',
        icon: 'none'
      });
      return;
    }

    if (code === this.data.userInfo.inviteCode) {
      wx.showToast({
        title: '不能使用自己的邀请码',
        icon: 'none'
      });
      return;
    }

    this.setData({ submittingInvite: true });

    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    wx.request({
      url: `${apiBaseUrl}/api/user/invite/bind`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      data: { inviteCode: code },
      success: (res) => {
        if (res.data && res.data.code === 'SUCCESS') {
          wx.showToast({
            title: '邀请码使用成功！已获得10积分',
            icon: 'success',
            duration: 2000
          });

          setTimeout(() => {
            this.loadUserInfoFromServer();
            this.loadInviteStatus();
            this.setData({ inputInviteCode: '' });
          }, 600);
        } else {
          wx.showToast({
            title: (res.data && (res.data.error || res.data.message)) || '邀请码无效',
            icon: 'none',
            duration: 2000
          });
        }
      },
      fail: (err) => {
        console.error('提交邀请码失败:', err);
        wx.showToast({
          title: '网络异常，请重试',
          icon: 'none'
        });
      },
      complete: () => {
        this.setData({ submittingInvite: false });
      }
    });
  },

  showPhoneLoginModal() {
    this.setData({ showPhoneLoginModal: true });
  },

  onPhoneLoginClose() {
    this.setData({ showPhoneLoginModal: false });
  },

  onPhoneLoginSuccess(e) {
    console.log('[我的] 一键登录成功', e.detail);
    this.loadUserInfoFromServer();
    this.loadInviteStatus();
  },

  onShareAppMessage() {
    const inviteCode = this.data.userInfo.inviteCode;

    return {
      title: `论文君邀请您注册！使用邀请码 ${inviteCode}，填写后可得10积分`,
      path: `/pages/register/index?inviteCode=${inviteCode}`,
      imageUrl: '/assets/app-logo.png'
    };
  }
});
