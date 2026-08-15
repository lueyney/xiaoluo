const auth = require("../../utils/auth.js");
const { getApiBaseUrl } = require("../../utils/request.js");

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
    const apiBaseUrl = getApiBaseUrl();

    this.setData({ loading: true });

    wx.request({
      url: `${apiBaseUrl}/api/wechat-pay/orders?limit=50`,
      method: "GET",
      header: {
        "Authorization": `Bearer ${token}`
      },
      success: (res) => {
        if (res.data && res.data.code === "SUCCESS") {
          const orders = (res.data.data.orders || []).map(item => Object.assign({}, item, {
            statusText: item.status === 'paid' ? '已支付' : item.status === 'pending' ? '待支付' : item.status === 'failed' ? '失败' : '未知',
            canQuery: item.status === 'pending'
          }));
          this.setData({
            orders,
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

  completeOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    wx.showModal({
      title: '验证支付状态',
      content: '系统将向微信查询订单状态，确认支付成功后才会发放积分',
      confirmText: '开始验证',
      cancelText: '取消',
      success: (modalRes) => {
        if (!modalRes.confirm) {
          return;
        }

        wx.showLoading({ title: '验证支付状态...' });

        wx.request({
          url: `${apiBaseUrl}/api/wechat-pay/poll-order/${orderId}`,
          method: "GET",
          header: {
            "Authorization": `Bearer ${token}`
          },
          success: (res) => {
            wx.hideLoading();
            if (res.data && res.data.code === "SUCCESS" && res.data.data && res.data.data.status === 'paid') {
              wx.showModal({
                title: '订单已完成',
                content: `支付验证通过！获得${res.data.data.credits || 0}积分`,
                showCancel: false,
                confirmText: '确定',
                success: () => {
                  this.loadPaymentRecords();
                }
              });
            } else if (res.data && res.data.code === "SUCCESS") {
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
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: "网络异常", icon: "none" });
          }
        });
      }
    });
  },

  onPullDownRefresh() {
    this.loadPaymentRecords();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1000);
  }
});
