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
    tt.setNavigationBarTitle({ title: "支付记录" });
  },

  loadPaymentRecords() {
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    this.setData({ loading: true });

    tt.request({
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
          tt.showToast({ title: "加载失败", icon: "none" });
          this.setData({ loading: false });
        }
      },
      fail: (err) => {
        console.error("加载支付记录失败:", err);
        tt.showToast({ title: "网络异常", icon: "none" });
        this.setData({ loading: false });
      }
    });
  },

  // 查询并完成订单
  completeOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    const token = auth.getToken();
    const apiBaseUrl = getApiBaseUrl();

    tt.showModal({
      title: '验证支付状态',
      content: '系统将向微信查询订单状态，确认支付成功后才会发放积分',
      confirmText: '开始验证',
      cancelText: '取消',
      success: (modalRes) => {
        if (modalRes.confirm) {
          tt.showLoading({ title: '验证支付状态...' });

          tt.request({
            url: `${apiBaseUrl}/api/wechat-pay/query-and-complete`,
            method: "POST",
            header: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            data: { orderId },
            success: (res) => {
              tt.hideLoading();
              if (res.data && res.data.code === "SUCCESS") {
                tt.showModal({
                  title: '订单已完成',
                  content: `支付验证通过！获得${res.data.data.credits}积分`,
                  showCancel: false,
                  confirmText: '确定',
                  success: () => {
                    this.loadPaymentRecords();
                  }
                });
              } else if (res.data && res.data.code === "ORDER_NOT_PAID") {
                tt.showModal({
                  title: '订单未支付',
                  content: '微信查询显示订单未支付，请先完成支付',
                  showCancel: false,
                  confirmText: '知道了'
                });
              } else {
                tt.showModal({
                  title: '处理失败',
                  content: res.data.error || "无法完成订单",
                  showCancel: false,
                  confirmText: '确定'
                });
              }
            },
            fail: (err) => {
              tt.hideLoading();
              tt.showToast({ title: "网络异常", icon: "none" });
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
      tt.stopPullDownRefresh();
    }, 1000);
  }
});
