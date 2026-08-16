const points = require("../../utils/points.js");
const notifications = require("../../utils/notifications.js");
const auth = require("../../utils/auth.js");
const { getApiBaseUrl } = require("../../utils/request.js");

Page({
  data: {
    activeTab: "all",
    tabs: [
      { label: "全部", value: "all" },
      { label: "已完成", value: "completed" },
      { label: "进行中", value: "processing" },
      { label: "失败", value: "failed" }
    ],
    orders: [],
    filteredOrders: [],
    summary: {
      total: 0,
      completed: 0,
      processing: 0,
      failed: 0,
      credits: 0,
      totalRecharge: 0,
      totalSpent: 0
    },
    loading: false,
    showPhoneLoginModal: false
  },
  
  onLoad() {
    if (!auth.requireLogin(true)) {
      return;
    }
  },
  
  onShow() {
    tt.setNavigationBarTitle({ title: "我的订单" });
    if (!auth.requireLogin(true)) {
      return;
    }
    this.refreshCredits();
    this.loadOrdersFromServer();
  },
  
  refreshCredits() {
    const balance = points.getCredits();
    this.setData({ "summary.credits": balance });
  },
  
  loadOrdersFromServer() {
    this.setData({ loading: true });
    
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
          const orders = res.data.data.orders || [];
          const ordersWithStatus = orders.map(item => {
            const statusInfo = this.getStatusInfo(item.status);
            const docTypeTags = this.extractDocTypes(item.type);
            return Object.assign({}, item, statusInfo, { docTypeTags });
          });
          
          this.setData({
            orders: ordersWithStatus,
            loading: false
          });
          
          this.updateSummary(ordersWithStatus);
          this.filterOrders(this.data.activeTab);
        } else {
          tt.showToast({ title: "加载失败", icon: "none" });
          this.setData({ loading: false });
        }
      },
      fail: (err) => {
        console.error("加载订单失败:", err);
        tt.showToast({ title: "网络异常", icon: "none" });
        this.setData({ loading: false });
      }
    });
  },
  
  loadOrders() {
    this.loadOrdersFromServer();
  },
  updateSummary(list) {
    const allOrders = this.data.orders.length ? this.data.orders : list;
    const summary = {
      total: allOrders.length,
      completed: allOrders.filter(item => item.status === "completed").length,
      processing: allOrders.filter(item => item.status === "processing").length,
      failed: allOrders.filter(item => item.status === "failed").length,
      credits: points.getCredits()
    };
    this.setData({ summary });
  },
  onTabChange(e) {
    const value = e.currentTarget.dataset.value || "all";
    this.setData({ activeTab: value });
    this.filterOrders(value);
  },
  filterOrders(value) {
    const { orders } = this.data;
    let list = orders;
    if (value === "completed") {
      list = orders.filter(item => item.status === "completed");
    } else if (value === "processing") {
      list = orders.filter(item => item.status === "processing");
    } else if (value === "failed") {
      list = orders.filter(item => item.status === "failed");
    }
    this.setData({ filteredOrders: list });
    this.updateSummary(list);
  },
  getStatusInfo(status) {
    const map = {
      completed: { statusText: "已完成", statusColor: "#0f9d58", statusBg: "rgba(15,157,88,0.12)" },
      processing: { statusText: "进行中", statusColor: "#818cf8", statusBg: "rgba(129,140,248,0.12)" },
      failed: { statusText: "失败", statusColor: "#f97316", statusBg: "rgba(249,115,22,0.12)" }
    };
    return map[status] || { statusText: "进行中", statusColor: "#818cf8", statusBg: "rgba(129,140,248,0.12)" };
  },
  
  extractDocTypes(typeString) {
    // 从订单type字段中提取文档类型标签
    // 例如："学术论文、开题报告-材料科学" -> ["学术论文", "开题报告"]
    if (!typeString) return [];
    
    const docTypeMap = {
      '学术范文': { label: '学术范文', color: '#818cf8', bg: 'rgba(129,140,248,0.12)' },
      '学术论文': { label: '学术范文', color: '#818cf8', bg: 'rgba(129,140,248,0.12)' }, // 兼容历史数据
      '开题报告': { label: '开题报告', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
      '任务书': { label: '任务书', color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
      '文献综述': { label: '文献综述', color: '#e879f9', bg: 'rgba(232,121,249,0.12)' },
      '答辩稿': { label: '答辩稿', color: '#f472b6', bg: 'rgba(244,114,182,0.12)' },
      '中期检查表': { label: '中期检查', color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
      '答辩PPT': { label: 'PPT', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' }
    };
    
    const tags = [];
    for (const [key, value] of Object.entries(docTypeMap)) {
      if (typeString.includes(key)) {
        tags.push(value);
      }
    }
    
    // 如果没有匹配到，说明是旧格式（AI创作-xxx），默认为学术范文
    if (tags.length === 0 && typeString.includes('AI创作')) {
      tags.push(docTypeMap['学术范文']);
    }
    
    return tags;
  },
  goToRecharge() {
    tt.navigateTo({ url: "/pages/recharge/index" });
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
    console.log('[订单] 一键登录成功', e.detail);
    this.loadOrders();
  }
});
