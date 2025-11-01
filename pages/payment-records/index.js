const auth = require("../../utils/auth.js");

Page({
  data: {
    orders: [],
    loading: false
  },

  onLoad() {
    if (!auth.requireLogin(true)) {
      return;
    }
    this.loadPaymentRecords();
  },

  onShow() {
    wx.setNavigationBarTitle({ title: "支付记录" });
  },

  loadPaymentRecords() {
    const token = auth.getToken();
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";

    this.setData({ loading: true });

    wx.request({
      url: `${apiBaseUrl}/api/wechat-pay/orders?limit=50`,
      method: "GET",
      header: {
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS") {
          const orders = res.data.data.orders || [];
          this.setData({
            orders: orders,
            loading: false
          });
        } else {
          wx.showToast({ title: "加载失败", icon: "none" });
          this.setData({ loading: false });
        }
      },
      fail: (err) => {
        console.error("加载支付记录失败:", err);
        wx.showToast({ title: "网络异常", icon: "none" });
        this.setData({ loading: false });
      }
    });
  },

  // 查询并完成订单
  completeOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    const token = auth.getToken();
    const app = getApp();
    const apiBaseUrl = wx.getStorageSync("apiBaseUrl") || 
                      (app && app.globalData && app.globalData.apiBaseUrl) || 
                      "http://127.0.0.1:3000";

    wx.showModal({
      title: '验证支付状态',
      content: '系统将向微信查询订单状态，确认支付成功后才会发放积分',
      confirmText: '开始验证',
      cancelText: '取消',
      success: (modalRes) => {
        if (modalRes.confirm) {
          wx.showLoading({ title: '验证支付状态...' });

          wx.request({
            url: `${apiBaseUrl}/api/wechat-pay/query-and-complete`,
            method: "POST",
            header: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            data: { orderId },
            success: (res) => {
              wx.hideLoading();
              if (res.data && res.data.code === "SUCCESS") {
                wx.showModal({
                  title: '订单已完成',
                  content: `支付验证通过！获得${res.data.data.credits}积分`,
                  showCancel: false,
                  confirmText: '确定',
                  success: () => {
                    this.loadPaymentRecords();
                  }
                });
              } else if (res.data && res.data.code === "ORDER_NOT_PAID") {
                wx.showModal({
                  title: '订单未支付',
                  content: '微信查询显示订单未支付，请先完成支付',
                  showCancel: false,
                  confirmText: '知道了'
                });
              } else {
                wx.showModal({
                  title: '处理失败',
                  content: res.data.error || "无法完成订单",
                  showCancel: false,
                  confirmText: '确定'
                });
              }
            },
            fail: (err) => {
              wx.hideLoading();
              wx.showToast({ title: "网络异常", icon: "none" });
            }
          });
        }
      }
    });
  },

  // 刷新
  onPullDownRefresh() {
    this.loadPaymentRecords();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  }
});

