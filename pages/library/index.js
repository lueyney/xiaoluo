const auth = require("../../utils/auth.js");
const documents = require("../../utils/documents.js");

Page({
  data: {
    documents: [],
    filteredDocs: [],
    searchValue: "",
    selectedType: "全部",
    totalWords: "0",
    emptyTitle: "暂无文档",
    emptyDesc: "去创建您的第一个文档吧",
    errorMessage: "",
    isLoading: false,
    showPhoneLoginModal: false
  },
  documentTypes: ["全部", "学术范文", "开题报告", "任务书", "文献综述", "答辩稿", "中期检查表", "答辩PPT"],
  colorMap: {
    "学术范文": "#2563eb",
    "学术论文": "#2563eb", // 兼容历史数据
    "开题报告": "#7c3aed",
    "任务书": "#dc2626",
    "文献综述": "#059669",
    "答辩稿": "#ea580c",
    "中期检查表": "#0891b2",
    "答辩PPT": "#be185d"
  },
  
  onLoad() {
    // 立即显示页面框架，避免白屏
    this.setData({ 
      isLoading: false,
      documents: [],
      filteredDocs: []
    });
    
    if (!auth.requireLogin(true)) {
      return;
    }
  },
  
  onShow() {
    wx.setNavigationBarTitle({ title: "文档库" });
    // 清除可能的loading遮罩
    wx.hideLoading();
    
    if (!auth.requireLogin(true)) {
      return;
    }
    
    // 立即加载文档
    this.loadDocuments();
  },
  
  loadDocuments() {
    // 先显示本地缓存的文档（避免白屏）
    const cachedDocs = documents.getDocuments();
    if (cachedDocs && cachedDocs.length > 0) {
      // 直接处理缓存数据并显示
      const processedDocs = cachedDocs.map((doc, index) => {
        const content = doc.content || "";
        const preview = content.length > 120 ? content.substring(0, 120) + "..." : content;
        const type = doc.type || "学术范文";
        const color = this.colorMap[type] || "#6b7280";
        return Object.assign({}, doc, {
          id: doc.id || Date.now() + index,
          type,
          wordCount: doc.word_count || content.length,
          createdAt: doc.created_at || new Date().toLocaleString(),
          content,
          preview,
          badgeColor: color,
          isNew: false
        });
      });
      
      this.setData({
        documents: processedDocs,
        filteredDocs: processedDocs,
        isLoading: false
      });
    } else {
      this.setData({ isLoading: true });
    }
    
    // 异步从服务器同步最新数据
    documents.syncDocumentsFromServer()
      .then(result => {
        const docs = (result.documents || []).map((doc, index) => {
          const content = doc.content || "";
          const preview = content.length > 120 ? content.substring(0, 120) + "..." : content;
          const type = doc.type || "学术范文";
          const color = this.colorMap[type] || "#6b7280";
          return Object.assign({}, doc, {
            id: doc.id || Date.now() + index,
            type,
            wordCount: doc.word_count || content.length,
            createdAt: doc.created_at || new Date().toLocaleString(),
            content,
            preview,
            badgeColor: color
          });
        });
        
        // 检查是否有新文档标记
        const hasNewDocs = wx.getStorageSync('hasNewDocuments');
        
        // 检测最近3分钟内创建的文档 - 用于【新】标记
        const now = new Date().getTime();
        const recentDocs = docs.filter(doc => {
          const docTime = new Date(doc.created_at).getTime();
          return now - docTime < 180000; // 3分钟内创建的
        });
        
        
        // 给文档添加"新"标记
        const docsWithNewMark = docs.map(doc => {
          const isRecent = recentDocs.some(rd => rd.id === doc.id);
          return Object.assign({}, doc, { isNew: isRecent });
        });
        
        this.setData({
          documents: docsWithNewMark,
          filteredDocs: docsWithNewMark,
          totalWords: (result.totalWords || 0).toLocaleString(),
          errorMessage: "",
          isLoading: false
        });
        
        this.updateEmptyState(docsWithNewMark, this.data.searchValue);
        
        // 如果有新文档标记，立即清除TabBar红点（用户已查看）
        if (hasNewDocs) {
          
          setTimeout(() => {
            
            wx.setStorageSync('hasNewDocuments', false);
            wx.setStorageSync('newDocumentsCount', 0);
            
            // 移除TabBar红点
            wx.removeTabBarBadge({
              index: 1,
              fail: (err) => {
                console.warn('[文档库] ⚠️ TabBar红点清除失败:', err);
              }
            });
          }, 100); // 0.1秒后清除（用户点击进入即视为已查看）
        }
      })
      .catch(err => {
        console.error("加载文档失败:", err);
        // 网络失败，尝试使用本地缓存
        const localDocs = documents.getDocuments();
        this.setData({
          documents: localDocs,
          filteredDocs: localDocs,
          errorMessage: "网络异常，显示缓存数据",
          isLoading: false
        });
        wx.showToast({ title: "网络异常，显示缓存数据", icon: "none" });
      });
  },
  calcTotalWords(list) {
    const total = list.reduce((sum, item) => sum + (item.wordCount || 0), 0);
    return total.toLocaleString();
  },
  updateEmptyState(list, keyword) {
    if (list.length) {
      this.setData({
        emptyTitle: "暂无文档",
        emptyDesc: "请检查筛选条件"
      });
    } else if (keyword) {
      this.setData({
        emptyTitle: "未找到相关文档",
        emptyDesc: "请更换关键词或尝试其他分类"
      });
    } else {
      this.setData({
        emptyTitle: "暂无文档",
        emptyDesc: "去创建您的第一个文档吧"
      });
    }
  },
  onSearchInput(e) {
    const value = e.detail.value || "";
    this.setData({ searchValue: value });
    this.filterDocuments(value, this.data.selectedType);
  },
  openTypePicker() {
    wx.showActionSheet({
      itemList: this.documentTypes,
      success: res => {
        const type = this.documentTypes[res.tapIndex];
        this.setData({ selectedType: type });
        this.filterDocuments(this.data.searchValue, type);
      }
    });
  },
  filterDocuments(keyword, type) {
    const value = keyword ? keyword.toLowerCase() : "";
    let list = this.data.documents.slice();
    if (type !== "全部") {
      list = list.filter(item => item.type === type);
    }
    if (value) {
      list = list.filter(item => {
        const title = (item.title || "").toLowerCase();
        const content = (item.content || "").toLowerCase();
        return title.indexOf(value) !== -1 || content.indexOf(value) !== -1;
      });
    }
    this.setData({
      filteredDocs: list,
      totalWords: this.calcTotalWords(list)
    });
    this.updateEmptyState(list, keyword);
  },
  goToWriting() {
    wx.switchTab({ url: "/pages/writing/index" });
  },
  onViewDoc(e) {
    const id = e.currentTarget.dataset.id;
    // 跳转到独立的预览页面
    wx.navigateTo({
      url: `/pages/document-preview/index?id=${id}`
    });
  },
  onDeleteDoc(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "确认删除",
      content: "删除后无法恢复，确认要删除这个文档吗？",
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: "删除中..." });
          
          documents.deleteDocument(id)
            .then(() => {
              const docs = this.data.documents.filter(item => item.id !== id);
              this.setData({ documents: docs });
              this.filterDocuments(this.data.searchValue, this.data.selectedType);
              wx.showToast({ title: "删除成功", icon: "success" });
            })
            .catch(err => {
              console.error("删除文档失败:", err);
              wx.showToast({ title: "删除失败，请稍后重试", icon: "none" });
            })
            .finally(() => {
              wx.hideLoading();
            });
        }
      }
    });
  },
  
  onCopyDoc(e) {
    const id = e && e.currentTarget ? e.currentTarget.dataset.id : undefined;
    const doc = id !== undefined
      ? this.data.documents.find(item => item.id === id) || this.data.filteredDocs.find(item => item.id === id)
      : null;
    
    if (!doc || !doc.content) {
      wx.showToast({ title: "内容为空", icon: "none" });
      return;
    }
    
    wx.setClipboardData({
      data: doc.content,
      success: () => {
        wx.showToast({ title: "内容已复制到剪贴板", icon: "success" });
      },
      fail: () => {
        wx.showToast({ title: "复制失败", icon: "none" });
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
    this.loadDocuments();
  }
});
